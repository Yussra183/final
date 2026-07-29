#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/start-with-tunnel.js
 *
 * One-command "permanent fix" for the "Could not reach backend at …" error.
 *
 *   npm run dev:tunnel
 *
 * What it does (no manual URL editing, no source edits, no per-network
 * churn):
 *
 *   1. Starts the Spring Boot backend in `../gas-delivery/` on port 8080
 *      as a **daemon** (survives Ctrl-C / terminal close — without this
 *      a closed terminal would tear the backend down and the phone
 *      would see Cloudflare 530 "origin unreachable"). Logs to
 *      `.runtime/backend.log`.
 *   2. Spawns `cloudflared tunnel --url http://localhost:8080` as a
 *      daemon. Logs to `.runtime/tunnel.log`; the public URL is parsed
 *      out of its output and stashed in `.runtime/tunnel.url` so other
 *      tooling can read it.
 *   3. Writes that URL into `.env.local` as
 *      `EXPO_PUBLIC_API_BASE_URL=https://…trycloudflare.com`, so the
 *      app rebuilds its bundle against the new URL the moment Expo
 *      starts.
 *   4. Spawns `npx expo start` **in the foreground** so you get the
 *      QR code. Ctrl-C still kills Expo cleanly without touching the
 *      backend/tunnel daemons (use `npm run dev:stop` to kill those).
 *
 * Why this is permanent: the URL is *public* (Cloudflare's edge), not a
 * LAN IP. Switch Wi-Fi, restart the laptop, restart the tunnel — every
 * new URL is just as reachable as the last one. The only thing that
 * ever needs editing is `.env.local`, and even that is done for you.
 *
 * Cleanup: Ctrl-C forwards SIGINT/SIGTERM to all three children, so the
 * backend, tunnel and Expo all stop together.
 *
 * Caveats:
 *   - The quick-tunnel URL changes on every `cloudflared` restart. If
 *     you want a STABLE URL that never changes (good for sharing with
 *     teammates or for a physical device you reinstall Expo on later),
 *     follow scripts/setup-named-tunnel.md for the named-tunnel flow.
 *     This script works equally well with that path — point `cloudflared`
 *     at your reserved hostname instead of `--url`, and set the same
 *     URL in `.env.local`.
 *   - Requires `mvn`, `cloudflared` and `npx` on $PATH.
 *   - Run from the `finalyear-project-main/` directory.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");

const SCRIPT_DIR = __dirname;
/**
 * Repo root — the directory holding this script's parent. We always
 * `process.chdir` here before doing anything else so the launcher
 * works no matter where it was invoked from (some users cd into
 * `gas-delivery/` first because that's where `mvn spring-boot:run`
 * historically ran, and `npm run dev:tunnel` would then try to read
 * `package.json` from there and fail with ENOENT).
 */
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
process.chdir(REPO_ROOT);

const BACKEND_DIR = path.resolve(REPO_ROOT, "..", "gas-delivery");
const ENV_FILE = path.join(REPO_ROOT, ".env.local");
/**
 * Per-process scratch dir. We persist the backend & tunnel PIDs and
 * logs here so the daemons survive Ctrl-C / terminal close, and so
 * the `npm run dev:stop` helper can find them again.
 */
const RUNTIME_DIR = path.join(REPO_ROOT, ".runtime");

const BACKEND_PORT = 8080;
const BACKEND_HEALTH_TIMEOUT_MS = 90_000;
const TUNNEL_READY_TIMEOUT_MS = 45_000;
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

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
 * Spawn a long-running child, prefixing each of its output lines with a
 * tag so the user can tell which stream is talking. We capture into a
 * ring buffer (last 200 lines) so we can grep it for "ready" markers
 * without buffering everything to disk.
 *
 * `opts.daemonize: true` re-spawns the child so it survives the
 * launcher's exit. On POSIX we use `setsid` (own process group, own
 * session — immune to SIGHUP / terminal close / Ctrl-C in this
 * launcher) and redirect stdio to a log file in `.runtime/`. The PID
 * of the daemon is written to `opts.pidFile` so a later script can
 * kill it. On Windows we fall back to Node's `detached: true`, which
 * is good enough for the IDE/terminal case but doesn't fully escape
 * the parent process group — see the README caveat.
 */
