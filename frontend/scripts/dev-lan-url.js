#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/dev-lan-url.js
 *
 * One-command LAN launcher. Resolves the laptop's current LAN IPv4 on every
 * run, then starts Expo with that URL inlined into the bundle so the phone
 * dials the right backend immediately — no manual edits to .env.local or
 * src/api/config.ts required.
 *
 *   npm run dev:lan
 *
 * What it does:
 *   1. Detects the laptop's primary LAN IPv4 (best non-loopback,
 *      non-link-local interface; wl / en / eth / ens / wlp etc. ranked first).
 *   2. Probes the backend on that IP:8080. If it doesn't answer, we
 *      refuse to launch Expo — the user would just see a stale
 *      "Could not reach backend at http://…" alert on the login screen.
 *      The message tells them to start the Spring Boot backend.
 *   3. Writes `EXPO_PUBLIC_API_BASE_URL=http://<lan-ip>:8080` into
 *      `.env.local` (replacing any stale value) so anyone running
 *      `npx expo start` directly gets the same URL.
 *   4. Spawns `npx expo start` with the URL injected into the child
 *      process's environment. Because Expo inlines EXPO_PUBLIC_* values
 *      at bundle time, the freshly detected IP is authoritative for the
 *      new bundle — no stale Metro cache, no stale .env.local.
 *
 * Why this exists: a laptop's LAN IP changes every time Wi-Fi changes
 * (or DHCP renews after a reboot). Hard-coding it in src/api/config.ts,
 * or leaving it stale in .env.local, is the classic "Could not reach
 * backend at http://<old-ip>:8080" failure mode. Re-running
 * `npm run dev:lan` after every Wi-Fi switch redetects the IP and rewrites
 * both `.env.local` and the Expo child's environment, so the next bundle
 * is built against the right URL with zero manual edits.
 *
 * Phone must be on the SAME Wi-Fi as the laptop (no internet needed for
 * the app's API traffic — both just need to share the LAN).
 *
 * Cleanup: Ctrl-C forwards to the Expo child and exits.
 *
 * Caveats:
 *   - Requires `node` and `npx` on $PATH.
 *   - On Linux/macOS the LAN IP is read from `node:os` `networkInterfaces`
 *     filtered to non-loopback, non-link-local IPv4 entries.
 *   - Run from the `finalyear-project-main/` directory.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const SCRIPT_DIR = __dirname;
/**
 * Repo root — the directory holding this script's parent. We always
 * `process.chdir` here before doing anything else so the launcher
 * works no matter where it was invoked from.
 */
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
process.chdir(REPO_ROOT);

const ENV_FILE = path.join(REPO_ROOT, ".env.local");
const BACKEND_PORT = 8080;

const isWindows = process.platform === "win32";

/** ANSI colors that auto-disable when stdout isn't a TTY. */
const c = {
  dim: (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  bold: (s) => (process.stdout.isTTY ? `\x1b[1m${s}\x1b[0m` : s),
};

function log(prefix, msg) {
  process.stdout.write(`${c.dim(`[${prefix}]`)} ${msg}\n`);
}

function banner(text) {
  const line = "─".repeat(Math.max(40, text.length + 4));
  console.log(`\n${c.bold(c.green(line))}`);
  console.log(`${c.bold(c.green(`  ${text}`))}`);
  console.log(`${c.bold(c.green(line))}\n`);
}

/**
 * Pick the best LAN IPv4 address for this host. Preference order:
 *   1. First non-loopback, non-link-local, non-virtual IPv4 on an
 *      "up" interface. This is what `hostname -I` returns on most
 *      Linux/macOS boxes.
 *
 * Returns `null` if nothing qualifies (e.g. the laptop is offline or
 * only has loopback). The caller should fail loudly with that.
 */
function detectLanIp() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== "IPv4") continue;
      if (a.internal) continue;
      // Skip link-local 169.254.x.x and loopback 127.x.x.x (already
      // filtered by `internal`, but be explicit).
      if (a.address.startsWith("127.")) continue;
      if (a.address.startsWith("169.254.")) continue;
      // Prefer common Wi-Fi / Ethernet interface names. We don't
      // hard-fail on others — just rank them lower.
      const preferred =
        /^(wl|en|eth|wlan|wlp|eno|ens|enp)/i.test(name) ? 0 : 1;
      candidates.push({ name, address: a.address, preferred });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => x.preferred - y.preferred);
  return candidates[0].address;
}

/**
 * Write `EXPO_PUBLIC_API_BASE_URL=http://<ip>:8080` into `.env.local`,
 * preserving any other lines. If the key already exists, replace it;
 * otherwise append it.
 */
