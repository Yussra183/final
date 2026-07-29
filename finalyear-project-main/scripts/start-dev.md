# Start the app against the named tunnel

After you've completed the one-time setup in
[`setup-named-tunnel.md`](./setup-named-tunnel.md), every dev session looks
the same — three terminals, no source edits.

> **The one rule:** never edit `src/api/config.ts` (or any other file) to
> change the backend URL. The only thing that should ever change between
> machines / networks / sessions is `EXPO_PUBLIC_API_BASE_URL` in
> `.env.local`, and only the *first* time on a new machine.

---

## Terminal 1 — backend

```bash
cd gas-delivery
mvn spring-boot:run
```

Should print `Tomcat started on port 8080`. Leave it running.

## Terminal 2 — named tunnel

```bash
cloudflared tunnel run <your-tunnel-name>
```

(e.g. `cloudflared tunnel run dev-tunnel`.)

The URL is fixed by the `route dns` step you ran during one-time setup
(e.g. `https://dev-api.your-domain.com`) — nothing here prints a new
URL, and nothing here should ever change.

If the tunnel exits, restart this command. The Spring Boot process on
port 8080 keeps running either way.

## Terminal 3 — Expo

```bash
cd finalyear-project-main
npx expo start
```

Then press `i` (iOS simulator), `a` (Android emulator), or scan the QR
code with Expo Go on a physical device.

> **One caveat:** if you change `EXPO_PUBLIC_API_BASE_URL` in
> `.env.local` for any reason, you MUST restart this terminal. Expo
> inlines `EXPO_PUBLIC_*` values at bundle time.

---

## What survives what

| Change                                  | Needs source edit? | Needs `.env.local` edit? | Needs Expo restart? |
|-----------------------------------------|--------------------|---------------------------|---------------------|
| Switch Wi-Fi (home → campus → hotspot)  | No                 | No                        | No                  |
| Restart laptop                          | No                 | No                        | No                  |
| Restart `cloudflared`                   | No                 | No                        | No                  |
| Restart Spring Boot                     | No                 | No                        | No                  |
| Restart Expo (`expo start` Ctrl-C, rerun) | No               | No                        | n/a (it IS the restart) |
| Move to a new machine                   | **Yes — once**     | Create `.env.local` once  | Yes                 |
| Add a new named-tunnel hostname         | **Yes — once**     | Edit `.env.local` once    | Yes                 |

The bottom two rows are intentional: they're the "one-time setup" rows.
The named-tunnel path means the top six rows never need anything more
than the three commands above.

---

## Quick smoke-test (30 seconds)

Before opening the app, confirm the tunnel is actually serving the
backend (so any later error is definitely the app, not the tunnel):

```bash
# REST — should return JSON (200 / 401 / 403, never a connection error).
curl -i https://dev-api.your-domain.com/api/sellers

# WebSocket handshake — should return `HTTP/1.1 101 Switching Protocols`.
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://dev-api.your-domain.com/ws/tracking
```

If both succeed, open the app and log in. You should see the normal
401-on-bad-credentials flow, **not** the "Could not reach backend at …"
alert.

---

## If the login screen still shows "Network request failed"

1. `cloudflared tunnel run …` — is it still running? (Re-launch if not.)
2. `curl -i https://<your-hostname>/api/sellers` — does it return JSON?
   - No  → tunnel or backend problem, not the app. Fix the tunnel first.
   - Yes → kill `expo start` and restart it. The JS bundle was built
     before the env var was last set.
3. Did you just edit `EXPO_PUBLIC_API_BASE_URL`? Restart Expo.
4. Still broken? `console.info("[API][RESOLVED_BASE_URL]", …)` is
   logged once at app boot. Check the value matches the hostname
   `cloudflared` is serving.
