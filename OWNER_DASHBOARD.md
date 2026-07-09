# Owner Dashboard (private) — how to see how Mujify is doing

Two numbers matter: **downloads** (GitHub counts these for free) and **online now**
(the anonymous ping worker). Neither collects any personal data.

---

## 1. Downloads — zero app code, GitHub already counts them

Every release asset has a `download_count`. Bookmark this URL (public, read-only):

```
https://api.github.com/repos/Mujtweaks/MujifyTweak/releases
```

Each release lists its `assets[]`; the installer asset's `download_count` is your
download number. Quick ways to read it:

- **Browser**: open the URL, `Ctrl+F` for `download_count`.
- **Terminal** (total across all assets of the latest release):
  ```bash
  curl -s https://api.github.com/repos/Mujtweaks/MujifyTweak/releases/latest \
    | grep -o '"download_count": [0-9]*' | awk '{s+=$2} END {print s}'
  ```
- The GitHub web UI also shows per-asset counts on the Releases page.

**README badges** (already added) show the latest version and total downloads
automatically via shields.io — no maintenance.

---

## 2. Online now — the anonymous ping worker (Cloudflare, free tier)

The app sends a single ping every 5 minutes containing **only the app version** —
no name, no machine id, no UUID, and the worker stores **no IP addresses**. It's
on by default, openly disclosed on the first-run welcome screen, and one-click
off in Settings → Privacy.

**Status: the worker is already created** in the Cloudflare dashboard
(account: cheaplabs2) as `mujify-stats`, currently running the hello-world
placeholder. The app is already pointed at it (`ANALYTICS_ENDPOINT` in
`src/lib/links.ts`) and the host is already in the CSP `connect-src`. The only
remaining one-time step is deploying the real code:

### Deploy the real code (one time)

```bash
cd analytics-worker
npx wrangler login                  # opens a browser — approve the access
npx wrangler deploy                 # replaces the hello-world placeholder
npx wrangler secret put STATS_TOKEN # paste a long random secret (your dashboard password)
```

The worker name in `wrangler.toml` is `mujify-stats` on purpose — it must match
the dashboard-created worker so the deploy REPLACES the placeholder at the URL
the app already calls. Do not rename it.

### Your browser dashboard

Bookmark (replace `YOURSECRET` with the STATS_TOKEN you set):

```
https://mujify-stats.cheaplabs2-4b2.workers.dev/stats?token=YOURSECRET
```

It shows **Online now** and an **estimated Daily actives**. Honest math:
- *Online now* ≈ pings received in the last ~6 minutes (each app pings every 5).
- *Daily actives (est.)* ≈ daily pings ÷ ~288 (pings per client per day).

Keep the token secret — anyone with it can see the (aggregate, anonymous) numbers.

---

## Privacy summary (what to tell users, honestly)

**No personal data. No tracking. No account.** The only thing ever sent is an
anonymous "online" ping (app version only) — disclosed on the first-run screen
and one-click off in Settings → Privacy. Everything else — health scans, tweaks,
sessions, the Detective, logs — stays 100% on the user's machine.
