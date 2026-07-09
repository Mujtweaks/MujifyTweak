// Mujify Tweaks — anonymous online-status worker (Cloudflare Workers, free tier).
//
// PRIVACY BY DESIGN. The app only ever POSTs `{ "v": "<app version>" }`. This
// worker stores NO IP addresses, NO machine ids, NO UUIDs — only aggregate
// counters: minute buckets (online), hourly + daily ping totals, per-version
// counts, and per-COUNTRY counts (country comes from Cloudflare's connection
// metadata; only the aggregate number per country is ever stored).
//
// Endpoints:
//   POST /                          — a heartbeat ping from the app (body: {"v":"..."})
//   GET  /stats?token=SECRET        — the branded owner dashboard (token-protected)
//   GET  /stats?token=SECRET&json=1 — same data as JSON (used by live refresh / export)
//
// Storage is ONE consolidated key ("state") written once per ping, so storage
// writes track the request count 1:1 and stay inside the free-tier budget.
//
// Every number on the dashboard is measured. Nothing is fabricated: panels that
// would need data we refuse to collect (IPs, sessions, device types) do not exist.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const GITHUB_LATEST = "https://api.github.com/repos/Mujtweaks/MujifyTweak/releases/latest";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const stub = env.COUNTER.get(env.COUNTER.idFromName("global"));

    if (req.method === "POST" && url.pathname === "/") {
      let v = "unknown";
      try {
        const body = await req.json();
        if (typeof body.v === "string") v = body.v.slice(0, 24);
      } catch {
        /* version is optional — a bare ping still counts */
      }
      // Country code from Cloudflare's connection metadata (e.g. "AU").
      // Aggregate count only — the IP itself is never read or stored.
      const c = (req.cf && req.cf.country) || "??";
      await stub.fetch(
        "https://do/ping?v=" + encodeURIComponent(v) + "&c=" + encodeURIComponent(c),
        { method: "POST" }
      );
      return new Response("ok", { headers: CORS });
    }

    if (req.method === "GET" && url.pathname === "/stats") {
      if (url.searchParams.get("token") !== env.STATS_TOKEN) {
        return new Response("unauthorized", { status: 401 });
      }
      const data = await (await stub.fetch("https://do/stats")).json();
      if (url.searchParams.get("json") === "1") {
        return Response.json(data, { headers: { "cache-control": "no-store" } });
      }
      return new Response(statsPage(data), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    return new Response("Mujify analytics: ok");
  },
};

export class Counter {
  constructor(state) {
    this.state = state;
    this.buckets = new Map(); // minute → ping count (last ~6 min, in-memory)
    this.loaded = false;
    // Consolidated persistent state — ONE storage key, ONE write per ping.
    this.s = {
      day: null,
      dailyPings: 0,
      peakOnline: 0,
      totalPings: 0,
      since: null, // first day the counter ever saw a ping
      history: {}, // "YYYY-MM-DD" → pings that day (last 30 days)
      hourly: {}, // "YYYY-MM-DDTHH" → pings that hour (last 48 hours)
      versions: {}, // app version → pings today
      countries: {}, // country code → pings today (aggregate only, no IPs)
      feed: [], // newest-first [{t: epoch ms, v: version, c: country}] (last 14)
      gh: { at: 0, tag: null, publishedAt: null }, // cached GitHub latest release
    };
  }

  async load() {
    if (this.loaded) return;
    const s = await this.state.storage.get("state");
    if (s) this.s = { ...this.s, ...s };
    this.loaded = true;
  }

  prune(nowMin) {
    for (const k of this.buckets.keys()) if (k < nowMin - 5) this.buckets.delete(k);
  }

  onlineNow(nowMin) {
    this.prune(nowMin);
    let n = 0;
    for (const v of this.buckets.values()) n += v;
    return n;
  }

  rollDay(today) {
    if (this.s.day === today) return;
    if (this.s.day && this.s.dailyPings > 0) {
      this.s.history[this.s.day] = this.s.dailyPings;
      const days = Object.keys(this.s.history).sort();
      while (days.length > 30) delete this.s.history[days.shift()];
    }
    this.s.day = today;
    this.s.dailyPings = 0;
    this.s.peakOnline = 0;
    this.s.versions = {};
    this.s.countries = {};
  }

  pruneHourly(nowHourKey) {
    const keys = Object.keys(this.s.hourly).sort();
    while (keys.length > 48) delete this.s.hourly[keys.shift()];
    void nowHourKey;
  }