function startTaggedChild(name, cmd, args, opts = {}) {
  if (opts.daemonize) {
    return startDaemonChild(name, cmd, args, opts);
  }

  const child = spawn(cmd, args, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWindows,
    ...opts,
  });

  const ring = [];
  const RING_LIMIT = 200;
  const pump = (stream, prefix) => {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        ring.push(`${prefix} ${line}`);
        if (ring.length > RING_LIMIT) ring.shift();
        process.stdout.write(`${c.dim(`[${prefix}]`)} ${line}\n`);
        nl = buffer.indexOf("\n");
      }
    });
    stream.on("end", () => {
      if (buffer.length > 0) {
        ring.push(`${prefix} ${buffer}`);
        process.stdout.write(`${c.dim(`[${prefix}]`)} ${buffer}\n`);
      }
    });
  };

  pump(child.stdout, name);
  pump(child.stderr, name);

  child.on("exit", (code, signal) => {
    log(name, c.dim(`exited (code=${code ?? "?"} signal=${signal ?? "?"})`));
  });

  child.allOutput = () => ring.join("\n");
  return child;
}

/**
 * Daemon variant of {@link startTaggedChild}. The launcher starts the
 * child, waits briefly for it to detach cleanly, then unrefs the
 * wrapper handle so the launcher can exit without taking the daemon
 * down with it.
 *
 * We tag stdout/stderr lines into a ring buffer just like the
 * foreground variant so readiness probes (which look at the log for
 * "Tomcat started on port …") still work.
 */
function startDaemonChild(name, cmd, args, opts = {}) {
  if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });

  const logFile = path.join(RUNTIME_DIR, opts.logName ?? `${name}.log`);
  const pidFile = path.join(RUNTIME_DIR, opts.pidName ?? `${name}.pid`);
  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  // POSIX: `setsid <cmd> <args…>` puts the child in its own session
  // and process group, so it ignores the launcher's SIGHUP and stays
  // alive after the launcher exits. We invoke setsid through a shell
  // so the full `cmd args…` vector is preserved exactly.
  const setsidCmd = isWindows ? `"${cmd}" ${args.join(" ")}` : `setsid ${cmd} ${args.map(quoteShellArg).join(" ")}`;
  const child = spawn(setsidCmd, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: process.env,
    stdio: ["ignore", out, err],
    shell: true,
    detached: !isWindows,
  });

  // A signature we can later use to uniquely identify *this* daemon
  // via `pgrep -f`. Picking just `path.basename(cmd)` is wrong when
  // the user has multiple instances of the same binary running
  // (e.g. an old tunnel daemon from a previous launcher run) —
  // `head -n1` would always return the lowest PID, which is the old
  // one. Including a distinctive arg in the signature fixes that.
  const pgrepSignature = `${path.basename(cmd)} ${args.join(" ")}`;

  // Wait briefly for the daemon's PID to land so we can write it
  // before returning. On POSIX the inner `setsid <cmd>` fork is what
  // we want; the outer shell exits almost immediately.
  child.on("exit", () => {
    // No-op: the launcher shouldn't react to the wrapper's exit
    // (which is normal — it just spawned the daemon).
  });

  // For POSIX, `setsid <cmd>` has already forked; we resolve the
  // actual daemon PID by greping `pgrep` against the full command
  // line (binary + args) so we pick THIS daemon even when an older
  // one is still alive. Picking just the basename would always
  // return the lowest PID, which is the old daemon — exactly the
  // bug that left the previous tunnel serving the old URL while the
  // launcher reported the new one.
  const resolveDaemonPid = () => {
    if (isWindows) return child.pid;
    try {
      const { execSync } = require("node:child_process");
      // `pgrep -f -n` = "match the full command line, return newest".
      // The newest is the one we just spawned (PGREP returns by
      // start time when multiple matches exist).
      const pid = execSync(
        `pgrep -f -n ${quoteShellArg(pgrepSignature)} || true`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      return Number(pid) || child.pid;
    } catch {
      return child.pid;
    }
  };

  // Give the daemon 300ms to fork & exec, then record its PID.
  setTimeout(() => {
    const pid = resolveDaemonPid();
    try {
      fs.writeFileSync(pidFile, String(pid), "utf8");
      log(name, c.dim(`daemonized → pid=${pid}, log=${path.relative(REPO_ROOT, logFile)}`));
    } catch (e) {
      log(name, c.dim(`could not write pid file: ${e.message}`));
    }
  }, 300).unref();

  // Don't keep the launcher alive just because we have a pipe open
  // to the daemon's redirected log file.
  child.unref();

  // Build a minimal "child" shim with `.allOutput()` reading the log
  // file (since we no longer have direct stdio access to the daemon).
  // Readiness probes watch the log file for "Tomcat started" lines.
  //
  // The shim exposes the same surface a real `ChildProcess` would —
  // `on` / `off` / `kill` / `stdout` / `stderr` — so callers like the
  // exit-watcher below and `installShutdown` don't have to special-
  // case daemonized children. Methods that would be no-ops on a
  // daemon (it's already detached) are stubbed; `kill` is a true
  // no-op since daemons survive the launcher by design.
  const { EventEmitter } = require("node:events");
  const shim = new EventEmitter();
  shim.pid = child.pid;
  shim.__daemon = true;
  shim.killed = false;
  shim.stdout = new EventEmitter();
  shim.stderr = new EventEmitter();
  shim.kill = () => false;
  shim.allOutput = () => {
    try {
      const data = fs.readFileSync(logFile, "utf8");
      return data.split("\n").slice(-200).join("\n");
    } catch {
      return "";
    }
  };
  return shim;
}

