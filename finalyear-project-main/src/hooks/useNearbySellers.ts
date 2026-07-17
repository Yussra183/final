/**
 * useNearbySellers — reactively exposes the customer-home "Nearby
 * Sellers" recommendation list.
 *
 *   - Reads the signed-in customer's profile location from the store.
 *   - Applies `filterNearbySellers(allSellers, location)` whenever the
 *     location, the seller list, or the active filter changes.
 *   - Falls back to a default location (the first seller's district)
 *     when the customer has not set a profile address yet.
 *
 * The hook returns both the filtered list and a few convenience
 * fields so the home screen can show counts and a "no sellers"
 * message without re-doing the work.
 */

import { useMemo } from "react";
import { useStore } from "../store/StoreContext";
import {
  filterNearbySellers,
  NearbySeller,
  FilterOptions,
} from "../utils/sellers";
import type { Location } from "../../constants/types";

export interface UseNearbySellersResult {
  /** The filtered, distance-ranked list of sellers. */
  sellers: NearbySeller[];
  /** The location used to filter (falls back to a default if unset). */
  effectiveLocation: Location | null;
  /** True when the customer hasn't set a profile location. */
  usingDefaultLocation: boolean;
}

export function useNearbySellers(
  fallbackPool: NearbySeller[],
  options?: FilterOptions,
): UseNearbySellersResult {
  const { session, sellers } = useStore();
  const customer = session?.user;

  // The "all sellers" pool combines the store-provided ones (if any)
  // with the page-local mock pool. In production the store would be
  // the sole source; today we keep the mock so the screen renders
  // even when the API is unreachable.
  const allSellers = useMemo<NearbySeller[]>(() => {
    if (!sellers?.length) return fallbackPool;
    // Map store SellerProfile → NearbySeller. The store shape lacks
    // gasTypes / image; we leave them empty so the card still renders.
    const fromStore: NearbySeller[] = sellers.map((s) => ({
      id: s.sellerId,
      name: s.businessName,
      status: s.openNow ? "Active" : "Closed",
      distanceKm: s.distanceKm,
      location: s.location,
      gasTypes: [],
      cylinderSizes: s.availableSizes,
      phone: s.phone,
    }));
    // De-dup by id, preferring the store version.
    const map = new Map<string, NearbySeller>();
    [...fromStore, ...fallbackPool].forEach((s) => {
      if (!map.has(s.id)) map.set(s.id, s);
    });
    return Array.from(map.values());
  }, [sellers, fallbackPool]);

  // Use the customer's profile location. If they haven't set one,
  // synthesize one from the first seller's location so the screen
  // still has *something* to filter against.
  const { effectiveLocation, usingDefaultLocation } = useMemo(() => {
    if (
      customer?.address ||
      customer?.district ||
      customer?.region ||
      typeof customer?.lat === "number"
    ) {
      return {
        effectiveLocation: {
          address: customer?.address,
          district: customer?.district,
          region: customer?.region,
          lat: customer?.lat,
          lng: customer?.lng,
        } as Location,
        usingDefaultLocation: false,
      };
    }
    const first = allSellers[0];
    if (!first) return { effectiveLocation: null, usingDefaultLocation: true };
    return {
      effectiveLocation: {
        address: first.location,
        district: first.district,
        region: first.region,
        lat: first.lat,
        lng: first.lng,
      } as Location,
      usingDefaultLocation: true,
    };
  }, [customer?.address, customer?.district, customer?.region, customer?.lat, customer?.lng, allSellers]);

  const filtered = useMemo(
    () => filterNearbySellers(allSellers, effectiveLocation, options),
    [allSellers, effectiveLocation, options],
  );

  return {
    sellers: filtered,
    effectiveLocation,
    usingDefaultLocation,
  };
}