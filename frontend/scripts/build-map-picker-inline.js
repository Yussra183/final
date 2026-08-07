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
 * Run manually when any of the three source files change:
 *   node scripts/build-map-picker-inline.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HTML_SRC = path.join(ROOT, "assets", "map-picker.html");
const CSS_SRC = path.join(ROOT, "assets", "map-picker", "leaflet.css");
const JS_SRC = path.join(ROOT, "assets", "map-picker", "leaflet.script");
const OUT = path.join(ROOT, "src", "components", "mapPickerInline.ts");

function readFileOrThrow(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`[build-map-picker-inline] source file not found: ${p}`);
  }
  return fs.readFileSync(p, "utf8");
}

// Convert a raw string into a JS template-literal body. We use a
// tagged literal `__raw` to allow embedded backticks / $ / { } in the
// source without any escaping beyond the final boundary character.
function toJsRaw(s) {
  return s;
}

const html = readFileOrThrow(HTML_SRC);
const css = readFileOrThrow(CSS_SRC);
const js = readFileOrThrow(JS_SRC);

// Sanity-check that the HTML actually has the placeholders we expect.
if (!html.includes("{{PICKER_CSS}}") || !html.includes("{{PICKER_JS}}")) {
  throw new Error(
    "[build-map-picker-inline] assets/map-picker.html is missing " +
      "{{PICKER_CSS}} and/or {{PICKER_JS}} placeholders. " +
      "Add them inside the existing <style> and <script> tags before running this script.",
  );
}

const banner = [
  "// GENERATED FILE - DO NOT EDIT BY HAND.",
  "// Regenerate with: node scripts/build-map-picker-inline.js",
  "//",
  "// Inlined picker source. The string contents originate from:",
  "//   - assets/map-picker.html         (with {{PICKER_CSS}} / {{PICKER_JS}} placeholders)",
  "//   - assets/map-picker/leaflet.css",
  "//   - assets/map-picker/leaflet.script",
  "//",
  "// At runtime, src/components/mapPickerHtml.ts builds a self-contained",
  "// HTML by substituting PICKER_CSS and PICKER_JS into PICKER_HTML_TEMPLATE",
  "// and writes the result to Paths.cache for the WebView to load.",
  "//",
  "// Why inline the JS as a string?  Metro's asset registry returns",
  "// image-source objects for binary types and module IDs for sources",
  "// (.js).  Leaflet's source calls document.createElement() at module",
  "// load and would throw a ReferenceError if Metro tried to evaluate",
  "// it.  As a string literal the JS sits inside the Metro bundle",
  "// unchanged, with no asset-registry involvement at all.",
].map((line) => line).join("\n");

const out =
  banner +
  "\n" +
  `export const PICKER_HTML_TEMPLATE: string = ${toJsRaw(JSON.stringify(html))};\n` +
  `export const PICKER_CSS: string = ${toJsRaw(JSON.stringify(css))};\n` +
  `export const PICKER_JS: string = ${toJsRaw(JSON.stringify(js))};\n`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, "utf8");

const kb = (n) => (n / 1024).toFixed(1);
console.log(
  `[build-map-picker-inline] wrote ${path.relative(ROOT, OUT)}  ` +
    `(html=${kb(html.length)}KB, css=${kb(css.length)}KB, js=${kb(js.length)}KB)`,
);
