/**
 * Admin Dashboard – Customers page.
 *
 * Combines two formerly separate screens into a tabbed page:
 *
 *   Tab 1: "Customers"
 *       The customer directory. Reads `GET /api/admin/customers`, which
 *       joins every user with `role = "customer"` against a grouped
 *       query over `orders` for lifetime order count and spend. Search
 *       and active/inactive filter are passed to the backend as query
 *       params so the database does the work. Read-only: the backend
 *       exposes no admin write surface for user records.
 *
 *   Tab 2: "Orders"
 *       The system-wide order book. Reads `GET /api/admin/orders` and
 *       `GET /api/admin/orders/{id}` for line items. Status is server-
 *       filtered via the existing `OrderStatus` union — no new states.
 *       Read-only: order state transitions belong to the customer,
 *       seller and rider flows.
 *
 * The original `orders.tsx` route is preserved for backward compatibility
 * — it now re-exports this page's OrdersTab.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
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
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminModal,
  AdminSearchBar,
  AdminStatTile,
  AdminTable,
  AdminTabs,
  OrderStatusBadge,
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import {
  ORDER_TIMELINE,
  orderStatusLabel,
  timelineIndexOf,
} from "../../constants/order";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type {
  AdminCustomer,
  AdminOrder,
  Order,
  OrderStatus,
} from "../../constants/types";

type Tab = "customers" | "orders";
type CustomerFilter = "all" | "active" | "inactive";

const ORDER_TABS: { key: "all" | OrderStatus; label: string }[] = [
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

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

export default function CustomersPage() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    params.tab === "orders" ? "orders" : "customers",
  );

  return (
    <AdminLayout
      title="Customers"
      subtitle="Customer accounts and every order recorded in the system"
    >
      <AdminTabs
        tabs={[
          { key: "customers", label: "Customers", icon: "customers" },
          { key: "orders", label: "Orders", icon: "orders" },
        ]}
        active={tab}
        onChange={(k: string) => setTab(k as Tab)}
      />

      {tab === "customers" ? <CustomersTab /> : <OrdersTab />}
    </AdminLayout>
  );
}

/* ===========================================================
 * Tab 1 – Customers directory
 * ========================================================= */
function CustomersTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [viewTarget, setViewTarget] = useState<AdminCustomer | null>(null);
  const [viewOrders, setViewOrders] = useState<AdminOrder[] | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const active =
    filter === "all" ? undefined : filter === "active" ? true : false;

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminCustomer[]
  >(
    () =>
      AdminApi.customers({
        q: debouncedSearch || undefined,
        active,
      }),
    [debouncedSearch, active],
  );

  const customers = data ?? [];

  const openCustomer = useCallback(async (c: AdminCustomer) => {
    setViewTarget(c);
    setViewOrders(null);
    try {
      setViewOrders(await AdminApi.customerOrders(c.id));
    } catch {
      setViewOrders([]);
    }
  }, []);

  const activeCount = customers.filter((c) => c.isActive).length;
  const totalSpend = customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0);

  const columns: AdminTableColumn<AdminCustomer>[] = [
    {
      key: "name",
      label: "Customer",
      flex: 2.2,
      render: (c) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={c.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{c.fullName}</Text>
            <Text style={styles.cellMeta}>{c.email}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      flex: 1.3,
      render: (c) => <Text style={styles.cellText}>{c.phone ?? "—"}</Text>,
    },
    {
      key: "joined",
      label: "Registered",
      flex: 1.2,
      render: (c) => (
        <Text style={styles.cellText}>{formatDate(c.createdAt)}</Text>
      ),
    },
    {
      key: "orders",
      label: "Orders",
      flex: 0.7,
      align: "center",
      render: (c) => (
        <View style={styles.ordersBubble}>
          <Text style={styles.ordersText}>{c.orderCount}</Text>
        </View>
      ),
    },
    {
      key: "spent",
      label: "Total Spent",
      flex: 1.2,
      align: "right",
      render: (c) => (
        <Text
          style={[
            styles.cellText,
            { color: Colors.primary, fontWeight: "800" },
          ]}
        >
          {formatCurrency(c.totalSpent)}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      flex: 0.9,
      render: (c) => (
        <AdminBadge
          label={c.isActive ? "Active" : "Inactive"}
          tone={c.isActive ? "success" : "neutral"}
        />
      ),
    },
  ];

  return (
    <View style={styles.tabBody}>
      <AdminAsyncBoundary
        loading={loading}
        error={error}
        onRetry={reload}
        hasData={!!data}
        loadingLabel="Loading customers…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Customers Shown"
            value={customers.length}
            icon="customers"
            tone="primary"
          />
          <AdminStatTile
            label="Active"
            value={activeCount}
            icon="approve"
            tone="success"
          />
          <AdminStatTile
            label="Inactive"
            value={customers.length - activeCount}
            icon="inactive"
            tone="warning"
          />
          <AdminStatTile
            label="Combined Spend"
            value={formatCurrency(totalSpend)}
            icon="orders"
            tone="accent"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, username, email or phone"
            filters={[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "inactive", label: "Inactive" },
            ]}
            activeFilter={filter}
            onFilterChange={(k) => setFilter(k as CustomerFilter)}
          />
          {customers.length === 0 ? (
            <AdminEmptyState
              icon="customers"
              title="No customers found"
              message={
                search || filter !== "all"
                  ? "No customer in the database matches this search."
                  : "No customer accounts have been registered yet."
              }
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={reload} />
              }
            >
              <View style={{ minWidth: 900 }}>
                <AdminTable
                  columns={columns}
                  rows={customers}
                  keyExtractor={(c) => c.id}
                  rowActions={(c) => (
                    <View style={styles.actionRow}>
                      <AdminButton
                        label="View"
                        variant="secondary"
                        size="sm"
                        onPress={() => openCustomer(c)}
                      />
                    </View>
                  )}
                />
              </View>
            </ScrollView>
          )}
        </AdminCard>
      </AdminAsyncBoundary>

      {viewTarget ? (
        <AdminModal
          visible
          onClose={() => {
            setViewTarget(null);
            setViewOrders(null);
          }}
          title={viewTarget.fullName}
          hideFooter
        >
          <View style={styles.detailHeader}>
            <AdminAvatar name={viewTarget.fullName} size={64} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.detailTitle}>{viewTarget.fullName}</Text>
              <Text style={styles.detailMeta}>@{viewTarget.username}</Text>
              <View style={{ marginTop: 6, flexDirection: "row", gap: 6 }}>
                <AdminBadge
                  label={viewTarget.isActive ? "Active" : "Inactive"}
                  tone={viewTarget.isActive ? "success" : "neutral"}
                />
                <AdminBadge label="Customer" tone="info" />
              </View>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <Row label="Email" value={viewTarget.email} />
            <Row label="Phone" value={viewTarget.phone ?? "—"} />
            <Row label="Registered" value={formatDate(viewTarget.createdAt)} />
            <Row label="Total Orders" value={String(viewTarget.orderCount)} />
            <Row
              label="Total Spent"
              value={formatCurrency(viewTarget.totalSpent)}
            />
          </View>

          <Text style={styles.subHeading}>Recent Orders</Text>
          {viewOrders === null ? (
            <Text style={styles.cellMeta}>Loading orders…</Text>
          ) : viewOrders.length === 0 ? (
            <Text style={styles.cellMeta}>
              This customer has not placed any orders.
            </Text>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {viewOrders.map((o) => (
                <View key={o.id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cellTitle}>#{o.id}</Text>
                    <Text style={styles.cellMeta}>
                      {o.sellerName} • {formatDate(o.createdAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.cellTitle}>
                      {formatCurrency(o.total)}
                    </Text>
                    <Text style={styles.cellMeta}>
                      {orderStatusLabel(o.status)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </AdminModal>
      ) : null}
    </View>
  );
}

/* ===========================================================
 * Tab 2 – Orders
 * ========================================================= */
function OrdersTab() {
  const [tab, setTab] = useState<"all" | OrderStatus>("all");
  const [search, setSearch] = useState("");
  const [viewTarget, setViewTarget] = useState<AdminOrder | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

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
    <View style={styles.tabBody}>
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
            icon="products"
            tone="primary"
          />
          <AdminStatTile
            label="In Progress"
            value={counts.active}
            icon="orders"
            tone="info"
          />
          <AdminStatTile
            label="Delivered"
            value={counts.delivered}
            icon="approve"
            tone="success"
          />
          <AdminStatTile
            label="Cancelled / Rejected"
            value={counts.closed}
            icon="reject"
            tone="danger"
          />
          <AdminStatTile
            label="Revenue (Delivered)"
            value={formatCurrency(counts.revenue)}
            icon="orders"
            tone="accent"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsRow}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={reload} />
            }
          >
            {ORDER_TABS.map((t) => {
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
              icon="products"
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
    </View>
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
  tabBody: { marginTop: Spacing.lg },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  cellRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  cellTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  cellMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  cellText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  ordersBubble: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  ordersText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  actionRow: {
    flexDirection: "row",
    gap: 4,
    justifyContent: "flex-end",
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
  subHeading: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
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
  orderTotal: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.md,
  },
  orderMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "600",
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
