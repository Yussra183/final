/**
 * src/components/LiveTrackingMap/region.ts
 *
 * Shared geographic region math for the LiveTrackingMap family. Lifted
 * out of `index.native.tsx` so that the new `NearbySellersMap` can
 * reuse the same bounding-box / region computation without copying it
 * or creating a circular import.
 *
 * The helpers are pure (no React, no `react-native-maps`) so they're
 * safe to import from both the native and the web-fallback builds.
 */
import type { LatLng } from "../../lib/location";

export interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function bboxOf(points: LatLng[]): BBox | null {
  if (!points || points.length === 0) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Build a `MapView` region that frames the given bounding box.
 *
 * `pad` is a multiplier on the lat/lng span — `1.6` leaves 30% padding
 * on each side. `minDelta` guards against zero-span inputs (single
 * point or a stack of identical points) by clamping the deltas to a
 * sane minimum zoom.
 */
export function regionFor(b: BBox, pad = 1.6, minDelta = 0.005): Region {
  const centerLat = (b.minLat + b.maxLat) / 2;
  const centerLng = (b.minLng + b.maxLng) / 2;
  const latDelta = Math.max(minDelta, (b.maxLat - b.minLat) * pad);
  const lngDelta = Math.max(minDelta, (b.maxLng - b.minLng) * pad);
  return {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

/** Convenience: bbox + region in one call. Returns null for empty input. */
export function regionForPoints(
  points: LatLng[],
  pad = 1.6,
): Region | null {
  const b = bboxOf(points);
  if (!b) return null;
  return regionFor(b, pad);
}
