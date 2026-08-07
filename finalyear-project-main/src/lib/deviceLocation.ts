/**
 * src/lib/deviceLocation.ts
 *
 * Resolve the current device's GPS coordinates, with a quiet fallback so
 * callers can use a single await whether the user granted permission or
 * not. Used by the Seller Registration / Profile flows to capture a
 * real-world fix for the seller's shop without ever surfacing
 * latitude / longitude inputs to the user.
 *
 * Behaviour:
 *
 *   - If `expo-location` is unavailable (e.g. on web / Expo Go without
 *     the native module) the helper resolves to `null`.
 *   - If the user denies permission, or the device doesn't return a fix
 *     within the timeout, the helper resolves to `null`.
 *   - The caller is then expected to fall back to a server-side
 *     geocode of the typed Business Address (the existing
 *     `SellerProfileService` path).
 *
 * The helper never throws and never throws a permission prompt at the
 * user — the surrounding code gates the prompt behind a clear "save"
 * action so we only ask when it's actually needed.
 */
import * as Location from "expo-location";

export interface ResolvedDeviceCoords {
  lat: number;
  lng: number;
}

/** Timeout for the single foreground fix — kept short so the
 *  registration / save flow doesn't visibly hang. */
const FIX_TIMEOUT_MS = 4_000;

/**
 * Request foreground permission and read one GPS fix. Resolves to
 * `null` on any failure (denied permission, no fix, network error,
 * unsupported platform) so the caller can use `??` to fall back to a
 * server-side geocode of the typed address.
 */
export async function resolveCurrentDeviceCoords(): Promise<ResolvedDeviceCoords | null> {
  try {
    const status = await Location.requestForegroundPermissionsAsync();
    if (status.status !== "granted") {
      return null;
    }
    const fix = await Promise.race<Promise<Location.LocationObject | null>>([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (!fix) return null;
    const { latitude, longitude } = fix.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return { lat: latitude, lng: longitude };
  } catch {
    // swallow — caller treats null as "no device fix available"
    return null;
  }
}
