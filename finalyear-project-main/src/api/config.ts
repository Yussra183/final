/**
 * Centralized API configuration.
 *
 * USE_MOCK is `false` — the app talks to the live Spring Boot backend.
 *
 * ## The base-URL rule (LAN IP, kept fresh on every dev launch)
 *
 * The backend URL is read from the `EXPO_PUBLIC_API_BASE_URL` environment
 * variable. The `npm run dev:lan` launcher (`scripts/dev-lan-url.js`)
 * detects the laptop's current LAN IPv4 on every run, probes the
 * backend on that IP, and writes the URL here *and* injects it into the
 * Expo child's environment so the bundle is rebuilt with the right
 * value. As long as the phone shares the laptop's Wi-Fi, the app
 * reaches the backend with zero manual edits.
 *
 * Wi-Fi changes automatically. If you switch Wi-Fi (or DHCP hands out
 * a new IP after a reboot), just re-run `npm run dev:lan` — the
 * launcher redetects the IP, rewrites `.env.local`, and starts Expo
 * against the new value.
 *
 * ## Fallback (no env var set): emulator / simulator loopback probe
 *
 * When `EXPO_PUBLIC_API_BASE_URL` is unset, the client probes a small
 * list of loopback candidates and uses the first that answers within 2 s
 * (see `CANDIDATE_HOSTS` / `resolveBaseUrl` below). This keeps a
 * freshly-cloned project working on an emulator/simulator with zero
 * config. Physical devices should always run `npm run dev:lan` so the
 * URL stays in sync with the laptop's current LAN IP.
 *
 * Platform cheatsheet:
 *   - Android emulator:    http://10.0.2.2:8080   (host-loopback alias)
 *   - iOS simulator / web: http://localhost:8080
 *   - Physical device:     `npm run dev:lan` keeps the URL fresh
 *
 * If the backend is unreachable, the login screen surfaces a clear
 * "Could not reach backend at …" alert.
 */

import { Platform } from "react-native";

/**
 * Default base URL baked into the bundle, used only when
 * {@link EXPO_PUBLIC_API_BASE_URL} is unset. Points at the plain
 * loopback so an iOS-simulator / web build works out-of-the-box; the
 * Android-emulator alias and physical-device URL are supplied by the
 * probe ({@link CANDIDATE_HOSTS}) and `npm run dev:lan` respectively.
 *
 * There is intentionally NO hardcoded LAN IP here — a LAN IP changes
 * on every Wi-Fi switch and is the classic cause of "Network request
 * failed". Run `npm run dev:lan` instead of editing this constant.
 */
const DEFAULT_BASE_URL = "http://localhost:8080";

/**
 * Ordered list of hosts the client probes when no explicit URL is set.
 * Each entry is a bare `host:port` (default 8080) assumed to be http.
 * The probe is a `GET /api/sellers` — the first entry that returns any
 * HTTP response (even 401/403) becomes the active base URL.
 *
 * The entries below are loopback aliases so an emulator/simulator
 * build works with zero config. They exist so a freshly-cloned project
 * works without any `EXPO_PUBLIC_API_BASE_URL` setup.
 *
 * For a physical device on a real Wi-Fi, run `npm run dev:lan` so the
 * URL tracks the dev laptop's current LAN IP without any user setup.
 */
const CANDIDATE_HOSTS: string[] = [
  // Android emulator alias for the host machine's localhost.
  "10.0.2.2:8080",
  // Local loopback (iOS simulator, web).
  "localhost:8080",
  // 127.0.0.1 also resolves the loopback on Android emulators where
  // "localhost" can be ambiguous.
  "127.0.0.1:8080",
];

/**
 * Returns the active base URL. Priority:
 *   1. `EXPO_PUBLIC_API_BASE_URL` (Expo public env vars are inlined at
 *      build time — `npm run dev:lan` keeps this fresh automatically).
 *   2. {@link DEFAULT_BASE_URL} (edit this file).
 *
 * Note: this is the synchronous "first guess". The async
 * `resolveBaseUrl()` helper below will probe the network and may swap
 * in a more accurate host at runtime.
 */
function readConfiguredBaseUrl(): string {
  // Expo inlines `process.env.EXPO_PUBLIC_*` at build time.
  const fromEnv =
    typeof process !== "undefined"
      ? (process as { env?: Record<string, string | undefined> }).env
          ?.EXPO_PUBLIC_API_BASE_URL
      : undefined;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  return DEFAULT_BASE_URL;
}

