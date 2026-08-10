/**
 * src/components/LiveTrackingMap/index.tsx
 *
 * Stylised-by-data fallback implementation of `LiveTrackingMap`.
 *
 * Loaded by Metro whenever the platform-extension rule selects
 * `*.tsx` (i.e. on **web** and Expo Go). It never imports
 * `react-native-maps` so the web bundle stays clean and the seller +
 * customer apps keep rendering even when the native module is
 * unavailable.
 *
 * The native sibling at `./index.native.tsx` exports the same
 * `LiveTrackingMap` symbol with the real Google Maps view, so
 * consumers can keep writing
 *
 *     import { LiveTrackingMap } from "../../src/components/LiveTrackingMap";
 *
 * and Metro transparently picks the right impl per platform via the
 * canonical folder + `index.<platform>.tsx` convention.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius, Spacing } from "../../../constants/colors";
import { LatLng } from "../../lib/location";
import {
  LiveTrackingMapProps,
  ResolvedMapProps,
  resolveLiveTrackingMapProps,
} from "../LiveTrackingMap.types";

/**
 * Re-export so that other modules that previously imported
 * `LatLng` from `./LiveTrackingMap` (e.g. `LiveRiderTracker`)
 * continue to work without modification.
 */
export type { LatLng };
export type { LiveTrackingMapProps } from "../LiveTrackingMap.types";

/* -------------------------------------------------------------------------- */
/* Stylised fallback                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Projects every point into a percent-based viewport and renders a
 * faux polyline + pins on a soft grid background. Visually distinct
 * from the Google tile view so it's obvious we're in fallback mode
 * (chip in the bottom-left reads "Simulated map").
 */
function FallbackFrame({
  origin,
  live,
  destination,
  waypoints,
  route,
  height,
  liveLabel,
  originLabel,
  destinationLabel,
  routeColor,
  markerColors,
  style,
}: ResolvedMapProps) {
  const all: LatLng[] = [
    origin,
    ...(waypoints ?? []),
    destination,
    ...((route && route.length > 1 ? route : [origin, destination])),
  ];

  const project = (p: LatLng) => {
    const lats = all.map((q) => q.lat);
    const lngs = all.map((q) => q.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const dx = maxLng - minLng || 0.0001;
    const dy = maxLat - minLat || 0.0001;
    return {
      x: ((p.lng - minLng) / dx) * 100,
      y: (1 - (p.lat - minLat) / dy) * 100,
    };
  };

  const originPos = project(origin);
  const livePos = project(live);
  const destPos = project(destination);

  const polyPts = (route && route.length > 1 ? route : [origin, destination]).map(
    project,
  );

  return (
    <View style={[styles.frame, { height }, style]}>
      {/* Faux tile background */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`h-${i}`} style={[styles.gridLine, { top: `${(i + 1) * 14}%` }]} />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={`v-${i}`}
            style={[styles.gridLineV, { left: `${(i + 1) * 14}%` }]}
          />
        ))}
      </View>

      {/* Polyline rendered as rotated bars between every adjacent pair */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {polyPts.slice(0, -1).map((a, i) => {
          const b = polyPts[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          return (
            <View
              key={`seg-${i}`}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: `${a.x}%`,
                top: `${a.y}%`,
                width: `${length}%`,
                height: 4,
                backgroundColor: routeColor ?? Colors.primary,
                borderRadius: 999,
                transform: [{ translateY: -2 }, { rotate: `${angle}rad` }],
              }}
            />
          );
        })}
      </View>

      {/* Pins */}
      <Pin x={originPos.x} y={originPos.y} icon="storefront" label={originLabel ?? "Origin"} tone="muted" bg={markerColors?.origin} />
      <Pin
        x={livePos.x}
        y={livePos.y}
        icon="navigate"
        label={liveLabel ?? "Live"}
        tone="live"
        bg={markerColors?.live}
        pulse
      />
      <Pin
        x={destPos.x}
        y={destPos.y}
        icon="flag"
        label={destinationLabel ?? "Destination"}
        tone="primary"
        bg={markerColors?.destination}
      />

      {/* Attribution chip */}
      <View style={styles.attribution}>
        <Ionicons name="map-outline" size={11} color={Colors.textSecondary} />
        <Text style={styles.attributionText}>Simulated map</Text>
      </View>
    </View>
  );
}

interface PinProps {
  x: number;
  y: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: "primary" | "muted" | "live";
  /** Optional background override (per-marker color). */
  bg?: string;
  pulse?: boolean;
}

function Pin({ x, y, icon, label, tone, bg: bgOverride, pulse }: PinProps) {
  const bg =
    bgOverride ??
    (tone === "primary"
      ? Colors.primary
      : tone === "live"
      ? Colors.accent
      : Colors.surfaceMuted);
  const fg = tone === "muted" ? Colors.textSecondary : "#FFF";
  return (
    <View
      pointerEvents="none"
      style={[
        styles.pinWrap,
        { left: `${x}%`, top: `${y}%`, transform: [{ translateX: -16 }, { translateY: -16 }] },
      ]}
    >
      {pulse ? <View style={[styles.pinHalo, { backgroundColor: Colors.accent }]} /> : null}
      <View style={[styles.pinBubble, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={14} color={fg} />
      </View>
      <View
        style={[
          styles.pinLabel,
          { backgroundColor: tone === "live" ? Colors.accent : bg },
        ]}
      >
        <Text style={styles.pinLabelText}>{label}</Text>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Public component (web / Expo Go)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Normalises the legacy `rider` / `riderLabel` aliases so existing
 * callers (`LiveRiderTracker`) keep working untouched.
 */
export function LiveTrackingMap(props: LiveTrackingMapProps) {
  const normalised = resolveLiveTrackingMapProps(props);
  return <FallbackFrame {...normalised} />;
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: "#E0F2F1",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gridOverlay: { ...StyleSheet.absoluteFillObject, opacity: 0.35 },
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
  pinWrap: {
    position: "absolute",
    alignItems: "center",
  },
  pinBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
  },
  pinHalo: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    opacity: 0.25,
  },
  pinLabel: {
    marginTop: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  pinLabelText: {
    color: "#FFF",
    fontSize: 9,
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