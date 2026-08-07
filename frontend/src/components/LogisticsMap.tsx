/**
 * src/components/LogisticsMap.tsx
 *
 * Stylized "live map" for the Supplier module. Renders:
 *
 *   • the planned route polyline (faded)
 *   • each RouteStop as a numbered marker (dimmed if delivered)
 *   • the supplier's current LatLng as a pulsing truck pin
 *   • a 500 m radius halo around the truck
 *
 * Visually it follows the same canvas-projection style as the existing
 * DeliveryMap component (no new dependencies) but exposes per-stop
 * state and a supplier marker so the live-tracking screen is a true
 * logistics visualisation rather than a 3-point customer trip.
 */
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { LatLng, RouteStop } from "../../constants/types";

interface Props {
  /** Stops along the route. Stops already delivered are dimmed. */
  stops: RouteStop[];
  /** The full route polyline (planned path). */
  polyline: LatLng[];
  /** The supplier's current position. */
  supplier: LatLng;
  /** Optional height override. */
  height?: number;
}

const PADDING_FRAC = 0.18;

/**
 * Project every point we care about into a single local rect. We use a
 * shared bounding box across the polyline + stops + supplier so the
 * "camera" doesn't jump when the truck moves.
 */
function project(
  points: LatLng[],
  width: number,
  height: number,
): { x: number; y: number }[] {
  if (points.length === 0 || width === 0) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = Math.max(0.0001, maxLat - minLat);
  const lngRange = Math.max(0.0001, maxLng - minLng);
  const padX = width * PADDING_FRAC;
  const padY = height * PADDING_FRAC;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  return points.map((p) => ({
    x: padX + ((p.lng - minLng) / lngRange) * usableW,
    y: padY + (1 - (p.lat - minLat) / latRange) * usableH,
  }));
}

/** Convert a pixel distance into a roughly-equivalent lat/lng radius
 * for the supplier halo. We use the same projection as the rest of the
 * map and just paint a circle in the canvas.
 *
 * For a 500 m halo, this is an approximation — the perceived size is
 * the focus, not the absolute accuracy.
 */
function projectRadius(
  center: { x: number; y: number },
  meters: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  width: number,
  height: number,
): number {
  const latRange = Math.max(0.0001, bounds.maxLat - bounds.minLat);
  const lngRange = Math.max(0.0001, bounds.maxLng - bounds.minLng);
  const padX = width * PADDING_FRAC;
  const padY = height * PADDING_FRAC;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  // 1 deg of lat ≈ 111 km. 1 deg of lng ≈ 111 km * cos(lat).
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const kmPerDegLat = 111;
  const kmPerDegLng = 111 * Math.cos((midLat * Math.PI) / 180);
  const degreesRadius = meters / 1000 / ((kmPerDegLat + kmPerDegLng) / 2);
  const wRatio = degreesRadius / lngRange;
  const hRatio = degreesRadius / latRange;
  return Math.max(wRatio, hRatio) * Math.max(usableW, usableH);
}

function colorForStop(status: RouteStop["status"]): string {
  switch (status) {
    case "delivered":
      return Colors.success;
    case "near_shop":
      return Colors.accent;
    case "on_the_way":
      return Colors.info;
    case "started":
      return Colors.primary;
    default:
      return Colors.textMuted;
  }
}

