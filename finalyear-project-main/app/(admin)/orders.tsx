/**
 * Admin Dashboard – Orders page.
 *
 * Tabbed list of orders grouped by status (Pending, Processing,
 * Delivered, Cancelled). Includes full-text search, view details and
 * resolve-issue actions.
 */
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAvatar,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminModal,
  AdminSearchBar,
  AdminStatTile,
  OrderStatusBadge,
} from "../../src/components/admin";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import {
  AdminOrder,
  OrderStatus,
  ORDERS,
} from "../../src/store/adminData";

const TABS: { key: "all" | OrderStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>(ORDERS);
  const [tab, setTab] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [viewTarget, setViewTarget] = useState<AdminOrder | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchT = tab === "all" || o.status === tab;
      const matchQ =
        !q ||
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.sellerName.toLowerCase().includes(q) ||
        (o.riderName?.toLowerCase().includes(q) ?? false);
      return matchT && matchQ;
    });
  }, [orders, tab, search]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      pending: orders.filter((o) => o.status === "pending").length,
      processing: orders.filter((o) => o.status === "processing").length,
      in_transit: orders.filter((o) => o.status === "in_transit").length,
      delivered: orders.filter((o) => o.status === "delivered").length,
      cancelled: orders.filter((o) => o.status === "cancelled").length,
    }),
    [orders],
  );

  const formatCurrency = (n: number) =>
    `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

  const handleResolve = () => {
    setViewTarget(null);
  };

  return (
    <AdminLayout
      title="Orders"
      subtitle="Track and resolve issues across all orders"
    >
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Orders"
          value={counts.all}
          icon="📦"
          tone="primary"
        />
        <AdminStatTile
          label="Active"
          value={counts.pending + counts.processing + counts.in_transit}
          icon="🛒"
          tone="info"
        />
        <AdminStatTile
          label="Delivered"
          value={counts.delivered}
          icon="✅"
          tone="success"
        />
        <AdminStatTile
          label="Cancelled"
          value={counts.cancelled}
          icon="⛔"
          tone="danger"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const count =
              t.key === "all"
                ? counts.all
                : counts[t.key as keyof typeof counts];
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                activeOpacity={0.85}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {t.label}
                </Text>
                <View
                  style={[
                    styles.tabCount,
                    active && { backgroundColor: "#FFF" },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      active && { color: Colors.admin },
                    ]}
                  >
                    {count as number}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by order ID, customer, seller or rider"
        />

        {filtered.length === 0 ? (
          <AdminEmptyState
            icon="📦"
            title="No orders found"
            message="Try adjusting your search or filter tab."
          />
        ) : (
          <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
            {filtered.map((o) => (
              <TouchableOpacity
                key={o.id}
                activeOpacity={0.85}
                style={styles.orderCard}
                onPress={() => setViewTarget(o)}
              >
                <View style={styles.orderHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderId}>
                      Order #{o.id.slice(-4)} •{" "}
                      <Text style={styles.orderCustomer}>
                        {o.customerName}
                      </Text>
                    </Text>
                    <Text style={styles.orderMeta}>
                      {o.product} × {o.quantity} • {o.sellerName}
                      {o.riderName ? ` • Rider: ${o.riderName}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.orderTotal}>
                      {formatCurrency(o.total)}
                    </Text>
                    <OrderStatusBadge status={o.status} />
                  </View>
                </View>
                <View style={styles.orderFooter}>
                  <Text style={styles.orderDate}>
                    Placed: {o.createdAt}
                  </Text>
                  {o.deliveredAt ? (
                    <Text style={styles.orderDate}>
                      Delivered: {o.deliveredAt}
                    </Text>
                  ) : null}
                  <Text style={styles.orderPayment}>
                    {o.paymentMethod.replace("_", " ")}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </AdminCard>

      {viewTarget ? (
        <AdminModal
          visible
          onClose={() => setViewTarget(null)}
          title={`Order #${viewTarget.id.slice(-4)}`}
          subtitle={viewTarget.customerName}
          hideFooter
        >
          <View style={styles.detailHeader}>
            <AdminAvatar name={viewTarget.customerName} size={56} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.detailTitle}>{viewTarget.customerName}</Text>
              <Text style={styles.detailMeta}>{viewTarget.product} × {viewTarget.quantity}</Text>
              <View style={{ marginTop: 6 }}>
                <OrderStatusBadge status={viewTarget.status} />
              </View>
            </View>
            <Text style={styles.detailTotal}>
              {formatCurrency(viewTarget.total)}
            </Text>
          </View>

          <View style={styles.detailGrid}>
            <Row label="Order ID" value={`#${viewTarget.id}`} />
            <Row label="Seller" value={viewTarget.sellerName} />
            <Row label="Rider" value={viewTarget.riderName ?? "—"} />
            <Row label="Product" value={viewTarget.product} />
            <Row label="Quantity" value={String(viewTarget.quantity)} />
            <Row label="Payment" value={viewTarget.paymentMethod.replace("_", " ")} />
            <Row label="Placed" value={viewTarget.createdAt} />
            {viewTarget.deliveredAt ? (
              <Row label="Delivered" value={viewTarget.deliveredAt} />
            ) : null}
          </View>

          <View style={styles.detailActions}>
            <AdminButton
              label="Mark Resolved"
              variant="primary"
              onPress={handleResolve}
              style={{ flex: 1, marginRight: Spacing.sm }}
            />
            <AdminButton
              label="Contact Support"
              variant="secondary"
              onPress={() => undefined}
              style={{ flex: 1 }}
            />
          </View>
        </AdminModal>
      ) : null}
    </AdminLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  tabsRow: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFF",
  },
  tabCount: {
    marginLeft: 8,
    backgroundColor: Colors.surface,
    paddingHorizontal: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  orderHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  orderId: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  orderCustomer: {
    color: Colors.text,
  },
  orderMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  orderTotal: {
    fontSize: FontSize.md,
    fontWeight: "900",
    color: Colors.primary,
    marginBottom: 4,
  },
  orderFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  orderDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  orderPayment: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "800",
    textTransform: "uppercase",
    marginLeft: "auto",
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  detailTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  detailMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  detailTotal: {
    fontSize: FontSize.xl,
    fontWeight: "900",
    color: Colors.primary,
  },
  detailGrid: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  detailValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: Spacing.md,
  },
  detailActions: {
    flexDirection: "row",
    marginTop: Spacing.lg,
  },
});