#!/usr/bin/env node
/* eslint-disable */

/**
 * scripts/build-map-picker-inline.js
 *
 * Inlines the picker source files (HTML / CSS / Leaflet JS) into a
 * single TypeScript module as string constants. The picker runs
 * inside a WebView; previously we tried to ship these files via the
 * APK assets/ folder (the standard `expo-asset` plugin whitelist
 * doesn't include `.html` / `.css`, and `Paths.bundle` on Android
 * resolves to `asset:///` which doesn't contain arbitrary project
 * assets). Inlining the source as strings is the only path that's
 * both cross-platform and unaffected by Metro's asset registry.
 *
 * Output: src/components/mapPickerInline.ts
 *   - export const PICKER_HTML_TEMPLATE: string   // contains {{CSS}} and {{JS}} placeholders
 *   - export const PICKER_CSS: string
 *   - export const PICKER_JS: string
 *
 * Usage:
 *   node scripts/build-map-picker-inline.js            # assert up to date (exit 1 if stale)
 *   node scripts/build-map-picker-inline.js --write    # regenerate
 *
 * The no-flag form is wired into the npm pre* hooks so a stale bundle
 * can't reach a device. Regenerate with --write and commit the result
 * whenever you touch assets/map-picker.html or assets/map-picker/*.
 *
 * Why the verification step below exists
 * --------------------------------------
 * The placeholders used to live inside comments (`// {{PICKER_JS}}`
 * and a block-commented `{{PICKER_CSS}}`). Substituting 147KB of
 * minified Leaflet after a `//` commented out only the first line of
 * its multi-line banner and let the rest escape as raw garbage — a
 * syntax error that killed the ENTIRE inline script. Nothing ran: no
 * boot(), no postReady(), not even the "Leaflet failed to load"
 * reporter. Every launch died with a generic 3.5s timeout, on every
 * device, online or off. `verifyAssembled()` parses the assembled
 * script and would have caught it at authoring time in milliseconds.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HTML_SRC = path.join(ROOT, "assets", "map-picker.html");
const CSS_SRC = path.join(ROOT, "assets", "map-picker", "leaflet.css");
const JS_SRC = path.join(ROOT, "assets", "map-picker", "leaflet.script");
const OUT = path.join(ROOT, "src", "components", "mapPickerInline.ts");

const WRITE = process.argv.includes("--write");

function readFileOrThrow(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`[build-map-picker-inline] source file not found: ${p}`);
  }
  return fs.readFileSync(p, "utf8");
}

/**
 * Assemble the final document exactly as `mapPickerHtml.ts` does at
 * runtime, then prove it actually works. Three checks, cheapest first:
 *
 *   1. No placeholder survived the substitution.
 *   2. The assembled <script> body parses. `new Function` is the
 *      cheapest real JS parser available here and catches precisely
 *      the comment-swallowing class of bug described above.
 *   3. Leaflet's CSS actually landed (a block-comment wrapper would
 *      truncate it at the first comment-close inside leaflet.css).
 *
 * Throws with an actionable message; never returns a falsy "ok".
 */
function verifyAssembled(html, css, js) {
  const assembled = html
    .replace(/\{\{PICKER_CSS\}\}/g, () => css)
    .replace(/\{\{PICKER_JS\}\}/g, () => js);

  const leftover = assembled.match(/\{\{[A-Z_]+\}\}/g);
  if (leftover) {
    throw new Error(
      `[build-map-picker-inline] unsubstituted placeholder(s) in the ` +
        `assembled document: ${[...new Set(leftover)].join(", ")}`,
    );
  }

  const scripts = assembled.match(/<script>([\s\S]*?)<\/script>/g);
  if (!scripts || scripts.length === 0) {
    throw new Error("[build-map-picker-inline] assembled document has no <script> block.");
  }
  scripts.forEach((block, i) => {
    const body = block.replace(/^<script>/, "").replace(/<\/script>$/, "");
    try {
      // Parse-only: constructing a Function compiles the body but
      // never runs it. Inputs are project-controlled source files.
      new Function(body);
    } catch (err) {
      throw new Error(
        `[build-map-picker-inline] assembled <script> block #${i + 1} does NOT parse: ` +
          `${err.message}\n` +
          `  This is the failure mode that makes the picker report ` +
          `"The map could not start". Check that {{PICKER_JS}} is on its ` +
          `own line and NOT inside a // comment.`,
      );
    }
  });

  if (!assembled.includes(".leaflet-container")) {
    throw new Error(
      "[build-map-picker-inline] Leaflet CSS is missing from the assembled " +
        "document (expected a `.leaflet-container` rule). Check that " +
        "{{PICKER_CSS}} is on its own line and NOT inside a /* */ comment.",
    );
  }
}