function writeEnvUrl(url) {
  const envLine = `EXPO_PUBLIC_API_BASE_URL=${url}`;
  let prev = "";
  if (fs.existsSync(ENV_FILE)) {
    prev = fs.readFileSync(ENV_FILE, "utf8");
  } else {
    prev =
      "# Generated by scripts/dev-lan-url.js — overwritten each run.\n" +
      "# Set this once and `npm run dev:lan` will keep it fresh on every run.\n";
  }
  const lines = prev.split(/\r?\n/);
  const re = /^EXPO_PUBLIC_API_BASE_URL\s*=/;
  const i = lines.findIndex((l) => re.test(l));
  if (i >= 0) lines[i] = envLine;
  else lines.push(envLine);
  // Drop any trailing blank lines, then add exactly one.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const out = lines.join("\n") + "\n";
  fs.writeFileSync(ENV_FILE, out, "utf8");
  log("env", c.green(`wrote ${envLine} to ${path.relative(REPO_ROOT, ENV_FILE)}`));
}

/**
 * Reachability probe. We accept any HTTP response (1xx–5xx) as proof
 * the laptop is listening on the port the phone will dial. Returns
 * `{ ok: true, status }` on success and `{ ok: false, error }` on
 * connection refused / timeout — which is exactly the signal we need
 * to decide whether to refuse the launch.
 */
function probeBackend(host, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host,
        port: BACKEND_PORT,
        path: "/api/sellers",
        method: "GET",
        timeout: timeoutMs,
        headers: { Accept: "application/json" },
      },
      (res) => {
        res.resume();
        resolve({ ok: true, status: res.statusCode });
      },
    );
    req.on("error", (err) => resolve({ ok: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timed out" });
    });
    req.end();
  });
}

async function main() {
  banner("Gas Delivery — direct LAN");

  const lanIp = detectLanIp();
  if (!lanIp) {
    console.error(
      c.red(
        "✘ Could not detect a LAN IPv4 address on this machine.\n" +
          "  Make sure the laptop is connected to Wi-Fi (not just cellular\n" +
          "  tethering) and try again. Run `hostname -I` to verify.",
      ),
    );
    process.exit(1);
  }
  log("lan", c.green(`✔ detected LAN IP: ${lanIp}`));

  const url = `http://${lanIp}:${BACKEND_PORT}`;

  // Refuse to launch Expo if the backend isn't reachable on this IP.
  // The user would otherwise open the app and see a stale
  // "Could not reach backend at http://<old-ip>:8080" alert — exactly
  // the failure mode we're trying to eliminate. Better to fail at
  // the launcher with the exact command they need to start the
  // backend in a separate terminal.
  const probe = await probeBackend(lanIp);
  if (!probe.ok) {
    console.error(
      c.red(
        `✘ Backend is not reachable at ${url} (${probe.error}).\n` +
          `  The Spring Boot backend must be running BEFORE ` +
          `\`npm run dev:lan\` can launch Expo.\n\n` +
          `  Start it in a separate terminal:\n` +
          `      cd gas-delivery && mvn spring-boot:run\n\n` +
          `  Wait for "Tomcat started on port 8080", then re-run:\n` +
          `      npm run dev:lan\n`,
      ),
    );
    process.exit(1);
  }
  log(
    "backend",
    c.green(`✔ reachable at ${url} (HTTP ${probe.status})`),
  );

  // Persist the URL in `.env.local` so anyone who later runs
  // `npx expo start` directly (without this launcher) picks up the
  // same value. We keep the rest of the file intact so other env vars
  // the developer might have set (analytics keys, feature flags, …)
  // survive across runs.
  writeEnvUrl(url);

  log("step", c.bold("starting Expo"));
  log("expo", c.dim(`URL: ${url}`));
  log("expo", c.dim("Once the QR code prints, scan it with Expo Go."));

  // Inject the URL directly into the Expo child's environment. Expo
  // inlines EXPO_PUBLIC_* at bundle time, so this overrides anything
  // cached in the Metro bundler from a previous session. This is what
  // makes "restart PC → npm run dev:lan → fresh IP, no manual edits"
  // actually work: even if a stale `.env.local` lingers, the child
  // process sees the right value and the new bundle picks it up.
  const childEnv = { ...process.env, EXPO_PUBLIC_API_BASE_URL: url };

  const expo = spawn("npx", ["expo", "start"], {
    cwd: REPO_ROOT,
    env: childEnv,
    stdio: "inherit",
    shell: isWindows,
  });

  const shutdown = (signal) => {
    log("ctrl-c", c.yellow(`received ${signal}, stopping Expo…`));
    try {
      expo.kill(signal);
    } catch {
      /* noop */
    }
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  expo.on("exit", (code, signal) => {
    log(
      "expo",
      c.dim(`exited (code=${code ?? "?"} signal=${signal ?? "?"})`),
    );
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(c.red(`✘ ${err && err.message ? err.message : err}`));
  process.exit(1);
});