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

export interface NearbySellerMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  selected?: boolean;
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
  selectedId?: string;
  onMarkerTap?: (id: string) => void;
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

function project(
  markers: NearbySellerMarker[],
  center: { lat: number; lng: number },
): Projected[] {
  if (markers.length === 0) return [];
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
  return markers.map((pin) => {
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
}

export function NearbySellersMap({
  markers,
  center,
  selectedId,
  onMarkerTap,
  fitMode = "auto",
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

  // Compute a "padding-adjusted" bbox so the projection matches the
  // native fitToCoordinates call. Used to show the user roughly
  // where the map is centred.
  const bounds = useMemo(() => {
    if (finiteMarkers.length < 2) return null;
    return regionForPoints(
      finiteMarkers.map((m) => ({ lat: m.lat, lng: m.lng })),
      1.4,
    );
  }, [finiteMarkers]);

  const projected = useMemo(
    () => (fitMode === "auto" ? project(finiteMarkers, center) : []),
    [finiteMarkers, center, fitMode],
  );

  // For single-marker / no-marker cases, project that one marker (or
  // the centre) so the user still sees *something* on the canvas.
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
      return (
        <Pressable
          key={p.pin.id}
          onPress={() => onMarkerTap?.(p.pin.id)}
          style={[styles.pinAnchor, { left, top }]}
          accessibilityRole="button"
          accessibilityLabel={
            p.pin.label ? `Open seller ${p.pin.label}` : "Open seller"
          }
        >
          <View
            style={[
              styles.pin,
              { backgroundColor: Colors.primary },
              isSelected && {
                backgroundColor: Colors.accent,
                transform: [{ scale: 1.15 }],
              },
            ]}
          >
            <Ionicons name="storefront" size={14} color="#FFF" />
          </View>
          {p.pin.label ? (
            <View style={styles.pinLabel}>
              <Text style={styles.pinLabelText} numberOfLines={1}>
                {p.pin.label}
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [onMarkerTap],
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
  pinLabel: {
    marginTop: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pinLabelText: {
    color: Colors.text,
    fontSize: FontSize.xs - 2,
    fontWeight: "800",
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
