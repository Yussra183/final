/**
 * src/components/LiveTrackingMap.types.ts
 *
 * Shared TypeScript types for the LiveTrackingMap family:
 *
 *   • LiveTrackingMapProps       — the public, optional-alias surface
 *     that every consumer sees. `live` is optional because the
 *     legacy `rider` alias still works.
 *   • ResolvedMapProps            — the internal, normalised shape
 *     after the public entry point resolves `live` from `live` or
 *     `rider`, and `liveLabel` from `liveLabel` or `riderLabel`.
 *
 * Splitting these into a separate `.ts` file keeps the platform-
 * specific implementations (`*.tsx`, `*.native.tsx`) free of
 * circular dependencies and ensures the type definitions are
 * available everywhere without pulling in `react-native-maps`.
 */
import type { ViewStyle } from "react-native";
import type { LatLng } from "../lib/location";

export interface LiveTrackingMapProps {
  /** Origin marker (e.g. supplier depot or seller's shop). */
  origin: LatLng;
  /**
   * Live moving marker — supplier's vehicle or rider.
   *
   * Optional because legacy consumers pass `rider` instead; the
   * component resolves whichever one is present at runtime.
   */
  live?: LatLng;
  /**
   * Backwards-compatibility alias for `live`. Older consumers
   * (e.g. `LiveRiderTracker`) still pass `rider={...}`; either name
   * is accepted. The `live` prop wins if both are provided.
   */
  rider?: LatLng;
  /** Destination marker — seller's shop or customer's address. */
  destination: LatLng;
  /** Optional planned route waypoints to render under the polyline. */
  waypoints?: LatLng[];
  /**
   * Optional ordered polyline points to draw on top of the map.
   * If absent, a single straight line `origin → destination` is used.
   */
  route?: LatLng[];
  /** Visual height of the map frame. Default 260. */
  height?: number;
  /** Label rendered on the live marker (e.g. "Rider", "Supplier"). */
  liveLabel?: string;
  /** Backwards-compatibility alias for `liveLabel`. */
  riderLabel?: string;
  /** Label rendered on the origin marker (e.g. "Depot", "Shop"). */
  originLabel?: string;
  /** Label rendered on the destination marker (e.g. "Customer"). */
  destinationLabel?: string;
  /** Hex colour for the route polyline. Default Colors.primary. */
  routeColor?: string;
  /** Optional wrapper style. */
  style?: ViewStyle;
}

/**
 * Internal normalised shape consumed by every renderer
 * (fallback + native). `live` is guaranteed to be defined.
 */
export type ResolvedMapProps = Omit<
  LiveTrackingMapProps,
  "live" | "liveLabel" | "rider" | "riderLabel"
> & {
  live: LatLng;
  liveLabel: string;
};

/** Resolve the public aliases into the shape consumed by each renderer. */
export function resolveLiveTrackingMapProps(
  props: LiveTrackingMapProps,
): ResolvedMapProps {
  return {
    ...props,
    live: props.live ?? props.rider ?? { lat: 0, lng: 0 },
    liveLabel: props.liveLabel ?? props.riderLabel ?? "Live",
  };
}
