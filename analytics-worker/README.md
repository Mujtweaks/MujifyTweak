# Mujify analytics worker

A tiny, privacy-first Cloudflare Worker that counts **online now** and estimates
**daily actives** from an anonymous heartbeat. It stores **no IPs, no ids, no
UUIDs** — only minute-bucket counts in a single Durable Object.

- `POST /` — the app's 5-minute ping, body `{"v":"<app version>"}`.
- `GET /stats?token=SECRET` — a token-protected HTML dashboard.

## Deploy

```bash
wrangler login
wrangler secret put STATS_TOKEN   # your dashboard password (a long random string)
wrangler deploy
```

Then set `ANALYTICS_ENDPOINT` in `src/lib/links.ts` to the worker URL and add the
host to the CSP `connect-src` in `src-tauri/tauri.conf.json`. Full walkthrough:
`../OWNER_DASHBOARD.md`.
