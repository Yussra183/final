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
import { identityColor } from "../../lib/identityColor";
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
   * "auto" — fit-bounds to all markers (and, when `includeCenterInFit`
   * is true, the user's centre) so every nearby seller is visible at
   * once. "fixed" — always centre on `center`, no auto fit. Default
   * "auto".
   */
  fitMode?: "auto" | "fixed";
  /**
   * Include the user's resolved `center` in the initial bbox so the
   * "user + all nearby sellers" framing is preserved even when there
   * is only a single seller (or none at all). Defaults to true — this
   * is the behaviour the customer Home wants on first paint.
   */
  includeCenterInFit?: boolean;
  /** When set, paints that marker in the selected colour. */
  selectedId?: string;
  /** Fired when the user taps a marker. */
  onMarkerTap?: (id: string) => void;
  /**
   * When false, hide the synthetic "You" pin AND disable the
   * native `showsUserLocation` blue dot — the customer Home's
   * privacy-style live-location toggle. Defaults to true.
   */
  showUserPin?: boolean;
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
  includeCenterInFit = true,
  showUserPin = true,
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

  // Combined point list used for the bbox: every marker PLUS the
  // user's resolved centre (when finite + opted in). This means the
  // initial frame shows "me + every nearby seller", even when there
  // is only a single seller on the map.
  const fitPoints = useMemo(() => {
    const pts: { lat: number; lng: number }[] = finiteMarkers.map((m) => ({
      lat: m.lat,
      lng: m.lng,
    }));
    if (includeCenterInFit && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      pts.push({ lat: center.lat, lng: center.lng });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finiteMarkers, includeCenterInFit, center.lat, center.lng]);

  // Initial region. With 1+ points we frame the bbox of every marker
  // (and the user); only the truly empty case falls back to the
  // Unguja-wide region. This guarantees the first paint shows ALL
  // nearby sellers in one view, never a tight zoom on a single pin.
  const initialRegion = useMemo(() => {
    if (fitMode === "auto" && fitPoints.length >= 1) {
      const r = regionForPoints(fitPoints, 1.4);
      if (r) return clampRegionToUnguja(r);
    }
    return clampRegionToUnguja(UNGUJA_FALLBACK_REGION);
    // zoom is used only as a fallback path; fitPoints drives the
    // primary case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitPoints, fitMode]);

  // Refit when the marker set or centre changes (e.g. the store
  // resolves, the user types a new address, "Locate me" is tapped).
  // The post-mount + onLayout passes catch the "first paint" case
  // before the MapView had time to lay out.
  const fitToMarkers = useCallback(() => {
    if (!mapRef.current) return;
    if (fitMode !== "auto" || fitPoints.length < 1) return;
    const points = fitPoints.map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
    }));
    try {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 64, right: 48, bottom: 96, left: 48 },
        animated: true,
      });
    } catch {
      /* ignore — the map ref is stale during fast unmount */
    }
  }, [fitPoints, fitMode]);

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
        showsUserLocation={showUserPin}
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
          // Bolt-lite richer label: business name on top, open/closed
          // pill underneath. Falls back to the legacy single-line
          // `label` string when richer fields are absent so older
          // callers keep their place-name text.
          const richName = m.name ?? m.label;
          const richStatus = m.status;
          // Per-seller identity color, hashed from id when no explicit
          // override. Same seller → same color on every map surface.
          const pinColor = m.color ?? identityColor(m.id);
          // Status halo: green ring for open sellers, grey for closed,
          // and a thin self-tinted ring when no status is reported.
          const haloColor =
            richStatus === "Active"
              ? Colors.success
              : richStatus === "Closed"
              ? Colors.border
              : pinColor;
          const haloWidth = isSelected ? 3 : 2;
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
                    styles.pinHalo,
                    {
                      borderColor: haloColor,
                      borderWidth: haloWidth,
                      opacity: isSelected ? 1 : 0.55,
                    },
                    isSelected && { transform: [{ scale: 1.15 }] },
                  ]}
                >
                  <View
                    style={[
                      styles.pin,
                      { backgroundColor: pinColor },
                    ]}
                  >
                    <Ionicons name="storefront" size={14} color="#FFF" />
                  </View>
                </View>
                {(richName || richStatus) ? (
                  <View style={styles.pinLabel}>
                    {richName ? (
                      <Text style={styles.pinLabelName} numberOfLines={1}>
                        {richName}
                      </Text>
                    ) : null}
                    {richStatus ? (
                      <View
                        style={[
                          styles.pinStatusPill,
                          {
                            backgroundColor:
                              richStatus === "Active" ? "#DCFCE7" : "#FEE2E2",
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
            </Marker>
          );
        })}

        {/* User "you are here" pin — mirrors the synthetic web-fallback
            pin so the user always sees themselves on the canvas
            alongside every nearby seller. Renders only when the
            resolved `center` is finite AND `showUserPin` is on (the
            customer Home's privacy toggle). Non-tappable so a stray
            tap can't open a phantom seller-details screen. */}
        {showUserPin &&
        Number.isFinite(center.lat) &&
        Number.isFinite(center.lng) ? (
          <Marker
            key="__user__"
            coordinate={{ latitude: center.lat, longitude: center.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            // Intentionally no `onPress` — the user pin is decorative.
          >
            <View
              style={[styles.pinWrap, styles.pinWrapUser]}
              pointerEvents="none"
            >
              <View style={[styles.pin, styles.pinUser]}>
                <Ionicons name="navigate" size={16} color="#FFF" />
              </View>
              <View style={styles.pinLabel}>
                <Text style={styles.pinLabelText} numberOfLines={1}>
                  You
                </Text>
              </View>
            </View>
          </Marker>
        ) : null}
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
  pinWrapUser: {
    // Lift the user pin above seller pins so the user can always see
    // themselves even when their coords coincide with a seller's.
    zIndex: 20,
  },
  pinHalo: {
    // Outer ring around the pin bubble. Color / width come from the
    // seller status (success for open, border for closed, self-tinted
    // when status is unknown). 2 px normal, 3 px when selected.
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderColor: Colors.success,
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
  pinUser: {
    // Slightly larger than a seller pin so the "you" marker reads as
    // distinct. Uses the accent colour (same as the web fallback's
    // synthetic user pin).
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    borderWidth: 3,
    boxShadow: "0 3px 6px rgba(0,0,0,0.35)",
  },
  pinLabel: {
    marginTop: 4,
    paddingHorizontal: 8,
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
  pinStatusPillText: {
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
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
