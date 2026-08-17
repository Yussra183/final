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

/**
 * Clamp a single coordinate pair to the Unguja box. Reused by the
 * seller picker's tap-to-drop pin so a seller can never drop a pin
 * in the Indian Ocean even by tapping a tile outside the island.
 */
export function clampCoordToUnguja(c: {
  latitude: number;
  longitude: number;
}): { lat: number; lng: number } {
  const { minLat, maxLat, minLng, maxLng } = UNGUJA_BOUNDS;
  return {
    lat: Math.min(Math.max(c.latitude, minLat), maxLat),
    lng: Math.min(Math.max(c.longitude, minLng), maxLng),
  };
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
  /**
   * Internal: a tiny offset applied to the rendered pin position
   * when two sellers share the same GPS point (a common case for
   * shops registered to the same building). Internal use only —
   * not part of the public props contract.
   */
  _renderCoord?: { lat: number; lng: number };
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
  /**
   * Fires when the user taps the map background (i.e. not a marker).
   * Coordinates are clamped to Unguja before being delivered.
   * Used by the seller picker so the seller can tap to drop a pin.
   * Marker taps do NOT fire this — they go through `onMarkerTap`.
   */
  onMapTap?: (coords: { lat: number; lng: number }) => void;
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
  onMapTap,
  style,
}: NearbySellersMapProps) {
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    console.log("[SELLER_DEBUG][MAP]", {
      mapCenterLat: center.lat,
      mapCenterLng: center.lng,
      sellerLat: markers[0]?.lat ?? null,
      sellerLng: markers[0]?.lng ?? null,
      markerCount: markers.length,
    });
    console.log("[MAP_CAMERA_DEBUG]", {
      mapCenterLat: center.lat,
      mapCenterLng: center.lng,
      sellerLat: markers[0]?.lat ?? null,
      sellerLng: markers[0]?.lng ?? null,
      markerCount: markers.length,
    });
  }, [center.lat, center.lng, markers]);

  useEffect(() => {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    markers.forEach((seller) => {
      const latitude = Number(seller.lat);
      const longitude = Number(seller.lng);
      console.log("[SELLER_DEBUG][COORDINATES]", {
        id: seller.id,
        latitude,
        longitude,
        latitudeFinite: Number.isFinite(latitude),
        longitudeFinite: Number.isFinite(longitude),
        locationStatus: (seller as NearbySellerMarker & { locationStatus?: "OK" | "MISSING" })
          .locationStatus ?? "OK",
      });
    });
  }, [markers]);

  // Filter once. The Home page already filters out non-finite coords,
  // but we double-check here so the bbox/fit math never chokes.
  const finiteMarkers = useMemo(
    () =>
      markers.filter(
        (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng),
      ),
    [markers],
  );

  // Group markers by exact coordinate so two sellers sharing the same
  // GPS point (a common case for shops registered to the same
  // building / geocoded to the same centroid) don't stack on top of
  // each other and become invisible. We assign each clustered marker
  // a small angular offset (≈ 40 m) so all pins stay readable.
  // Markers keep their original lat/lng — the offset only affects
  // the rendered pin position so the bbox math still reflects the
  // true store coordinates.
  const clusteredMarkers = useMemo(() => {
    const groups = new Map<string, NearbySellerMarker[]>();
    finiteMarkers.forEach((m) => {
      const key = `${m.lat.toFixed(5)}:${m.lng.toFixed(5)}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(m);
      else groups.set(key, [m]);
    });
    const out: Array<NearbySellerMarker & { _renderCoord: { lat: number; lng: number } }> = [];
    const OFFSET_DEG = 0.0004; // ≈ 40 m at the equator — small enough to read as the same shop
    groups.forEach((bucket) => {
      if (bucket.length === 1) {
        const m = bucket[0];
        out.push({ ...m, _renderCoord: { lat: m.lat, lng: m.lng } });
        return;
      }
      const step = (Math.PI * 2) / bucket.length;
      bucket.forEach((m, i) => {
        const angle = i * step;
        out.push({
          ...m,
          _renderCoord: {
            lat: m.lat + Math.sin(angle) * OFFSET_DEG,
            lng: m.lng + Math.cos(angle) * OFFSET_DEG,
          },
        });
      });
    });
    return out;
  }, [finiteMarkers]);

  // Combined point list used for the bbox: every marker PLUS the
  // user's resolved centre (when finite + opted in). This means the
  // initial frame shows "me + every nearby seller", even when there
  // is only a single seller on the map.
  //
  // Coordinates are clamped to Unguja before the bbox calc so an
  // out-of-bounds seller (e.g. a Dar es Salaam seed row) doesn't drag
  // the camera frame off-island and hide the rest of the markers. The
  // marker itself is also rendered with the clamped coord (see the
  // `pinCoord` below), so the bbox and the actual pin position agree.
  const fitPoints = useMemo(() => {
    const pts: { lat: number; lng: number }[] = finiteMarkers.map((m) => {
      const c = clampCoordToUnguja({
        latitude: m.lat,
        longitude: m.lng,
      });
      return { lat: c.lat, lng: c.lng };
    });
    if (includeCenterInFit && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      pts.push({ lat: center.lat, lng: center.lng });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finiteMarkers, includeCenterInFit, center.lat, center.lng]);

  // Initial region.
  //
  //   `auto` — with 1+ points, frame the bbox of every marker (and
  //            the user when `includeCenterInFit` is true) so the
  //            first paint shows everything in one view.
  //   `fixed` — centre the camera on the user's resolved location at
  //             a tight street-level zoom. Sellers are still rendered
  //             as individual pins at their own coordinates but the
  //             camera never auto-zooms away from the customer.
  //
  // When the auto-fit would degenerate to a single point (the user
  // alone, no nearby sellers), we still centre on the user but use
  // a moderate delta so they can see the surrounding area instead
  // of a street-level dot. The truly empty case falls back to the
  // Unguja-wide region.
  const initialRegion = useMemo(() => {
    if (fitMode === "auto" && fitPoints.length >= 2) {
      // `pad` (1.8) leaves ~40% padding on each side — generous
      // enough that no seller or user pin is hidden under the FAB
      // cluster, bottom sheet, or location chip on the first paint.
      // The same padding is applied in `fitToCoordinates` via
      // `edgePadding`, so the two paths agree about what the camera
      // should show.
      const r = regionForPoints(fitPoints, 1.8);
      if (r) return clampRegionToUnguja(r);
    }
    if (fitMode === "auto" && fitPoints.length === 1 && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      // Single-point fit (user only, no sellers in range) — centre on
      // the user at a context-providing zoom (~16 km around) so the
      // customer still sees their surrounding area, not street level.
      const CONTEXT_DELTA = 0.15;
      return clampRegionToUnguja({
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: CONTEXT_DELTA,
        longitudeDelta: CONTEXT_DELTA,
      });
    }
    if (fitMode === "fixed" && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      // `zoom` is treated as the desired delta in degrees. Default
      // `12` would be ~1,300 km of viewport (the whole island);
      // callers that want a tighter street-level zoom pass a smaller
      // value (e.g. 0.02 for ~2.2 km around the customer).
      const delta = zoom;
      return clampRegionToUnguja({
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
    }
    return clampRegionToUnguja(UNGUJA_FALLBACK_REGION);
    // zoom is used only as a fallback path; fitPoints drives the
    // primary case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitPoints, fitMode, center.lat, center.lng]);

  // Refit when the marker set changes (e.g. the store resolves, the
  // user types a new address, "Locate me" is tapped). The post-mount
  // + onLayout passes catch the "first paint" case before the MapView
  // had time to lay out.
  //
  // We deliberately depend ONLY on the marker count + ids, NOT on the
  // customer's live GPS coordinates. Without this, every GPS fix from
  // `useCustomerLocation` would re-fit the camera and re-frame the
  // whole map, which feels like the markers "wobble" and prevents the
  // user from panning / zooming on their own.
  const markerKey = useMemo(
    () => finiteMarkers.map((m) => m.id).join("|"),
    [finiteMarkers],
  );

  const fitToMarkers = useCallback(() => {
    if (!mapRef.current) return;
    if (fitMode !== "auto" || fitPoints.length < 1) return;
    // Single-point case (user only, no sellers): animate to a
    // user-centred context region instead of calling fitToCoordinates
    // with one point (which would collapse to a meaningless zoom).
    if (fitPoints.length === 1 && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
      const r = clampRegionToUnguja({
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      });
      try {
        mapRef.current.animateToRegion(r, 600);
      } catch {
        /* ignore */
      }
      return;
    }
    const points = fitPoints.map((p) => ({
      latitude: p.lat,
      longitude: p.lng,
    }));
    try {
      // `animated: false` on the first fit — the camera should land
      // on the requested bbox synchronously so the seller pins are
      // visible on the very first paint. Animated fits can be
      // cancelled mid-flight by `onMapReady` re-firing or by the map
      // settling on a default region before our value arrives, which
      // was the symptom reported on the customer Home ("markers
      // exist but the camera is showing the whole island"). The
      // bottom padding leaves room for the FAB cluster and bottom
      // sheet so no pin is hidden under chrome.
      mapRef.current.fitToCoordinates(points, {
        edgePadding: { top: 64, right: 48, bottom: 220, left: 48 },
        animated: false,
      });
    } catch {
      /* ignore — the map ref is stale during fast unmount */
    }
  }, [fitPoints, fitMode, center.lat, center.lng]);

  useEffect(() => {
    // Small delay so the first fit lands after the map's tile layer
    // has a chance to start drawing — otherwise the camera can settle
    // before the world is ready and the result looks clipped. The
    // `onMapReady` handler below also runs `fitToMarkers` once tiles
    // are ready, so this delay is mainly a backstop for the case
    // where `onMapReady` has already fired (e.g. on a fast re-mount).
    const timer = setTimeout(fitToMarkers, 500);
    return () => clearTimeout(timer);
  }, [fitToMarkers, markerKey]);

  // Recentre on the user's location. Parent bumps `recenterToken`
  // when the "Locate me" button is tapped. With the customer Home
  // now in `auto` fit mode, "Locate me" re-runs the same bbox fit
  // (`fitToMarkers`) so the camera lands on the user together with
  // every nearby seller — matching first-paint behaviour. Falls
  // back to a tight street-level recentre when there are no markers
  // to frame.
  useEffect(() => {
    if (!mapRef.current) return;
    if (recenterToken <= 0) return;
    if (fitPoints.length >= 1) {
      fitToMarkers();
      return;
    }
    if (Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
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
        // `key` ties the map's mount lifetime to the *seller set
        // cardinality* so the MapView remounts the first time any
        // seller data arrives. Before any sellers are present, the
        // only `initialRegion` we can compute is the Unguja-wide
        // fallback — once the seller set resolves (length ≥ 1), the
        // key changes and the MapView remounts with a fresh
        // `initialRegion` centred on user + sellers, so the camera
        // lands on the requested bbox instead of falling back to the
        // Google Maps default (which is what was hiding the seller
        // pins on the customer Home). Using `markerKey` directly
        // would be a no-op for stable seller IDs, so we key on the
        // bucket the map is currently displaying: `0` = no sellers
        // yet, `>0` = sellers present.
        key={`map-${fitPoints.length > 0 ? markerKey : "empty"}`}
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onLayout={fitToMarkers}
        // Re-fit once the map's tile layer is ready. `onMapReady`
        // fires after `initialRegion` has been consumed, so this is
        // the safest place to run `fitToCoordinates` — by then the
        // map ref is alive and tiles are painted, so the camera lands
        // on the requested bbox instead of falling back to the
        // Google Maps default (which is what was hiding the seller
        // pins on the customer Home).
        onMapReady={fitToMarkers}
        // Tap-to-drop pin for the seller picker. Marker taps go
        // through the per-Marker `onPress` and never reach this
        // handler (react-native-maps swallows the event when a
        // marker consumes it).
        onPress={(e) => {
          if (!onMapTap) return;
          const c = e.nativeEvent?.coordinate;
          if (!c) return;
          onMapTap(clampCoordToUnguja(c));
        }}
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
        {clusteredMarkers.map((m) => {
          const richName = m.name ?? m.label;
          const latitude = Number(m.lat);
          const longitude = Number(m.lng);
          const locationStatus = (
            m as NearbySellerMarker & { locationStatus?: "OK" | "MISSING" }
          ).locationStatus ?? "OK";
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[SELLER_MARKER_DEBUG]", {
                sellerId: m.id,
                sellerName: richName ?? null,
                latitude,
                longitude,
                locationStatus,
                markerCount: clusteredMarkers.length,
            });
          }
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }
          return (
            <Marker
              key={`seller-${m.id}`}
              coordinate={{ latitude, longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
              tracksInfoWindowChanges={false}
              onPress={(e) => {
                e?.stopPropagation?.();
                onMarkerTap?.(m.id);
              }}
              title={richName ?? "Seller"}
              description={
                Number.isFinite(m.distanceKm) ? `${m.distanceKm!.toFixed(1)} km` : undefined
              }
            />
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
              collapsable={false}
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
    // Lift seller pins above the Google Maps POI label layer so
    // nearby labels (e.g. "Stone Town") never cover the storefront
    // pin. Without this, the pin reads as a thin icon behind a
    // paragraph of text and is hard to tap.
    zIndex: 50,
  },
  pinWrapSelected: {
    zIndex: 60,
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
    // Sized generously so the pin is easy to spot on a busy map and
    // large enough for a fingertip tap target.
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    borderColor: Colors.success,
  },
  pin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFF",
    boxShadow: "0 3px 6px rgba(0,0,0,0.4)",
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
    fontSize: 10,
    fontWeight: "800",
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
