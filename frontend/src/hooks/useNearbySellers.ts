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
import { useCustomerLocation } from "./useCustomerLocation";
import {
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

  // Live device GPS — preferred over the saved profile address when
  // the customer hasn't set one. The backend's radius-filtered query
  // is only useful if we have *some* coordinate pair to centre on;
  // without one the hook used to fall through to a text-match over
  // the whole store slice, which silently dropped every GPS-tagged
  // seller and returned the no-nearby-sellers empty state. Customers
  // who rely on device GPS (the typical case for a marketplace app)
  // now see their real nearby list.
  const { coords: deviceCoords } = useCustomerLocation();

  // Server-side filtered slice — populated whenever the customer has
  // a coordinate pair (saved profile OR live device GPS). The backend
  // has already filtered to the radius and sorted nearest-first.
  const [serverSellers, setServerSellers] = useState<NearbySeller[] | null>(
    null,
  );

  // Effective query centre — saved profile wins when available,
  // otherwise live device GPS. The previous version required a saved
  // profile, which silently produced the "No sellers nearby" empty
  // state for every customer who skipped the profile location step.
  const queryLat =
    typeof customer?.lat === "number" && Number.isFinite(customer.lat)
      ? customer.lat
      : Number.isFinite(deviceCoords.lat)
        ? deviceCoords.lat
        : null;
  const queryLng =
    typeof customer?.lng === "number" && Number.isFinite(customer.lng)
      ? customer.lng
      : Number.isFinite(deviceCoords.lng)
        ? deviceCoords.lng
        : null;
  const hasCustomerGps =
    queryLat !== null && queryLng !== null;

  useEffect(() => {
    if (!hasCustomerGps) {
      // No saved or device coordinates → no server query, fall back to
      // the store slice and the local text matcher below.
      setServerSellers(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await SellersApi.list({
          lat: queryLat!,
          lng: queryLng!,
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
  }, [hasCustomerGps, queryLat, queryLng]);

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
    if (serverSellers && serverSellers.length > 0) {
      const activeOnly = options?.activeOnly ?? true;
      const limit = options?.limit ?? 20;
      const pool = activeOnly
        ? serverSellers.filter((s) => s.status === "Active")
        : serverSellers;
      return pool.slice(0, limit);
    }
    // Server query unavailable (network error / empty response) —
    // fall back to the store slice directly. Previously this path
    // routed through `filterNearbySellers`, which awards points for
    // district / region string equality, then drops every row scoring
    // 0. For a customer that has only device GPS (no saved profile
    // address), `effectiveLocation.address` defaults to the first
    // seller's location and `district` / `region` come back undefined
    // from the API mapper, so the scorer would silently throw away
    // every approved seller — exactly the symptom reported on the
    // customer Home ("badge shows 2, but no markers appear"). The
    // store slice itself is already pre-filtered server-side by the
    // permit / active gate (`projectApprovedActive`), so we just need
    // a sensible in-radius filter on top of it.
    //
    // The store slice comes from the no-filter `SellersApi.list()`
    // boot call — it carries EVERY approved+active seller regardless
    // of distance. Applying the 25 km radius gate again here would
    // drop every seller far from the customer and produce an empty
    // map. The radius gate belongs only on the server-side filtered
    // path above. On the fallback path we keep every approved seller
    // that has finite coords; sellers without coords are kept so the
    // bottom-sheet card list can show their details — the map
    // component drops them on its own with a clear `Number.isFinite`
    // check.
    const activeOnly = options?.activeOnly ?? true;
    const limit = options?.limit ?? 20;
    const activePool = activeOnly
      ? fallbackSellers.filter((s) => s.status === "Active")
      : fallbackSellers;
    // Rank by Haversine when the customer has GPS so the closest
    // sellers appear first, but do NOT drop out-of-radius rows — the
    // store slice is the full approved list and the customer Home
    // expects to see every approved seller's pin on the map. When GPS
    // is unknown, preserve the store order (alphabetical from
    // `GET /api/sellers`) so the list is stable across renders.
    let pool: NearbySeller[];
    if (queryLat !== null && queryLng !== null) {
      const R = 6371;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const distKm = (s: NearbySeller): number | null => {
        if (
          typeof s.lat !== "number" ||
          typeof s.lng !== "number" ||
          !Number.isFinite(s.lat) ||
          !Number.isFinite(s.lng)
        ) {
          return null;
        }
        const dLat = toRad(s.lat - queryLat);
        const dLng = toRad(s.lng - queryLng);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(queryLat)) *
            Math.cos(toRad(s.lat)) *
            Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
      };
      const sorted = activePool
        .slice()
        .sort((a, b) => {
          // Sort: known-distance first (asc), then unknown-distance
          // (null). NO radius gate — every approved seller stays.
          const ka = distKm(a);
          const kb = distKm(b);
          if (ka === null && kb === null) return 0;
          if (ka === null) return 1;
          if (kb === null) return -1;
          return ka - kb;
        });
      pool = sorted;
    } else {
      pool = activePool;
    }
    const finalPool = pool.slice(0, limit);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      // Diagnostic: trace whether we served the server-filtered list
      // or fell back to the store slice, and how many sellers made
      // it through the final gate. Wrapped in __DEV__ so it never
      // ships to production bundles.
      console.info(
        "[USE_NEARBY_SELLERS][RESULT]",
        JSON.stringify({
          path:
            serverSellers && serverSellers.length > 0
              ? "server"
              : "store-fallback",
          storeSellersCount: storeSellers.length,
          serverSellersCount: serverSellers?.length ?? 0,
          fallbackSellersCount: fallbackSellers.length,
          finalCount: finalPool.length,
          hasCustomerGps,
          queryLat,
          queryLng,
        }),
      );
    }
    return finalPool;
  }, [serverSellers, fallbackSellers, options, queryLat, queryLng]);

  return {
    sellers,
    effectiveLocation,
    usingDefaultLocation,
  };
}
