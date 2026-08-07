/**
 * src/hooks/useTripTicker.ts
 *
 * Drives the live map's animation. On a fixed interval, calls
 * `tickTrip(tripId)` on the store, which advances the supplier's
 * `progress` along the polyline and fires near-arrival notifications.
 *
 * The hook:
 *  - Pauses when the trip is `completed`.
 *  - Pauses when the screen is unmounted (clean-up).
 *  - Has a sensible default cadence (~1.5 s) but accepts an override
 *    for tests / demo slow-down.
 */
import { useEffect, useRef } from "react";
import { useStore } from "../store/StoreContext";

const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_DELTA = 0.05;

export function useTripTicker(
  tripId: string | null | undefined,
  options: { intervalMs?: number; deltaProgress?: number } = {},
) {
  const store = useStore();
  const tripStatus = tripId
    ? store.trips.find((t) => t.id === tripId)?.status
    : undefined;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!tripId) return;
    if (tripStatus === "completed") return;

    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    const delta = options.deltaProgress ?? DEFAULT_DELTA;

    intervalRef.current = setInterval(() => {
      store.tickTrip(tripId, delta);
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // The interval should reset only when tripId, status, or cadence
    // options change — the closure captures the latest tickTrip from
    // `store`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, tripStatus, options.intervalMs, options.deltaProgress]);
}
