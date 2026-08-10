/**
 * src/components/NearbySellersMap/index.native.tsx
 *
 * Native Google-Maps view for the customer Home screen. Plots an
 * arbitrary list of "nearby seller" pins, supports tap-to-open, and
 * auto-fits all markers into view.
 *
 * Why a separate component (vs. reusing `LiveTrackingMap`)
 * --------------------------------------------------------
 * `LiveTrackingMap` is the right shape for the rider/order-tracking
 * flow (origin / live / destination / waypoints + polyline). The
 * customer Home only needs multi-pin plotting, no live marker, no
 * polyline. A bespoke component keeps the props API purpose-built and
 * keeps the `LiveTrackingMap` import surface stable.
 *
 * Why this is much faster than the previous WebView implementation
 * ----------------------------------------------------------------
 * The previous `NearbyMap` rendered Leaflet inside a `WebView`, paying
 * a WebView cold start + an inlined HTML materialise pass on every
 * cold mount. This file uses `react-native-maps` directly: native
 * tiles, native gesture handling, native marker hit-testing, no JS
 * bridge round-trip per marker tap, and no "Loading map…" overlay.
 *
 * The web fallback (../index.tsx) keeps web/Expo Go working.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Colors, FontSize, Radius } from "../../../constants/colors";
import { regionForPoints } from "../LiveTrackingMap/region";
import type { StyleProp, ViewStyle } from "react-native";

/**
 * Geographic bounds of Unguja Island (Zanzibar). The native
 * MapView's `region` prop and any `animateToRegion` / `fitToCoordinates`
 * call is clamped to this box so the camera can never wander off-island.
 *
 * The box is slightly wider than the strict coastline to leave a thin
 * margin of water around the pins — the FAB cluster and the bottom
 * sheet overlap the bottom edge, so a little extra room at the south
 * keeps the visible map from feeling claustrophobic.
 */
export const UNGUJA_BOUNDS = {
  minLat: -6.5,
  maxLat: -5.7,
  minLng: 39.15,
  maxLng: 39.55,
} as const;

/** Centre of Unguja Island — used as a fallback when no markers / centre exist. */
export const UNGUJA_CENTER = {
  latitude: -6.165,
  longitude: 39.2,
} as const;

/** Fallback region around Unguja for the initial paint. */
const UNGUJA_FALLBACK_REGION = {
  latitude: UNGUJA_CENTER.latitude,
  longitude: UNGUJA_CENTER.longitude,
  latitudeDelta: 0.6,
  longitudeDelta: 0.6,
};

/**
 * Clamp a region's centre + deltas so the resulting camera rect stays
 * inside Unguja. We snap the centre to the island box (clamped by half-
 * delta) and shrink the deltas if the requested zoom is wider than
 * the island itself.
 */
