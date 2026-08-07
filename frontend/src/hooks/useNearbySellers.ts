/**
 * useNearbySellers — reactively exposes the customer-home "Nearby
 * Sellers" recommendation list.
 *
 *   - Reads the signed-in customer's SAVED location from the store
 *     (loaded once after login from `GET /api/customers/me` and cached
 *     for the session). The customer is never asked to re-enter it.
 *   - When that location has coordinates — which it always does once
 *     saved, because the backend geocodes the address — the hook asks
 *     `GET /api/sellers?lat&lng&radiusKm` for a server-side
 *     radius-filtered, nearest-first list and uses it VERBATIM. The
 *     backend owns the distance math (Haversine against each seller's
 *     approved business coordinates), the radius gate, and the sort.
 *   - Re-fetches when the saved coordinates change, so the dashboard
 *     refreshes as soon as the customer updates their address.
 *   - Falls back to the store slice + local text matching only when the
 *     customer has no saved location yet.
 *
 * The hook returns both the list and a few convenience fields so the
 * home screen can show counts and the right empty-state message without
 * re-doing the work.
 */

import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store/StoreContext";
import { SellersApi } from "../api/endpoints";
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

/** Default radius (km) used when the customer supplies coords but no
 *  explicit radius. Mirrors the backend's `app.nearby.radius-km`. */
const NEARBY_RADIUS_KM = 25;

export function useNearbySellers(
  fallbackPool: NearbySeller[],
  options?: FilterOptions,
): UseNearbySellersResult {
  const { session, sellers: storeSellers } = useStore();
  const customer = session?.user;

  // Server-side filtered slice — populated whenever the customer has a
  // saved location with coordinates. The backend has already filtered to
  // the radius and sorted nearest-first.
  const [serverSellers, setServerSellers] = useState<NearbySeller[] | null>(
    null,
  );

  const hasCustomerGps =
    typeof customer?.lat === "number" && typeof customer?.lng === "number";

  useEffect(() => {
    if (!hasCustomerGps) {
      // No saved coordinates → no server query, fall back to the store
      // slice and the local text matcher below.
      setServerSellers(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await SellersApi.list({
          lat: customer!.lat,
          lng: customer!.lng,
          radiusKm: NEARBY_RADIUS_KM,
        });
        if (cancelled) return;
        setServerSellers(
          rows.map((s) => ({
            id: s.sellerId,
            name: s.businessName,
            status: s.openNow ? ("Active" as const) : ("Closed" as const),
            distanceKm: s.distanceKm,
            location: s.location,
            district: undefined,
            region: undefined,
            gasTypes: ["LPG"],
            cylinderSizes: s.availableSizes,
            phone: s.phone,
            lat: s.lat,
            lng: s.lng,
          })),
        );
      } catch {
        // Network / server errors: fall through to the store-based
        // fallback so the home screen still renders *something*.
        if (!cancelled) setServerSellers(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasCustomerGps, customer?.lat, customer?.lng]);

  // The customer's saved location. When they haven't set one, synthesize
  // one from the first available seller so the screen still has
  // something to filter against.
  const fallbackSellers = useMemo<NearbySeller[]>(() => {
    const fromStore: NearbySeller[] = storeSellers.map((s) => ({
      id: s.sellerId,
      name: s.businessName,
      status: s.openNow ? ("Active" as const) : ("Closed" as const),
      distanceKm: s.distanceKm,
      location: s.location,
      gasTypes: [],
      cylinderSizes: s.availableSizes,
      phone: s.phone,
      lat: s.lat,
      lng: s.lng,
    }));
    // De-dup by id, preferring the store response.
    const map = new Map<string, NearbySeller>();
    [...fromStore, ...fallbackPool].forEach((s) => {
      if (!map.has(s.id)) map.set(s.id, s);
    });
    return Array.from(map.values());
  }, [storeSellers, fallbackPool]);

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
    const first = fallbackSellers[0];
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
  }, [
    customer?.address,
    customer?.district,
    customer?.region,
    customer?.lat,
    customer?.lng,
    fallbackSellers,
  ]);

  const sellers = useMemo(() => {
    // GPS path — the server response is authoritative and complete.
    //
    // It is used verbatim, NOT run through `filterNearbySellers`. That
    // local scorer awards points for district / region string equality
    // against seller fields the API doesn't carry (they map to
    // `undefined`), then drops every row scoring 0 — which would throw
    // away the very sellers the backend just confirmed are in range.
    // The store slice is not merged in either: it is the *unfiltered*
    // list, so merging it would smuggle out-of-radius sellers back onto
    // the screen and defeat the radius gate.
    //
    // An empty array here is a real answer ("nothing within the service
    // radius"), so the home screen shows the no-nearby-sellers message.
    if (serverSellers) {
      const activeOnly = options?.activeOnly ?? true;
      const limit = options?.limit ?? 20;
      const pool = activeOnly
        ? serverSellers.filter((s) => s.status === "Active")
        : serverSellers;
      return pool.slice(0, limit);
    }
    // No saved coordinates (or the request failed) — fall back to the
    // local text-matching heuristic over the store slice.
    return filterNearbySellers(fallbackSellers, effectiveLocation, options);
  }, [serverSellers, fallbackSellers, effectiveLocation, options]);

  return {
    sellers,
    effectiveLocation,
    usingDefaultLocation,
  };
}
