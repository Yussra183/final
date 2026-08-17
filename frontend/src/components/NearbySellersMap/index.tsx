/**
 * src/components/NearbySellersMap/index.tsx
 *
 * Web / Expo Go fallback for `NearbySellersMap`. Metro picks this
 * file on non-native platforms so we never pull `react-native-maps`
 * into the web bundle. Renders a clean grid + pin overlay that
 * matches the visual language of the native version closely enough
 * that the user gets the same look and feel across platforms.
 *
 * Why not the WebView+Leaflet NearbyMap?
 * --------------------------------------
 * The legacy WebView picker is reserved for the address-picker
 * screen, where the user actually drags a pin and needs geocoding.
 * Here on the home screen we only need to plot markers, so a
 * zero-dependency canvas projection is the right tool — no
 * materialise, no WebView, no `injectJavaScript` round-trip.
 */
import { useCallback, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../../constants/colors";
import { regionForPoints } from "../LiveTrackingMap/region";
import { identityColor } from "../../lib/identityColor";

export interface NearbySellerMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  selected?: boolean;
  /** Business name shown on the pin label. Falls back to `label`. */
  name?: string;
  /** Open / closed status shown as a pill under the pin label. */
  status?: "Active" | "Closed";
  /** Distance from the user, used by the bottom-sheet card row. */
  distanceKm?: number;
  /** Cylinder sizes the seller stocks, used by the bottom-sheet card. */
  cylinderSizes?: string[];
  /**
   * Optional per-marker accent colour. When set, overrides the
   * automatic `identityColor(id)` default — use for semantic cases
   * (e.g. the seller's most recent order).
   */
  color?: string;
  /**
   * "MISSING" markers come from seller rows whose saved coords are
   * missing (e.g. a freshly-registered seller who hasn't configured
   * their address yet). The renderer pins these to the Unguja
   * centroid so the seller is still visible — they would otherwise
   * be silently dropped from the home screen, which was the
   * dominant cause of the "I can see myself but no sellers" report.
   */
  locationStatus?: "OK" | "MISSING";
}

export interface NearbySellersMapProps {
  markers: NearbySellerMarker[];
  center: { lat: number; lng: number };
  zoom?: number;
  recenterToken?: number;
  /**
   * Place-picker recentre target. On native this animates the
   * camera; on web there's no camera so it's accepted as a typed
   * no-op (the parent's component compiles for both platforms).
   */
  recenterTo?: {
    lat: number;
    lng: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  fitMode?: "auto" | "fixed";
  /**
   * Include the user's resolved `center` in the projection so the
   * first paint shows "me + every nearby seller" on one canvas,
   * even when there's only a single seller. Defaults to true.
   */
  includeCenterInFit?: boolean;
  selectedId?: string;
  onMarkerTap?: (id: string) => void;
  /**
   * When false, hide the synthetic "You" pin entirely (the
   * privacy-style live-location toggle on the customer Home).
   * Defaults to true.
   */
  showUserPin?: boolean;
  /**
   * Fires when the user taps the map background (i.e. not a pin).
   * Coordinates are derived from the projected bbox so they live in
   * the same coordinate system the native renderer uses. Used by
   * the seller picker so a seller can tap to drop a pin.
   */
  onMapTap?: (coords: { lat: number; lng: number }) => void;
  style?: StyleProp<ViewStyle>;
}

interface Projected {
  x: number;
  y: number;
  pin: NearbySellerMarker;
}

/**
 * Geographic bounds of Unguja Island. The web-fallback projection
 * clamps the visible canvas to this box so the marker layout never
 * extends off-island, even when the API returns out-of-bounds coords
 * or the user types a far-away address.
 *
 * Kept in sync with `index.native.tsx`'s `UNGUJA_BOUNDS`.
 */
const UNGUJA_BOUNDS = {
  minLat: -6.5,
  maxLat: -5.7,
  minLng: 39.15,
  maxLng: 39.55,
} as const;

interface ProjectBbox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  latSpan: number;
  lngSpan: number;
  padX: number;
  padY: number;
}

