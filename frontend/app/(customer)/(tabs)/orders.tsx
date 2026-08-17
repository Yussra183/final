import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../../constants/colors";
import { Card } from "../../../src/components/Card";
import { StatusPill } from "../../../src/components/StatusPill";
import { useStore } from "../../../src/store/StoreContext";
import { Order, OrderStatus } from "../../../constants/types";
import {
  formatCurrency,
  formatDate,
  orderStatusLabel,
  orderTone,
} from "../../../src/utils/format";
import {
  derivePaymentStatus,
  paymentStatusLabel,
  paymentTone,
} from "../../../src/lib/payment";
import { TERMINAL_STATUSES } from "../../../constants/order";
import { FadeIn, PressableScale } from "../../../src/components/MicroAnimations";

/**
 * My Orders — tab destination inside the bottom-tab navigator.
 *
 * Shows the customer's order history with a segmented Active / Past
 * control. Active = in-flight orders (pending → in_transit). Past =
 * terminal orders (delivered / cancelled / rejected) — pulled from the
 * canonical `TERMINAL_STATUSES` set in `constants/order.ts`.
 *
 * Tap an order → `/tracking?id=<orderId>` (full-screen push; tab bar
 * hidden by the parent Stack).
 *
 * The "Place new order" form previously embedded in this screen has
 * moved behind the Home → seller-detail flow. The inline live rider
 * tracker that used to live here now lives in `tracking.tsx`.
 */
type Segment = "active" | "past";

const ACTIVE_STATUSES = new Set<OrderStatus>([
  "pending",
  "accepted",
  "assigned",
  "picked_up",
  "in_transit",
]);

// Reuse the canonical terminal set so the buckets stay in sync with
// the rest of the app.
const PAST_STATUSES: ReadonlySet<OrderStatus> = TERMINAL_STATUSES;

/**
 * Inline segmented control. We don't depend on
 * `@react-native-segmented-control/segmented-control` (not installed)
 * — two Pressable cells, surface-coloured active pill.
 */