/** Shell-quote a single argument for POSIX sh. */
function quoteShellArg(s) {
  if (/^[a-zA-Z0-9_\-./:=]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Read a PID file written by {@link startDaemonChild}. Returns null
 *  when the file is missing or doesn't contain a numeric PID. */
function readPid(name) {
  try {
    const raw = fs.readFileSync(path.join(RUNTIME_DIR, name), "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** True if `pid` resolves to a live process. `process.kill(pid, 0)`
 *  throws ESRCH for "no such process" and EPERM for "exists but
 *  not yours" — we treat EPERM as alive (it does). */
function processAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

/**
 * Stop a daemon we started previously. Used at launch-time to clean
 * up after an earlier `npm run dev:tunnel` whose daemons survived
 * Ctrl-C. SIGTERM the process group (negative PID), wait up to
 * `graceMs` for it to exit, then SIGKILL if needed. Cleans up the
 * pid file regardless of outcome.
 */
function stopDaemonByPid(name, pid, graceMs = 5000) {
  if (!pid || !processAlive(pid)) return;
  const target = isWindows ? pid : -pid;
  try {
    process.kill(target, "SIGTERM");
  } catch {
    /* may already be dead */
  }
  const start = Date.now();
  // Busy-wait (sync) so the caller can rely on the daemon being
  // gone by the time we return. This is a one-time, ms-scale cost
  // on launcher startup; using a busy loop here keeps the launcher
  // from racing with itself.
  while (processAlive(pid) && Date.now() - start < graceMs) {
    require("node:child_process").execSync("sleep 0.1");
  }
  if (processAlive(pid)) {
    try {
      process.kill(target, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  try {
    fs.unlinkSync(path.join(RUNTIME_DIR, `${name}.pid`));
  } catch {
    /* ignore */
  }
  log(name, c.dim(`previous daemon (pid ${pid}) stopped`));
}

/**
 * Poll a known endpoint until the backend answers OR TCP accepts a
 * connection. The probe prefers `/api/sellers` because it exists in
 * every version of this project (the runtime resolver in
 * `src/api/config.ts` probes it for the same reason). We accept any
 * HTTP response — 200, 401, 403, even a Spring "NoResourceFoundException"
 * 404 — as proof that Tomcat is serving. The only "not ready" signal
 * is a connection refusal, which means the listener isn't bound yet.
 *
 * Two extra escape hatches:
 *   - Spring Boot prints `Tomcat started on port <N>` once the
 *     connector is bound; we watch the log so we don't have to wait
 *     for the first HTTP round-trip.
 *   - If HTTP is still failing past 60% of the budget we drop to a
 *     raw TCP-connect probe, which works even when the dispatcher
 *     servlet is briefly unavailable.
 *
 * Returns once the backend is confirmed reachable.
 */
function waitForBackend(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  // Fast-path: log-watch for `Tomcat started on port <N>`.
  let logSawReady = false;
  const onLog = (chunk) => {
    if (logSawReady) return;
    if (/Tomcat started on port/i.test(chunk.toString("utf8"))) {
      logSawReady = true;
    }
  };
  if (typeof child.stdout?.on === "function") child.stdout.on("data", onLog);
  if (typeof child.stderr?.on === "function") child.stderr.on("data", onLog);
  // Also poll the persisted log file every 500ms — the daemonized
  // child has its stdio redirected to `.runtime/backend.log`, so the
  // in-process listeners above won't see anything until we tail the
  // file ourselves.
  const backendLog = path.join(RUNTIME_DIR, "backend.log");
  let lastSize = fs.existsSync(backendLog) ? fs.statSync(backendLog).size : 0;
  const tailTimer = setInterval(() => {
    if (logSawReady) return;
    try {
      const stat = fs.statSync(backendLog);
      if (stat.size > lastSize) {
        const fd = fs.openSync(backendLog, "r");
        try {
          const buf = Buffer.alloc(stat.size - lastSize);
          fs.readSync(fd, buf, 0, buf.length, lastSize);
          onLog(buf.toString("utf8"));
        } finally {
          fs.closeSync(fd);
        }
        lastSize = stat.size;
      }
    } catch {
      /* file may not exist yet */
    }
  }, 500);
  tailTimer.unref();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (typeof child.stdout?.off === "function") child.stdout.off("data", onLog);
      if (typeof child.stderr?.off === "function") child.stderr.off("data", onLog);
      clearInterval(tailTimer);
    };

    const tryOnce = () => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: BACKEND_PORT,
          path: "/api/sellers",
          method: "GET",
          timeout: 1500,
          headers: { Accept: "application/json" },
        },
        (res) => {
          res.resume();
          // Any HTTP status (1xx-5xx) means Tomcat answered. Only a
          // connection-level error below counts as "not ready".
          if (res.statusCode && res.statusCode >= 100 && res.statusCode < 600) {
            cleanup();
            resolve();
            return;
          }
          if (Date.now() > deadline) {
            cleanup();
            reject(new Error(`backend health check kept returning status ${res.statusCode}`));
            return;
          }
          setTimeout(tryOnce, 1000);
        },
      );
      req.on("error", () => {
        if (logSawReady || Date.now() > deadline * 0.6) {
          tcpProbe()
            .then((ok) => {
              if (ok) {
                cleanup();
                resolve();
                return;
              }
              if (Date.now() > deadline) {
                cleanup();
                reject(new Error("backend didn't start listening on :8080 in time"));
                return;
              }
              setTimeout(tryOnce, 1000);
            })
            .catch(() => {
              if (Date.now() > deadline) {
                cleanup();
                reject(new Error("backend didn't start listening on :8080 in time"));
                return;
              }
              setTimeout(tryOnce, 1000);
            });
          return;
        }
        if (Date.now() > deadline) {
          cleanup();
          reject(new Error("backend didn't start listening on :8080 in time"));
          return;
        }
        setTimeout(tryOnce, 1000);
      });
      req.on("timeout", () => {
        req.destroy();
        if (Date.now() > deadline) {
          cleanup();
          reject(new Error("backend health check timed out"));
          return;
        }
        setTimeout(tryOnce, 1000);
      });
      req.end();
    };
    tryOnce();
  });
}

/** Bare TCP-connect probe — true if the kernel accepts the SYN. */
function tcpProbe() {
  return new Promise((resolve) => {
    const sock = require("node:net").connect(BACKEND_PORT, "127.0.0.1");
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(v);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    setTimeout(() => done(false), 1500).unref();
  });
}

/**
 * Probe the tunnel URL to confirm it's actually serving before we hand
 * it to Expo. Any HTTP status (1xx–5xx) means the URL is reachable —
 * the backend's own auth handler decides what `/api/sellers` returns,
 * which is exactly the same probe the app's runtime resolver uses.
 *
 * Cloudflare only prints the `trycloudflare.com` URL once the tunnel
 * has been minted on their side, so the URL itself is real even if
 * the local resolver hasn't propagated it yet. We return three
 * states from the probe:
 *   - `ok: true`  — the probe reached the backend.
 *   - `dns: true` — DNS for the new hostname hasn't propagated here,
 *                   but the URL was minted by Cloudflare so it's a
 *                   wait-for-DNS situation, not a configuration bug.
 *   - `dead: true` — DNS resolved but the tunnel refused the request.
 */
function probeTunnel(url) {
  return new Promise((resolve) => {
    const host = url.replace(/^https?:\/\//, "").split("/")[0];
    const req = http.request(
      {
        host,
        port: 443,
        path: "/api/sellers",
        method: "GET",
        timeout: 4000,
        headers: { Accept: "application/json" },
      },
      (res) => {
        res.resume();
        const ok = res.statusCode != null && res.statusCode >= 100 && res.statusCode < 600;
        log(
          "tunnel",
          c.dim(
            `probe → status=${res.statusCode ?? "?"} (${ok ? "reachable" : "unexpected"})`,
          ),
        );
        resolve({ ok, dns: false, dead: !ok });
      },
    );
    req.on("error", (err) => {
      const isDns = err && (err.code === "ENOTFOUND" || err.code === "EAI_AGAIN");
      log(
        "tunnel",
        c.dim(
          `probe → ${isDns ? "DNS not yet propagated (ENOTFOUND)" : `connection error: ${err.message ?? err}`}`,
        ),
      );
      resolve({ ok: false, dns: !!isDns, dead: !isDns });
    });
    req.on("timeout", () => {
      req.destroy();
      log("tunnel", c.dim("probe → timed out"));
      resolve({ ok: false, dns: false, dead: true });
    });
    req.end();
  });
}

/**
 * Retry `probeTunnel` while the result is "dead" (tunnel refused the
 * request). Returns:
 *   - `"reachable"` as soon as a probe succeeds.
 *   - `"dns-only"` if every probe is `dns: true` — the URL is real
 *     (Cloudflare minted it) but the launcher's local resolver
 *     hasn't propagated it yet. The phone's resolver almost
 *     certainly has, or will within a minute. We continue.
 *   - `"unreachable"` if every probe is `dead: true` — the tunnel
 *     is configured wrong (or the backend died) and continuing
 *     would just leave the user staring at a 530 in the app.
 */
async function probeTunnelWithRetry(url, attempts = 12, delayMs = 3000) {
  let sawDns = false;
  let sawDead = false;
  for (let i = 1; i <= attempts; i++) {
    // eslint-disable-next-line no-await-in-loop
    const result = await probeTunnel(url);
    if (result.ok) return "reachable";
    sawDns = sawDns || result.dns;
    sawDead = sawDead || result.dead;
    if (i < attempts) {
      log(
        "tunnel",
        c.dim(`retrying probe in ${delayMs / 1000}s (attempt ${i}/${attempts})…`),
      );
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  if (sawDns && !sawDead) return "dns-only";
  return "unreachable";
}

/** Write `EXPO_PUBLIC_API_BASE_URL=<url>` into `.env.local`, preserving
 *  any other lines. If the key already exists, replace it; otherwise
 *  append it. */
function writeEnvUrl(url) {
  const envLine = `EXPO_PUBLIC_API_BASE_URL=${url}`;
  let prev = "";
  if (fs.existsSync(ENV_FILE)) {
    prev = fs.readFileSync(ENV_FILE, "utf8");
  } else {
    prev =
      "# Generated by scripts/start-with-tunnel.js — overwrite freely.\n" +
      "# For a permanent stable URL see scripts/setup-named-tunnel.md.\n";
  }
  const lines = prev.split(/\r?\n/);
  const re = /^EXPO_PUBLIC_API_BASE_URL\s*=/;
  const i = lines.findIndex((l) => re.test(l));
  if (i >= 0) lines[i] = envLine;
  else lines.push(envLine);
  // Ensure trailing newline.
  const out = lines.filter((l, idx, arr) => !(l === "" && idx === arr.length - 1)).join("\n") + "\n";
  fs.writeFileSync(ENV_FILE, out, "utf8");
  log("env", c.green(`wrote ${envLine} to ${path.relative(REPO_ROOT, ENV_FILE)}`));
}

/**
 * Wait until `cloudflared` has printed a `trycloudflare.com` URL.
 * Listens both to the in-process streams (foreground spawn) and to
 * the persisted log file (daemon spawn — stdio is redirected to
 * `.runtime/tunnel.log`).
 */
function waitForTunnelUrl(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof child.stdout?.off === "function") child.stdout.off("data", onChunk);
      if (typeof child.stderr?.off === "function") child.stderr.off("data", onChunk);
      clearInterval(tailTimer);
      resolve(url);
    };
    const onChunk = (chunk) => {
      const text = chunk.toString("utf8");
      const match = text.match(TUNNEL_URL_RE);
      if (match) finish(match[0]);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (typeof child.stdout?.off === "function") child.stdout.off("data", onChunk);
      if (typeof child.stderr?.off === "function") child.stderr.off("data", onChunk);
      clearInterval(tailTimer);
      reject(new Error(`cloudflared didn't print a tunnel URL within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    if (typeof child.stdout?.on === "function") child.stdout.on("data", onChunk);
    if (typeof child.stderr?.on === "function") child.stderr.on("data", onChunk);
    // Daemon fallback: tail the log file every 250ms.
    const tunnelLog = path.join(RUNTIME_DIR, "tunnel.log");
    let lastSize = fs.existsSync(tunnelLog) ? fs.statSync(tunnelLog).size : 0;
    const tailTimer = setInterval(() => {
      try {
        const stat = fs.statSync(tunnelLog);
        if (stat.size > lastSize) {
          const fd = fs.openSync(tunnelLog, "r");
          try {
            const buf = Buffer.alloc(stat.size - lastSize);
            fs.readSync(fd, buf, 0, buf.length, lastSize);
            onChunk(buf.toString("utf8"));
          } finally {
            fs.closeSync(fd);
          }
          lastSize = stat.size;
        }
      } catch {
        /* file may not exist yet */
      }
    }, 250);
    tailTimer.unref();
  });
}

/**
 * Forward Ctrl-C / SIGTERM to the foreground children (typically just
 * Expo — the daemons for the backend and tunnel are deliberately
 * skipped so they survive the launcher exiting). The daemons are
 * torn down by `npm run dev:stop` reading `.runtime/*.pid`.
 */
function installShutdown(children) {
  const shutdown = (signal) => {
    log("ctrl-c", c.yellow(`received ${signal}, stopping Expo…`));
    for (const child of children) {
      if (!child || child.killed) continue;
      // Daemon shims have `kill === undefined` and `unref === fn` —
      // don't try to kill them, they're meant to outlive us.
      if (typeof child.kill !== "function" || child.__daemon) continue;
      try {
        child.kill(signal);
      } catch {
        /* noop */
      }
    }
    // Last-resort hard exit if a child ignores the signal.
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function main() {
  banner("Gas Delivery — start-with-tunnel");

  // Pre-flight checks — fail loudly with a fix, not a stack trace.
  if (!fs.existsSync(path.join(BACKEND_DIR, "pom.xml"))) {
    console.error(
      c.red(
        `✘ Could not find Spring Boot project at ${BACKEND_DIR}.\n` +
          `  This script expects the backend to live next to the mobile app:\n` +
          `      <repo>/gas-delivery/        (Spring Boot, pom.xml)\n` +
          `      <repo>/finalyear-project-main/  (Expo, this script)\n` +
          `  If your layout is different, edit BACKEND_DIR at the top of this file.`,
      ),
    );
    process.exit(1);
  }

  // Detect a previous launcher run still alive — starting a second
  // backend would race with the first on port 8080, and a second
  // `cloudflared` would grab a different `*.trycloudflare.com` URL
  // while the old daemon kept serving the old one (the new URL
  // would be unrouteable until the new tunnel finished propagating
  // — confusing to debug). Stop the old daemons before starting new
  // ones so we always have exactly one stack.
  const existingBackend = readPid("backend.pid");
  const existingTunnel = readPid("tunnel.pid");
  if ((existingBackend && processAlive(existingBackend)) ||
      (existingTunnel && processAlive(existingTunnel))) {
    log(
      "step",
      c.yellow(
        "previous run still alive — stopping its daemons before starting fresh " +
          `(backend=${existingBackend ?? "—"} tunnel=${existingTunnel ?? "—"})`,
      ),
    );
    stopDaemonByPid("backend", existingBackend, 5000);
    stopDaemonByPid("tunnel", existingTunnel, 5000);
  }

  // 1. Backend.
  log("step", c.bold(`1/4  starting backend  (${path.relative(REPO_ROOT, BACKEND_DIR)})`));
  // Daemonized — the backend survives Ctrl-C and terminal close.
  // Without this, closing the terminal would tear the backend down
  // and the phone would see Cloudflare 530 "origin unreachable".
  const backend = startTaggedChild("backend", "mvn", [
    "-q",
    "spring-boot:run",
    `-Dspring-boot.run.jvmArguments=-Dserver.port=${BACKEND_PORT}`,
  ], { cwd: BACKEND_DIR, daemonize: true, logName: "backend.log", pidName: "backend.pid" });

  try {
    await waitForBackend(backend, BACKEND_HEALTH_TIMEOUT_MS);
    log("backend", c.green(`✔ ready on http://localhost:${BACKEND_PORT}`));
  } catch (err) {
    console.error(
      c.red(
        `✘ Backend didn't come up in time. Last 30 lines of backend output:\n\n` +
          backend
            .allOutput()
            .split("\n")
            .slice(-30)
            .join("\n"),
      ),
    );
    // Backend is a daemon — leave it running so the user can debug.
    // They can stop it (and the tunnel) with `npm run dev:stop`.
    process.exit(1);
  }

  // 2. Tunnel.
  log("step", c.bold(`2/4  opening Cloudflare quick tunnel`));
  // Daemonized — survives Ctrl-C and terminal close. The URL is
  // stashed in `.runtime/tunnel.url` so the stop script can print
  // it on shutdown and so external tooling can read the public URL
  // without parsing logs.
  const tunnel = startTaggedChild("tunnel", "cloudflared", [
    "tunnel",
    "--url",
    `http://localhost:${BACKEND_PORT}`,
    "--no-autoupdate",
  ], { daemonize: true, logName: "tunnel.log", pidName: "tunnel.pid" });

  let tunnelUrl;
  try {
    tunnelUrl = await waitForTunnelUrl(tunnel, TUNNEL_READY_TIMEOUT_MS);
    // Stash the URL for external tooling (status checks, the stop
    // script, CI smoke tests).
    if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(path.join(RUNTIME_DIR, "tunnel.url"), tunnelUrl, "utf8");
    log("tunnel", c.green(`✔ ${tunnelUrl}`));
  } catch (err) {
    console.error(
      c.red(
        `✘ Couldn't get a tunnel URL from cloudflared. ` +
          `Is 'cloudflared' installed and on PATH? (cloudflared --version)\n` +
          `  Last 30 lines of tunnel output:\n\n` +
          tunnel
            .allOutput()
            .split("\n")
            .slice(-30)
            .join("\n"),
      ),
    );
    // Backend + tunnel are daemons — don't kill them. The user can
    // stop them with `npm run dev:stop`. Just exit the launcher.
    process.exit(1);
  }

  // Confirm the URL actually reaches the backend. Cloudflare prints the
  // URL a moment before DNS for `*.trycloudflare.com` propagates to
  // every resolver — in practice that can take 30-90 s. We retry for
  // up to ~36 s and treat DNS-propagation failures as a non-fatal
  // warning (the URL was minted by Cloudflare, so it WILL work once
  // the user's resolver catches up). Real "tunnel refused" failures
  // are surfaced as errors.
  const probeResult = await probeTunnelWithRetry(tunnelUrl, 12, 3000);
  if (probeResult === "reachable") {
    log("tunnel", c.green("✔ tunnel is reachable end-to-end"));
  } else if (probeResult === "dns-only") {
    log(
      "tunnel",
      c.yellow(
        "⚠ URL is real but DNS hasn't propagated to this machine's resolver yet. " +
          "Your phone's DNS almost certainly has, or will within a minute. " +
          "Proceeding — if the login screen still shows 'Could not reach backend' " +
          "after a minute, reload the app.",
      ),
    );
  } else {
    log(
      "tunnel",
      c.red(
        "✘ tunnel refused every probe — the backend is probably not running, " +
          "or the tunnel config is wrong. Check `.runtime/backend.log` and " +
          "`.runtime/tunnel.log`.",
      ),
    );
    // Don't bail — the user can debug from the app's alert. But
    // make this very visible so they don't think everything's fine.
  }

  // 3. Write URL into .env.local so Expo picks it up at bundle time.
  log("step", c.bold(`3/4  writing URL into .env.local`));
  writeEnvUrl(tunnelUrl);

  // 4. Expo.
  log("step", c.bold(`4/4  starting Expo`));
  log("expo", c.dim(`URL: ${tunnelUrl}`));
  log("expo", c.dim(`Once the QR code prints, scan it with Expo Go.`));
  // No `--tunnel` here: the backend is already public through the
  // Cloudflare quick tunnel, so the phone reaches it directly via the
  // https URL. `--tunnel` would needlessly pull in @expo/ngrok and
  // create a second tunnel of its own. Plain `expo start` is enough.
  const expo = startTaggedChild("expo", "npx", ["expo", "start"]);

  installShutdown([backend, tunnel, expo]);

  // If any of the three exit unexpectedly, take the whole stack down.
  // (Expo exiting is fine if the user hit Ctrl-C; we treat exit 0 as a
  // clean shutdown and anything else as an error.)
  for (const [name, child] of [
    ["backend", backend],
    ["tunnel", tunnel],
    ["expo", expo],
  ]) {
    child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        log(name, c.red(`exited with code ${code}`));
        installShutdown.__lastError = true;
      }
    });
  }

  // Idle forever — children own the terminal.
  // (Returning from main() would let Node exit; we keep the event loop
  // alive via the child stdio streams + the SIGINT/SIGTERM handlers.)
  // eslint-disable-next-line no-constant-condition
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(c.red(`✘ ${err && err.message ? err.message : err}`));
  process.exit(1);
});