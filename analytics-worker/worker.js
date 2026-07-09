// Mujify Tweaks — anonymous online-status worker (Cloudflare Workers, free tier).
//
// PRIVACY BY DESIGN. The app only ever POSTs `{ "v": "<app version>" }`. This
// worker stores NO IP addresses, NO machine ids, NO UUIDs — only minute-bucket
// counts and daily totals. "Online now" ≈ the number of pings in the last
// ~6 minutes (each app pings every 5 min). "Daily actives" is an estimate =
// daily pings / ~288 pings-per-client-per-day. Both are honestly labelled.
//
// Endpoints:
//   POST /                          — a heartbeat ping from the app (body: {"v":"..."})
//   GET  /stats?token=SECRET        — your branded browser dashboard (token-protected)
//   GET  /stats?token=SECRET&json=1 — same data as JSON (used by the page's live refresh)
//
// Storage is ONE consolidated key ("state") written once per ping, so storage
// writes track the request count 1:1 and stay inside the free-tier budget.
//
// Deploy: see analytics-worker/README.md. Set STATS_TOKEN to a long random
// secret and keep it out of the app.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

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
      await stub.fetch("https://do/ping?v=" + encodeURIComponent(v), { method: "POST" });
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
    // Consolidated persistent state (single storage key, single write per ping).
    this.s = {
      day: null,
      dailyPings: 0,
      peakOnline: 0,
      totalPings: 0,
      history: {}, // "YYYY-MM-DD" → pings that day (last 14 days)
      versions: {}, // app version → pings today
    };
  }

  async load() {
    if (this.loaded) return;
    const s = await this.state.storage.get("state");
    if (s) {
      this.s = { ...this.s, ...s };
    } else {
      // Migrate from the original two-field shape, if present.
      const d = await this.state.storage.get("daily");
      if (d) {
        this.s.day = d.day;
        this.s.dailyPings = d.pings;
      }
    }
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
    // Archive the finished day into history, keep the last 14 days only.
    if (this.s.day && this.s.dailyPings > 0) {
      this.s.history[this.s.day] = this.s.dailyPings;
      const days = Object.keys(this.s.history).sort();
      while (days.length > 14) delete this.s.history[days.shift()];
    }
    this.s.day = today;
    this.s.dailyPings = 0;
    this.s.peakOnline = 0;
    this.s.versions = {};
  }

  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    const nowMin = Math.floor(Date.now() / 60000);
    const today = new Date().toISOString().slice(0, 10);

    if (url.pathname === "/ping") {
      this.rollDay(today);
      this.buckets.set(nowMin, (this.buckets.get(nowMin) || 0) + 1);
      this.s.dailyPings += 1;
      this.s.totalPings += 1;
      const v = url.searchParams.get("v") || "unknown";
      this.s.versions[v] = (this.s.versions[v] || 0) + 1;
      const online = this.onlineNow(nowMin);
      if (online > this.s.peakOnline) this.s.peakOnline = online;
      await this.state.storage.put("state", this.s); // ONE write per ping
      return new Response("ok");
    }

    if (url.pathname === "/stats") {
      this.rollDay(today);
      const online = this.onlineNow(nowMin);
      // Last 14 days ending today, zero-filled, for the chart.
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        days.push({
          date: d,
          pings: d === today ? this.s.dailyPings : this.s.history[d] || 0,
        });
      }
      return Response.json({
        onlineNow: online,
        peakOnline: Math.max(this.s.peakOnline, online),
        dailyPings: this.s.dailyPings,
        dailyActivesEstimate:
          this.s.dailyPings > 0 ? Math.max(1, Math.round(this.s.dailyPings / 288)) : 0,
        totalPings: this.s.totalPings,
        versions: this.s.versions,
        days,
        day: this.s.day,
        updated: new Date().toISOString(),
      });
    }

    return new Response("ok");
  }
}