function project(
  markers: NearbySellerMarker[],
  center: { lat: number; lng: number },
): { projected: Projected[]; bbox: ProjectBbox | null } {
  if (markers.length === 0) return { projected: [], bbox: null };
  const lats = markers.map((m) => m.lat);
  const lngs = markers.map((m) => m.lng);
  // Clamp the bbox to Unguja so the canvas projection stays on-island
  // even when a marker or the user's centre is off-shore.
  const minLat = Math.max(Math.min(...lats), UNGUJA_BOUNDS.minLat);
  const maxLat = Math.min(Math.max(...lats), UNGUJA_BOUNDS.maxLat);
  const minLng = Math.max(Math.min(...lngs), UNGUJA_BOUNDS.minLng);
  const maxLng = Math.min(Math.max(...lngs), UNGUJA_BOUNDS.maxLng);
  // Span with a minimum so a single marker doesn't divide by zero.
  // Use the full island span as a floor so a single tight cluster
  // doesn't zoom in past street level.
  const latSpan = Math.max(maxLat - minLat, 0.05);
  const lngSpan = Math.max(maxLng - minLng, 0.05);
  // 12% padding on each side, like the native fitToCoordinates call.
  const padX = 0.12;
  const padY = 0.18; // extra room at the bottom for the FAB
  const bbox: ProjectBbox = {
    minLat,
    maxLat,
    minLng,
    maxLng,
    latSpan,
    lngSpan,
    padX,
    padY,
  };
  const projected = markers.map((pin) => {
    const x = padX + ((pin.lng - minLng) / lngSpan) * (1 - 2 * padX);
    const y =
      padY +
      (1 - 2 * padY) -
      ((pin.lat - minLat) / latSpan) * (1 - 2 * padY);
    // If everything is at the same lat/lng, fall back to centre.
    const cx = markers.length === 1 ? 0.5 : x;
    const cy = markers.length === 1 ? 0.5 : y;
    // The native map's "recentre" should also work on web; bias toward
    // the user's location when only one marker exists.
    const biasX =
      markers.length === 1 && center ? 0.5 : cx;
    const biasY =
      markers.length === 1 && center ? 0.5 : cy;
    return { x: biasX, y: biasY, pin };
  });
  return { projected, bbox };
}

/**
 * `fixed`-mode projection: the camera stays anchored on the user, so
 * each marker is projected relative to the user's centre rather than
 * the bbox of every marker. Sellers still appear at their OWN
 * lat/lng — they're just rendered relative to a fixed point instead
 * of getting auto-framed into the canvas. Without this the `auto`
 * `project()` helper would zoom the canvas out to fit every distant
 * seller, defeating the customer-first behaviour.
 */
function projectFixed(
  markers: NearbySellerMarker[],
  center: { lat: number; lng: number },
): { projected: Projected[] } {
  if (markers.length === 0) return { projected: [] };
  // Fixed canvas: ±0.05 deg around the user's centre (~5.5 km E-W at
  // the equator). Matches the native map's `latitudeDelta = zoom`
  // (default 12) so the two surfaces look consistent.
  const latSpan = 0.05;
  const lngSpan = 0.05;
  const padX = 0.12;
  const padY = 0.18;
  const projected = markers.map((pin) => {
    const x = padX + ((pin.lng - center.lng) / lngSpan) * (1 - 2 * padX);
    const y =
      padY +
      (1 - 2 * padY) -
      ((pin.lat - center.lat) / latSpan) * (1 - 2 * padY);
    return { x, y, pin };
  });
  return { projected };
}

