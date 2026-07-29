#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * scripts/dev-stop.js
 *
 * Stops the backend and tunnel daemons started by
 * `scripts/start-with-tunnel.js` (a.k.a. `npm run dev:tunnel`).
 *
 *   npm run dev:stop
 *
 * What it does:
 *   1. Reads PIDs from `.runtime/backend.pid` and `.runtime/tunnel.pid`.
 *   2. Sends SIGTERM (graceful) then SIGKILL (after 5 s) to each
 *      process group — `setsid` put each daemon in its own group,
 *      so killing the leader kills all of its children too.
 *   3. Cleans up the PID files so the next `npm run dev:tunnel`
 *      starts fresh.
 *
 * Idempotent: re-running on an already-stopped stack is a no-op.
 * Safe to run after Ctrl-C in the launcher (the daemons survive
 * the launcher, this is the way to actually stop them).
 */

const fs = require("node:fs");
const path = require("node:path");

const SCRIPT_DIR = __dirname;
// Always operate relative to the directory that holds this script —
// otherwise users who `cd gas-delivery` first and run
// `npm run dev:stop` from there would see a confusing ENOENT.
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
process.chdir(REPO_ROOT);
const RUNTIME_DIR = path.join(REPO_ROOT, ".runtime");

const isWindows = process.platform === "win32";
const c = {
  dim: (s) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s) => (process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s),
};

function log(prefix, msg) {
  process.stdout.write(`${c.dim(`[${prefix}]`)} ${msg}\n`);
}

function readPid(name) {
  try {
    const raw = fs.readFileSync(path.join(RUNTIME_DIR, name), "utf8").trim();
    const pid = Number(raw);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

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
 * Kill `pid` and its whole process group (negative PID on POSIX =
 * "send signal to every process whose pgid equals this PID"). On
 * Windows groups don't exist, so fall back to the bare PID.
 */
function killGroup(pid, signal) {
  const target = isWindows ? pid : -pid;
  try {
    process.kill(target, signal);
    return true;
  } catch {
    return false;
  }
}

async function stopOne(name, pidFile) {
  const pid = readPid(pidFile);
  if (!pid) {
    log(name, c.dim(`no pid file at .runtime/${pidFile} — nothing to stop`));
    return false;
  }
  if (!processAlive(pid)) {
    log(name, c.dim(`pid ${pid} is no longer alive — cleaning pid file`));
    try {
      fs.unlinkSync(path.join(RUNTIME_DIR, pidFile));
    } catch {
      /* ignore */
    }
    return false;
  }

  log(name, `stopping pid ${pid} (SIGTERM → SIGKILL in 5 s)…`);
  // SIGTERM first for graceful shutdown (Spring Boot exits cleanly,
  // cloudflared sends a final disconnect). If the process is still
  // alive after 5 seconds we escalate to SIGKILL.
  killGroup(pid, "SIGTERM");
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (!processAlive(pid)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (processAlive(pid)) {
    log(name, c.yellow("still alive after 5 s — sending SIGKILL"));
    killGroup(pid, "SIGKILL");
    // Give the kernel a moment to actually deliver it.
    await new Promise((r) => setTimeout(r, 500));
  }

  try {
    fs.unlinkSync(path.join(RUNTIME_DIR, pidFile));
  } catch {
    /* ignore */
  }
  log(name, c.green("✔ stopped"));
  return true;
}

async function main() {
  const stoppedBackend = await stopOne("backend", "backend.pid");
  const stoppedTunnel = await stopOne("tunnel", "tunnel.pid");
  // Best-effort: drop the tunnel-url record if the tunnel is gone.
  if (stoppedTunnel) {
    try {
      fs.unlinkSync(path.join(RUNTIME_DIR, "tunnel.url"));
    } catch {
      /* ignore */
    }
  }
  if (!stoppedBackend && !stoppedTunnel) {
    console.log(
      c.yellow(
        "\nNothing to stop. (Did you already run `npm run dev:stop`?)\n" +
          "Run `npm run dev:tunnel` to start the backend + tunnel + Expo.",
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});