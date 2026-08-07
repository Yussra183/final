/**
 * src/components/DeliveryMap.tsx
 *
 * Inline "map" for the Delivery Tracking screen.
 *
 * For now we render a clean SVG-style polyline + markers using stock
 * React Native primitives (no extra dependency). The shape of the
 * props already matches `react-native-maps` so swapping in:
 *
 *   import MapView, { Marker, Polyline } from "react-native-maps";
 *
 * …is a 1:1 refactor. Until that lands we keep zero external deps.
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { LatLng, Route } from "../lib/location";

export interface DeliveryMapProps {
  shop: LatLng;
  rider: LatLng;
  customer: LatLng;
  route: Route | null;
  /** Render height override. Defaults to 220. */
  height?: number;
  style?: ViewStyle;
}

interface Pin {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  pos: LatLng;
}

const PADDING_FRAC = 0.18; // viewport padding so pins never touch the edge

/**
 * Project two lat/lng endpoints into the local rect. We do not attempt
 * real Web Mercator here — the points are rendered on a stylized canvas
 * to communicate progress, not to be a navigational aid.
 */
function project(pins: Pin[], width: number, height: number) {
  if (pins.length === 0) return { width: 0, height: 0, points: [] as Array<{ x: number; y: number; pin: Pin }> };
  const lats = pins.map((p) => p.pos.lat);
  const lngs = pins.map((p) => p.pos.lng);
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

  return {
    width,
    height,
    points: pins.map((pin) => ({
      pin,
      x: padX + ((pin.pos.lng - minLng) / lngRange) * usableW,
      // y inverted because pixel coords grow down
      y: padY + (1 - (pin.pos.lat - minLat) / latRange) * usableH,
    })),
  };
}

export function DeliveryMap({ shop, rider, customer, route, height = 220, style }: DeliveryMapProps) {
  const pins: Pin[] = [
    { label: "Shop", color: Colors.primary, icon: "storefront", pos: shop },
    { label: "Rider", color: Colors.accent, icon: "bicycle", pos: rider },
    { label: "Customer", color: Colors.secondary, icon: "home", pos: customer },
  ];

  const [size, setSize] = React.useState({ w: 0, h: height });
  const projected = project(pins, size.w, height);

  // Build a polyline of SVG-style line segments from shop → rider → customer,
  // and a faded preview of the full route under it.
  const fullRoutePoints = route?.polyline ?? [];
  const fullRouteProjected = fullRoutePoints.map((p) => {
    const pts = project(pins, size.w, height).points;
    const refX = pts[0].x;
    const refY = pts[0].y;
    const lats = pins.map((pp) => pp.pos.lat);
    const lngs = pins.map((pp) => pp.pos.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = Math.max(0.0001, maxLat - minLat);
    const lngRange = Math.max(0.0001, maxLng - minLng);
    const padX = size.w * PADDING_FRAC;
    const padY = height * PADDING_FRAC;
    const usableW = size.w - padX * 2;
    const usableH = height - padY * 2;
    void refX; void refY;
    return {
      x: padX + ((p.lng - minLng) / lngRange) * usableW,
      y: padY + (1 - (p.lat - minLat) / latRange) * usableH,
    };
  });

  const riderToCustomer = riderToLine(projected.points[1], projected.points[2]);
  const shopToRider = riderToLine(projected.points[0], projected.points[1]);

  return (
    <View
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: height })}
      style={[styles.map, { height }, style]}
    >
      {/* Grid background */}
      <View style={[styles.grid, { opacity: 0.18 }]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={`h${i}`}
            style={[styles.gridLine, { top: ((i + 1) * height) / 5, width: size.w }]}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <View
            key={`v${i}`}
            style={[styles.gridLineV, { left: ((i + 1) * size.w) / 5, height }]}
          />
        ))}
      </View>

      {/* Faded planned route (shop → customer) */}
      {fullRouteProjected.length > 1 ? (
        <RouteSvg points={fullRouteProjected} width={size.w} height={height} color={Colors.border} thickness={3} dashed />
      ) : null}

      {/* Active leg: shop → rider */}
      {shopToRider ? (
        <RouteSvg
          points={[projected.points[0], projected.points[1]]}
          width={size.w}
          height={height}
          color={Colors.primary}
          thickness={4}
        />
      ) : null}

      {/* Active leg: rider → customer */}
      {riderToCustomer ? (
        <RouteSvg
          points={[projected.points[1], projected.points[2]]}
          width={size.w}
          height={height}
          color={Colors.accent}
          thickness={4}
        />
      ) : null}

      {/* Pins */}
      {projected.points.map(({ x, y, pin }) => (
        <View key={pin.label} style={[styles.pinWrap, { left: x - 18, top: y - 32 }]}>
          <View style={[styles.pinBubble, { backgroundColor: pin.color }]}>
            <Ionicons name={pin.icon} size={14} color="#FFF" />
          </View>
          <View style={[styles.pinTail, { borderTopColor: pin.color }]} />
          <View style={[styles.pinLabel, { backgroundColor: pin.color }]}>
            <Text style={styles.pinLabelText}>{pin.label}</Text>
          </View>
        </View>
      ))}

      {/* Compass */}
      <View style={styles.compass}>
        <Ionicons name="compass-outline" size={16} color={Colors.textSecondary} />
      </View>
    </View>
  );
}

function riderToLine(a: { x: number; y: number }, b: { x: number; y: number }) {
  if (!a || !b) return null;
  return { a, b };
}

/**
 * Simple line renderer — we use rotated View boxes between two points.
 * For a route polyline we'd ideally use react-native-svg, but we want
 * zero added dependencies today, so we draw straight segments only.
 */
function RouteSvg({
  points,
  width,
  height,
  color,
  thickness,
  dashed,
}: {
  points: Array<{ x: number; y: number }>;
  width: number;
  height: number;
  color: string;
  thickness: number;
  dashed?: boolean;
}) {
  void width; void height;
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
          transform: [{ translateX: 0 }, { translateY: 0 }, { rotateZ: `${angle}rad` }],
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
  pinWrap: {
    position: "absolute",
    width: 36,
    alignItems: "center",
  },
  pinBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFF",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  pinLabel: {
    marginTop: 2,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  pinLabelText: {
    color: "#FFF",
    fontSize: FontSize.xs - 1,
    fontWeight: "700",
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
});