function clampRegionToUnguja<
  R extends { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
>(region: R): R {
  const { minLat, maxLat, minLng, maxLng } = UNGUJA_BOUNDS;
  const maxLatDelta = Math.max(0.01, maxLat - minLat);
  const maxLngDelta = Math.max(0.01, maxLng - minLng);
  const latitudeDelta = Math.min(Math.max(region.latitudeDelta, 0.01), maxLatDelta);
  const longitudeDelta = Math.min(Math.max(region.longitudeDelta, 0.01), maxLngDelta);
  const halfLat = latitudeDelta / 2;
  const halfLng = longitudeDelta / 2;
  const latitude = Math.min(
    Math.max(region.latitude, minLat + halfLat),
    maxLat - halfLat,
  );
  const longitude = Math.min(
    Math.max(region.longitude, minLng + halfLng),
    maxLng - halfLng,
  );
  return { ...region, latitude, longitude, latitudeDelta, longitudeDelta };
}

/** A single pin in the NearbySellersMap viewer. */
export interface NearbySellerMarker {
  id: string;
  lat: number;
  lng: number;
  /** Short label rendered below the pin (e.g. "2.1 km"). */
  label?: string;
  /** Visual selection; usually driven by `selectedId`. */
  selected?: boolean;
}

/** Props for `<NearbySellersMap>`. */
export interface NearbySellersMapProps {
  markers: NearbySellerMarker[];
  /** Initial centre. Ignored when 2+ markers exist (fit-bounds wins). */
  center: { lat: number; lng: number };
  /** Initial zoom. Defaults to 12. */
  zoom?: number;
  /**
   * Bumped by the parent to recentre the map on the user's location.
   * One-way signal: a fresh token animates the camera back to `center`.
   */
  recenterToken?: number;
  /**
   * Optional place-picker recentre target. When this changes, the
   * camera animates to the given lat/lng with the given delta. Used
   * by the "place chip" strip on the customer Home — every chip tap
   * builds a new `PlaceRecenter` value and the map follows.
   *
   * Takes precedence over `recenterToken` for the same render cycle.
   */
  recenterTo?: {
    lat: number;
    lng: number;
    latitudeDelta?: number;
    longitudeDelta?: number;
  };
  /**
   * "auto" — fit-bounds when 2+ markers exist, otherwise centre on
   * `center`. "fixed" — always centre on `center`, no auto fit. Default
   * "auto".
   */
  fitMode?: "auto" | "fixed";
  /** When set, paints that marker in the selected colour. */
  selectedId?: string;
  /** Fired when the user taps a marker. */
  onMarkerTap?: (id: string) => void;
  /** Wrapper style. Pass `{ flex: 1 }` to make the map fill its parent. */
  style?: StyleProp<ViewStyle>;
}

export function NearbySellersMap({
  markers,
  center,
  zoom = 12,
  recenterToken = 0,
  recenterTo,
  fitMode = "auto",
  selectedId,
  onMarkerTap,
  style,
}: NearbySellersMapProps) {
  const mapRef = useRef<MapView | null>(null);

  // Filter once. The Home page already filters out non-finite coords,
  // but we double-check here so the bbox/fit math never chokes.
  const finiteMarkers = useMemo(
    () =>
      markers.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng),
      ),
    [markers],
  );

  // Initial region = bbox-fit when we have enough markers, otherwise
  // a small fixed region around the centre. Every path is clamped to
  // the Unguja bounding box so the camera can never start off-island.
  const initialRegion = useMemo(() => {
    if (fitMode === "auto" && finiteMarkers.length >= 2) {
      const r = regionForPoints(
        finiteMarkers.map((m) => ({ lat: m.lat, lng: m.lng })),
        1.4,
      );
      if (r) return clampRegionToUnguja(r);
    }
    return clampRegionToUnguja({
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    });
    // zoom / center are used only as a fallback path; finiteMarkers is
    // the primary driver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finiteMarkers, fitMode]);

  // Refit when the marker set changes (e.g. the store resolves, the
  // user types a new address). The post-mount + onLayout passes catch
  // the "first paint" case before the WebView had time to lay out.
  const fitToMarkers = useCallback(() => {
    if (!mapRef.current) return;
    if (fitMode !== "auto" || finiteMarkers.length < 2) return;
    const points = finiteMarkers.map((m) => ({
      latitude: m.lat,
      longitude: m.lng,
    }));
    try {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 64, right: 48, bottom: 96, left: 48 },
        animated: true,
      });
    } catch {
      /* ignore — the map ref is stale during fast unmount */
    }
  }, [finiteMarkers, fitMode]);

  useEffect(() => {
    // Small delay so the first fit lands after the map's tile layer
    // has a chance to start drawing — otherwise the camera can settle
    // before the world is ready and the result looks clipped.
    const timer = setTimeout(fitToMarkers, 120);
    return () => clearTimeout(timer);
  }, [fitToMarkers]);

  // Recentre on the user's location. Parent bumps `recenterToken`
  // when the "Locate me" button is tapped. The dep list keeps this
  // re-firing only on token change, not on every centre prop update.
  useEffect(() => {
    if (!mapRef.current) return;
    if (recenterToken <= 0) return;
    const r = clampRegionToUnguja({
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
    try {
      mapRef.current.animateToRegion(r, 600);
    } catch {
      /* ignore */
    }
    // We intentionally ignore `center` to keep the effect tied to the
    // tap signal, not to upstream location churn. The Home screen
    // already memoises `center` on the same token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  // Place-picker recentre. When the parent passes a new `recenterTo`
  // value (e.g. a chip tap on the home screen), animate to it. This
  // effect depends on the lat/lng/deltas directly so a new chip
  // always fires — even if two chips share the same object identity
  // (the parent should pass a fresh object on every tap).
  useEffect(() => {
    if (!mapRef.current) return;
    if (!recenterTo) return;
    const r = clampRegionToUnguja({
      latitude: recenterTo.lat,
      longitude: recenterTo.lng,
      latitudeDelta: recenterTo.latitudeDelta ?? 0.05,
      longitudeDelta: recenterTo.longitudeDelta ?? 0.05,
    });
    try {
      mapRef.current.animateToRegion(r, 500);
    } catch {
      /* ignore */
    }
  }, [recenterTo]);

  return (
    <View style={[styles.frame, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onLayout={fitToMarkers}
        onRegionChangeComplete={(region) => {
          if (!mapRef.current) return;
          const clamped = clampRegionToUnguja(region);
          // If the user panned / zoomed past the island edge, snap
          // the camera back. Comparing numbers directly avoids an
          // animation when nothing changed.
          if (
            clamped.latitude !== region.latitude ||
            clamped.longitude !== region.longitude ||
            clamped.latitudeDelta !== region.latitudeDelta ||
            clamped.longitudeDelta !== region.longitudeDelta
          ) {
            try {
              mapRef.current.animateToRegion(clamped, 250);
            } catch {
              /* ignore */
            }
          }
        }}
        showsCompass
        showsMyLocationButton={false}
        showsTraffic={false}
        toolbarEnabled={false}
        rotateEnabled
        zoomEnabled
        scrollEnabled
        pitchEnabled
        // Hard-clamp the live camera so panning / zooming can never
        // leave the island. `minDelta` / `maxDelta` cap the zoom
        // range; the per-axis literal min/max is enforced by the
        // clamp helper we run on every region change.
        minDelta={0.01}
        maxDelta={0.6}
      >
        {finiteMarkers.map((m) => {
          const isSelected = selectedId === m.id || m.selected;
          return (
            <Marker
              key={m.id}
              coordinate={{ latitude: m.lat, longitude: m.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              onPress={() => onMarkerTap?.(m.id)}
            >
              <View
                style={[
                  styles.pinWrap,
                  isSelected && styles.pinWrapSelected,
                ]}
                pointerEvents="none"
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
                {m.label ? (
                  <View style={styles.pinLabel}>
                    <Text style={styles.pinLabelText} numberOfLines={1}>
                      {m.label}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Marker>
          );
        })}
      </MapView>

      <View style={styles.attribution} pointerEvents="none">
        <Ionicons name="logo-google" size={11} color={Colors.textSecondary} />
        <Text style={styles.attributionText}>Google Maps</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: "#E0F2F1",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pinWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  pinWrapSelected: {
    zIndex: 10,
  },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
  },
  pinLabel: {
    marginTop: 2,
    paddingHorizontal: 6,
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