  /** Cached GitHub latest-release lookup (at most every 10 minutes). */
  async refreshGithub() {
    if (Date.now() - (this.s.gh.at || 0) < 10 * 60 * 1000) return false;
    this.s.gh.at = Date.now(); // set first so failures don't hammer the API
    try {
      const r = await fetch(GITHUB_LATEST, {
        headers: { "user-agent": "mujify-stats-worker", accept: "application/vnd.github+json" },
      });
      if (r.ok) {
        const j = await r.json();
        this.s.gh.tag = j.tag_name || null;
        this.s.gh.publishedAt = j.published_at || null;
      }
    } catch {
      /* no releases yet / network hiccup — keep whatever we had */
    }
    return true;
  }

  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    const now = Date.now();
    const nowMin = Math.floor(now / 60000);
    const today = new Date(now).toISOString().slice(0, 10);
    const hourKey = new Date(now).toISOString().slice(0, 13); // YYYY-MM-DDTHH

    if (url.pathname === "/ping") {
      this.rollDay(today);
      if (!this.s.since) this.s.since = today;
      this.buckets.set(nowMin, (this.buckets.get(nowMin) || 0) + 1);
      this.s.dailyPings += 1;
      this.s.totalPings += 1;
      const v = url.searchParams.get("v") || "unknown";
      const c = url.searchParams.get("c") || "??";
      this.s.versions[v] = (this.s.versions[v] || 0) + 1;
      this.s.countries[c] = (this.s.countries[c] || 0) + 1;
      this.s.hourly[hourKey] = (this.s.hourly[hourKey] || 0) + 1;
      this.pruneHourly(hourKey);
      this.s.feed.unshift({ t: now, v, c });
      if (this.s.feed.length > 14) this.s.feed.length = 14;
      const online = this.onlineNow(nowMin);
      if (online > this.s.peakOnline) this.s.peakOnline = online;
      await this.state.storage.put("state", this.s); // ONE write per ping
      return new Response("ok");
    }

    if (url.pathname === "/stats") {
      this.rollDay(today);
      const ghChanged = await this.refreshGithub();
      if (ghChanged) await this.state.storage.put("state", this.s);

      const online = this.onlineNow(nowMin);

      // Last 14 days (zero-filled) for the daily chart + weekly growth.
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
        days.push({ date: d, pings: d === today ? this.s.dailyPings : this.s.history[d] || 0 });
      }
      const week = (arr) => arr.reduce((a, x) => a + x.pings, 0);
      const thisWeek = week(days.slice(7));
      const prevWeek = week(days.slice(0, 7));
      const growthPct = prevWeek > 0 ? ((thisWeek - prevWeek) / prevWeek) * 100 : null;

      // Last 24 hours (zero-filled) for the timeline + sparklines.
      const hours = [];
      for (let i = 23; i >= 0; i--) {
        const h = new Date(now - i * 3600000).toISOString().slice(0, 13);
        hours.push({ hour: h.slice(11) + ":00", pings: this.s.hourly[h] || 0 });
      }

      // Top countries today (aggregate counts only).
      const countries = Object.entries(this.s.countries)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code, pings]) => ({ code, pings }));

      return Response.json({
        onlineNow: online,
        peakOnline: Math.max(this.s.peakOnline, online),
        dailyPings: this.s.dailyPings,
        dailyActivesEstimate:
          this.s.dailyPings > 0 ? Math.max(1, Math.round(this.s.dailyPings / 288)) : 0,
        totalPings: this.s.totalPings,
        since: this.s.since,
        versions: this.s.versions,
        countries,
        days,
        hours,
        thisWeek,
        prevWeek,
        growthPct,
        latestRelease: this.s.gh.tag,
        latestReleaseAt: this.s.gh.publishedAt,
        feed: this.s.feed,
        day: this.s.day,
        updated: new Date(now).toISOString(),
      });
    }

    return new Response("ok");
  }
}

// ---------------------------------------------------------------------------
// The owner dashboard — Mujify-branded, live (15s refresh), 100% measured data.
// ---------------------------------------------------------------------------
function statsPage(d) {
  const initial = JSON.stringify(d).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Mujify Tweaks · Owner Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--bg:#0A0A0A;--panel:#101012;--card:#121214;--edge:rgba(255,255,255,.07);--red:#E3000E;--txt:#fff;
 --txt2:#9a9aa2;--txt3:#55555c;--green:#22C55E;--yellow:#F59E0B}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif;
 background-image:radial-gradient(1100px 480px at 55% -180px,rgba(227,0,14,.13),transparent 70%)}