function buildOutput(html, css, js) {
  const banner = [
    "// GENERATED FILE - DO NOT EDIT BY HAND.",
    "// Regenerate with: node scripts/build-map-picker-inline.js --write",
    "//",
    "// Inlined picker source. The string contents originate from:",
    "//   - assets/map-picker.html         (with {{PICKER_CSS}} / {{PICKER_JS}} placeholders)",
    "//   - assets/map-picker/leaflet.css",
    "//   - assets/map-picker/leaflet.script",
    "//",
    "// At runtime, src/components/mapPickerHtml.ts builds a self-contained",
    "// HTML by substituting PICKER_CSS and PICKER_JS into PICKER_HTML_TEMPLATE",
    "// and hands the result to WebView.source.html.",
    "//",
    "// Why inline the JS as a string?  Metro's asset registry returns",
    "// image-source objects for binary types and module IDs for sources",
    "// (.js).  Leaflet's source calls document.createElement() at module",
    "// load and would throw a ReferenceError if Metro tried to evaluate",
    "// it.  As a string literal the JS sits inside the Metro bundle",
    "// unchanged, with no asset-registry involvement at all.",
  ].join("\n");

  return (
    banner +
    "\n" +
    `export const PICKER_HTML_TEMPLATE: string = ${JSON.stringify(html)};\n` +
    `export const PICKER_CSS: string = ${JSON.stringify(css)};\n` +
    `export const PICKER_JS: string = ${JSON.stringify(js)};\n`
  );
}

const html = readFileOrThrow(HTML_SRC);
const css = readFileOrThrow(CSS_SRC);
const js = readFileOrThrow(JS_SRC);

// Sanity-check that the HTML actually has the placeholders we expect.
if (!html.includes("{{PICKER_CSS}}") || !html.includes("{{PICKER_JS}}")) {
  throw new Error(
    "[build-map-picker-inline] assets/map-picker.html is missing " +
      "{{PICKER_CSS}} and/or {{PICKER_JS}} placeholders. " +
      "Add them on their own lines inside the <style> and <script> tags " +
      "(NOT inside comments) before running this script.",
  );
}

verifyAssembled(html, css, js);

const out = buildOutput(html, css, js);
const kb = (n) => (n / 1024).toFixed(1);

if (!WRITE) {
  // Assert-up-to-date mode: this is what the npm pre* hooks run, so a
  // stale generated bundle fails the build instead of silently
  // shipping a picker that doesn't match its source.
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
  if (current !== out) {
    console.error(
      "[build-map-picker-inline] OUT OF DATE: " +
        `${path.relative(ROOT, OUT)} does not match its sources.\n` +
        "  Fix with: node scripts/build-map-picker-inline.js --write",
    );
    process.exit(1);
  }
  console.log("[build-map-picker-inline] up to date, assembled script parses OK.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, "utf8");

console.log(
  `[build-map-picker-inline] wrote ${path.relative(ROOT, OUT)}  ` +
    `(html=${kb(html.length)}KB, css=${kb(css.length)}KB, js=${kb(js.length)}KB)  ` +
    `verified: assembled script parses, Leaflet CSS present.`,
);