function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
          >
            <Text
              style={[
                styles.segmentText,
                active && styles.segmentTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const { session, orders, getOrdersForUser, cancelOrder } = useStore();

  const [segment, setSegment] = useState<Segment>("active");

  /**
   * All orders belonging to the current customer, newest first.
   * `getOrdersForUser` already filters by `customerId === user.id`.
   */
  const myOrders = useMemo<Order[]>(() => {
    if (!session) return [];
    return [...getOrdersForUser(session.user.id, "customer")].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }, [orders, session, getOrdersForUser]);

  /** Filtered view for the active segment. */
  const filtered = useMemo(
    () =>
      myOrders.filter((o) =>
        segment === "active"
          ? ACTIVE_STATUSES.has(o.status)
          : PAST_STATUSES.has(o.status),
      ),
    [myOrders, segment],
  );

  /**
   * Tap a row → tracking screen with the order id. The parent Stack
   * pushes this route and the tab bar is hidden automatically.
   */
  const viewDetails = (order: Order) => {
    router.push({
      pathname: "/(customer)/tracking",
      params: { id: order.id },
    } as any);
  };

  const renderItem = ({ item, index }: { item: Order; index: number }) => {
    const i = item.items[0];
    const numericTail = item.id.replace(/[^0-9]/g, "");
    const shortNumber =
      numericTail.length > 0 && numericTail.length <= 6
        ? numericTail
        : item.id.slice(-6);
    const orderNumber = `#${shortNumber}`;
    const payStatus = derivePaymentStatus(item.status);
    const gasType =
      (i?.productName ?? "").split(" ").slice(1).join(" ") || "—";
    return (
      <FadeIn delay={index * 50} style={styles.historyCardWrap}>
        <Pressable onPress={() => viewDetails(item)}>
          <Card style={styles.historyCard}>
            {/* ----- Card header: number + status pills ----- */}
            <View style={styles.historyCardHeader}>
              <View style={styles.historyNumberWrap}>
                <Ionicons
                  name="cube-outline"
                  size={16}
                  color={Colors.primary}
                />
                <Text style={styles.historyCardNumber}>{orderNumber}</Text>
              </View>
              <View style={styles.historyPills}>
                <StatusPill
                  label={orderStatusLabel(item.status)}
                  tone={orderTone(item.status)}
                />
                <StatusPill
                  label={paymentStatusLabel(payStatus)}
                  tone={paymentTone(payStatus)}
                />
              </View>
            </View>

            {/* ----- Detail rows ----- */}
            <View style={styles.historyRow}>
              <Text style={styles.historyRowLabel}>Gas Type</Text>
              <Text style={styles.historyRowValue}>{gasType}</Text>
            </View>
            <View style={styles.historyRow}>
              <Text style={styles.historyRowLabel}>Cylinder Size</Text>
              <Text style={styles.historyRowValue}>{i?.size ?? "—"}</Text>
            </View>
            <View style={styles.historyRow}>
              <Text style={styles.historyRowLabel}>Order Date</Text>
              <Text style={styles.historyRowValue}>
                {formatDate(item.createdAt)}
              </Text>
            </View>
            <View style={styles.historyRow}>
              <Text style={styles.historyRowLabel}>Total Price</Text>
              <Text style={styles.historyRowTotalValue}>
                {formatCurrency(item.total)}
              </Text>
            </View>

            {/* ----- Rejection banner ----- */}
            {item.status === "rejected" && item.rejectReason ? (
              <View style={styles.rejectBanner}>
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={Colors.danger}
                />
                <Text style={styles.rejectBannerText}>
                  Seller declined: {item.rejectReason}
                </Text>
              </View>
            ) : null}

            {/* ----- Pending-only: cancel ----- */}
            {item.status === "pending" ? (
              <Pressable
                onPress={() => {
                  Alert.alert(
                    "Cancel order?",
                    `Order ${orderNumber} will be cancelled. The seller will be notified.`,
                    [
                      { text: "Keep", style: "cancel" },
                      {
                        text: "Cancel order",
                        style: "destructive",
                        onPress: async () => {
                          try {
                            await cancelOrder(item.id);
                          } catch (err) {
                            Alert.alert(
                              "Could not cancel",
                              (err as Error)?.message ??
                                "Please try again.",
                            );
                          }
                        },
                      },
                    ],
                  );
                }}
                style={styles.cancelLinkWrap}
              >
                <Text style={styles.cancelLinkText}>Cancel this order</Text>
              </Pressable>
            ) : null}

            {/* ----- Pay Now shortcut -----
                Visible once the seller has accepted the order (or it's
                still pending) — i.e. there's a payment-eligible moment
                in the customer journey. Cash on delivery is fine; the
                Pay Now screen lets the customer switch to M-Pesa / Card
                if they prefer not to pay the rider in cash. */}
            {(item.status === "pending" ||
              item.status === "accepted" ||
              item.status === "assigned" ||
              item.status === "picked_up" ||
              item.status === "in_transit" ||
              item.status === "delivered") &&
            payStatus !== "completed" &&
            payStatus !== "refunded" ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/(customer)/pay",
                    params: { id: item.id },
                  } as any)
                }
                style={styles.payLinkWrap}
                accessibilityRole="button"
                accessibilityLabel="Pay for this order"
              >
                <Ionicons
                  name="card-outline"
                  size={14}
                  color={Colors.primary}
                />
                <Text style={styles.payLinkText}>Pay for this order</Text>
              </Pressable>
            ) : null}
          </Card>
        </Pressable>
      </FadeIn>
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      {/* ---------------- Header ---------------- */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My Orders</Text>
          <Text style={styles.subtitle}>
            {myOrders.length} {myOrders.length === 1 ? "order" : "orders"} total
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/(customer)/payments" as any)}
          style={styles.paymentsLinkWrap}
          accessibilityRole="button"
          accessibilityLabel="My Payments"
        >
          <Ionicons
            name="card-outline"
            size={16}
            color={Colors.primary}
          />
          <Text style={styles.paymentsLinkText}>Payments</Text>
        </Pressable>
      </View>

      {/* ---------------- Segmented control ---------------- */}
      <Segmented
        value={segment}
        onChange={setSegment}
        options={[
          { key: "active", label: "Active" },
          { key: "past", label: "Past" },
        ]}
      />

      {/* ---------------- List ---------------- */}
      {myOrders.length === 0 ? (
        // No orders at all — same empty state regardless of segment.
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.emptyCard}>
            <Ionicons
              name="archive-outline"
              size={40}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptyText}>
              Once you place an order from the Home screen it will appear
              here so you can track it or reorder with a single tap.
            </Text>
            <PressableScale
              onPress={() => router.push("/(customer)" as any)}
              style={styles.emptyCta}
            >
              <Text style={styles.emptyCtaText}>Browse sellers</Text>
            </PressableScale>
          </Card>
        </ScrollView>
      ) : filtered.length === 0 ? (
        // Have orders, but none in this segment.
        <ScrollView
          contentContainerStyle={styles.emptyWrap}
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.emptyCard}>
            <Ionicons
              name={segment === "active" ? "time-outline" : "checkmark-done-outline"}
              size={40}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {segment === "active" ? "No active orders" : "No past orders"}
            </Text>
            <Text style={styles.emptyText}>
              {segment === "active"
                ? "You have no orders in progress right now."
                : "Completed and cancelled orders will appear here."}
            </Text>
            {segment === "active" ? (
              <PressableScale
                onPress={() => router.push("/(customer)" as any)}
                style={styles.emptyCta}
              >
                <Text style={styles.emptyCtaText}>Browse sellers</Text>
              </PressableScale>
            ) : null}
          </Card>
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  /* ----- Header ----- */
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },

  /* ----- Segmented control ----- */
  segmented: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    borderRadius: Radius.sm,
  },
  segmentActive: {
    backgroundColor: Colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: {
    color: Colors.textMuted,
    fontWeight: "700",
    fontSize: FontSize.sm,
  },
  segmentTextActive: {
    color: Colors.primary,
  },

  /* ----- List ----- */
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  /* ----- Empty states ----- */
  emptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  emptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyCta: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  emptyCtaText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.sm,
  },

  /* ----- History card ----- */
  historyCardWrap: {
    marginBottom: Spacing.md,
  },
  historyCard: {
    padding: Spacing.lg,
  },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyNumberWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyCardNumber: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  historyPills: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
    gap: Spacing.md,
  },
  historyRowLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
    flexShrink: 0,
    minWidth: 110,
  },
  historyRowValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  historyRowTotalValue: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: "800",
    flex: 1,
    textAlign: "right",
  },

  /* ----- Reject banner ----- */
  rejectBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FEE2E2",
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rejectBannerText: {
    flex: 1,
    color: Colors.danger,
    fontWeight: "600",
    fontSize: FontSize.sm,
  },

  /* ----- Cancel link ----- */
  cancelLinkWrap: {
    alignSelf: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  cancelLinkText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textDecorationLine: "underline",
  },

  /* ----- Pay Now link (per-order) ----- */
  payLinkWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    alignSelf: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.primarySoft,
    borderRadius: 999,
    marginTop: Spacing.sm,
  },
  payLinkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },

  /* ----- Header: My Payments shortcut ----- */
  paymentsLinkWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: 999,
    backgroundColor: Colors.primarySoft,
  },
  paymentsLinkText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
});
