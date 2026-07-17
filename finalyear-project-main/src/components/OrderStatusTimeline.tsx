/**
 * `OrderStatusTimeline` — visual progress for the Order Flow.
 *
 * Renders the canonical lifecycle as a vertical timeline of dots
 * connected by lines. The current status determines which dots are
 * "filled". Cancelled/rejected orders render a separate failure path
 * so the user understands why the normal flow was abandoned.
 *
 * Pure presentational component — no data fetching. Pair it with
 * `useStore().orders.find(...)` or `useStore().getOrderTimeline(...)`
 * to feed it the active order.
 */
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import {
  ORDER_TIMELINE,
  orderStatusLabel,
  timelineIndexOf,
} from "../../constants/order";
import type { Order } from "../../constants/types";

interface Props {
  order: Order;
  /** Optional override for the timestamp shown next to each filled dot. */
  /** Inline style override. */
  style?: ViewStyle;
  /** When true, render the future dots dimmed rather than empty. */
  compact?: boolean;
}

/**
 * Render the canonical timeline. The "current" status comes from the
 * order's `status` field; previous steps are filled, future steps are
 * empty, terminal-exit statuses (`cancelled`, `rejected`) redirect to
 * a single failure node rendered below the normal flow.
 */
export function OrderStatusTimeline({ order, style, compact }: Props) {
  const currentIdx = timelineIndexOf(order.status);
  const isFailure = order.status === "cancelled" || order.status === "rejected";

  return (
    <View style={[styles.wrap, style]}>
      {ORDER_TIMELINE.map((step, idx) => {
        const reached = idx <= currentIdx && !isFailure;
        const future = idx > currentIdx;
        const isCurrent = idx === currentIdx && !isFailure;
        const isLast = idx === ORDER_TIMELINE.length - 1;
        return (
          <View key={step.key} style={styles.row}>
            <View style={styles.dotColumn}>
              <View
                style={[
                  styles.dot,
                  reached && styles.dotFilled,
                  isCurrent && styles.dotCurrent,
                  future && styles.dotFuture,
                ]}
              >
                {reached && !isCurrent ? (
                  <Ionicons name="checkmark" size={12} color="#FFF" />
                ) : null}
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.line,
                    reached && idx < currentIdx ? styles.lineFilled : null,
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.labelColumn}>
              <Text
                style={[
                  styles.label,
                  reached && styles.labelReached,
                  future && styles.labelFuture,
                ]}
              >
                {step.label}
              </Text>
              {isCurrent ? (
                <Text style={styles.meta}>In progress</Text>
              ) : null}
              {!compact && isCurrent ? (
                <Text style={styles.meta}>{orderStatusLabel(order.status)}</Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {isFailure ? (
        <View style={styles.row}>
          <View style={styles.dotColumn}>
            <View style={[styles.dot, styles.dotFailure]}>
              <Ionicons name="close" size={12} color="#FFF" />
            </View>
          </View>
          <View style={styles.labelColumn}>
            <Text style={[styles.label, styles.labelFailure]}>
              {order.status === "rejected"
                ? "Seller rejected the order"
                : "Order cancelled"}
            </Text>
            {order.rejectReason ? (
              <Text style={styles.reason}>"{order.rejectReason}"</Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 44,
  },
  dotColumn: {
    width: 28,
    alignItems: "center",
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  dotFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dotCurrent: {
    borderColor: Colors.primary,
    backgroundColor: "#FFF",
    borderWidth: 3,
  },
  dotFuture: {
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
  },
  dotFailure: {
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    marginTop: 2,
  },
  lineFilled: {
    backgroundColor: Colors.primary,
  },
  labelColumn: {
    flex: 1,
    paddingLeft: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  label: {
    color: Colors.text,
    fontWeight: "700",
    fontSize: FontSize.md,
  },
  labelReached: {
    color: Colors.text,
  },
  labelFuture: {
    color: Colors.textMuted,
  },
  labelFailure: {
    color: Colors.danger,
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  reason: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 4,
    fontStyle: "italic",
  },
});