export const API_CONFIG = {
  /** Toggle to switch between the in-memory mock store and the real API. */
  USE_MOCK: false,

  /**
   * Synchronously-computed base URL. Becomes the resolved URL after
   * `resolveBaseUrl()` finishes its probe; until then this is the
   * "first guess" the client uses for the very first request (typically
   * a login).
   */
  BASE_URL: readConfiguredBaseUrl(),

  /**
   * Hosts to probe in order when the configured base URL fails. Used by
   * `resolveBaseUrl()` to auto-pick the first reachable backend.
   */
  CANDIDATE_HOSTS,

  /**
   * Default request timeout, in milliseconds. 30s comfortably absorbs a
   * cold start while still feeling responsive.
   */
  TIMEOUT_MS: 30000,

  /**
   * Longer deadline for multipart uploads — picking a 10 MB PDF over a
   * flaky network can take 30–60 s on a physical device.
   */
  UPLOAD_TIMEOUT_MS: 60000,

  /** Optional API key / version header for the backend. */
  API_VERSION: "v1",
} as const;

export type ApiConfig = typeof API_CONFIG;

/**
 * Derived WebSocket URL for the real-time delivery tracking channel.
 * Swaps the http(s) scheme for ws(s) on the *resolved* base URL so it
 * always tracks whatever HTTP host the probe landed on. The Spring
 * Boot endpoint is `/ws/tracking`; the handshake carries the same
 * `Authorization: Bearer <token>` header used by REST.
 */
export function buildWsUrl(httpBase: string): string {
  return httpBase.replace(/^http/i, "ws") + "/ws/tracking";
}

/**
 * Last host that answered the probe. Persisted in memory so a NETWORK
 * recovery skips every candidate we already proved dead and gets to
 * the working host faster. Cleared whenever the device changes network
 * (see {@link subscribeToNetworkChanges}).
 */
let lastKnownGoodHost: string | null = null;

/**
 * Asynchronously picks the first reachable backend host by probing
 * `/api/sellers` (the cheapest endpoint that returns JSON). Mutates
 * `API_CONFIG.BASE_URL` in place so the rest of the app picks up the
 * resolved host without a reload.
 *
 * Candidate order:
 *   1. The explicitly configured base URL (env var or DEFAULT_BASE_URL).
 *   2. The last-known-good host from a previous successful probe.
 *   3. The device's own LAN IP, port 8080 (only probed when it isn't
 *      already a loopback). This is what makes the app find a Spring
 *      Boot backend running on the dev laptop *with no env var set at
 *      all* — as long as the phone and laptop share a Wi-Fi.
 *   4. The platform loopback alias (`10.0.2.2` on Android emulator,
 *      `localhost` elsewhere).
 *   5. {@link CANDIDATE_HOSTS} as a final fallback.
 *
 * The probe runs in the background — the caller can `await` it before
 * the first request, or let it complete lazily. The returned promise
 * always resolves (never rejects); on total failure it leaves the
 * configured `BASE_URL` untouched.
 */
export async function resolveBaseUrl(timeoutMs = 2000): Promise<string> {
  const resolved = await probeForReachableBaseUrl(timeoutMs);
  if (resolved) {
    lastKnownGoodHost = resolved;
    return resolved;
  }
  return API_CONFIG.BASE_URL;
}

/**
 * Re-probe the candidate list, returning the first host that answers
 * (or `null` if every candidate fails). Used by the API client when a
 * request fails with a NETWORK error so the next retry attempt can hit
 * the right host without the user manually editing `.env.local`.
 *
 * The candidate ordering is identical to {@link resolveBaseUrl} but
 * the last-known-good host is tested first — that's the host that was
 * working seconds ago, so it's the most likely candidate to be live
 * again after a brief backend restart.
 */
export async function recoverBaseUrl(timeoutMs = 1500): Promise<string | null> {
  const resolved = await probeForReachableBaseUrl(timeoutMs);
  if (resolved) {
    lastKnownGoodHost = resolved;
    return resolved;
  }
  return null;
}

