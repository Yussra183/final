/**
 * src/components/mapPickerHtml.ts
 *
 * Builds the self-contained OpenStreetMap picker HTML in-memory and
 * returns it for the WebView to render via `source.html`. The picker
 * runs entirely off the JS bundle — no Metro / asset registry, no
 * disk round-trip, no `file://` URL permissions.
 *
 * Why source.html (not source.uri)
 * --------------------------------
 * The earlier implementation wrote the assembled HTML to
 * `Paths.cache/map-picker/` and loaded it via `source.uri =
 * file://...`. On Android, that path produced a WebView that
 * loaded the file (loadEnd fired) but never executed the inline
 * `<script>` block — the page never emitted READY and the picker
 * hung on its skeleton. Root cause: `file://` documents have a
 * null/opaque origin in modern Android WebViews, and the inline
 * script tag was either blocked by the opaque-origin policy or
 * dropped because the file was written without an explicit
 * Content-Type. The documented happy-path for `react-native-webview`
 * is `source={{ html, baseUrl }}` — the WebView creates an
 * `about:blank` document, base-URLs it, and runs inline scripts in
 * a normal same-origin context. No filesystem permissions, no MIME
 * guessing.
 *
 * The HTML template is the same — CSS and JS are still substituted
 * in place at the `{{PICKER_CSS}}` / `{{PICKER_JS}}` markers. The
 * `baseUrl` is `https://localhost` so Leaflet's CSS `url(images/...)`
 * references resolve to harmless 404s (we don't use any of the
 * raster-icon paths — the marker is a div-icon). If we ever need
 * the marker PNGs we can switch the baseUrl to point at the
 * bundled image assets.
 *
 * Bundle impact: ~170 KB of strings (HTML 9 KB + CSS 14 KB + JS 144 KB).
 * Acceptable for a one-shot render per picker open.
 *
 * Regenerating the inlined source
 * -------------------------------
 * The generator script reads the three source files and writes
 * `src/components/mapPickerInline.ts`:
 *
 *     node scripts/build-map-picker-inline.js
 *
 * Re-run after editing any file under `assets/map-picker/`.
 */
import {
  PICKER_CSS,
  PICKER_HTML_TEMPLATE,
  PICKER_JS,
} from "./mapPickerInline";

interface MaterialisedPicker {
  /**
   * The fully-assembled HTML string with CSS + JS substituted in.
   * Passed to `WebView.source.html` so the WebView renders it
   * directly without going through the filesystem.
   */
  html: string;
  /**
   * Base URL for `WebView.source.baseUrl`. The picker page does
   * network calls to OSM, so the baseUrl must be HTTPS to satisfy
   * `mixedContentMode`. `https://localhost` is the conventional
   * pick for in-memory HTML — it gives the document a real origin
   * without implying any real server. `fetch` and `XMLHttpRequest`
   * to `https://tile.openstreetmap.org` succeed from this origin.
   */
  baseUrl: string;
}

/**
 * Build the self-contained picker HTML in memory by substituting
 * the CSS and JS placeholders in the template. Synchronous because
 * the source is already in the JS bundle — no I/O involved.
 *
 * `String#replace` is called with a function so `$` characters and
 * backreferences in the CSS / JS source can't trigger
 * `replace`-special pattern parsing.
 */
export function getMaterialisedPicker(): MaterialisedPicker {
  const html = PICKER_HTML_TEMPLATE.replace(
    /\{\{PICKER_CSS\}\}/g,
    () => PICKER_CSS,
  ).replace(/\{\{PICKER_JS\}\}/g, () => PICKER_JS);

  return {
    html,
    // Use a stable HTTPS base URL so (1) the inline script block
    // executes in a same-origin context and (2) OSM tile fetches
    // are not blocked as mixed-content. `https://localhost` is the
    // conventional pick for in-memory HTML pages — it gives the
    // WebView a real origin without any DNS round-trip.
    baseUrl: "https://localhost/",
  };
}
