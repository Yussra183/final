/**
 * src/components/NearbyMap/bridge.ts
 *
 * Typed bridge contract for the multi-pin Leaflet viewer used by the
 * customer `NearbyMap` component. Sister to `mapPickerBridge.ts`
 * (single-pin picker / preview) — both layers live on the same
 * WebView page (`assets/map-picker.html`) but expose different
 * window globals and post different `postMessage` types.
 *
 * Outbound (Leaflet -> RN):
 *   - READY  — emitted once `boot()` finishes; React wrappers MUST NOT
 *              call `__setMarkers` / `__selectMarker` / `__setView`
 *              before this fires. The payload replay is handled inside
 *              the page (the `__MARKERS__` stash mirrors the
 *              `__SEED__` replay pattern).
 *   - MARKER_TAP — fired when the user taps a NearbyMap pin. Carries
 *              the marker's `id` so the React side can match it back
 *              to the seller.
 *   - ERROR  — same error contract as `mapPickerBridge.ts`. We
 *              re-export `ERROR_MESSAGES` and `isFiniteNumber` from
 *              there so callers only need this module.
 *
 * Inbound (RN -> Leaflet):
 *   - window.__setMarkers(json)        inject the list of markers
 *   - window.__selectMarker(id|null)   toggle selected styling
 *   - window.__setView(lat,lng,zoom)   already defined for the
 *                                       single-pin page; reuse.
 *
 * ⚠ If you edit the bridge messages, you MUST also edit the page-side
 *    implementations in `assets/map-picker.html`. After either side
 *    changes, run:
 *
 *        node scripts/build-map-picker-inline.js --write
 *
 *    The build is wired as a `pre` hook on `start`/`build`/`android`/
 *    `ios`/`web`/`lint`/`typecheck`, so dev/CI loops are safe.
 */

import {
  ERROR_MESSAGES,
  isFiniteNumber,
  type ErrorCode,
} from "../mapPickerBridge";

export { ERROR_MESSAGES, isFiniteNumber };
export type { ErrorCode };

/**
 * Wire messages emitted by the Leaflet page over the multi-pin
 * viewer. Mirror of the page-side `postMessage(...)` calls in
 * `assets/map-picker.html`.
 */
export type NearbyMapMessage =
  | { type: "READY" }
  | { type: "MARKER_TAP"; id: string }
  | { type: "ERROR"; message: string; code?: string };

/**
 * Parse a raw `postMessage` payload into a typed `NearbyMapMessage`.
 * Returns `null` for anything unrecognisable — we never throw, so a
 * single bad message cannot kill the bridge.
 */
export function parseNearbyMapMessage(raw: string): NearbyMapMessage | null {
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
    case "MARKER_TAP":
      if (typeof obj.id === "string" && obj.id.length > 0) {
        return { type: "MARKER_TAP", id: obj.id };
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
