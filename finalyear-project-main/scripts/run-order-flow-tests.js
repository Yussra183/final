/**
 * Runner for the Order Flow smoke tests.
 *
 * Steps:
 *   1. Type-compile the service layer to a temp dir (CommonJS so
 *      Node can load it without tsx / ts-node).
 *   2. Invoke the smoke test against the built dir.
 *   3. Surface the count + exit code from the smoke test.
 *
 * Wired to `npm run test:order-flow` and `npm test` in package.json.
 */
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PROJECT_DIR = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(
  os.tmpdir(),
  `order-flow-build-${process.pid}-${Date.now()}`,
);

console.log("→ Compiling service layer…");

const tscArgs = [
  "--outDir",
  BUILD_DIR,
  "--rootDir",
  PROJECT_DIR,
  "--module",
  "commonjs",
  "--moduleResolution",
  "node",
  "--target",
  "es2020",
  "--esModuleInterop",
  "--skipLibCheck",
  "--noEmitOnError",
  "false",
  "constants/order.ts",
  "src/services/orderErrors.ts",
  "src/services/orderValidation.ts",
  "src/services/orderRepository.ts",
  "src/services/riderBroadcast.ts",
  "src/services/OrderService.ts",
];

const tsc = spawnSync("npx", ["tsc", ...tscArgs], {
  cwd: PROJECT_DIR,
  stdio: "inherit",
  shell: false,
});
if (tsc.status !== 0) {
  console.error("TypeScript compilation failed.");
  process.exit(1);
}

console.log(`\n→ Running smoke tests against ${BUILD_DIR}`);
const env = { ...process.env, ORDER_FLOW_BUILD_DIR: BUILD_DIR };
try {
  const smoke = spawnSync(
    "node",
    [path.join(PROJECT_DIR, "scripts", "order-flow-smoke.js")],
    { cwd: PROJECT_DIR, stdio: "inherit", env, shell: false },
  );
  process.exit(smoke.status ?? 1);
} finally {
  // Cleanup the build directory.
  try {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