a{color:inherit;text-decoration:none}
.layout{display:grid;grid-template-columns:1fr 300px;gap:16px;max-width:1240px;margin:0 auto;padding:24px 20px 44px}
header.top{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:12px}
.mark{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#E3000E,#7d0008);
 display:grid;place-items:center;font-weight:900;font-size:19px;box-shadow:0 4px 26px rgba(227,0,14,.5)}
.brand h1{font-size:16px;font-weight:800;letter-spacing:.03em}
.brand small{display:block;color:var(--txt3);font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;margin-top:2px}
.tools{display:flex;align-items:center;gap:10px}
.live{display:flex;align-items:center;gap:8px;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.08);
 border-radius:999px;padding:7px 14px;font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--green)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}55%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}
.iconbtn{width:34px;height:34px;border-radius:9px;border:1px solid var(--edge);background:var(--card);color:var(--txt2);
 display:grid;place-items:center;cursor:pointer;font-size:15px}
.iconbtn:hover{color:var(--txt);border-color:rgba(255,255,255,.18)}
main{display:flex;flex-direction:column;gap:14px}
aside{display:flex;flex-direction:column;gap:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--edge);border-radius:14px;padding:16px 16px 12px;position:relative;overflow:hidden}
.card .l{color:var(--txt3);font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.18em}
.card .n{font-size:34px;font-weight:900;line-height:1.15;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:6px}
.card .sub{color:var(--txt2);font-size:10.5px;margin-top:2px;min-height:14px}
.card svg.spark{position:absolute;right:10px;bottom:8px;opacity:.9}
.card.hero .n{color:var(--red);text-shadow:0 0 30px rgba(227,0,14,.45)}
.badge{position:absolute;top:12px;right:12px;font-size:9px;font-weight:800;letter-spacing:.12em;color:var(--red);
 background:rgba(227,0,14,.12);border:1px solid rgba(227,0,14,.3);padding:3px 8px;border-radius:999px;animation:blink 2s ease-in-out infinite}
@keyframes blink{50%{opacity:.55}}
.up{color:var(--green)}.down{color:var(--red)}.flat{color:var(--txt3)}
.health{background:var(--card);border:1px solid var(--edge);border-radius:14px;padding:12px 16px;display:flex;flex-wrap:wrap;gap:18px;align-items:center}
.health .h{font-size:9.5px;font-weight:700;letter-spacing:.18em;color:var(--txt3);text-transform:uppercase;margin-right:4px}
.hitem{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--txt2)}
.st{width:7px;height:7px;border-radius:50%}
.ok{background:var(--green)}.warn{background:var(--yellow)}
.panel{background:var(--card);border:1px solid var(--edge);border-radius:14px;padding:16px}
.panel h2{font-size:9.5px;font-weight:700;color:var(--txt3);letter-spacing:.2em;text-transform:uppercase;margin-bottom:12px;display:flex;justify-content:space-between}
.panel h2 span.meta{letter-spacing:0;text-transform:none;font-weight:600;color:var(--txt2)}
.tworow{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.chart-days{display:flex;align-items:flex-end;gap:5px;height:120px}
.col{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end}
.bar{width:100%;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#E3000E,#6e0007);min-height:3px;
 box-shadow:0 0 12px rgba(227,0,14,.22);transition:height .5s cubic-bezier(.4,0,.2,1)}
.bar.zero{background:#1b1b1f;box-shadow:none}
.dlab{color:var(--txt3);font-size:8.5px;font-weight:600}
.rows .row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--edge);font-size:12px}
.rows .row:last-child{border-bottom:0}
.flag{font-size:15px;width:22px;text-align:center}
.rname{flex:1;color:var(--txt)}
.rbar{flex:2;height:5px;border-radius:99px;background:#1b1b1f;overflow:hidden}
.rbar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#E3000E,#ff4d57)}
.rval{color:var(--txt2);font-variant-numeric:tabular-nums;min-width:44px;text-align:right;font-size:11px}
.vrow{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:12px}
.vtag{font-weight:700;color:var(--txt);min-width:110px}
.latest{border:1px solid var(--edge);border-radius:10px;padding:10px 12px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:var(--txt2)}
.latest b{color:var(--txt);font-size:13px}
.feed{display:flex;flex-direction:column}
.fitem{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--edge);font-size:11.5px;align-items:flex-start}
.fitem:last-child{border-bottom:0}
.fdot{width:26px;height:26px;border-radius:8px;background:rgba(227,0,14,.12);border:1px solid rgba(227,0,14,.25);
 display:grid;place-items:center;font-size:12px;flex-shrink:0}
