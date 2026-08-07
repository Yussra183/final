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
 *
 * Timeout notes: a cold-start GPS fix on a fresh app launch under
 * `Accuracy.Balanced` frequently exceeds 4 seconds. We default to 8s
 * so the helper is actually useful on first-run; callers can override
 * with `resolveCurrentDeviceCoords({ timeoutMs })` if they need a
 * tighter bound (e.g. a "Use my location" chip that the seller is
 * actively waiting on).
 */
import * as Location from "expo-location";

export interface ResolvedDeviceCoords {
  lat: number;
  lng: number;
}

/** Default timeout for the single foreground fix. */
const DEFAULT_FIX_TIMEOUT_MS = 8_000;

export interface ResolveDeviceCoordsOptions {
  /** Override the GPS-fix timeout. Defaults to 8s. */
  timeoutMs?: number;
}

/**
 * Request foreground permission and read one GPS fix. Resolves to
 * `null` on any failure (denied permission, no fix, network error,
 * unsupported platform) so the caller can use `??` to fall back to a
 * server-side geocode of the typed address.
 */
export async function resolveCurrentDeviceCoords(
  options: ResolveDeviceCoordsOptions = {},
): Promise<ResolvedDeviceCoords | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FIX_TIMEOUT_MS;
  try {
    const status = await Location.requestForegroundPermissionsAsync();
    if (status.status !== "granted") {
      return null;
    }
    // Wrap the GPS promise so the two branches share an explicit
    // `Location.LocationObject | null` element type — without this,
    // TS widens the array to `Promise<LocationObject | Promise<...> | null>`
    // which breaks the explicit generic below.
    const fixPromise: Promise<Location.LocationObject | null> =
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).then(
        (fix) => fix,
        () => null,
      );
    const timeoutPromise = new Promise<Location.LocationObject | null>(
      (resolve) => setTimeout(() => resolve(null), timeoutMs),
    );
    const fix = await Promise.race([fixPromise, timeoutPromise]);
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
