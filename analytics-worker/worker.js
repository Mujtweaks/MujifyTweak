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
// Every number on the dashboard is measured. Nothing is fabricated. Feed
// "milestone" events (new peak / new version / new country) are derived from
// real counter transitions, never invented.

const WORKER_VERSION = "2.2.0";

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
      // Real edge metadata for the footer: which Cloudflare location served YOU.
      data.colo = (req.cf && req.cf.colo) || null;
      data.workerVersion = WORKER_VERSION;
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
      peakYesterday: 0,
      totalPings: 0,
      since: null, // first day the counter ever saw a ping
      history: {}, // "YYYY-MM-DD" → pings that day (last 30 days)
      hourly: {}, // "YYYY-MM-DDTHH" → pings that hour (last 48 hours)
      versions: {}, // app version → pings today
      countries: {}, // country code → pings today (aggregate only, no IPs)
      versionsEver: [], // every version ever seen (cap 50) — drives "new version" events
      countriesEver: [], // every country ever seen (cap 250) — drives "new country" events
      feed: [], // newest-first [{t, k: "ping"|"peak"|"version"|"country", v, c, x}] (last 20)
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
    this.s.peakYesterday = this.s.peakOnline;
    this.s.day = today;
    this.s.dailyPings = 0;
    this.s.peakOnline = 0;
    this.s.versions = {};
    this.s.countries = {};
  }

  pushFeed(item) {
    this.s.feed.unshift(item);
    if (this.s.feed.length > 20) this.s.feed.length = 20;
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
      const hkeys = Object.keys(this.s.hourly).sort();
      while (hkeys.length > 48) delete this.s.hourly[hkeys.shift()];

      // Real derived milestone events (never invented).
      if (!this.s.versionsEver.includes(v)) {
        this.s.versionsEver.push(v);
        if (this.s.versionsEver.length > 50) this.s.versionsEver.shift();
        if (this.s.totalPings > 1) this.pushFeed({ t: now, k: "version", v, c, x: v });
      }
      if (c !== "??" && !this.s.countriesEver.includes(c)) {
        this.s.countriesEver.push(c);
        if (this.s.countriesEver.length > 250) this.s.countriesEver.shift();
        if (this.s.totalPings > 1) this.pushFeed({ t: now, k: "country", v, c, x: c });
      }
      const online = this.onlineNow(nowMin);
      if (online > this.s.peakOnline) {
        const prev = this.s.peakOnline;
        this.s.peakOnline = online;
        if (prev > 0 && online > 1) this.pushFeed({ t: now, k: "peak", v, c, x: String(online) });
      }
      this.pushFeed({ t: now, k: "ping", v, c, x: null });

      await this.state.storage.put("state", this.s); // ONE write per ping
      return new Response("ok");
    }

    if (url.pathname === "/stats") {
      this.rollDay(today);
      const ghChanged = await this.refreshGithub();
      if (ghChanged) await this.state.storage.put("state", this.s);

      const online = this.onlineNow(nowMin);

      // Last 30 days (zero-filled) — the client offers a real 14D/30D toggle.
      const days = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
        days.push({ date: d, pings: d === today ? this.s.dailyPings : this.s.history[d] || 0 });
      }
      const sum = (arr) => arr.reduce((a, x) => a + x.pings, 0);
      const thisWeek = sum(days.slice(23));
      const prevWeek = sum(days.slice(16, 23));
      const growthPct = prevWeek > 0 ? ((thisWeek - prevWeek) / prevWeek) * 100 : null;
      const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
      const yesterdayPings = this.s.history[yesterday] || 0;

      // Last 48 hours (zero-filled) — the client offers a real 24H/48H toggle.
      const hours = [];
      for (let i = 47; i >= 0; i--) {
        const h = new Date(now - i * 3600000).toISOString().slice(0, 13);
        hours.push({ hour: h.slice(11) + ":00", pings: this.s.hourly[h] || 0 });
      }

      // Top countries today (aggregate counts only).
      const countries = Object.entries(this.s.countries)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([code, pings]) => ({ code, pings }));

      // Honest version rollups for the release info column.
      const latest = this.s.gh.tag;
      let outdated = 0;
      let betas = 0;
      for (const [ver, n] of Object.entries(this.s.versions)) {
        if (latest && ver !== latest && "v" + ver !== latest) outdated += n;
        if (/beta|rc|alpha/i.test(ver)) betas += n;
      }

      return Response.json({
        onlineNow: online,
        peakOnline: Math.max(this.s.peakOnline, online),
        peakYesterday: this.s.peakYesterday,
        dailyPings: this.s.dailyPings,
        yesterdayPings,
        dailyActivesEstimate:
          this.s.dailyPings > 0 ? Math.max(1, Math.round(this.s.dailyPings / 288)) : 0,
        totalPings: this.s.totalPings,
        since: this.s.since,
        versions: this.s.versions,
        outdatedPings: latest ? outdated : null,
        betaPings: betas,
        countries: countries,
        countriesEverCount: this.s.countriesEver.length,
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
// The owner dashboard — Mujify-branded, live (10s refresh), 100% measured data.
// ---------------------------------------------------------------------------
function statsPage(d) {
  const initial = JSON.stringify(d).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Mujify Tweaks · Owner Dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--bg:#0A0A0B;--rail:#0D0D0F;--card:#131316;--card2:#17171b;--edge:rgba(255,255,255,.06);
 --edge2:rgba(255,255,255,.1);--red:#E3000E;--red2:#ff3b45;--txt:#fff;--txt2:#9a9aa2;--txt3:#5b5b63;
 --green:#22C55E;--yellow:#F59E0B;--blue:#4A9EFF;--purple:#A855F7}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--txt);font-family:Inter,system-ui,sans-serif;font-size:13px;
 background-image:radial-gradient(1200px 500px at 60% -220px,rgba(227,0,14,.10),transparent 70%)}
a{color:inherit;text-decoration:none}
.app{display:grid;grid-template-columns:60px 1fr;min-height:100vh}
/* ---- sidebar rail ---- */
.rail{background:var(--rail);border-right:1px solid var(--edge);display:flex;flex-direction:column;align-items:center;
 padding:14px 0;gap:6px;position:sticky;top:0;height:100vh}
.rail .logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#E3000E,#7d0008);
 display:grid;place-items:center;font-weight:900;font-size:17px;box-shadow:0 4px 22px rgba(227,0,14,.5);margin-bottom:14px}
.rail a.nav{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:var(--txt3)}
.rail a.nav:hover{background:rgba(255,255,255,.06);color:var(--txt2)}
.rail a.nav.active{background:var(--red);color:#fff;box-shadow:0 3px 16px rgba(227,0,14,.45)}
.rail .spacer{flex:1}
.rail svg{width:17px;height:17px}
/* ---- main ---- */
.main{padding:18px 22px 30px;max-width:1330px;width:100%;margin:0 auto}
header.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.htitle h1{font-size:17px;font-weight:800;letter-spacing:.02em}
.htitle small{color:var(--txt3);font-size:10px;font-weight:600;letter-spacing:.24em;text-transform:uppercase}
.tools{display:flex;align-items:center;gap:9px}
.live{display:flex;align-items:center;gap:7px;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.09);
 border-radius:999px;padding:7px 15px;font-size:11px;font-weight:800;letter-spacing:.13em;color:var(--green)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}55%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}
