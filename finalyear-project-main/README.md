# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Backend connectivity (dev tunnel)

The app talks to the Spring Boot backend (port `8080`) through **one**
configurable URL, `EXPO_PUBLIC_API_BASE_URL`, which drives both the REST
client and the WebSocket tracking channel. Set it once and switching Wi-Fi
never requires a source edit again.

### One-time setup

```bash
cp .env.example .env.local   # .env.local is git-ignored
```

### Recommended: Cloudflare Tunnel (stable URL, any network)

A LAN IP changes every time you switch network (home / campus / hotspot),
which is what causes `Network request failed` on a physical device. A dev
tunnel gives you a fixed public URL instead.

For the **stable URL** path (URL never changes between runs), follow
[`scripts/setup-named-tunnel.md`](./scripts/setup-named-tunnel.md) — it's
a one-time `cloudflared login` / `tunnel create` / `route dns` and then
just `cloudflared tunnel run <name>` per session. **Per-session startup
(three terminals, no source edits) is in
[`scripts/start-dev.md`](./scripts/start-dev.md).**

**Fallback — quick-tunnel** (URL changes on every `cloudflared` restart,
fine for a single afternoon of hacking):

```bash
# 1. Run the backend
cd ../gas-delivery && mvn spring-boot:run        # serves http://localhost:8080

# 2. Expose it over a tunnel (in a second terminal)
cloudflared tunnel --url http://localhost:8080   # prints https://<id>.trycloudflare.com
```

Put the URL in `.env.local` (named-tunnel hostname OR the printed quick-tunnel):

```
EXPO_PUBLIC_API_BASE_URL=https://dev-api.your-domain.com
# or, for the quick-tunnel fallback:
# EXPO_PUBLIC_API_BASE_URL=https://<id>.trycloudflare.com
```

Then restart Expo so the value is re-inlined:

```bash
npx expo start
```

An `https://` URL automatically yields a secure `wss://` WebSocket — no
separate configuration. Because the backend is already public through the
tunnel, `--tunnel` on Expo is optional.

**Ngrok alternative:** `ngrok http 8080` → use its `https://` URL the same way.

**Android emulator / iOS simulator:** leave `EXPO_PUBLIC_API_BASE_URL` unset
— the app auto-probes the loopback aliases (`10.0.2.2`, `localhost`) and works
with zero config.

**Staging / production:** just set a different `EXPO_PUBLIC_API_BASE_URL`
value (EAS env var or a swapped `.env.local`). No source change, no
`NODE_ENV` switching.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
