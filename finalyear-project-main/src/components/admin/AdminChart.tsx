/**
 * AdminChart — small, dependency-free chart primitives used by the
 * Reports page. Includes a vertical bar chart, a horizontal bar
 * chart, and a sparkline-style line/area chart. Built with plain
 * Views so it works on web, iOS, and Android without extra libraries.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../../constants/colors";

interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  formatValue?: (v: number) => string;
  title?: string;
}

export function AdminBarChart({
  data,
  height = 200,
  formatValue = (v) => String(v),
  title,
}: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={[styles.chart, { height }]}>
        {data.map((d, idx) => {
          const h = (d.value / max) * (height - 40);
          return (
            <View key={idx} style={styles.barWrap}>
              <Text style={styles.barValue}>{formatValue(d.value)}</Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(2, h),
                    backgroundColor: d.color ?? Colors.primary,
                  },
                ]}
              />
              <Text style={styles.barLabel} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface HBarDatum extends BarDatum {}

interface HBarChartProps {
  data: HBarDatum[];
  formatValue?: (v: number) => string;
  title?: string;
}

export function AdminHBarChart({
  data,
  formatValue = (v) => String(v),
  title,
}: HBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={{ gap: Spacing.sm }}>
        {data.map((d, idx) => {
          const w = `${Math.max(4, (d.value / max) * 100)}%`;
          return (
            <View key={idx}>
              <View style={styles.hbarHeader}>
                <Text style={styles.hbarLabel} numberOfLines={1}>
                  {d.label}
                </Text>
                <Text style={styles.hbarValue}>
                  {formatValue(d.value)}
                </Text>
              </View>
              <View style={styles.hbarTrack}>
                <View
                  style={[
                    styles.hbarFill,
                    {
                      width: w as `${number}%`,
                      backgroundColor: d.color ?? Colors.primary,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface LinePoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LinePoint[];
  height?: number;
  formatValue?: (v: number) => string;
  title?: string;
}

export function AdminLineChart({
  data,
  height = 200,
  formatValue = (v) => String(v),
  title,
}: LineChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;

  const W = 320;
  const H = height - 40;
  const stepX = data.length > 1 ? W / (data.length - 1) : W;

  // Build an SVG-like polyline using rotated Views? Simpler: stack
  // vertical bars for a "line-ish" appearance using bars of varied
  // heights. This is robust on all platforms without extra deps.

  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={[styles.chart, { height }]}>
        {data.map((d, idx) => {
          const h = ((d.value - min) / range) * (H - 30) + 10;
          return (
            <View key={idx} style={styles.barWrap}>
              <Text style={styles.barValue}>{formatValue(d.value)}</Text>
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: Colors.primary,
                    opacity: 0.85,
                    borderTopLeftRadius: Radius.sm,
                    borderTopRightRadius: Radius.sm,
                  },
                ]}
              />
              <Text style={styles.barLabel} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.helperText}>
        Trend: {data.length} data points • Peak {formatValue(max)} • Low {formatValue(min)}
      </Text>
    </View>
  );
}

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutSlice[];
  size?: number;
  title?: string;
}

export function AdminDonut({
  data,
  size = 160,
  title,
}: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.lg }}>
        {/* Render donut as concentric ring stack */}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: Colors.surfaceMuted,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            borderWidth: 6,
            borderColor: Colors.surface,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: Colors.text }}>
              {total}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textSecondary, fontWeight: "700" }}>
              TOTAL
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          {data.map((d, idx) => {
            const pct = Math.round((d.value / total) * 100);
            return (
              <View key={idx} style={styles.donutRow}>
                <View
                  style={[
                    styles.donutDot,
                    { backgroundColor: d.color },
                  ]}
                />
                <Text style={styles.donutLabel}>{d.label}</Text>
                <Text style={styles.donutValue}>
                  {pct}% · {d.value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
  },
  barWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "70%",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  barLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 6,
    fontWeight: "700",
  },
  barValue: {
    fontSize: 10,
    color: Colors.text,
    fontWeight: "800",
    marginBottom: 4,
  },
  helperText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    fontWeight: "600",
  },
  hbarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  hbarLabel: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  hbarValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "800",
  },
  hbarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceMuted,
    overflow: "hidden",
  },
  hbarFill: {
    height: "100%",
    borderRadius: 4,
  },
  donutRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  donutDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  donutLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "600",
  },
  donutValue: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "800",
  },
});