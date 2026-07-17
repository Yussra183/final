/**
 * src/components/LiveTrackingMap/index.native.tsx
 *
 * Real Google-Maps-backed implementation of `LiveTrackingMap`.
 *
 * Metro only includes this file when bundling for a NATIVE platform
 * (iOS / Android) thanks to the `index.<platform>.tsx` convention
 * inside the `LiveTrackingMap/` folder. On web / Expo Go, Metro picks
 * `index.tsx` instead — which never imports `react-native-maps` — so
 * the seller + customer apps both keep rendering in environments
 * where the native module is unavailable.
 *
 * Both files export a function named `LiveTrackingMap`, so consumers
 * can keep their existing import shape:
 *
 *     import { LiveTrackingMap } from "../../src/components/LiveTrackingMap";
 *
 * Metro resolves the specifier per-platform and picks the correct
 * implementation at bundle time.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Colors, FontSize, Radius } from "../../../constants/colors";
import { LatLng } from "../../lib/location";
import { ResolvedMapProps } from "../LiveTrackingMap.types";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* -------------------------------------------------------------------------- */

interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function bboxOf(points: LatLng[]): BBox | null {
  if (!points || points.length === 0) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function regionFor(b: BBox, pad = 1.6): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  const centerLat = (b.minLat + b.maxLat) / 2;
  const centerLng = (b.minLng + b.maxLng) / 2;
  const latDelta = Math.max(0.005, (b.maxLat - b.minLat) * pad);
  const lngDelta = Math.max(0.005, (b.maxLng - b.minLng) * pad);
  return {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

/* -------------------------------------------------------------------------- */
/* Real Google Map view                                                      */
/* -------------------------------------------------------------------------- */

export function LiveTrackingMap(props: ResolvedMapProps) {
  const polyline = useMemo<LatLng[]>(
    () => (props.route && props.route.length > 1 ? props.route : [props.origin, props.destination]),
    [props.route, props.origin, props.destination],
  );

  const initialRegion = useMemo(() => {
    const pts = [
      props.origin,
      props.live,
      props.destination,
      ...(props.waypoints ?? []),
      ...polyline,
    ];
    const b = bboxOf(pts);
    if (!b) {
      return { latitude: 0, longitude: 0, latitudeDelta: 0.1, longitudeDelta: 0.1 };
    }
    return regionFor(b);
  }, [props.origin, props.live, props.destination, props.waypoints, polyline]);

  const mapRef = useRef<any>(null);
  useEffect(() => {
    if (!mapRef.current) return;
    const pts = [
      props.origin,
      props.live,
      props.destination,
      ...(props.waypoints ?? []),
      ...polyline,
    ];
    const b = bboxOf(pts);
    if (!b) return;
    const region = regionFor(b, 1.4);
    try {
      mapRef.current.animateToRegion(region, 700);
    } catch {
      /* ignore */
    }
  }, [props.live.lat, props.live.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.frame, { height: props.height ?? 260 }, props.style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsCompass
        showsMyLocationButton={false}
        showsTraffic={false}
        toolbarEnabled={false}
        rotateEnabled
        zoomEnabled
        scrollEnabled
        pitchEnabled
      >
        <Polyline
          coordinates={polyline.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={props.routeColor ?? Colors.primary}
          strokeWidth={4}
          lineDashPattern={[0]}
        />

        <Marker
          coordinate={{ latitude: props.origin.lat, longitude: props.origin.lng }}
          anchor={{ x: 0.5, y: 1 }}
          title={props.originLabel ?? "Origin"}
        >
          <View style={[styles.mapPin, { backgroundColor: Colors.surfaceMuted }]}>
            <Ionicons name="storefront" size={14} color={Colors.textSecondary} />
          </View>
        </Marker>

        <Marker
          coordinate={{ latitude: props.live.lat, longitude: props.live.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          title={props.liveLabel ?? "Live"}
        >
          <View style={[styles.mapPinLive, { backgroundColor: Colors.accent }]}>
            <Ionicons name="navigate" size={16} color="#FFF" />
          </View>
        </Marker>

        <Marker
          coordinate={{ latitude: props.destination.lat, longitude: props.destination.lng }}
          anchor={{ x: 0.5, y: 1 }}
          title={props.destinationLabel ?? "Destination"}
        >
          <View style={[styles.mapPin, { backgroundColor: Colors.primary }]}>
            <Ionicons name="flag" size={14} color="#FFF" />
          </View>
        </Marker>

        {(props.waypoints ?? []).map((w, idx) => (
          <Marker
            key={`wp-${idx}`}
            coordinate={{ latitude: w.lat, longitude: w.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            title={`Stop ${idx + 1}`}
          >
            <View style={styles.mapWaypoint}>
              <Text style={styles.mapWaypointText}>{idx + 1}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.attribution}>
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
  mapPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
  },
  mapPinLive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFF",
    boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
  },
  mapWaypoint: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  mapWaypointText: {
    fontSize: FontSize.xs - 2,
    fontWeight: "800",
    color: Colors.primary,
  },
});