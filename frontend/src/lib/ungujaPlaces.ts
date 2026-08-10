/**
 * src/lib/ungujaPlaces.ts
 *
 * A small, curated dataset of Unguja Island (Zanzibar) places. Used to:
 *   1. Render the "place" chip strip on the customer Home — tapping a
 *      chip recenters the map on that place.
 *   2. Snap seller coordinates to the nearest named place so the
 *      rendered markers look anchored to a real settlement even when
 *      the API returns slightly noisy GPS.
 *   3. Render a "Stone Town" / "Mbweni" / etc. label under each pin
 *      so the user can read the location at a glance.
 *
 * Coords are approximate centroids — accurate enough for fitting the
 * map and labelling markers, not a substitute for a real geocoder.
 *
 * Sources: standard Zanzibar administrative + tourist references
 * (Stone Town UNESCO listing, Zanzibar Commission for Tourism,
 * OpenStreetMap place nodes).
 */

import { haversineMeters, type LatLng } from "./location";

export interface UngujaPlace {
  /** Stable id (kebab-case). */
  id: string;
  /** Display name. */
  name: string;
  /** Optional grouping (e.g. "Zanzibar City", "North Coast", "South"). */
  region: string;
  /** Centroid lat/lng. */
  lat: number;
  lng: number;
  /**
   * Default zoom for the recentre button. Streets = 0.04,
   * neighbourhood = 0.08, district = 0.2, island = 0.5.
   */
  zoom: number;
}

/**
 * Master list of Unguja places, ordered roughly north → south.
 * Order is meaningful: the chip strip renders in this order.
 */
export const UNGUJA_PLACES: UngujaPlace[] = [
  // North
  { id: "nungwi",        name: "Nungwi",        region: "North",  lat: -5.7265, lng: 39.2985, zoom: 0.05 },
  { id: "kendwa",        name: "Kendwa",        region: "North",  lat: -5.7480, lng: 39.2850, zoom: 0.05 },
  { id: "matemwe",       name: "Matemwe",       region: "North",  lat: -5.8800, lng: 39.3500, zoom: 0.06 },
  { id: "pwani-mchangani", name: "Pwani Mchangani", region: "North", lat: -5.9300, lng: 39.3800, zoom: 0.06 },
  { id: "kiwengwa",      name: "Kiwengwa",      region: "North",  lat: -5.9900, lng: 39.3800, zoom: 0.06 },
  { id: "pongwe",        name: "Pongwe",        region: "North",  lat: -6.0350, lng: 39.4050, zoom: 0.05 },
  { id: "urembo",        name: "Uroa",          region: "North",  lat: -6.0900, lng: 39.4100, zoom: 0.05 },
  // East
  { id: "chwaka",        name: "Chwaka",        region: "East",   lat: -6.1700, lng: 39.4700, zoom: 0.08 },
  { id: "jambiani",      name: "Jambiani",      region: "East",   lat: -6.3200, lng: 39.5400, zoom: 0.06 },
  { id: "paje",          name: "Paje",          region: "East",   lat: -6.2700, lng: 39.5300, zoom: 0.05 },
  { id: "bwejuu",        name: "Bwejuu",        region: "East",   lat: -6.2300, lng: 39.5200, zoom: 0.05 },
  { id: "pingwe",        name: "Pingwe",        region: "East",   lat: -6.1500, lng: 39.5100, zoom: 0.05 },
  // South
  { id: "makunduchi",    name: "Makunduchi",    region: "South",  lat: -6.4100, lng: 39.5100, zoom: 0.08 },
  { id: "kizimkazi",     name: "Kizimkazi",     region: "South",  lat: -6.4500, lng: 39.4700, zoom: 0.06 },
  // West
  { id: "fumba",         name: "Fumba",         region: "West",   lat: -6.3100, lng: 39.2700, zoom: 0.08 },
  { id: "bubu",          name: "Bubu",          region: "West",   lat: -6.2300, lng: 39.2200, zoom: 0.06 },
  // Zanzibar City + suburbs (western central)
  { id: "stone-town",    name: "Stone Town",    region: "Zanzibar City", lat: -6.1620, lng: 39.2020, zoom: 0.04 },
  { id: "mbweni",        name: "Mbweni",        region: "Zanzibar City", lat: -6.1050, lng: 39.2150, zoom: 0.05 },
  { id: "mazizini",      name: "Mazizini",      region: "Zanzibar City", lat: -6.2000, lng: 39.2200, zoom: 0.05 },
  { id: "magomeni",      name: "Magomeni",      region: "Zanzibar City", lat: -6.1900, lng: 39.2350, zoom: 0.05 },
  { id: "mwanakwerekwe", name: "Mwanakwerekwe", region: "Zanzibar City", lat: -6.2150, lng: 39.2250, zoom: 0.06 },
  { id: "kikwajuni",     name: "Kikwajuni",     region: "Zanzibar City", lat: -6.1800, lng: 39.2150, zoom: 0.04 },
  { id: "kisauni",       name: "Kisauni",       region: "Zanzibar City", lat: -6.1500, lng: 39.2350, zoom: 0.06 },
  { id: "chukwani",      name: "Chukwani",      region: "Zanzibar City", lat: -6.2300, lng: 39.2050, zoom: 0.06 },
  { id: "fuoni",         name: "Fuoni",         region: "West",   lat: -6.2600, lng: 39.2200, zoom: 0.07 },
  { id: "bumbwisudi",    name: "Bumbwisudi",    region: "West",   lat: -6.2400, lng: 39.2000, zoom: 0.06 },
];

/**
 * Distance in meters below which a place is considered a "close match"
 * for snapping. Anything farther returns null so we never relabel a
 * marker with a place that's actually 10 km away.
 */
const SNAP_MAX_METERS = 1500;

export interface NearestPlaceResult {
  place: UngujaPlace;
  /** Great-circle distance in meters. */
  distanceMeters: number;
}

/**
 * Return the closest place to `point` by haversine distance, or null
 * if the nearest one is farther than {@link SNAP_MAX_METERS}.
 */
export function nearestPlace(point: LatLng): NearestPlaceResult | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  let best: NearestPlaceResult | null = null;
  for (const place of UNGUJA_PLACES) {
    const d = haversineMeters(point, { lat: place.lat, lng: place.lng });
    if (best == null || d < best.distanceMeters) {
      best = { place, distanceMeters: d };
    }
  }
  if (best && best.distanceMeters <= SNAP_MAX_METERS) return best;
  return null;
}

/**
 * Convenience: just the place name (or `null` if out of range).
 */
export function nearestPlaceName(point: LatLng): string | null {
  return nearestPlace(point)?.place.name ?? null;
}
