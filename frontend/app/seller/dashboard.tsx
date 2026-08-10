/**
 * Seller → Dashboard
 *
 * First screen after a seller signs in. Surfaces a real-time business
 * overview: four summary cards (Total / Pending / Stock / Today's Sales)
 * plus recent orders, recent notifications and low-stock alerts.
 *
 * All data flows through `useStore()` so a future REST integration
 * (Spring Boot backend) only needs to swap the mock store — no screen
 * changes required.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { useStore } from "../../src/store/StoreContext";
import {
  formatCurrency,
  formatDateTime,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";
import { GasProduct, NotificationItem, Order } from "../../constants/types";
import { PermitStatusBanner } from "../../src/components/PermitStatusBanner";

const LOW_STOCK_THRESHOLD = 10;

/** Reusable 2-column summary card used on the dashboard top row. */
function SummaryCard(props: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  hint?: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: props.tint + "22" }]}>
        <Ionicons name={props.icon} size={22} color={props.tint} />
      </View>
      <Text style={styles.summaryValue} numberOfLines={1}>
        {props.value}
      </Text>
      <Text style={styles.summaryLabel} numberOfLines={1}>
        {props.label}
      </Text>
      {props.hint ? (
        <Text style={styles.summaryHint} numberOfLines={1}>
          {props.hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Compact order row used in the dashboard "Recent Orders" section. */
function RecentOrderRow({
  order,
  onPress,
}: {
  order: Order;
  onPress?: () => void;
}) {
  const item = order.items[0];
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.recentCard}>
        <View style={styles.recentRow}>
          <View style={styles.recentIcon}>
            <Ionicons name="flame-outline" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.recentTitle} numberOfLines={1}>
              #{order.id.slice(-4)} • {order.customerName}
            </Text>
            <Text style={styles.recentMeta} numberOfLines={1}>
              {item ? `${item.size} × ${item.quantity}` : "—"} • {formatCurrency(order.total)}
            </Text>
          </View>
          <StatusPill label={orderStatusLabel(order.status)} tone={orderTone(order.status)} />
        </View>
      </Card>
    </TouchableOpacity>
  );
}