export function NearbySellersMap({
  markers,
  center,
  selectedId,
  onMarkerTap,
  fitMode = "auto",
  includeCenterInFit = true,
  showUserPin = true,
  onMapTap,
  // recenterTo / recenterToken are accepted for API parity with the
  // native component but have no effect on web (no camera to drive).
  recenterTo: _recenterTo,
  recenterToken: _recenterToken,
  style,
}: NearbySellersMapProps) {
  const finiteMarkers = useMemo(
    () =>
      markers.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng),
      ),
    [markers],
  );

  // Effective user centre — only valid when finite. Used both for the
  // bbox and as a fallback pin when no markers exist.
  const finiteCenter = useMemo(
    () =>
      Number.isFinite(center.lat) && Number.isFinite(center.lng)
        ? { lat: center.lat, lng: center.lng }
        : null,
    [center.lat, center.lng],
  );

  // Compute a "padding-adjusted" bbox so the projection matches the
  // native fitToCoordinates call. Used to show the user roughly
  // where the map is centred. Includes the user's resolved location
  // when `includeCenterInFit` is true so a single-marker case still
  // frames "user + nearest seller".
  const bounds = useMemo(() => {
    const pts: { lat: number; lng: number }[] = finiteMarkers.map((m) => ({
      lat: m.lat,
      lng: m.lng,
    }));
    if (includeCenterInFit && finiteCenter) pts.push(finiteCenter);
    if (pts.length < 2) return null;
    return regionForPoints(pts, 1.4);
  }, [finiteMarkers, finiteCenter, includeCenterInFit]);

  // Projection gets every marker PLUS a synthetic user pin so the
  // canvas frames the user alongside every nearby seller. We also
  // stash the bbox so the `onMapTap` handler can convert a tap
  // location back into a lat/lng pair.
  //
  // Two modes:
  //   `auto`  — project all markers using a bbox that includes the
  //             user so the canvas frames "user + every seller".
  //   `fixed` — camera is anchored on the user; project each marker
  //             individually relative to the user's centre so they
  //             still appear at their OWN coordinates (no collapse
  //             onto a single point), but the canvas doesn't auto-fit
  //             around distant sellers.
  const { projected, bbox } = useMemo(() => {
    if (fitMode === "auto") {
      const synthetic = showUserPin && includeCenterInFit && finiteCenter
        ? [
            {
              id: "__user__",
              lat: finiteCenter.lat,
              lng: finiteCenter.lng,
              // Synthetic pin is rendered too so the user always sees
              // themselves on the canvas. `selected` stays false and
              // the tap callback short-circuits for this id below.
              label: "You",
            },
          ]
        : [];
      return project(
        [...finiteMarkers, ...synthetic],
        finiteCenter ?? center,
      );
    }
    // `fixed` — each marker is positioned relative to the user's
    // centre so it lands at its OWN lat/lng, but the canvas doesn't
    // auto-zoom around the marker bbox. The user pin always renders
    // at the canvas centre.
    const origin = finiteCenter ?? center;
    const synthetic = showUserPin && finiteCenter
      ? [
          {
            id: "__user__",
            lat: finiteCenter.lat,
            lng: finiteCenter.lng,
            label: "You",
          },
        ]
      : [];
    const { projected: fixedProjected } = projectFixed(
      [...finiteMarkers, ...synthetic],
      origin,
    );
    return { projected: fixedProjected, bbox: null };
  }, [finiteMarkers, finiteCenter, center, fitMode, showUserPin]);

  // For the single-marker case (or no-marker case), project that one
  // marker (or the centre) so the user still sees *something* on the
  // canvas. With `includeCenterInFit` the projection above already
  // handles single-marker; this is a true empty-state fallback.
  const single = useMemo<Projected | null>(() => {
    if (projected.length > 0) return null;
    const target = finiteMarkers[0];
    const lat = target?.lat ?? center.lat;
    const lng = target?.lng ?? center.lng;
    return {
      x: 0.5,
      y: 0.5,
      pin: { id: target?.id ?? "centre", lat, lng, label: target?.label },
    };
  }, [projected, finiteMarkers, center]);

  const renderPin = useCallback(
    (p: Projected, isSelected: boolean) => {
      const left = `${(p.x * 100).toFixed(2)}%` as `${number}%`;
      const top = `${(p.y * 100).toFixed(2)}%` as `${number}%`;
      const isUserPin = p.pin.id === "__user__";
      // MISSING-location sellers (no saved coords) get a distinct
      // grey pin so the customer can still see them — they would
      // otherwise be silently dropped from the home screen. The pin
      // shape stays identical so the layout doesn't shift; only the
      // colour and label change.
      const isMissing = !isUserPin && p.pin.locationStatus === "MISSING";
      // Bolt-lite richer label: business name + open/closed pill.
      // Falls back to the legacy single-line `label` when richer fields
      // are absent so older callers keep their place-name text.
      const richName = !isUserPin ? p.pin.name ?? p.pin.label : null;
      const richStatus = !isUserPin ? p.pin.status : null;
      // Per-seller identity color (overridable via `pin.color`).
      const pinColor = !isUserPin
        ? isMissing
          ? "#94A3B8" // slate-400 — distinct, neutral "location missing" cue
          : p.pin.color ?? identityColor(p.pin.id)
        : Colors.accent;
      // Status halo: success for open, border for closed, self-tinted
      // when no status reported. 2 px normal, 3 px when selected.
      const haloColor =
        isMissing
          ? Colors.border
          : richStatus === "Active"
          ? Colors.success
          : richStatus === "Closed"
          ? Colors.border
          : pinColor;
      const haloWidth = isSelected ? 3 : 2;
      return (
        <Pressable
          key={p.pin.id}
          // User pin is decorative — taps must NOT open seller details.
          onPress={isUserPin ? undefined : () => onMarkerTap?.(p.pin.id)}
          disabled={isUserPin}
          style={[styles.pinAnchor, { left, top }]}
          accessibilityRole={isUserPin ? undefined : "button"}
          accessibilityLabel={
            isUserPin
              ? "Your current location"
              : isMissing
              ? `${richName ?? "Seller"} — location not yet set`
              : richName
              ? `Open seller ${richName}`
              : "Open seller"
          }
        >
          <View
            style={[
              styles.pinHalo,
              {
                borderColor: isUserPin ? Colors.accent : haloColor,
                borderWidth: haloWidth,
                opacity: isUserPin || isSelected ? 1 : 0.55,
              },
              isSelected && !isUserPin && {
                transform: [{ scale: 1.15 }],
              },
            ]}
          >
            <View
              style={[
                styles.pin,
                { backgroundColor: pinColor },
              ]}
            >
              <Ionicons
                name={
                  isUserPin
                    ? "navigate"
                    : isMissing
                    ? "help-outline"
                    : "storefront"
                }
                size={14}
                color="#FFF"
              />
            </View>
          </View>
          {isUserPin && p.pin.label ? (
            <View style={styles.pinLabel}>
              <Text style={styles.pinLabelText} numberOfLines={1}>
                {p.pin.label}
              </Text>
            </View>
          ) : null}
          {!isUserPin && (richName || richStatus || Number.isFinite(p.pin.distanceKm) || isMissing) ? (
            <View style={styles.pinLabel}>
              {richName ? (
                <Text style={styles.pinLabelName} numberOfLines={1}>
                  {richName}
                </Text>
              ) : null}
              {isMissing ? (
                <View style={styles.pinMissingPill}>
                  <Text style={styles.pinMissingPillText} numberOfLines={1}>
                    Location not set
                  </Text>
                </View>
              ) : (Number.isFinite(p.pin.distanceKm) || richStatus) ? (
                <View style={styles.pinLabelRow}>
                  {Number.isFinite(p.pin.distanceKm) ? (
                    <View style={styles.pinDistancePill}>
                      <Text style={styles.pinDistanceText} numberOfLines={1}>
                        {p.pin.distanceKm!.toFixed(1)} km
                      </Text>
                    </View>
                  ) : null}
                  {richStatus ? (
                    <View
                      style={[
                        styles.pinStatusPill,
                        {
                          backgroundColor:
                            richStatus === "Active"
                              ? "#DCFCE7"
                              : "#FEE2E2",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pinStatusPillText,
                          {
                            color:
                              richStatus === "Active" ? "#047857" : "#B91C1C",
                          },
                        ]}
                      >
                        {richStatus === "Active" ? "Open" : "Closed"}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      );
    },
    [onMarkerTap],
  );

  // Convert a tap on the empty grid into a lat/lng using the same
  // bbox the projection uses. Lets the seller picker drop a pin via
  // tap on web the same way the native renderer does.
  const handleMapTap = useCallback(
    (evt: { nativeEvent: { locationX: number; locationY: number } }) => {
      if (!onMapTap) return;
      const ref = bbox;
      if (!ref) return;
      const frameW = evt.nativeEvent.locationX;
      const frameH = evt.nativeEvent.locationY;
      // The projected bbox renders inside a padded canvas. Match the
      // forward direction: undo `padX` / `padY`, undo `1 - 2*pad*`,
      // then divide by the lat/lng span.
      const drawW = 1 - 2 * ref.padX;
      const drawH = 1 - 2 * ref.padY;
      const nx = (frameW - ref.padX) / drawW;
      const ny = 1 - (frameH - ref.padY) / drawH;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
      const lng = ref.minLng + nx * ref.lngSpan;
      const lat = ref.minLat + ny * ref.latSpan;
      onMapTap({
        lat: Math.min(Math.max(lat, UNGUJA_BOUNDS.minLat), UNGUJA_BOUNDS.maxLat),
        lng: Math.min(Math.max(lng, UNGUJA_BOUNDS.minLng), UNGUJA_BOUNDS.maxLng),
      });
    },
    [onMapTap, bbox],
  );

  return (
    <View style={[styles.frame, style]}>
      {/* Soft grid background — mirrors the fallback map style. */}
      <View style={styles.grid} pointerEvents="none">
        {[0, 1, 2, 3].map((i) => (
          <View
            key={`h${i}`}
            style={[
              styles.gridLine,
              { top: `${(i + 1) * 20}%` },
            ]}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <View
            key={`v${i}`}
            style={[
              styles.gridLineV,
              { left: `${(i + 1) * 20}%` },
            ]}
          />
        ))}
      </View>

      {/* Tap-to-drop surface — sits beneath the pins so a marker
          press still wins. Only mounts when an `onMapTap` consumer
          is interested, so the customer Home (which never wires it)
          keeps the existing pointer-events behaviour. */}
      {onMapTap ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleMapTap}
          accessibilityRole="button"
          accessibilityLabel="Tap to drop a pin here"
        />
      ) : null}

      {/* Pins */}
      {projected.map((p) =>
        renderPin(p, selectedId === p.pin.id || p.pin.selected === true),
      )}
      {single ? renderPin(single, false) : null}

      {/* Subtle centre crosshair so the user can see the centre on web. */}
      {bounds ? (
        <View style={styles.crosshair} pointerEvents="none">
          <View style={styles.crosshairV} />
          <View style={styles.crosshairH} />
        </View>
      ) : null}

      <View style={styles.attribution} pointerEvents="none">
        <Ionicons name="map-outline" size={11} color={Colors.textSecondary} />
        <Text style={styles.attributionText}>Map preview</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    overflow: "hidden",
    borderRadius: Radius.lg,
    backgroundColor: "#E0F2F1",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.4,
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#CBD5E1",
  },
  gridLineV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "#CBD5E1",
  },
  pinAnchor: {
    position: "absolute",
    alignItems: "center",
    transform: [{ translateX: -16 }, { translateY: -16 }],
  },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
  },
  pinHalo: {
    // Outer ring around the pin bubble. Color / width come from the
    // seller status (success for open, border for closed, self-tinted
    // when status is unknown). 2 px normal, 3 px when selected.
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderColor: Colors.success,
  },
  pinLabel: {
    marginTop: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: Radius.md,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    minWidth: 64,
    maxWidth: 160,
  },
  pinLabelText: {
    color: Colors.text,
    fontSize: FontSize.xs - 2,
    fontWeight: "800",
  },
  pinLabelName: {
    color: Colors.text,
    fontSize: FontSize.xs - 1,
    fontWeight: "800",
    textAlign: "center",
  },
  pinStatusPill: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  pinLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 2,
  },
  pinDistancePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: "#0F766E",
  },
  pinDistanceText: {
    color: "#0F766E",
    fontSize: 9,
    fontWeight: "800",
  },
  pinStatusPillText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  // MISSING-location pill — distinct from the open/closed status
  // pills so the customer sees the cue without misreading it as a
  // "closed shop" message. Same dimensions, slate-on-white scheme.
  pinMissingPill: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    backgroundColor: "#F1F5F9", // slate-100
    borderWidth: 1,
    borderColor: "#94A3B8",
  },
  pinMissingPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#475569", // slate-600
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  crosshair: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  crosshairV: {
    position: "absolute",
    width: 1,
    height: 12,
    backgroundColor: "rgba(15,118,110,0.35)",
  },
  crosshairH: {
    position: "absolute",
    width: 12,
    height: 1,
    backgroundColor: "rgba(15,118,110,0.35)",
  },
  attribution: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  attributionText: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontWeight: "700",
  },
});
