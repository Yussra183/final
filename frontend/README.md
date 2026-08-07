# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npm run dev:lan
   ```

   `npm run dev:lan` detects the laptop's current LAN IPv4 on every run,
   writes `EXPO_PUBLIC_API_BASE_URL=http://<lan-ip>:8080` into
   `.env.local`, and launches Expo against the new URL — no manual
   edits after Wi-Fi changes or reboots.

   If you'd rather start Expo without the auto-detect helper, plain
   `npx expo start` works too — but the URL in `.env.local` (or the
   default localhost) is whatever was last written there.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Backend connectivity (direct LAN)

The app talks to the Spring Boot backend (port `8080`) through **one**
configurable URL, `EXPO_PUBLIC_API_BASE_URL`, which drives both the REST
client and the WebSocket tracking channel.

### One-time setup

```bash
cp .env.example .env.local   # .env.local is git-ignored
```

### `npm run dev:lan` — auto-detected LAN IP, no manual edits

A laptop's LAN IP changes every time you switch Wi-Fi (home → campus →
hotspot) or reboot, which is what causes `Network request failed` on a
physical device when the URL points at the old IP.

`npm run dev:lan` (alias for `node scripts/dev-lan-url.js`) handles this
on every run:

1. Detects the laptop's current LAN IPv4 (best non-loopback
   non-link-local interface).
2. Probes the backend on that IP:8080. If it isn't reachable, the
   launcher refuses to start Expo and tells you to bring up the
   Spring Boot backend in a separate terminal — no more silent "Could
   not reach backend at <old-ip>" alerts on the login screen.
3. Writes `EXPO_PUBLIC_API_BASE_URL=http://<lan-ip>:8080` into
   `.env.local`, replacing any stale value.
4. Spawns `npx expo start` with the URL injected into the child's
   environment, so the freshly built bundle picks up the new value
   even when a stale Metro cache lingers.

Re-run it any time the LAN IP changes (Wi-Fi switch, DHCP renewal,
reboot). Switching networks after that needs no source edits.

**Android emulator / iOS simulator:** leave `EXPO_PUBLIC_API_BASE_URL`
unset — the app auto-probes the loopback aliases (`10.0.2.2`,
`localhost`) and works with zero config.

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