/** Compact notification row used in the dashboard "Recent Notifications" section. */
function RecentNotificationRow({ n }: { n: NotificationItem }) {
  const tint =
    n.type === "order"
      ? Colors.primary
      : n.type === "delivery"
        ? Colors.info
        : n.type === "stock"
          ? Colors.warning
          : n.type === "permit"
            ? Colors.accent
            : Colors.textSecondary;
  return (
    <View style={styles.notifRow}>
      <View style={[styles.notifIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons
          name={
            n.type === "order"
              ? "receipt-outline"
              : n.type === "delivery"
                ? "car-outline"
                : n.type === "stock"
                  ? "alert-circle-outline"
                  : n.type === "permit"
                    ? "document-text-outline"
                    : "information-circle-outline"
          }
          size={18}
          color={tint}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.notifHeader}>
          <Text style={styles.notifTitle} numberOfLines={1}>
            {n.title}
          </Text>
          {!n.read ? <View style={styles.unreadDot} /> : null}
        </View>
        <Text style={styles.notifBody} numberOfLines={2}>
          {n.message}
        </Text>
        <Text style={styles.notifMeta}>{formatDateTime(n.createdAt)}</Text>
      </View>
    </View>
  );
}

export default function SellerDashboard() {
  const {
    session,
    orders,
    products,
    notifications,
    sellerPermits,
    refresh,
    getOrdersForUser,
    getProductsForSeller,
    getNotificationsForUser,
  } = useStore();

  // Pull-to-refresh wiring: hits the store-level `refresh()` so the
  // seller's permit (and notification feed) re-hydrate from the backend.
  // Without this, an admin's approval performed in another session is
  // never picked up until the seller signs out and back in.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Auto-refresh on screen focus. This is what makes the dashboard
  // unlock after the admin approves the permit in another session:
  // every time the seller returns to this tab, the store re-fetches
  // `/api/permits/me` and mirrors the latest `status` onto the session,
  // which the layout and banner read off.
  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {
        // Silent — the pull-to-refresh surface gives the seller a manual
        // retry path; we don't want to surface a toast every focus.
      });
    }, []),
  );

  const user = session?.user;
  const sellerPermit = user ? sellerPermits[user.id] : undefined;
  const sellerOrders = useMemo(
    () => (user ? getOrdersForUser(user.id, "seller") : orders),
    [user, orders, getOrdersForUser],
  );
  const sellerProducts = useMemo(
    () => (user ? getProductsForSeller(user.id) : products),
    [user, products, getProductsForSeller],
  );
  const sellerNotifications = useMemo(
    () => (user ? getNotificationsForUser(user.id) : notifications),
    [user, notifications, getNotificationsForUser],
  );

  // ---- Derived KPIs --------------------------------------------------
  const totalOrders = sellerOrders.length;
  const pendingOrders = sellerOrders.filter(
    (o) => o.status === "pending" || o.status === "accepted",
  ).length;
  const availableStock = sellerProducts.reduce((sum, p) => sum + p.stock, 0);
  const todaysSales = sellerOrders
    .filter((o) => {
      if (o.status !== "delivered") return false;
      const today = new Date().toISOString().slice(0, 10);
      return o.updatedAt.slice(0, 10) === today;
    })
    .reduce((sum, o) => sum + o.total, 0);

  const recentOrders = sellerOrders.slice(0, 4);
  const recentNotifications = sellerNotifications.slice(0, 3);
  const lowStock: GasProduct[] = sellerProducts
    .filter((p) => p.stock < LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Dashboard" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ---- Welcome banner ---- */}
        <View style={styles.welcome}>
          <Text style={styles.welcomeLine}>
            {greeting}, {user?.fullName?.split(" ")[0] ?? "Seller"} 👋
          </Text>
          <Text style={styles.businessName}>
            Here is what is happening in your shop today.
          </Text>
        </View>

        {/* ---- Permit verification status ---- */}
        <PermitStatusBanner permit={sellerPermit ?? null} emphasis />

        {/* ---- Summary cards ---- */}
        <View style={styles.cardGrid}>
          <SummaryCard
            label="Total Orders"
            value={String(totalOrders)}
            icon="receipt-outline"
            tint={Colors.primary}
            hint="All time"
          />
          <SummaryCard
            label="Pending Orders"
            value={String(pendingOrders)}
            icon="hourglass-outline"
            tint={Colors.warning}
            hint="Awaiting action"
          />
          <SummaryCard
            label="Available Stock"
            value={String(availableStock)}
            icon="cube-outline"
            tint={Colors.accent}
            hint={`Across ${sellerProducts.length} products`}
          />
          <SummaryCard
            label="Today's Sales"
            value={formatCurrency(todaysSales)}
            icon="cash-outline"
            tint={Colors.success}
            hint="Delivered today"
          />
        </View>

        {/* ---- Recent orders ---- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Orders</Text>
          <TouchableOpacity>
            <Text style={styles.linkText}>See all</Text>
          </TouchableOpacity>
        </View>
        {recentOrders.length === 0 ? (
          <Card>
            <EmptyState
              icon="📭"
              title="No orders yet"
              message="When customers place orders they will appear here."
            />
          </Card>
        ) : (
          recentOrders.map((o) => <RecentOrderRow key={o.id} order={o} />)
        )}

        {/* ---- Recent notifications ---- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Notifications</Text>
          <TouchableOpacity>
            <Text style={styles.linkText}>View all</Text>
          </TouchableOpacity>
        </View>
        <Card>
          {recentNotifications.length === 0 ? (
            <EmptyState
              icon="🔔"
              title="All caught up"
              message="You have no new notifications."
            />
          ) : (
            recentNotifications.map((n, idx) => (
              <View key={n.id}>
                <RecentNotificationRow n={n} />
                {idx < recentNotifications.length - 1 ? (
                  <View style={styles.divider} />
                ) : null}
              </View>
            ))
          )}
        </Card>

        {/* ---- Low stock alerts ---- */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Low Stock Alerts</Text>
          <TouchableOpacity>
            <Text style={styles.linkText}>Manage</Text>
          </TouchableOpacity>
        </View>
        {lowStock.length === 0 ? (
          <Card>
            <View style={styles.allGoodRow}>
              <View style={styles.allGoodIcon}>
                <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.allGoodTitle}>All stock levels are healthy</Text>
                <Text style={styles.allGoodMeta}>
                  No products below {LOW_STOCK_THRESHOLD} units.
                </Text>
              </View>
            </View>
          </Card>
        ) : (
          lowStock.slice(0, 5).map((p) => (
            <Card key={p.id} style={styles.alertCard}>
              <View style={styles.alertRow}>
                <View style={styles.alertIcon}>
                  <Ionicons name="warning-outline" size={20} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertTitle}>
                    {p.size} {p.name}
                  </Text>
                  <Text style={styles.alertMeta}>
                    Only {p.stock} units remaining — consider restocking.
                  </Text>
                </View>
                <View style={styles.alertQty}>
                  <Text style={styles.alertQtyText}>{p.stock}</Text>
                  <Text style={styles.alertQtyLabel}>left</Text>
                </View>
              </View>
            </Card>
          ))
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Welcome
  welcome: { marginBottom: Spacing.lg },
  welcomeLine: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  businessName: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Summary cards (2-col grid)
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  summaryCard: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  summaryValue: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  summaryHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  linkText: {
    fontSize: FontSize.sm,
    color: Colors.accent,
    fontWeight: "700",
  },

  // Recent order row
  recentCard: { marginBottom: Spacing.sm },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  recentTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  recentMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Notification row
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  notifTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  notifBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  notifMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },

  // Low stock alert
  alertCard: { marginBottom: Spacing.sm },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  alertTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  alertMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  alertQty: {
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  alertQtyText: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.warning,
  },
  alertQtyLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // All good row
  allGoodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  allGoodIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  allGoodTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  allGoodMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});