/**
 * Internal: probe every candidate in priority order, return the first
 * host that answers. Pulled out of {@link resolveBaseUrl} so both the
 * boot-time resolver and the runtime NETWORK-recovery code share one
 * candidate pipeline.
 */
async function probeForReachableBaseUrl(
  timeoutMs: number,
): Promise<string | null> {
  const configured = API_CONFIG.BASE_URL;
  const platformLocal =
    Platform.OS === "android" ? "10.0.2.2:8080" : "localhost:8080";
  const seen = new Set<string>();
  const candidates: string[] = [];
  const push = (raw: string) => {
    const trimmed = raw.replace(/\/+$/, "");
    if (trimmed.startsWith("http")) {
      const key = trimmed;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(trimmed);
      }
    } else {
      const url = `http://${trimmed}`;
      if (!seen.has(url)) {
        seen.add(url);
        candidates.push(url);
      }
    }
  };
  // Last-known-good wins first — the user was just connected there.
  if (lastKnownGoodHost) push(lastKnownGoodHost);
  push(configured);

  // Auto-detect the device's own LAN IP. If the phone says it's on
  // 192.168.1.42 we probe 192.168.1.42:8080 — which is exactly the
  // address of the dev laptop on the same Wi-Fi in most home/campus
  // networks. Loopback / link-local addresses are skipped (the
  // platform-local + CANDIDATE_HOSTS entries already cover them).
  const deviceIp = await getDeviceLanIp();
  if (deviceIp && !isLoopbackIp(deviceIp)) {
    push(`http://${deviceIp}:8080`);
  }

  push(`http://${platformLocal}`);
  for (const h of CANDIDATE_HOSTS) push(h);

  // Try each candidate in order; return the first that answers.
  for (const url of candidates) {
    try {
      const ok = await probe(url, timeoutMs);
      if (ok) {
        (API_CONFIG as { BASE_URL: string }).BASE_URL = url;
        return url;
      }
    } catch {
      // Continue to next candidate.
    }
  }
  return null;
}

/**
 * Mark the cached last-known-good host as stale. Called whenever the
 * device's network interface changes (Wi-Fi switch, VPN tunnel up,
 * etc.) so the next probe re-discovers the live host rather than
 * sticking with a possibly-unreachable cache entry.
 */
export function invalidateCachedHost(): void {
  lastKnownGoodHost = null;
}

/**
 * Best-effort detection of the device's primary IPv4 address. Returns
 * `null` on platforms where we can't introspect networking (web) or
 * when no non-loopback interface is up.
 *
 * On a real Android/iOS device this returns the phone's Wi-Fi address,
 * which lets the auto-detect candidate (`<deviceIp>:8080`) point at the
 * dev laptop on the same network without any user setup. On an Android
 * emulator `getIPAddress()` returns the host alias (`10.0.2.2`) and the
 * `isLoopbackIp` filter below drops it, so we never replace the
 * canonical emulator entry with itself.
 */
async function getDeviceLanIp(): Promise<string | null> {
  // The lightweight, dep-free path: `react-native`'s built-in
  // `Network` module via `getIPAddress()`. It returns the device's
  // primary IPv4 as a string, or `null` on failure. Wrapped in a
  // dynamic require so this module is still web-safe (where the
  // polyfill would throw).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN: { Network?: { getIPAddress?: () => Promise<string | null> } } =
      require("react-native");
    if (RN.Network?.getIPAddress) {
      const ip = await RN.Network.getIPAddress();
      if (typeof ip === "string" && ip.length > 0) return ip;
    }
  } catch {
    // Swallow — fall through to null.
  }
  return null;
}

/**
 * True for loopback (127.0.0.0/8), link-local (169.254.0.0/16) and the
 * Android-emulator host alias (10.0.2.2). The first two are pointless
 * to probe as a LAN host; the third is already a candidate under a
 * clearer name.
 */
function isLoopbackIp(ip: string): boolean {
  if (ip === "10.0.2.2") return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("169.254.")) return true;
  return false;
}

/**
 * Tiny one-shot probe. Returns true if the host answered ANY HTTP
 * response (even a 401/403/404) within the deadline. We intentionally
 * accept non-2xx — the goal is "host is reachable", not "endpoint is
 * authorised" (auth state is verified by the actual login call).
 */
async function probe(base: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/sellers`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    // Any HTTP response means the backend is reachable. The auth header
    // is what gates the payload contents.
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}