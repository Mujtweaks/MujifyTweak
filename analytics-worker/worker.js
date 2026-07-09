// Mujify Tweaks — anonymous online-status worker (Cloudflare Workers, free tier).
//
// PRIVACY BY DESIGN. The app only ever POSTs `{ "v": "<app version>" }`. This
// worker stores NO IP addresses, NO machine ids, NO UUIDs — only minute-bucket
// counts and a daily ping total. "Online now" ≈ the number of pings in the last
// ~6 minutes (each app pings every 5 min). "Daily actives" is an estimate =
// daily pings / ~288 pings-per-client-per-day. Both are honestly labelled.
//
// Endpoints:
//   POST /            — a heartbeat ping from the app (body: {"v":"..."})
//   GET  /stats?token=SECRET  — your browser dashboard (token-protected)
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
      await stub.fetch("https://do/ping", { method: "POST" });
      return new Response("ok", { headers: CORS });
    }

    if (req.method === "GET" && url.pathname === "/stats") {
      if (url.searchParams.get("token") !== env.STATS_TOKEN) {
        return new Response("unauthorized", { status: 401 });
      }
      const data = await (await stub.fetch("https://do/stats")).json();
      return new Response(statsPage(data), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Mujify analytics: ok");
  },
};

export class Counter {
  constructor(state) {
    this.state = state;
    this.buckets = new Map(); // minute → ping count (last ~6 min)
    this.day = null;
    this.dailyPings = 0;
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    const d = await this.state.storage.get("daily");
    if (d) {
      this.day = d.day;
      this.dailyPings = d.pings;
    }
    this.loaded = true;
  }

  prune(nowMin) {
    for (const k of this.buckets.keys()) if (k < nowMin - 5) this.buckets.delete(k);
  }

  async fetch(req) {
    await this.load();
    const url = new URL(req.url);
    const nowMin = Math.floor(Date.now() / 60000);
    const today = new Date().toISOString().slice(0, 10);

    if (url.pathname === "/ping") {
      this.prune(nowMin);
      this.buckets.set(nowMin, (this.buckets.get(nowMin) || 0) + 1);
      if (this.day !== today) {
        this.day = today;
        this.dailyPings = 0;
      }
      this.dailyPings += 1;
      await this.state.storage.put("daily", { day: this.day, pings: this.dailyPings });
      return new Response("ok");
    }

    if (url.pathname === "/stats") {
      this.prune(nowMin);
      let online = 0;
      for (const v of this.buckets.values()) online += v;
      const dailyActives = this.dailyPings > 0 ? Math.max(1, Math.round(this.dailyPings / 288)) : 0;
      return Response.json({
        onlineNow: online,
        dailyActivesEstimate: dailyActives,
        day: this.day,
        updated: new Date().toISOString(),
      });
    }

    return new Response("ok");
  }
}

function statsPage(d) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mujify · Live</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#0A0A0A;color:#fff;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh}
.card{text-align:center}.n{font-size:72px;font-weight:800;color:#E3000E;line-height:1}.l{color:#8E8E95;text-transform:uppercase;letter-spacing:2px;font-size:12px;margin-top:6px}
.row{display:flex;gap:48px;margin-top:8px}.u{color:#555;font-size:11px;margin-top:28px}</style></head>
<body><div class="card"><div class="row">
<div><div class="n">${d.onlineNow}</div><div class="l">Online now</div></div>
<div><div class="n">${d.dailyActivesEstimate}</div><div class="l">Daily actives (est.)</div></div>
</div><div class="u">${d.day || ""} · updated ${d.updated}</div></div></body></html>`;
}
