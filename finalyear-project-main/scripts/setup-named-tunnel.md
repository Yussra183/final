# Cloudflare Named Tunnel — setup

A Cloudflare **named tunnel** gives you a STABLE public URL for your local
Spring Boot backend. Unlike `cloudflared tunnel --url` (which mints a fresh
`*.trycloudflare.com` URL on every restart), the named tunnel binds to a
hostname **you own** (e.g. `dev-api.your-domain.com`) — so
`EXPO_PUBLIC_API_BASE_URL` never changes between sessions.

This walkthrough is the long form of the README's "stable URL" claim.
For the one-shot quick-tunnel alternative, see the README's
"Backend connectivity (dev tunnel)" section.

---

## 1. Prerequisites

- A Cloudflare account — https://dash.cloudflare.com/sign-up
- A domain **added to that account** (free tier is fine — the tunnel
  just needs DNS records in your zone).
- `cloudflared` installed locally — see the official install guide:
  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  Verify with `cloudflared --version`.
- The Spring Boot backend able to run on `localhost:8080` (see
  `gas-delivery/`).

## 2. One-time setup

These four steps run **once per machine**, then you're done.

### 2.1. Authenticate

```bash
cloudflared tunnel login
```

A browser window opens. Pick the zone (domain) you want to create
tunnels under. This writes `~/.cloudflared/cert.pem` — that file
authorizes `cloudflared` to manage DNS records in your zone.

### 2.2. Create the tunnel

```bash
cloudflared tunnel create dev-tunnel
```

This prints the tunnel UUID and writes the matching credentials JSON to
`~/.cloudflared/<UUID>.json`. **Save the UUID** — you'll paste it into
the config in 2.4.

You can name the tunnel anything (`gas-dev`, `maryam-laptop`, …); the
name only matters for `cloudflared tunnel run <name>` and `cloudflared
tunnel list`.

### 2.3. Route DNS

```bash
cloudflared tunnel route dns dev-tunnel dev-api.your-domain.com
```

This creates a `CNAME dev-api → <UUID>.cfargotunnel.com` record in your
Cloudflare zone. DNS propagation is usually <60 s.

### 2.4. Drop in the config

```bash
cp finalyear-project-main/cloudflared/config.yml.example ~/.cloudflared/config.yml
```

Open `~/.cloudflared/config.yml` and replace both placeholders:

- `REPLACE_WITH_TUNNEL_UUID` → the UUID from step 2.2 (twice — `tunnel:`
  and `credentials-file:`).
- `dev-api.your-domain.com` → the hostname from step 2.3.

The file is **outside** the repo (in `~/.cloudflared/`), so it never
gets accidentally committed.

## 3. Per-session run

Two terminals.

**Terminal 1 — backend:**

```bash
cd gas-delivery && mvn spring-boot:run
```

**Terminal 2 — tunnel:**

```bash
cloudflared tunnel run dev-tunnel
```

You should see `Connection established connIndex=0 …` and the process
stays in the foreground. Stop it with Ctrl-C.

## 4. Wire it into the app

In `finalyear-project-main/.env.local` (copy from `.env.example` if you
haven't already):

```
EXPO_PUBLIC_API_BASE_URL=https://dev-api.your-domain.com
```

Then restart Expo so the value is re-inlined:

```bash
cd finalyear-project-main && npx expo start
```

## 5. Verify

Smoke-test the tunnel before touching the app:

```bash
# REST — 200 (public) or 401 (auth-gated); never connection-refused.
curl -i https://dev-api.your-domain.com/actuator/health
curl -i https://dev-api.your-domain.com/api/sellers

# WebSocket handshake — should return `101 Switching Protocols`.
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://dev-api.your-domain.com/ws/tracking
```

In the app: open the login screen. The "Could not reach backend at …"
alert should be gone and a bad-credentials attempt should return a
normal 401 (i.e. the tunnel worked; auth is the only thing left).

## 6. Troubleshooting

- **`dial tcp 127.0.0.1:8080: connect: connection refused`**
  → The backend isn't running on port 8080. Check Terminal 1.
- **`ERR_TUNNEL_CONNECTION_FAILED` in the browser**
  → The tunnel process is dead. Check Terminal 2 output.
- **`failed to read cert.pem`**
  → Re-run `cloudflared tunnel login` (the cert may have expired, or
  you're on a new machine).
- **DNS doesn't resolve (`dig dev-api.your-domain.com` returns nothing)**
  → DNS propagation can take a few minutes. Verify the CNAME in the
  Cloudflare dashboard → DNS → Records.
- **`credentials file not found`**
  → The path in `credentials-file:` is wrong, or you deleted the JSON.
  Re-run `cloudflared tunnel create <name>` (idempotent — won't
  overwrite, just remints if missing).
- **WebSocket connects then disconnects immediately**
  → The `Authorization: Bearer <token>` header is missing.
  `buildWsUrl()` in `src/api/config.ts` derives the URL from
  `EXPO_PUBLIC_API_BASE_URL` automatically — confirm the env var is
  set to a real value (not the placeholder) and Expo was restarted.
- **Expo can't reach the tunnel even though curl can**
  → Expo was started BEFORE the env var was set. Kill `expo start`
  and restart — `EXPO_PUBLIC_*` is inlined at bundle time.

## 7. Why this beats `cloudflared tunnel --url`

The `--url` flag creates a **quick-tunnel**: Cloudflare picks a random
subdomain on `trycloudflare.com` and binds it to your process for as
long as the process runs. Restart `cloudflared` and you get a new
hostname — which means editing `.env.local`, restarting Expo, and
re-pointing any physical-device build that was still pointing at the
old URL.

A named tunnel binds to **your** hostname (the `CNAME` you routed in
step 2.3). `EXPO_PUBLIC_API_BASE_URL=https://dev-api.your-domain.com`
works across restarts, across machines, and across collaborators —
one config, one truth.
