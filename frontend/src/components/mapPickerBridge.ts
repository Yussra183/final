/**
 * src/components/mapPickerBridge.ts
 *
 * Single source of truth for the WebView <-> Leaflet bridge contract
 * used by `MapPickerSheet` and `ShopMapPreview`. Both components
 * previously declared their own copy of this interface and the
 * accompanying `isFiniteNumber` guard, and they had already drifted
 * (MapPickerSheet exposes `message?` and a `code?` discriminator;
 * ShopMapPreview does not). One page-side change used to compile
 * green and then silently lose a field at runtime.
 *
 * Wire format is JSON over `window.ReactNativeWebView.postMessage`.
 * The HTML source is `assets/map-picker.html`.
 *
 * Event types:
 *   - READY  — emitted once boot() finishes; safe to call __setView /
 *              __setReadOnly from RN after this.
 *   - PIN    — emitted on every user-driven pin change (tap, drag).
 *              The boot seed is intentionally NOT emitted (see the
 *              rationale in MapPickerSheet's `userInteracted` state).
 *   - ERROR  — emitted when something has gone wrong. Carries a
 *              `code` for the failure class and a `message` for the
 *              picker UI. `code` is optional for backwards
 *              compatibility with older bundles.
 */
export type BridgeMessage =
  | { type: "READY" }
  | { type: "PIN"; lat: number; lng: number }
  | { type: "ERROR"; message: string; code?: string };

/**
 * One ErrorCode for each failure class the RN UI knows how to render.
 * The HTML's `code` field is matched against this. Unknown codes fall
 * back to the generic message — we never throw on an unrecognised
 * value, because a stale HTML bundle talking to a newer RN module
 * (or vice-versa) should degrade, not crash.
 */
export type ErrorCode = "TILE_ERROR" | "SCRIPT_ERROR";

/**
 * User-facing copy for each known code. Kept centralised so the
 * picker and the preview render the same diagnostic.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  TILE_ERROR:
    "Map tiles are unavailable. Check your internet connection — you can still use Current Location or Type Coordinates.",
  SCRIPT_ERROR:
    "The map could not start. Please close and try again.",
};

/**
 * Shared finite-number guard. Both the picker and the preview used to
 * ship their own copy — same definition, but a third site waiting to
 * drift.
 */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Parse a raw `postMessage` payload into a typed `BridgeMessage`.
 * Returns `null` for anything that isn't a recognisable JSON object
 * with a string `type` field — we never throw, so a single bad
 * message can't kill the bridge.
 */
export function parseBridgeMessage(raw: string): BridgeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  switch (obj.type) {
    case "READY":
      return { type: "READY" };
    case "PIN":
      if (isFiniteNumber(obj.lat) && isFiniteNumber(obj.lng)) {
        return { type: "PIN", lat: obj.lat, lng: obj.lng };
      }
      return null;
    case "ERROR":
      if (typeof obj.message === "string") {
        return {
          type: "ERROR",
          message: obj.message,
          code: typeof obj.code === "string" ? obj.code : undefined,
        };
      }
      return null;
    default:
      return null;
  }
}