.fmain{flex:1}.fmain b{color:var(--txt);font-weight:600;font-size:11.5px}
.fsub{color:var(--txt3);font-size:10px;margin-top:1px}
.ftime{color:var(--txt3);font-size:10px;white-space:nowrap}
.qa{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.qbtn{border:1px solid var(--edge);background:#0d0d0f;border-radius:10px;padding:10px;font-size:11px;font-weight:600;
 color:var(--txt2);cursor:pointer;text-align:center;font-family:inherit}
.qbtn:hover{color:var(--txt);border-color:rgba(255,255,255,.2)}
.qbtn.primary{background:linear-gradient(135deg,#E3000E,#8a0009);color:#fff;border-color:transparent}
footer{grid-column:1/-1;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;color:var(--txt3);font-size:10.5px;padding-top:4px}
.empty{color:var(--txt3);font-size:11.5px;padding:10px 0}
@media(max-width:900px){.layout{grid-template-columns:1fr}.tworow{grid-template-columns:1fr}}
</style></head>
<body><div class="layout">
  <header class="top">
    <div class="brand">
      <div class="mark">M</div>
      <div><h1>MUJIFY TWEAKS</h1><small>Owner dashboard · private</small></div>
    </div>
    <div class="tools">
      <div class="live"><span class="dot"></span>LIVE</div>
      <button class="iconbtn" onclick="refresh()" title="Refresh now">⟳</button>
    </div>
  </header>

  <main>
    <div class="cards">
      <div class="card hero"><span class="badge">● LIVE</span><div class="l">Online now</div>
        <div class="n" id="online">–</div><div class="sub">active apps, last ~6 min</div><svg class="spark" id="sp1"></svg></div>
      <div class="card"><div class="l">Peak online today</div>
        <div class="n" id="peak">–</div><div class="sub" id="day">&nbsp;</div><svg class="spark" id="sp2"></svg></div>
      <div class="card"><div class="l">Daily activity</div>
        <div class="n" id="pings">–</div><div class="sub" id="avg">&nbsp;</div><svg class="spark" id="sp3"></svg></div>
      <div class="card"><div class="l">Total lifetime pings</div>
        <div class="n" id="total">–</div><div class="sub" id="since">&nbsp;</div><svg class="spark" id="sp4"></svg></div>
      <div class="card"><div class="l">Weekly growth</div>
        <div class="n" id="growth">–</div><div class="sub" id="growthsub">vs previous 7 days</div></div>
    </div>

    <div class="health">
      <span class="h">Service health</span>
      <span class="hitem"><span class="st ok"></span>Ping service <b id="hlat" style="color:var(--txt2);font-weight:600"></b></span>
      <span class="hitem"><span class="st ok"></span>Counter storage</span>
      <span class="hitem" id="hgh"><span class="st warn"></span>GitHub releases: none yet</span>
      <span class="hitem"><span class="st ok"></span>Auto-refresh 15s</span>
    </div>

    <div class="tworow">
      <div class="panel"><h2>Daily pings · last 14 days <span class="meta" id="wk"></span></h2>
        <div class="chart-days" id="chartDays"></div></div>
      <div class="panel"><h2>Online timeline · last 24h <span class="meta">pings per hour</span></h2>
        <svg id="chartHours" width="100%" height="120" preserveAspectRatio="none"></svg></div>
    </div>

    <div class="tworow">
      <div class="panel"><h2>Geographic distribution · today</h2>
        <div class="rows" id="countries"><div class="empty">no pings yet today</div></div></div>
      <div class="panel"><h2>Version analytics · today</h2>
        <div id="versions"><div class="empty">no pings yet today</div></div>
        <div class="latest" id="latest" style="display:none"></div></div>
    </div>
  </main>

  <aside>
    <div class="panel"><h2>Live activity feed</h2>
      <div class="feed" id="feed"><div class="empty">waiting for the first ping…</div></div></div>
    <div class="panel"><h2>Quick actions</h2>
      <div class="qa">
        <button class="qbtn primary" onclick="refresh()">⟳ Refresh now</button>
        <button class="qbtn" onclick="exportJson()">⤓ Export JSON</button>
        <a class="qbtn" href="https://github.com/Mujtweaks/MujifyTweak/releases" target="_blank">GitHub releases</a>
        <a class="qbtn" href="https://dash.cloudflare.com" target="_blank">Cloudflare</a>
      </div></div>
  </aside>

  <footer>
    <span>No IPs stored · no IDs · anonymous aggregate counts only</span>
    <span id="updated">–</span>
  </footer>
</div>
<script>
var INITIAL = ${initial};
var token = new URLSearchParams(location.search).get("token");
var latest = INITIAL;

function fmt(n){if(n==null)return"–";return n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(n>=1e4?0:1)+"k":String(n)}
function flag(cc){if(!cc||cc.length!==2||cc==="??")return"🌐";
  return String.fromCodePoint(127397+cc.charCodeAt(0),127397+cc.charCodeAt(1))}
function rel(t){var s=Math.max(0,(Date.now()-t)/1000);
  return s<60?Math.round(s)+"s ago":s<3600?Math.round(s/60)+"m ago":s<86400?Math.round(s/3600)+"h ago":Math.round(s/86400)+"d ago"}
function esc(x){return String(x).replace(/[<>&]/g,function(ch){return{"<":"&lt;",">":"&gt;","&":"&amp;"}[ch]})}

function spark(id,arr,color){
  var el=document.getElementById(id); if(!el)return;
  var w=90,h=30; el.setAttribute("width",w); el.setAttribute("height",h); el.setAttribute("viewBox","0 0 "+w+" "+h);
  var max=1; arr.forEach(function(v){if(v>max)max=v});
  var pts=arr.map(function(v,i){return (i/(arr.length-1)*w).toFixed(1)+","+(h-3-(v/max*(h-6))).toFixed(1)}).join(" ");
  el.innerHTML='<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.6" stroke-linejoin="round"/>';
}

function render(d){
  latest=d;
  var hp=d.hours.map(function(x){return x.pings});
  document.getElementById("online").textContent=fmt(d.onlineNow);
  document.getElementById("peak").textContent=fmt(d.peakOnline);
  document.getElementById("pings").textContent=fmt(d.dailyPings);
  document.getElementById("total").textContent=fmt(d.totalPings);
  document.getElementById("day").textContent=d.day||"";
  var hrsElapsed=Math.max(1,new Date().getUTCHours()+1);
  document.getElementById("avg").textContent="avg "+(d.dailyPings/hrsElapsed).toFixed(1)+" / hour · est. "+fmt(d.dailyActivesEstimate)+" actives";
  document.getElementById("since").textContent=d.since?("since "+d.since):"";
  var g=document.getElementById("growth");
  if(d.growthPct==null){g.textContent="–";g.className="n flat";
    document.getElementById("growthsub").textContent="needs 2 weeks of history";}
  else{var up=d.growthPct>=0;g.textContent=(up?"↑ ":"↓ ")+Math.abs(d.growthPct).toFixed(1)+"%";
    g.className="n "+(up?"up":"down");
    document.getElementById("growthsub").textContent=fmt(d.thisWeek)+" vs "+fmt(d.prevWeek)+" pings";}
  document.getElementById("wk").textContent="this week "+fmt(d.thisWeek);
  document.getElementById("updated").textContent="updated "+new Date(d.updated).toLocaleTimeString();

  spark("sp1",hp.slice(-12),"#E3000E"); spark("sp2",hp,"#E3000E");
  spark("sp3",hp,"#F59E0B"); spark("sp4",d.days.map(function(x){return x.pings}),"#22C55E");

  // 14-day bars
  var max=1; d.days.forEach(function(x){if(x.pings>max)max=x.pings});
  var cd=document.getElementById("chartDays"); cd.innerHTML="";
  d.days.forEach(function(x,i){
    var col=document.createElement("div");col.className="col";
    var bar=document.createElement("div");bar.className="bar"+(x.pings===0?" zero":"");
    bar.style.height=Math.max(3,Math.round(x.pings/max*100))+"%";
    bar.title=x.date+" · "+x.pings+" pings";
    var lab=document.createElement("div");lab.className="dlab";
    lab.textContent=(i===0||i===7||i===13)?x.date.slice(5):"";
    col.appendChild(bar);col.appendChild(lab);cd.appendChild(col);
  });

  // 24h area chart
  var svg=document.getElementById("chartHours");
  var W=svg.clientWidth||520,H=120; svg.setAttribute("viewBox","0 0 "+W+" "+H);
  var hmax=1; hp.forEach(function(v){if(v>hmax)hmax=v});
  var pts=hp.map(function(v,i){return[(i/(hp.length-1)*W),(H-8-(v/hmax*(H-24)))]});
  var line=pts.map(function(p){return p[0].toFixed(1)+","+p[1].toFixed(1)}).join(" ");
  var area=line+" "+W+","+(H-2)+" 0,"+(H-2);
  svg.innerHTML='<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0" stop-color="#E3000E" stop-opacity=".35"/><stop offset="1" stop-color="#E3000E" stop-opacity="0"/></linearGradient></defs>'+
    '<polygon points="'+area+'" fill="url(#ag)"/>'+
    '<polyline points="'+line+'" fill="none" stroke="#E3000E" stroke-width="2" stroke-linejoin="round"/>'+
    '<text x="4" y="12" fill="#55555c" font-size="9">'+esc(d.hours[0].hour)+'</text>'+
    '<text x="'+(W-38)+'" y="12" fill="#55555c" font-size="9">'+esc(d.hours[23].hour)+'</text>';

  // countries
  var cn=document.getElementById("countries");
  if(!d.countries.length){cn.innerHTML='<div class="empty">no pings yet today</div>';}
  else{var cmax=d.countries[0].pings; cn.innerHTML="";
    d.countries.forEach(function(x){
      var r=document.createElement("div");r.className="row";
      r.innerHTML='<span class="flag">'+flag(x.code)+'</span><span class="rname">'+esc(x.code)+
        '</span><span class="rbar"><i style="width:'+Math.round(x.pings/cmax*100)+'%"></i></span>'+
        '<span class="rval">'+fmt(x.pings)+'</span>';
      cn.appendChild(r);});}

  // versions
  var vs=document.getElementById("versions");
  var keys=Object.keys(d.versions||{});
  if(!keys.length){vs.innerHTML='<div class="empty">no pings yet today</div>';}
  else{var tot=0;keys.forEach(function(k){tot+=d.versions[k]});vs.innerHTML="";
    keys.sort(function(a,b){return d.versions[b]-d.versions[a]}).slice(0,6).forEach(function(k){
      var pct=(d.versions[k]/tot*100);
      var r=document.createElement("div");r.className="vrow";
      var isLatest=d.latestRelease&&(k===d.latestRelease||("v"+k)===d.latestRelease);
      r.innerHTML='<span class="vtag">'+(isLatest?"✦ ":"")+"v"+esc(k)+'</span>'+
        '<span class="rbar"><i style="width:'+pct.toFixed(0)+'%"></i></span>'+
        '<span class="rval">'+pct.toFixed(1)+'%</span>';
      vs.appendChild(r);});}
  var lt=document.getElementById("latest");
  var hg=document.getElementById("hgh");
  if(d.latestRelease){lt.style.display="flex";
    var when=d.latestReleaseAt?new Date(d.latestReleaseAt).toLocaleDateString():"";
    lt.innerHTML='<span>Latest release</span><span><b>'+esc(d.latestRelease)+'</b> · '+when+'</span>';
    hg.innerHTML='<span class="st ok"></span>GitHub releases: '+esc(d.latestRelease);}
  else{lt.style.display="none";}

  // feed
  var fd=document.getElementById("feed");
  if(!d.feed||!d.feed.length){fd.innerHTML='<div class="empty">waiting for the first ping…</div>';}
  else{fd.innerHTML="";
    d.feed.forEach(function(f){
      var it=document.createElement("div");it.className="fitem";
      it.innerHTML='<div class="fdot">⚡</div><div class="fmain"><b>App online ping</b>'+
        '<div class="fsub">v'+esc(f.v)+' · '+flag(f.c)+' '+esc(f.c)+'</div></div>'+
        '<span class="ftime">'+rel(f.t)+'</span>';
      fd.appendChild(it);});}
}

function refresh(){
  var t0=performance.now();
  fetch("/stats?token="+encodeURIComponent(token)+"&json=1",{cache:"no-store"})
    .then(function(r){
      document.getElementById("hlat").textContent=Math.round(performance.now()-t0)+"ms";
      return r.ok?r.json():null})
    .then(function(d){if(d)render(d)})
    .catch(function(){});
}
function exportJson(){
  var blob=new Blob([JSON.stringify(latest,null,2)],{type:"application/json"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="mujify-stats-"+(latest.day||"export")+".json";a.click();
}
render(INITIAL);
refresh();
setInterval(refresh,15000);
setInterval(function(){ if(latest&&latest.feed){var els=document.querySelectorAll(".ftime");
  latest.feed.forEach(function(f,i){if(els[i])els[i].textContent=rel(f.t)});} },1000);
</script>
</body></html>`;
}
