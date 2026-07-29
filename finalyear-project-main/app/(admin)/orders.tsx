/**
 * Admin Dashboard – Orders page.
 *
 * Reads `GET /api/admin/orders`, which returns every order in the system
 * regardless of which customer, seller or rider it belongs to. The status
 * tabs and the search box are passed to the backend as query params, so
 * filtering runs against the database rather than a local copy.
 *
 * Opening a row fetches `GET /api/admin/orders/{id}`, which returns the
 * canonical `Order` shape including line items and delivery location.
 *
 * Read-only. Order state transitions belong to the customer, seller and
 * rider flows — the admin observes the order book, it doesn't drive it.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAsyncBoundary,
  AdminAvatar,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminModal,
  AdminSearchBar,
  AdminStatTile,
  OrderStatusBadge,
} from "../../src/components/admin";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import {
  ORDER_TIMELINE,
  orderStatusLabel,
  timelineIndexOf,
} from "../../constants/order";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type { AdminOrder, Order, OrderStatus } from "../../constants/types";

/** Tabs mirror the real lifecycle in `constants/order.ts` — no invented states. */
const TABS: { key: "all" | OrderStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "assigned", label: "Assigned" },
  { key: "picked_up", label: "Picked Up" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "rejected", label: "Rejected" },
];

