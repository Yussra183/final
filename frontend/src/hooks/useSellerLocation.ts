/**
 * src/hooks/useSellerLocation.ts
 *
 * Resolves the seller's shop coordinates from the persisted seller
 * profile cached on `session.user`.
 *
 * The returned value is UI-only. When the seller has not yet saved a
 * real shop location we expose a temporary fallback centre so existing
 * seller screens can still render, but that fallback is never written
 * back to the backend and never treated as the seller's actual shop
 * coordinates.
 */
import { useMemo } from "react";
import { LatLng } from "../lib/location";
import { useStore } from "../store/StoreContext";

const UI_FALLBACK_CENTER: LatLng = { lat: -6.1659, lng: 39.2026 };

/** Prefer persisted shop coordinates; otherwise use a temporary UI fallback. */
export function useSellerLocation(): LatLng {
  const { session } = useStore();
  return useMemo(() => {
    const u = session?.user;
    if (
      typeof u?.lat === "number" &&
      Number.isFinite(u.lat) &&
      typeof u?.lng === "number" &&
      Number.isFinite(u.lng)
    ) {
      return { lat: u.lat, lng: u.lng };
    }
    return UI_FALLBACK_CENTER;
  }, [session?.user?.lat, session?.user?.lng]);
}