// ---------------------------------------------------------------------------
// The owner dashboard page — Mujify-branded, live-refreshing (30s), private.
// ---------------------------------------------------------------------------
function statsPage(d) {
  const initial = JSON.stringify(d).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Mujify Tweaks · Live</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap" rel="stylesheet">
<style>
  :root{--bg:#0A0A0A;--card:#111113;--edge:rgba(255,255,255,.07);--red:#E3000E;--txt:#fff;--txt2:#9a9aa2;--txt3:#55555c;--green:#22C55E}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif;min-height:100vh;
       background-image:radial-gradient(900px 420px at 50% -140px,rgba(227,0,14,.14),transparent 70%)}
  .wrap{max-width:880px;margin:0 auto;padding:28px 20px 48px}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px}
  .brand{display:flex;align-items:center;gap:12px}
  .mark{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#E3000E,#8a0009);
        display:grid;place-items:center;font-weight:900;font-size:18px;box-shadow:0 4px 24px rgba(227,0,14,.45)}
  .brand h1{font-size:16px;font-weight:800;letter-spacing:.04em}
  .brand small{display:block;color:var(--txt3);font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;margin-top:2px}
  .live{display:flex;align-items:center;gap:8px;border:1px solid var(--edge);background:var(--card);
        border-radius:999px;padding:7px 14px;font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--txt2)}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 1.6s ease-in-out infinite}
  @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}55%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}
  .card{background:var(--card);border:1px solid var(--edge);border-radius:16px;padding:22px 20px 18px;position:relative;overflow:hidden}
  .card .n{font-size:52px;font-weight:900;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .card .l{color:var(--txt3);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.2em;margin-top:10px}
  .card .sub{color:var(--txt2);font-size:11px;margin-top:4px}
  .hero .n{color:var(--red);text-shadow:0 0 34px rgba(227,0,14,.5)}
  .hero::after{content:"";position:absolute;inset:auto -30% -60% -30%;height:120px;background:radial-gradient(closest-side,rgba(227,0,14,.18),transparent)}
  .panel{background:var(--card);border:1px solid var(--edge);border-radius:16px;padding:20px;margin-top:14px}
  .panel h2{font-size:10px;font-weight:700;color:var(--txt3);letter-spacing:.2em;text-transform:uppercase;margin-bottom:16px}
  .chart{display:flex;align-items:flex-end;gap:6px;height:110px}
  .col{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
  .bar{width:100%;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#E3000E,#7d0008);min-height:3px;
       box-shadow:0 0 14px rgba(227,0,14,.25);transition:height .5s cubic-bezier(.4,0,.2,1)}
  .bar.zero{background:#1c1c20;box-shadow:none}
  .dlab{color:var(--txt3);font-size:9px;font-weight:600}
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chip{border:1px solid var(--edge);background:#0d0d0f;border-radius:999px;padding:6px 12px;font-size:11px;color:var(--txt2)}
  .chip b{color:var(--txt);font-weight:700}
  footer{margin-top:22px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;color:var(--txt3);font-size:11px}
  @media(max-width:560px){.card .n{font-size:40px}}
</style></head>
<body><div class="wrap">
  <header>
    <div class="brand">
      <div class="mark">M</div>
      <div><h1>MUJIFY TWEAKS</h1><small>Owner dashboard · private</small></div>
    </div>
    <div class="live"><span class="dot"></span>LIVE</div>
  </header>

  <div class="grid">
    <div class="card hero"><div class="n" id="online">–</div><div class="l">Online now</div><div class="sub">pings in the last ~6 min</div></div>
    <div class="card"><div class="n" id="peak">–</div><div class="l">Peak online today</div><div class="sub" id="day">&nbsp;</div></div>
    <div class="card"><div class="n" id="actives">–</div><div class="l">Daily actives (est.)</div><div class="sub" id="pings">&nbsp;</div></div>
    <div class="card"><div class="n" id="total">–</div><div class="l">Total pings all-time</div><div class="sub">since the counter went live</div></div>
  </div>

  <div class="panel"><h2>Last 14 days · pings per day</h2><div class="chart" id="chart"></div></div>
  <div class="panel"><h2>App versions today</h2><div class="chips" id="versions"><span class="chip">no pings yet today</span></div></div>

  <footer>
    <span>No IPs · no IDs · anonymous minute-bucket counts only</span>
    <span id="updated">–</span>
  </footer>
</div>
<script>
  var INITIAL = ${initial};
  var token = new URLSearchParams(location.search).get("token");
  function fmt(n){return n>=1000?(n/1000).toFixed(n>=10000?0:1)+"k":String(n)}
  function render(d){
    document.getElementById("online").textContent = fmt(d.onlineNow);
    document.getElementById("peak").textContent = fmt(d.peakOnline);
    document.getElementById("actives").textContent = fmt(d.dailyActivesEstimate);
    document.getElementById("total").textContent = fmt(d.totalPings);
    document.getElementById("pings").textContent = fmt(d.dailyPings)+" pings today";
    document.getElementById("day").textContent = d.day || "";
    document.getElementById("updated").textContent = "updated "+new Date(d.updated).toLocaleTimeString();
    var max = 1; d.days.forEach(function(x){ if(x.pings>max) max=x.pings; });
    var chart = document.getElementById("chart"); chart.innerHTML = "";
    d.days.forEach(function(x,i){
      var col=document.createElement("div"); col.className="col";
      var bar=document.createElement("div"); bar.className="bar"+(x.pings===0?" zero":"");
      bar.style.height=Math.max(3,Math.round(x.pings/max*100))+"%";
      bar.title=x.date+" · "+x.pings+" pings";
      var lab=document.createElement("div"); lab.className="dlab";
      lab.textContent=(i===0||i===13||i===7)?x.date.slice(5):"";
      col.appendChild(bar); col.appendChild(lab); chart.appendChild(col);
    });
    var vs=document.getElementById("versions"); vs.innerHTML="";
    var keys=Object.keys(d.versions||{});
    if(keys.length===0){ vs.innerHTML='<span class="chip">no pings yet today</span>'; }
    keys.sort(function(a,b){return d.versions[b]-d.versions[a]}).slice(0,8).forEach(function(k){
      var c=document.createElement("span"); c.className="chip";
      c.innerHTML="v"+k.replace(/</g,"&lt;")+" · <b>"+fmt(d.versions[k])+"</b>";
      vs.appendChild(c);
    });
  }
  render(INITIAL);
  setInterval(function(){
    fetch("/stats?token="+encodeURIComponent(token)+"&json=1",{cache:"no-store"})
      .then(function(r){return r.ok?r.json():null})
      .then(function(d){if(d)render(d)})
      .catch(function(){});
  }, 30000);
</script>
</body></html>`;
}
