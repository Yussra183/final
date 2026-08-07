/**
 * src/hooks/useSellerLocation.ts
 *
 * Resolves the seller's shop coordinates. Today this falls back to
 * a static value baked into the session user. Production swap:
 *
 *   • ask for foreground permission via `expo-location`
 *   • on success, call `Location.getCurrentPositionAsync()` and cache
 *     it on the seller's profile (so the address pin survives restart)
 */
import { useEffect, useState } from "react";
import { LatLng } from "../lib/location";
import { useStore } from "../store/StoreContext";

const NAIROBI_CBD: LatLng = { lat: -1.2864, lng: 36.8172 };

/** Read-once the seller profile fields; cache nothing. */
export function useSellerLocation(): LatLng {
  const { session } = useStore();
  const [coords, setCoords] = useState<LatLng>(NAIROBI_CBD);

  useEffect(() => {
    const u = session?.user;
    if (!u) return;
    if (typeof u.lat === "number" && typeof u.lng === "number") {
      setCoords({ lat: u.lat, lng: u.lng });
    }
    // Production: trigger GPS fetch + permission flow.
  }, [session?.user?.id]);

  return coords;
}