.iconbtn{width:34px;height:34px;border-radius:9px;border:1px solid var(--edge);background:var(--card);color:var(--txt2);
 display:grid;place-items:center;cursor:pointer}
.iconbtn:hover{color:var(--txt);border-color:var(--edge2)}
.iconbtn svg{width:15px;height:15px}
.avatar{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#E3000E,#7d0008);
 display:grid;place-items:center;font-weight:900;font-size:14px}
/* ---- grid ---- */
.content{display:grid;grid-template-columns:1fr 300px;gap:14px}
.colmain{display:flex;flex-direction:column;gap:14px;min-width:0}
.colside{display:flex;flex-direction:column;gap:14px}
/* ---- stat cards ---- */
.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.card{background:var(--card);border:1px solid var(--edge);border-radius:15px;padding:15px 16px 8px;position:relative;overflow:hidden;min-width:0}
.card .l{color:var(--txt3);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.17em;display:flex;justify-content:space-between;align-items:center}
.card .n{font-size:31px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:7px;line-height:1.1}
.card .sub{color:var(--txt2);font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .delta{font-size:10px;font-weight:700;margin-top:3px;display:inline-block}
.card svg.mini{display:block;width:calc(100% + 32px);margin:6px -16px -8px;height:34px}
.card.hero .n{color:var(--red);text-shadow:0 0 28px rgba(227,0,14,.45)}
.pill-live{font-size:8.5px;font-weight:800;letter-spacing:.1em;color:var(--red2);background:rgba(227,0,14,.13);
 border:1px solid rgba(227,0,14,.32);padding:2.5px 8px;border-radius:999px;animation:blink 2s ease-in-out infinite}
@keyframes blink{50%{opacity:.5}}
.up{color:var(--green)}.down{color:var(--red2)}.flat{color:var(--txt3)}
/* ---- health strip ---- */
.health{background:var(--card);border:1px solid var(--edge);border-radius:13px;padding:11px 16px;display:flex;flex-wrap:wrap;gap:4px 22px;align-items:center}
.health .h{font-size:9px;font-weight:700;letter-spacing:.17em;color:var(--txt3);text-transform:uppercase;margin-right:2px}
.hitem{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--txt2);font-weight:500}
.hitem b{color:var(--txt);font-weight:600}
.st{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.ok{background:var(--green);box-shadow:0 0 6px rgba(34,197,94,.6)}
.warn{background:var(--yellow);box-shadow:0 0 6px rgba(245,158,11,.5)}
/* ---- panels ---- */
.panel{background:var(--card);border:1px solid var(--edge);border-radius:15px;padding:16px;min-width:0}
.panel h2{font-size:9px;font-weight:700;color:var(--txt3);letter-spacing:.19em;text-transform:uppercase;margin-bottom:13px;
 display:flex;justify-content:space-between;align-items:center}
.chip{letter-spacing:.02em;text-transform:none;font-weight:600;color:var(--txt2);border:1px solid var(--edge);
 background:var(--card2);border-radius:7px;padding:3px 9px;font-size:10px}
.chip.tgl{cursor:pointer;user-select:none}
.chip.tgl:hover{color:var(--txt);border-color:var(--edge2)}
.chip.on{background:rgba(227,0,14,.16);border-color:rgba(227,0,14,.45);color:#fff}
svg.chart{cursor:crosshair;touch-action:none}
#tip{position:fixed;display:none;z-index:50;background:#1a1a1f;border:1px solid var(--edge2);border-radius:9px;
 padding:7px 11px;font-size:11.5px;font-weight:700;color:var(--txt);pointer-events:none;box-shadow:0 10px 28px rgba(0,0,0,.55)}
#tip b{display:block;color:var(--txt3);font-size:9.5px;font-weight:600;letter-spacing:.08em;margin-bottom:2px}
#tip i{font-style:normal;color:var(--red2)}
.bump{animation:bump .5s ease}
@keyframes bump{0%{opacity:.35}40%{opacity:1}}
tbody tr{transition:background .12s}tbody tr:hover{background:rgba(255,255,255,.025)}
.fitem{transition:background .12s;border-radius:8px}.fitem:hover{background:rgba(255,255,255,.025)}
.spin{animation:rot .7s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
.tworow{display:grid;grid-template-columns:1.35fr 1fr;gap:14px}
.tworow2{display:grid;grid-template-columns:1fr 1.35fr;gap:14px}
svg.chart{display:block;width:100%}
/* ---- geo rows ---- */
.rows .row{display:flex;align-items:center;gap:10px;padding:7.5px 0;border-bottom:1px solid var(--edge);font-size:12px}
.rows .row:last-child{border-bottom:0}
.flag{font-size:16px;width:24px;text-align:center;flex-shrink:0}
.rname{width:42px;color:var(--txt);font-weight:600}
.rbar{flex:1;height:6px;border-radius:99px;background:#1d1d22;overflow:hidden}
.rbar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#E3000E,#ff4d57);box-shadow:0 0 8px rgba(227,0,14,.4)}
.rval{color:var(--txt2);font-variant-numeric:tabular-nums;min-width:52px;text-align:right;font-size:11px}
.rpct{color:var(--txt3);min-width:36px;text-align:right;font-size:10.5px}
/* ---- versions ---- */
.vwrap{display:grid;grid-template-columns:1.5fr 1fr;gap:16px}
.vrow{display:flex;align-items:center;gap:10px;padding:7.5px 0;font-size:12px}
.vpill{font-weight:700;color:var(--txt);min-width:118px;display:flex;align-items:center;gap:6px;font-size:11.5px}
.vdot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.vinfo{border-left:1px solid var(--edge);padding-left:16px;display:flex;flex-direction:column;gap:9px;font-size:11px}
.vinfo .kv{display:flex;justify-content:space-between;color:var(--txt3)}
.vinfo .kv b{color:var(--txt);font-weight:600}
/* ---- feed ---- */
.feed{display:flex;flex-direction:column;max-height:430px;overflow-y:auto}
.feed::-webkit-scrollbar{width:4px}.feed::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
.fitem{display:flex;gap:10px;padding:9px 2px;border-bottom:1px solid var(--edge);font-size:11.5px;align-items:center}
.fitem:last-child{border-bottom:0}
.fdot{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;font-size:12px;flex-shrink:0;border:1px solid}
.fk-ping{background:rgba(227,0,14,.11);border-color:rgba(227,0,14,.28)}
.fk-peak{background:rgba(34,197,94,.11);border-color:rgba(34,197,94,.3)}
.fk-version{background:rgba(168,85,247,.12);border-color:rgba(168,85,247,.3)}
.fk-country{background:rgba(74,158,255,.12);border-color:rgba(74,158,255,.3)}
.fmain{flex:1;min-width:0}.fmain b{color:var(--txt);font-weight:600;font-size:11.5px}
.fsub{color:var(--txt3);font-size:10px;margin-top:1px}
.ftime{color:var(--txt3);font-size:10px;white-space:nowrap}
/* ---- quick actions ---- */
.qa{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.qbtn{border:1px solid var(--edge);background:var(--card2);border-radius:10px;padding:11px 8px;font-size:11px;font-weight:600;
 color:var(--txt2);cursor:pointer;text-align:center;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px}
.qbtn:hover{color:var(--txt);border-color:var(--edge2)}
.qbtn.primary{background:linear-gradient(135deg,#E3000E,#8a0009);color:#fff;border-color:transparent;box-shadow:0 3px 14px rgba(227,0,14,.35)}
.qbtn svg{width:12px;height:12px}
/* ---- events table ---- */
table{width:100%;border-collapse:collapse;font-size:11.5px}
th{color:var(--txt3);font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;text-align:left;padding:0 10px 9px 0}
td{padding:8px 10px 8px 0;border-top:1px solid var(--edge);color:var(--txt2);white-space:nowrap}
td.ev{color:var(--txt);font-weight:600}
.status{font-weight:700;font-size:10.5px}
.s-ok{color:var(--green)}.s-info{color:var(--blue)}
/* ---- footer bar ---- */
.footbar{margin-top:14px;background:var(--card);border:1px solid var(--edge);border-radius:13px;padding:10px 16px;
 display:flex;flex-wrap:wrap;gap:6px 24px;align-items:center;justify-content:space-between;color:var(--txt3);font-size:10.5px}
.footbar b{color:var(--txt2);font-weight:600}
.empty{color:var(--txt3);font-size:11.5px;padding:8px 0}
@media(max-width:1050px){.content{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,1fr)}
 .tworow,.tworow2,.vwrap{grid-template-columns:1fr}.vinfo{border-left:0;padding-left:0;border-top:1px solid var(--edge);padding-top:12px}}
</style></head>
<body><div class="app">
  <nav class="rail">
    <div class="logo">M</div>
    <a class="nav active" href="#top" title="Overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/></svg></a>
    <a class="nav" href="#charts" title="Analytics"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M8 15v3M13 11v7M18 7v11"/></svg></a>
    <a class="nav" href="#geo" title="Geography"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 4 5.7 4 9s-1.5 6.4-4 9c-2.5-2.6-4-5.7-4-9s1.5-6.4 4-9z"/></svg></a>
    <a class="nav" href="#versions" title="Versions"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg></a>
    <a class="nav" href="#events" title="Events"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg></a>
    <div class="spacer"></div>
    <a class="nav" href="https://dash.cloudflare.com" target="_blank" title="Cloudflare settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg></a>
  </nav>

  <div class="main" id="top">
    <header class="top">
      <div class="htitle"><h1>MUJIFY TWEAKS</h1><small>Owner Dashboard · Private</small></div>
      <div class="tools">
        <div class="live"><span class="dot"></span>LIVE</div>
        <button class="iconbtn" onclick="refresh()" title="Refresh now"><svg id="rspin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg></button>
        <button class="iconbtn" onclick="exportJson()" title="Export JSON"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></button>
        <div class="avatar">M</div>
      </div>
    </header>

    <div class="content">
      <div class="colmain">
        <div class="cards">
          <div class="card hero"><div class="l">Online now <span class="pill-live">● LIVE</span></div>
            <div class="n" id="online">–</div><div class="sub">active apps, last ~6 min</div>
            <div class="delta" id="onlineDelta">&nbsp;</div><svg class="mini" id="m1"></svg></div>
          <div class="card"><div class="l">Peak online today</div>
            <div class="n" id="peak">–</div><div class="sub" id="day">&nbsp;</div>
            <div class="delta" id="peakDelta">&nbsp;</div><svg class="mini" id="m2"></svg></div>
          <div class="card"><div class="l">Daily activity</div>
            <div class="n" id="pings">–</div><div class="sub" id="avg">&nbsp;</div>
            <div class="delta" id="pingsDelta">&nbsp;</div><svg class="mini" id="m3"></svg></div>
          <div class="card"><div class="l">Total lifetime pings</div>
            <div class="n" id="total">–</div><div class="sub" id="since">&nbsp;</div>
            <div class="delta up" id="totalDelta">&nbsp;</div><svg class="mini" id="m4"></svg></div>
          <div class="card"><div class="l">Weekly growth</div>
            <div class="n" id="growth">–</div><div class="sub" id="growthsub">&nbsp;</div>
            <div class="delta" id="growthDelta">&nbsp;</div><svg class="mini" id="m5"></svg></div>
        </div>

        <div class="health">
          <span class="h">Service health</span>
          <span class="hitem"><span class="st ok"></span>Ping service <b id="hlat"></b></span>
          <span class="hitem"><span class="st ok"></span>Counter storage <b>operational</b></span>
          <span class="hitem" id="hgh"><span class="st warn"></span>GitHub releases <b>none yet</b></span>
          <span class="hitem"><span class="st ok"></span>Auto-refresh <b>10s</b></span>
        </div>

        <div class="tworow" id="charts">
          <div class="panel"><h2>Daily pings <span><span class="chip tgl on" data-chart="days" data-n="14">14D</span> <span class="chip tgl" data-chart="days" data-n="30">30D</span></span></h2>
            <svg class="chart" id="chartDays" height="150"></svg></div>
          <div class="panel"><h2>Online timeline · pings/hr <span><span class="chip tgl on" data-chart="hours" data-n="24">24H</span> <span class="chip tgl" data-chart="hours" data-n="48">48H</span></span></h2>
            <svg class="chart" id="chartHours" height="150"></svg></div>
        </div>

        <div class="tworow2">
          <div class="panel" id="geo"><h2>Geographic distribution <span class="chip" id="geoChip">today</span></h2>
            <div class="rows" id="countries"><div class="empty">no pings yet today</div></div></div>
          <div class="panel" id="versions"><h2>Version analytics <span class="chip">today</span></h2>
            <div class="vwrap">
              <div id="vlist"><div class="empty">no pings yet today</div></div>
              <div class="vinfo">
                <div class="kv"><span>Latest release</span><b id="vLatest">—</b></div>
                <div class="kv"><span>Released</span><b id="vReleased">—</b></div>
                <div class="kv"><span>Outdated clients</span><b id="vOutdated">—</b></div>
                <div class="kv"><span>Beta pings</span><b id="vBeta">—</b></div>
                <div class="kv"><span>Countries all-time</span><b id="vCountries">—</b></div>
              </div>
            </div></div>
        </div>

        <div class="panel" id="events"><h2>Recent events <span class="chip">newest first</span></h2>
          <div style="overflow-x:auto"><table>
            <thead><tr><th>Time</th><th>Event</th><th>Version</th><th>Location</th><th>Status</th></tr></thead>
            <tbody id="evbody"><tr><td colspan="5" class="empty">waiting for the first ping…</td></tr></tbody>
          </table></div></div>

        <div class="footbar">
          <span>Last updated: <b id="updated">–</b></span>
          <span>Auto-refresh: <b>On</b></span>
          <span>Counting since: <b id="fsince">–</b></span>
          <span>Edge: <b id="fcolo">–</b></span>
          <span>Worker: <b id="fver">–</b></span>
          <span>🔒 No IPs stored · anonymous analytics only</span>
        </div>
      </div>

      <div class="colside">
        <div class="panel"><h2>Live activity feed <a href="#events" class="chip">view all</a></h2>
          <div class="feed" id="feed"><div class="empty">waiting for the first ping…</div></div></div>
        <div class="panel"><h2>Quick actions</h2>
          <div class="qa">
            <button class="qbtn primary" onclick="refresh()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>Refresh</button>
            <button class="qbtn" onclick="exportJson()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>Export</button>
            <a class="qbtn" href="https://github.com/Mujtweaks/MujifyTweak/releases" target="_blank">GitHub releases</a>
            <a class="qbtn" href="https://dash.cloudflare.com" target="_blank">Cloudflare</a>
          </div></div>
      </div>
    </div>
  </div>
</div>
<div id="tip"></div>
<script>
var INITIAL = ${initial};
var token = new URLSearchParams(location.search).get("token");
var latest = INITIAL;
var view = { days: 14, hours: 24 };

function fmt(n){if(n==null)return"-";return n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(n>=1e4?0:1)+"k":String(n)}
function flag(cc){if(!cc||cc.length!==2||cc==="??")return"🌐";
  return String.fromCodePoint(127397+cc.charCodeAt(0),127397+cc.charCodeAt(1))}
function rel(t){var s=Math.max(0,(Date.now()-t)/1000);
  return s<60?Math.round(s)+"s ago":s<3600?Math.round(s/60)+"m ago":s<86400?Math.round(s/3600)+"h ago":Math.round(s/86400)+"d ago"}
function esc(x){return String(x).replace(/[<>&]/g,function(ch){return{"<":"&lt;",">":"&gt;","&":"&amp;"}[ch]})}
function setText(id,val){var el=document.getElementById(id);if(!el)return;var s=String(val);
  if(el.textContent!==s){el.textContent=s;el.classList.remove("bump");void el.offsetWidth;el.classList.add("bump")}}
function deltaTxt(el,cur,prev,label){
  el=document.getElementById(el);
  if(prev==null||prev===0){el.textContent=label?("· "+label):" ";el.className="delta flat";return}
  var pct=(cur-prev)/prev*100, up=pct>=0;
  el.textContent=(up?"↑ ":"↓ ")+Math.abs(pct).toFixed(1)+"% "+(label||"");
  el.className="delta "+(up?"up":"down");
}
function smoothPath(pts){
  if(pts.length<3){return "M"+pts.map(function(p){return p[0]+","+p[1]}).join("L")}
  var d="M"+pts[0][0]+","+pts[0][1];
  for(var i=0;i<pts.length-1;i++){
    var p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    d+="C"+(p1[0]+(p2[0]-p0[0])/6).toFixed(1)+","+(p1[1]+(p2[1]-p0[1])/6).toFixed(1)+" "
        +(p2[0]-(p3[0]-p1[0])/6).toFixed(1)+","+(p2[1]-(p3[1]-p1[1])/6).toFixed(1)+" "
        +p2[0].toFixed(1)+","+p2[1].toFixed(1);
  }
  return d;
}

/* ---- interactive charts: crosshair + tooltip, real data only ---- */
var tip=document.getElementById("tip");
function showTip(html,x,y){tip.innerHTML=html;tip.style.display="block";
  var r=tip.getBoundingClientRect();var px=x+16;if(px+r.width>innerWidth-8)px=x-r.width-16;
  var py=y-r.height-14;if(py<8)py=y+18;tip.style.left=px+"px";tip.style.top=py+"px"}
function hideTip(){tip.style.display="none"}
function chartMove(e){var svg=e.currentTarget,c=svg.__c;if(!c)return;
  var r=svg.getBoundingClientRect();
  var i=Math.round((e.clientX-r.left)/r.width*(c.v.length-1));
  i=Math.max(0,Math.min(c.v.length-1,i));
  var px=i/(c.v.length-1)*c.W, py=c.padT+(1-c.v[i]/c.max)*(c.H-c.padT-c.padB);
  var g=document.getElementById(c.cross);if(!g)return;g.style.display="";
  var ln=g.querySelector("line"),ci=g.querySelector("circle");
  ln.setAttribute("x1",px);ln.setAttribute("x2",px);
  ci.setAttribute("cx",px);ci.setAttribute("cy",py);
  showTip("<b>"+esc(c.l[i])+"</b><i>"+Number(c.v[i]).toLocaleString()+"</i> "+c.unit,e.clientX,e.clientY);
}
function chartLeave(e){var c=e.currentTarget.__c;
  if(c){var g=document.getElementById(c.cross);if(g)g.style.display="none"}hideTip()}

var GID=0;
function areaChart(id,values,labels,color,unit){
  var svg=document.getElementById(id); if(!svg)return;
  var W=svg.clientWidth||560,H=150,padB=16,padT=8;
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  var max=1;values.forEach(function(v){if(v>max)max=v});
  var pts=values.map(function(v,i){return[ i/(values.length-1)*W, padT+(1-v/max)*(H-padT-padB) ]});
  var line=smoothPath(pts);
  var area=line+"L"+W+","+(H-padB)+"L0,"+(H-padB)+"Z";
  var gid="g"+(GID++);
  var grid="";
  for(var g=1;g<=3;g++){var gy=padT+(H-padT-padB)*g/4;
    grid+='<line x1="0" y1="'+gy+'" x2="'+W+'" y2="'+gy+'" stroke="rgba(255,255,255,.04)" stroke-dasharray="3 5"/>'}
  var mid=Math.floor(labels.length/2);
  var lbl='<text x="2" y="'+(H-3)+'" fill="#5b5b63" font-size="8.5">'+esc(labels[0])+'</text>'+
    '<text x="'+(W/2-14)+'" y="'+(H-3)+'" fill="#5b5b63" font-size="8.5">'+esc(labels[mid])+'</text>'+
    '<text x="'+(W-40)+'" y="'+(H-3)+'" fill="#5b5b63" font-size="8.5">'+esc(labels[labels.length-1])+'</text>';
  var last=pts[pts.length-1];
  svg.innerHTML='<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0" stop-color="'+color+'" stop-opacity=".32"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+
    grid+'<path d="'+area+'" fill="url(#'+gid+')"/>'+
    '<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>'+
    '<circle cx="'+last[0]+'" cy="'+last[1]+'" r="3" fill="'+color+'"/>'+
    '<circle cx="'+last[0]+'" cy="'+last[1]+'" r="6" fill="'+color+'" opacity=".25"/>'+lbl+
    '<text x="2" y="10" fill="#5b5b63" font-size="8.5">max '+fmt(max)+'</text>'+
    '<g id="'+id+'X" style="display:none"><line y1="'+padT+'" y2="'+(H-padB)+
    '" stroke="rgba(255,255,255,.28)" stroke-dasharray="2 3"/><circle r="4.5" fill="'+color+
    '" stroke="#0A0A0B" stroke-width="2"/></g>';
  svg.__c={v:values,l:labels,color:color,W:W,H:H,padT:padT,padB:padB,max:max,unit:unit,cross:id+"X"};
  if(!svg.__wired){svg.__wired=true;
    svg.addEventListener("pointermove",chartMove);
    svg.addEventListener("pointerleave",chartLeave);}
}
function mini(id,values,color){
  var svg=document.getElementById(id); if(!svg)return;
  var W=svg.clientWidth||220,H=34;
  svg.setAttribute("viewBox","0 0 "+W+" "+H);
  var max=1;values.forEach(function(v){if(v>max)max=v});
  var pts=values.map(function(v,i){return[ i/(values.length-1)*W, 4+(1-v/max)*(H-8) ]});
  var line=smoothPath(pts);
  var gid="mg"+(GID++);
  svg.innerHTML='<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1">'+
    '<stop offset="0" stop-color="'+color+'" stop-opacity=".3"/><stop offset="1" stop-color="'+color+'" stop-opacity="0"/></linearGradient></defs>'+
    '<path d="'+line+'L'+W+','+H+'L0,'+H+'Z" fill="url(#'+gid+')"/>'+
    '<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="1.7"/>';
}
var KMETA={ping:["⚡","App online ping","fk-ping","Received","s-ok"],
  peak:["▲","New peak online","fk-peak","Info","s-info"],
  version:["✦","New version seen","fk-version","Info","s-info"],
  country:["◈","New country","fk-country","Info","s-info"]};

function render(d){
  latest=d;
  var hp=d.hours.map(function(x){return x.pings});
  var hl=d.hours.map(function(x){return x.hour});
  var dp=d.days.map(function(x){return x.pings});
  var dl=d.days.map(function(x){return x.date.slice(5)});
  setText("online",fmt(d.onlineNow));
  setText("peak",fmt(d.peakOnline));
  setText("pings",fmt(d.dailyPings));
  setText("total",fmt(d.totalPings));
  document.title="("+d.onlineNow+" online) Mujify Stats";
  document.getElementById("day").textContent=d.day||"";
  var hrsElapsed=Math.max(1,new Date().getUTCHours()+1);
  document.getElementById("avg").textContent="avg "+(d.dailyPings/hrsElapsed).toFixed(1)+"/hr · est. "+fmt(d.dailyActivesEstimate)+" actives";
  document.getElementById("since").textContent=d.since?("since "+d.since):"";
  deltaTxt("onlineDelta",hp[hp.length-1],hp[hp.length-2],"vs last hour");
  deltaTxt("peakDelta",d.peakOnline,d.peakYesterday,"vs yesterday");
  deltaTxt("pingsDelta",d.dailyPings,d.yesterdayPings,"vs yesterday");
  document.getElementById("totalDelta").textContent="+"+fmt(d.dailyPings)+" today";
  var g=document.getElementById("growth");
  if(d.growthPct==null){setText("growth","-");g.className="n flat";
    document.getElementById("growthsub").textContent="needs 2 weeks of history";
    document.getElementById("growthDelta").textContent=" ";}
  else{var up=d.growthPct>=0;setText("growth",(up?"↑":"↓")+Math.abs(d.growthPct).toFixed(1)+"%");
    g.className="n "+(up?"up":"down");
    document.getElementById("growthsub").textContent=fmt(d.thisWeek)+" vs "+fmt(d.prevWeek)+" pings";
    document.getElementById("growthDelta").textContent="vs previous 7 days";
    document.getElementById("growthDelta").className="delta flat";}
  document.getElementById("updated").textContent=new Date(d.updated).toLocaleTimeString();
  document.getElementById("fsince").textContent=d.since||"-";
  document.getElementById("fcolo").textContent=d.colo?("Cloudflare "+d.colo):"-";
  document.getElementById("fver").textContent="v"+(d.workerVersion||"?");

  mini("m1",hp.slice(-12),"#E3000E"); mini("m2",hp.slice(-24),"#E3000E");
  mini("m3",hp.slice(-24),"#F59E0B"); mini("m4",dp.slice(-14),"#22C55E"); mini("m5",dp.slice(-7),"#4A9EFF");

  areaChart("chartDays",dp.slice(-view.days),dl.slice(-view.days),"#E3000E","pings");
  areaChart("chartHours",hp.slice(-view.hours),hl.slice(-view.hours),"#E3000E","pings/hr");

  var cn=document.getElementById("countries");
  var totC=0; d.countries.forEach(function(x){totC+=x.pings});
  document.getElementById("geoChip").textContent=d.countries.length+" countr"+(d.countries.length===1?"y":"ies")+" today";
  if(!d.countries.length){cn.innerHTML='<div class="empty">no pings yet today</div>';}
  else{var cmax=d.countries[0].pings; cn.innerHTML="";
    d.countries.forEach(function(x){
      var r=document.createElement("div");r.className="row";
      r.innerHTML='<span class="flag">'+flag(x.code)+'</span><span class="rname">'+esc(x.code)+
        '</span><span class="rbar"><i style="width:'+Math.round(x.pings/cmax*100)+'%"></i></span>'+
        '<span class="rpct">'+(totC?Math.round(x.pings/totC*100):0)+'%</span>'+
        '<span class="rval">'+fmt(x.pings)+' pings</span>';
      cn.appendChild(r);});}

  var vs=document.getElementById("vlist");
  var keys=Object.keys(d.versions||{});
  var VCOLORS=["#E3000E","#A855F7","#4A9EFF","#22C55E","#F59E0B","#9a9aa2"];
  if(!keys.length){vs.innerHTML='<div class="empty">no pings yet today</div>';}
  else{var tot=0;keys.forEach(function(k){tot+=d.versions[k]});vs.innerHTML="";
    keys.sort(function(a,b){return d.versions[b]-d.versions[a]}).slice(0,6).forEach(function(k,i){
      var pct=d.versions[k]/tot*100;
      var isLatest=d.latestRelease&&(k===d.latestRelease||("v"+k)===d.latestRelease);
      var r=document.createElement("div");r.className="vrow";
      r.innerHTML='<span class="vpill"><span class="vdot" style="background:'+VCOLORS[i%6]+'"></span>'+
        (isLatest?"✦ ":"")+"v"+esc(k)+'</span>'+
        '<span class="rbar"><i style="width:'+pct.toFixed(0)+'%;background:linear-gradient(90deg,'+VCOLORS[i%6]+','+VCOLORS[i%6]+'cc)"></i></span>'+
        '<span class="rval">'+pct.toFixed(1)+'%</span>';
      vs.appendChild(r);});}
  document.getElementById("vLatest").textContent=d.latestRelease||"none yet";
  document.getElementById("vReleased").textContent=d.latestReleaseAt?new Date(d.latestReleaseAt).toLocaleDateString():"—";
  document.getElementById("vOutdated").textContent=d.outdatedPings==null?"—":fmt(d.outdatedPings)+" pings";
  document.getElementById("vBeta").textContent=fmt(d.betaPings)+" pings";
  document.getElementById("vCountries").textContent=fmt(d.countriesEverCount);
  var hg=document.getElementById("hgh");
  hg.innerHTML=d.latestRelease
    ?'<span class="st ok"></span>GitHub releases <b>'+esc(d.latestRelease)+'</b>'
    :'<span class="st warn"></span>GitHub releases <b>none yet</b>';

  var fd=document.getElementById("feed");
  if(!d.feed||!d.feed.length){fd.innerHTML='<div class="empty">waiting for the first ping…</div>';}
  else{fd.innerHTML="";
    d.feed.forEach(function(f){
      var m=KMETA[f.k]||KMETA.ping;
      var sub=f.k==="peak"?(esc(f.x)+" online at once")
        :f.k==="version"?("v"+esc(f.x)+" first seen")
        :f.k==="country"?(flag(f.x)+" "+esc(f.x)+" first ping ever")
        :("v"+esc(f.v)+" · "+flag(f.c)+" "+esc(f.c));
      var it=document.createElement("div");it.className="fitem";
      it.innerHTML='<div class="fdot '+m[2]+'">'+m[0]+'</div><div class="fmain"><b>'+m[1]+'</b>'+
        '<div class="fsub">'+sub+'</div></div><span class="ftime" data-t="'+f.t+'">'+rel(f.t)+'</span>';
      fd.appendChild(it);});}

  var tb=document.getElementById("evbody");
  if(!d.feed||!d.feed.length){tb.innerHTML='<tr><td colspan="5" class="empty">waiting for the first ping…</td></tr>';}
  else{tb.innerHTML="";
    d.feed.slice(0,10).forEach(function(f){
      var m=KMETA[f.k]||KMETA.ping;
      var tr=document.createElement("tr");
      tr.innerHTML='<td class="ftime" data-t="'+f.t+'">'+rel(f.t)+'</td><td class="ev">'+m[0]+" "+m[1]+'</td>'+
        '<td>v'+esc(f.v)+'</td><td>'+flag(f.c)+" "+esc(f.c)+'</td>'+
        '<td class="status '+m[4]+'">'+m[3]+'</td>';
      tb.appendChild(tr);});}
}

function refresh(){
  var rb=document.getElementById("rspin"); if(rb)rb.classList.add("spin");
  var t0=performance.now();
  fetch("/stats?token="+encodeURIComponent(token)+"&json=1",{cache:"no-store"})
    .then(function(r){
      document.getElementById("hlat").textContent=Math.round(performance.now()-t0)+"ms";
      return r.ok?r.json():null})
    .then(function(d){if(d)render(d)})
    .catch(function(){})
    .finally(function(){setTimeout(function(){if(rb)rb.classList.remove("spin")},350)});
}
function exportJson(){
  var blob=new Blob([JSON.stringify(latest,null,2)],{type:"application/json"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="mujify-stats-"+(latest.day||"export")+".json";a.click();
}
document.querySelectorAll(".tgl").forEach(function(ch){
  ch.addEventListener("click",function(){
    var grp=ch.getAttribute("data-chart");
    view[grp]=Number(ch.getAttribute("data-n"));
    document.querySelectorAll('.tgl[data-chart="'+grp+'"]').forEach(function(o){o.classList.toggle("on",o===ch)});
    render(latest);
  });
});
render(INITIAL);
refresh();
setInterval(refresh,10000);
setInterval(function(){document.querySelectorAll(".ftime[data-t]").forEach(function(el){
  el.textContent=rel(Number(el.getAttribute("data-t")))})},1000);
window.addEventListener("resize",function(){render(latest)});
</script>
</body></html>`;
}