export function LogisticsMap({ stops, polyline, supplier, height = 260 }: Props) {
  const [size, setSize] = useState({ w: 0, h: height });
  const [pulse, setPulse] = useState(0);

  // Pulse the truck halo to communicate "live".
  useEffect(() => {
    const t = setInterval(() => {
      setPulse((p) => (p + 1) % 100);
    }, 60);
    return () => clearInterval(t);
  }, []);

  const allPoints: LatLng[] = [...polyline, ...stops.map((s) => ({ lat: s.lat, lng: s.lng })), supplier];
  const projected = project(allPoints, size.w, size.h);
  // Indices into `projected`:
  //   [0..polyline.length-1]             = polyline points
  //   [polyline.length..+stops.length-1] = stops
  //   last                                = supplier
  const polyProjected = projected.slice(0, polyline.length);
  const stopsProjected = projected.slice(polyline.length, polyline.length + stops.length);
  const supplierProjected = projected[projected.length - 1];

  const bounds = (() => {
    if (allPoints.length === 0) return null;
    const lats = allPoints.map((p) => p.lat);
    const lngs = allPoints.map((p) => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  })();

  const haloRadius = bounds
    ? projectRadius(
        supplierProjected ?? { x: 0, y: 0 },
        500,
        bounds,
        size.w,
        size.h,
      )
    : 0;

  const pulseScale = 1 + Math.sin((pulse / 100) * Math.PI * 2) * 0.25;
  const haloOpacity = 0.18 + Math.abs(Math.sin((pulse / 100) * Math.PI * 2)) * 0.18;

  return (
    <View
      onLayout={(e) =>
        setSize({ w: e.nativeEvent.layout.width, h: height })
      }
      style={[styles.map, { height }]}
    >
      {/* Faint grid background */}
      <View style={[styles.grid, { opacity: 0.18 }]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={`h${i}`}
            style={[
              styles.gridLine,
              { top: ((i + 1) * height) / 5, width: size.w },
            ]}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <View
            key={`v${i}`}
            style={[
              styles.gridLineV,
              { left: ((i + 1) * size.w) / 5, height },
            ]}
          />
        ))}
      </View>

      {/* Planned polyline (faded) */}
      {polyProjected.length > 1 ? (
        <Polyline
          points={polyProjected}
          color={Colors.border}
          thickness={3}
          dashed
        />
      ) : null}

      {/* Stops */}
      {stopsProjected.map((pt, i) => {
        const stop = stops[i];
        const c = colorForStop(stop.status);
        const dim = stop.status === "delivered" ? 0.45 : 1;
        return (
          <View
            key={stop.sellerId}
            style={[
              styles.stopWrap,
              { left: pt.x - 18, top: pt.y - 22, opacity: dim },
            ]}
          >
            <View style={[styles.stopBubble, { backgroundColor: c }]}>
              <Text style={styles.stopNumber}>{stop.sequence}</Text>
            </View>
            <View style={[styles.stopTail, { borderTopColor: c }]} />
            <View style={[styles.stopLabel, { backgroundColor: c }]}>
              <Text style={styles.stopLabelText} numberOfLines={1}>
                {stop.sellerName}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Supplier halo (500 m radius visualisation) */}
      {supplierProjected ? (
        <View
          style={[
            styles.halo,
            {
              left: supplierProjected.x - haloRadius * pulseScale,
              top: supplierProjected.y - haloRadius * pulseScale,
              width: haloRadius * 2 * pulseScale,
              height: haloRadius * 2 * pulseScale,
              borderRadius: haloRadius * pulseScale,
              backgroundColor: Colors.accent,
              opacity: haloOpacity,
            },
          ]}
        />
      ) : null}

      {/* Supplier pin */}
      {supplierProjected ? (
        <View
          style={[
            styles.supplierWrap,
            { left: supplierProjected.x - 20, top: supplierProjected.y - 38 },
          ]}
        >
          <View style={styles.supplierBubble}>
            <Ionicons name="car-sport" size={18} color="#FFF" />
          </View>
          <View style={styles.supplierTail} />
          <View style={styles.supplierLabel}>
            <Text style={styles.supplierLabelText}>Truck</Text>
          </View>
        </View>
      ) : null}

      {/* Compass */}
      <View style={styles.compass}>
        <Ionicons
          name="navigate-outline"
          size={16}
          color={Colors.textSecondary}
        />
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
          <Text style={styles.legendText}>Start</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.accent }]} />
          <Text style={styles.legendText}>Truck</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.legendText}>Delivered</Text>
        </View>
      </View>
    </View>
  );
}

/** Inline polyline renderer (rotated View boxes between two points). */
function Polyline({
  points,
  color,
  thickness,
  dashed,
}: {
  points: { x: number; y: number }[];
  color: string;
  thickness: number;
  dashed?: boolean;
}) {
  const segs: React.ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    segs.push(
      <View
        key={i}
        style={{
          position: "absolute",
          left: a.x,
          top: a.y - thickness / 2,
          width: len,
          height: thickness,
          backgroundColor: dashed ? "transparent" : color,
          borderTopWidth: dashed ? thickness : 0,
          borderStyle: dashed ? "dashed" : "solid",
          borderColor: color,
          transform: [{ rotateZ: `${angle}rad` }],
          transformOrigin: "0% 50%",
        }}
      />,
    );
  }
  return <>{segs}</>;
}

const styles = StyleSheet.create({
  map: {
    width: "100%",
    borderRadius: Radius.lg,
    backgroundColor: "#E0F2F1",
    overflow: "hidden",
    position: "relative",
  },
  grid: { ...StyleSheet.absoluteFillObject },
  gridLine: {
    position: "absolute",
    height: 1,
    backgroundColor: Colors.border,
  },
  gridLineV: {
    position: "absolute",
    width: 1,
    backgroundColor: Colors.border,
  },
  stopWrap: {
    position: "absolute",
    width: 36,
    alignItems: "center",
  },
  stopBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },
  stopNumber: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.xs,
  },
  stopTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  stopLabel: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    maxWidth: 70,
  },
  stopLabelText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "700",
  },
  supplierWrap: {
    position: "absolute",
    width: 40,
    alignItems: "center",
  },
  supplierBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFF",
    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
  },
  supplierTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: Colors.accent,
    marginTop: -1,
  },
  supplierLabel: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
  },
  supplierLabelText: {
    color: "#FFF",
    fontSize: 9,
    fontWeight: "800",
  },
  halo: {
    position: "absolute",
  },
  compass: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  legend: {
    position: "absolute",
    left: Spacing.sm,
    bottom: Spacing.sm,
    flexDirection: "row",
    gap: Spacing.sm,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
});
