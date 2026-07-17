/**
 * src/lib/location.ts
 *
 * Lightweight location utilities. The mock implementations give us a
 * fully working pipeline (distance, ETA, route polyline, bearing-based
 * turn instruction) without any third-party dependency. They are written
 * behind a single object so they can be swapped with real Google Maps /
 * Directions / Routes calls without touching any UI code.
 *
 * Real integration plan (do later):
 *   • Replace `getCurrentPosition()` with `expo-location`'s
 *     `Location.getCurrentPositionAsync({ accuracy: High })`.
 *   • Replace `computeRoute()` with `https://routes.googleapis.com/directions/v2:computeRoutes`
 *     or the Google Directions JS SDK. The output already conforms to
 *     the Google `LatLngLiteral` shape.
 *   • Replace `bearingToManeuver()` with the `maneuver` steps returned
 *     by the Directions response.
 */
import { Location } from "../../constants/types";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  /** Turn instruction rendered to the rider in plain English. */
  instruction: string;
  /** Distance in meters until the next maneuver. */
  distanceMeters: number;
  /** Whether this is the final "arrive" instruction. */
  arrive?: boolean;
}

export interface Route {
  /** Encoded polyline as an ordered list of LatLng points. */
  polyline: LatLng[];
  /** Total route distance in meters. */
  distanceMeters: number;
  /** Estimated travel duration in seconds (car / scooter profile). */
  durationSeconds: number;
  /** Turn-by-turn instructions (newest first in the live UI). */
  steps: RouteStep[];
}

/** Cardinal directions — used by the mock bearing → instruction helper. */
const BEARINGS = [
  { from: 337.5, to: 22.5, label: "north" },
  { from: 22.5, to: 67.5, label: "northeast" },
  { from: 67.5, to: 112.5, label: "east" },
  { from: 112.5, to: 157.5, label: "southeast" },
  { from: 157.5, to: 202.5, label: "south" },
  { from: 202.5, to: 247.5, label: "southwest" },
  { from: 247.5, to: 292.5, label: "west" },
  { from: 292.5, to: 337.5, label: "northwest" },
];

/**
 * Haversine — great-circle distance between two lat/lng points in
 * meters. Accurate enough (<0.5%) for sub-city ETA calculations.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Initial bearing from `a` to `b` in degrees (0..360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Convert degrees to a cardinal label (e.g. "north-east"). */
export function cardinalFromBearing(deg: number): string {
  for (const b of BEARINGS) {
    if (deg >= b.from || deg < b.to) return b.label;
  }
  return "north";
}

/**
 * Infer a turn instruction from a heading delta.
 *
 *   |delta| <= 25°  → "Continue straight"
 *   delta > 25°     → "Turn right"
 *   delta < -25°    → "Turn left"
 *
 * Used by the mock route — the real Directions API returns the
 * same shape directly via each step's `maneuver`.
 */
export function maneuverFromDelta(delta: number, distanceMeters: number): string {
  const rounded = Math.max(50, Math.round(distanceMeters / 50) * 50);
  if (Math.abs(delta) <= 25) return `Continue straight for ${rounded} meters.`;
  if (delta > 25 && delta <= 110) return `Turn right after ${rounded} meters.`;
  if (delta > 110) return `Make a sharp right turn in ${rounded} meters.`;
  if (delta < -25 && delta >= -110) return `Turn left after ${rounded} meters.`;
  return `Make a sharp left turn in ${rounded} meters.`;
}

/**
 * Promise that resolves with the device's current position.
 *
 * Today: returns a mocked LatLng centered on `fallback`. Production:
 * replace the body with a call to `expo-location`.
 *
 *   const { status } = await Location.requestForegroundPermissionsAsync();
 *   if (status !== 'granted') throw new Error('permission denied');
 *   const { coords } = await Location.getCurrentPositionAsync({});
 *   return { lat: coords.latitude, lng: coords.longitude };
 */
export async function getCurrentPosition(fallback: LatLng): Promise<LatLng> {
  // The fallback returns the seller's shop, so the seller card is
  // never blank before GPS permission is granted.
  return Promise.resolve(fallback);
}

/**
 * Compute a synthetic route between two points. We interpolate along
 * the great-circle to generate a polyline that *looks* like a real
 * road on the map. Turn instructions come from the local bearing.
 *
 * Production: replace with Google Directions / Routes API.
 */
export function computeRoute(from: LatLng, to: LatLng): Route {
  const distanceMeters = haversineMeters(from, to);
  // ~30 km/h average urban speed → ETA in seconds.
  const durationSeconds = Math.max(60, Math.round(distanceMeters / (30000 / 3600)));

  const steps = 12;
  const polyline: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    polyline.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
  }

  const stepsOut: RouteStep[] = [
    {
      instruction: `Head ${cardinalFromBearing(bearingDegrees(from, to))} from current position.`,
      distanceMeters: Math.round(distanceMeters * 0.2),
    },
    {
      instruction: `Continue for ${Math.round(distanceMeters * 0.4)} meters.`,
      distanceMeters: Math.round(distanceMeters * 0.4),
    },
    {
      instruction: `Approaching destination — ${Math.round(distanceMeters * 0.3)} meters remaining.`,
      distanceMeters: Math.round(distanceMeters * 0.3),
    },
    {
      instruction: "Your destination is on the left.",
      distanceMeters: 0,
      arrive: true,
    },
  ];

  return { polyline, distanceMeters, durationSeconds, steps: stepsOut };
}

/** Format meters → km with one decimal (e.g. 2.4 km). */
export function formatDistanceKm(meters: number): string {
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${km.toFixed(1)} km`;
}

/** Format seconds → "8 min" / "1 h 12 min". */
export function formatEta(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} h ${m} min`;
}

/** Project the fraction `t` of a route onto its polyline. */
export function pointAtProgress(route: Route, t: number): LatLng {
  const clamped = Math.min(1, Math.max(0, t));
  const total = route.polyline.length - 1;
  const idx = clamped * total;
  const i0 = Math.floor(idx);
  const i1 = Math.min(total, i0 + 1);
  const frac = idx - i0;
  const a = route.polyline[i0];
  const b = route.polyline[i1];
  return {
    lat: a.lat + (b.lat - a.lat) * frac,
    lng: a.lng + (b.lng - a.lng) * frac,
  };
}

/** Standard Location → LatLng coercion helper. */
export function toLatLng(loc?: Location | { lat?: number; lng?: number } | null): LatLng | null {
  if (!loc || loc.lat == null || loc.lng == null) return null;
  return { lat: loc.lat, lng: loc.lng };
}