const formatCurrency = (n: number) =>
  `TZS ${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

export default function OrdersPage() {
  const [tab, setTab] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [viewTarget, setViewTarget] = useState<AdminOrder | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  // Debounce the search so a keystroke doesn't fire a request per letter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const status = tab === "all" ? undefined : tab;

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminOrder[]
  >(
    () => AdminApi.orders({ status, q: debouncedSearch || undefined }),
    [status, debouncedSearch],
  );

  const orders = useMemo(() => data ?? [], [data]);

  // These describe the current result set. `/api/admin/stats` on the
  // dashboard is the source of truth for system-wide totals.
  const counts = useMemo(() => {
    const active = orders.filter((o) =>
      ["pending", "accepted", "assigned", "picked_up", "in_transit"].includes(
        o.status,
      ),
    ).length;
    return {
      all: orders.length,
      active,
      delivered: orders.filter((o) => o.status === "delivered").length,
      closed: orders.filter(
        (o) => o.status === "cancelled" || o.status === "rejected",
      ).length,
      revenue: orders
        .filter((o) => o.status === "delivered")
        .reduce((s, o) => s + (o.total ?? 0), 0),
    };
  }, [orders]);

  const openOrder = useCallback(async (o: AdminOrder) => {
    setViewTarget(o);
    setDetail(null);
    try {
      setDetail(await AdminApi.orderById(o.id));
    } catch {
      setDetail(null);
    }
  }, []);

  return (
    <AdminLayout
      title="Orders"
      subtitle="Every order recorded in the database"
      rightActions={
        <AdminButton
          label="Refresh"
          icon="↻"
          variant="secondary"
          onPress={reload}
          loading={refreshing}
        />
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={reload} />
      }
    >
      <AdminAsyncBoundary
        loading={loading}
        error={error}
        onRetry={reload}
        hasData={!!data}
        loadingLabel="Loading orders…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Orders Shown"
            value={counts.all}
            icon="📦"
            tone="primary"
          />
          <AdminStatTile
            label="In Progress"
            value={counts.active}
            icon="🚚"
            tone="info"
          />
          <AdminStatTile
            label="Delivered"
            value={counts.delivered}
            icon="✅"
            tone="success"
          />
          <AdminStatTile
            label="Cancelled / Rejected"
            value={counts.closed}
            icon="⛔"
            tone="danger"
          />
          <AdminStatTile
            label="Revenue (Delivered)"
            value={formatCurrency(counts.revenue)}
            icon="💰"
            tone="accent"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
          >
            {TABS.map((t) => {
              const active = tab === t.key;
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
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by customer, seller, rider or address"
          />

          {orders.length === 0 ? (
            <AdminEmptyState
              icon="📦"
              title="No orders found"
              message={
                search || tab !== "all"
                  ? "No order in the database matches this filter."
                  : "No orders have been placed yet."
              }
            />
          ) : (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              {orders.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  activeOpacity={0.85}
                  style={styles.orderCard}
                  onPress={() => openOrder(o)}
                >
                  <AdminAvatar name={o.customerName} size={44} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <View style={styles.orderTitleRow}>
                      <Text style={styles.orderId}>#{o.id}</Text>
                      <OrderStatusBadge status={o.status} />
                    </View>
                    <Text style={styles.orderCustomer}>{o.customerName}</Text>
                    <Text style={styles.orderMeta}>
                      Seller: {o.sellerName} • Rider:{" "}
                      {o.riderName ?? "Unassigned"}
                    </Text>
                    <Text style={styles.orderMeta} numberOfLines={1}>
                      📍 {o.deliveryAddress}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.orderTotal}>
                      {formatCurrency(o.total)}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {formatDateTime(o.createdAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </AdminCard>
      </AdminAsyncBoundary>

      {viewTarget ? (
        <AdminModal
          visible
          onClose={() => {
            setViewTarget(null);
            setDetail(null);
          }}
          title={`Order #${viewTarget.id}`}
          subtitle={orderStatusLabel(viewTarget.status)}
          hideFooter
        >
          {/* Delivery progress — position on the real lifecycle timeline. */}
          <Text style={styles.subHeading}>Delivery Progress</Text>
          <View style={styles.timeline}>
            {ORDER_TIMELINE.map((step, i) => {
              const reached = i <= timelineIndexOf(viewTarget.status);
              return (
                <View key={step.key} style={styles.timelineStep}>
                  <View
                    style={[styles.timelineDot, reached && styles.timelineDotOn]}
                  />
                  <Text
                    style={[
                      styles.timelineLabel,
                      reached && styles.timelineLabelOn,
                    ]}
                    numberOfLines={1}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
          {viewTarget.status === "cancelled" ||
          viewTarget.status === "rejected" ? (
            <Text style={styles.closedNote}>
              This order was {orderStatusLabel(viewTarget.status).toLowerCase()}
              {viewTarget.rejectReason ? `: ${viewTarget.rejectReason}` : "."}
            </Text>
          ) : null}

          <Text style={styles.subHeading}>Parties</Text>
          <View style={styles.detailGrid}>
            <Row label="Customer" value={viewTarget.customerName} />
            <Row label="Seller" value={viewTarget.sellerName} />
            <Row label="Rider" value={viewTarget.riderName ?? "Unassigned"} />
            <Row label="Phone" value={viewTarget.phone ?? "—"} />
          </View>

          <Text style={styles.subHeading}>Delivery</Text>
          <View style={styles.detailGrid}>
            <Row label="Address" value={viewTarget.deliveryAddress} />
            <Row
              label="Coordinates"
              value={
                viewTarget.deliveryLat != null && viewTarget.deliveryLng != null
                  ? `${viewTarget.deliveryLat.toFixed(5)}, ${viewTarget.deliveryLng.toFixed(5)}`
                  : "Not captured"
              }
            />
            <Row label="Placed" value={formatDateTime(viewTarget.createdAt)} />
            <Row
              label="Last updated"
              value={formatDateTime(viewTarget.updatedAt)}
            />
          </View>

          <Text style={styles.subHeading}>Items</Text>
          {detail === null ? (
            <Text style={styles.orderMeta}>Loading line items…</Text>
          ) : detail.items.length === 0 ? (
            <Text style={styles.orderMeta}>
              No line items recorded for this order.
            </Text>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {detail.items.map((it, i) => (
                <View key={`${it.productId}-${i}`} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.productName}</Text>
                    <Text style={styles.orderMeta}>
                      {it.size} × {it.quantity}
                    </Text>
                  </View>
                  <Text style={styles.itemPrice}>
                    {formatCurrency(it.unitPrice * it.quantity)}
                  </Text>
                </View>
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  {formatCurrency(viewTarget.total)}
                </Text>
              </View>
            </View>
          )}

          {detail?.notes ? (
            <>
              <Text style={styles.subHeading}>Customer Notes</Text>
              <Text style={styles.orderMeta}>{detail.notes}</Text>
            </>
          ) : null}
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
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  tabTextActive: { color: "#FFF" },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  orderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  orderId: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  orderCustomer: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  orderMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
  },
  orderTotal: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.md,
  },
  subHeading: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  timeline: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  timelineStep: {
    alignItems: "center",
    flexGrow: 1,
    minWidth: 74,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 2,
    borderColor: Colors.border,
    marginBottom: 4,
  },
  timelineDotOn: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  timelineLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textMuted,
    textAlign: "center",
  },
  timelineLabelOn: { color: Colors.text },
  closedNote: {
    marginTop: Spacing.md,
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: "700",
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
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  itemName: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  itemPrice: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalLabel: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
  },
});
