/**
 * Seller recommendation utilities.
 *
 * The customer home screen surfaces a list of gas sellers near the
 * customer. Today the data is mocked; tomorrow it will come from a
 * backend that filters sellers server-side using the customer's
 * profile location (or live GPS).
 *
 * To keep the swap-over simple we expose a single pure function
 * `filterNearbySellers(sellers, location)` that takes the raw seller
 * list and a `Location` and returns the recommendation set. The hook
 * layer (`useNearbySellers`) wraps it with React state, but the
 * filtering logic itself lives here so it can be unit-tested and
 * reused from anywhere.
 *
 * Pipeline:
 *   customer profile Location
 *     → filterNearbySellers(allSellers, location)
 *     → sorted by distance (closest first)
 *     → surfaced in the home screen
 */

import type { Location } from "../../constants/types";
import type { GasProduct } from "../../constants/types";
import { GAS_BRANDS, isGasBrand } from "../../constants/gasCatalog";

/**
 * A "display-ready" seller — what the home card needs to render. This
 * extends the public `SellerProfile` with the two extra fields the
 * customer card shows (image, gasTypes). Keeping it in the utils
 * module lets us pass any object that has at least the canonical
 * fields without forcing a type-cast at every call site.
 */
export interface NearbySeller extends Record<string, unknown> {
  id: string;
  name: string;
  image?: string;
  status: "Active" | "Closed";
  distanceKm: number;
  location: string;
  district?: string;
  region?: string;
  gasTypes: string[];
  cylinderSizes: string[];
  phone: string;
  lat?: number;
  lng?: number;
  /**
   * Mirrors {@link SellerProfile.locationStatus}. "MISSING" rows are
   * sellers whose address hasn't been geocoded — the customer map
   * renders them with a grey pin at the island centroid and the
   * bottom-sheet row shows a "Location not set" pill.
   */
  locationStatus?: "OK" | "MISSING";
}

export function gasBrandsForSellerInventory(
  products: GasProduct[],
  sellerId: string,
): string[] {
  const seen = new Set<string>();
  for (const product of products) {
    if (product.sellerId !== sellerId) continue;
    if (!isGasBrand(product.name)) continue;
    seen.add(product.name);
  }
  return GAS_BRANDS.filter((brand) => seen.has(brand));
}

export function gasSizesForSellerInventory(
  products: GasProduct[],
  sellerId: string,
): string[] {
  const seen = new Set<string>();
  for (const product of products) {
    if (product.sellerId !== sellerId) continue;
    if (!isGasBrand(product.name)) continue;
    seen.add(product.size);
  }
  return Array.from(seen);
}

/**
 * Crude distance helper — Haversine in km. Used as a fallback when we
 * have GPS coordinates on both sides but the backend has not yet
 * shipped a distance field. Server-side ranking is preferred.
 */
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const t =
    s1 * s1 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(t)));
}

/**
 * Normalize a string for case/whitespace-insensitive comparison.
 */
function norm(s: string | undefined | null): string {
  return (s ?? "").trim().toLowerCase();
}

export interface FilterOptions {
  /**
   * How many results to return. Default is 20 — enough for the home
   * screen's "Nearby" list without flooding the layout.
   */
  limit?: number;
  /**
   * Whether to drop sellers that aren't currently `Active`. Defaults
   * to true so closed sellers don't appear in recommendations.
   */
  activeOnly?: boolean;
}

/**
 * Filter (and sort) sellers relative to a customer location.
 *
 * The matching strategy is intentionally layered so the same function
 * works whether the data is fully GPS-tagged, partially tagged, or
 * text-only:
 *
 *   1. **District match** (strongest textual signal) — sellers in the
 *      same district as the customer are guaranteed to surface.
 *   2. **Region match** — sellers in the same region but different
 *      district are included when we have nothing closer.
 *   3. **GPS distance** — when both sides have lat/lng we fall back
 *      to a Haversine ranking.
 *   4. **Address token overlap** — last-resort fuzzy match using
 *      tokens from the customer's address.
 *
 * The function is **pure**: same inputs → same outputs. The hook in
 * `useNearbySellers` is what ties it to component state.
 */
export function filterNearbySellers(
  sellers: NearbySeller[],
  location: Location | null | undefined,
  options: FilterOptions = {},
): NearbySeller[] {
  const { limit = 20, activeOnly = true } = options;
  if (!sellers.length) return [];

  // Drop closed sellers up front (unless the caller asked otherwise).
  const pool = activeOnly
    ? sellers.filter((s) => s.status === "Active")
    : sellers.slice();

  // No location yet → just hand back the pool sorted by stored
  // distance (or stable order if all distances are equal).
  if (!location) {
    return pool
      .slice()
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  const customerDistrict = norm(location.district);
  const customerRegion = norm(location.region);
  const customerAddress = norm(location.address);
  const hasGps =
    typeof location.lat === "number" && typeof location.lng === "number";

  return pool
    .map((s) => {
      let score = 0;
      const sellerDistrict = norm(s.district);
      const sellerRegion = norm(s.region);

      if (customerDistrict && sellerDistrict === customerDistrict) score += 100;
      if (customerRegion && sellerRegion && sellerRegion === customerRegion)
        score += 30;
      if (hasGps && typeof s.lat === "number" && typeof s.lng === "number") {
        // Closer is better; subtract a small amount proportional to km
        // distance so two same-district sellers still rank by proximity.
        score += Math.max(0, 20 - haversineKm(location as any, s as any));
      } else if (customerAddress && s.location) {
        const tokens = customerAddress.split(/[\s,]+/).filter(Boolean);
        const hay = norm(s.location);
        const hits = tokens.filter((t) => hay.includes(t)).length;
        score += hits * 5;
      }
      return { seller: s, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.seller.distanceKm - b.seller.distanceKm;
    })
    .map((r) => r.seller)
    .slice(0, limit);
}
