/**
 * Admin Dashboard – Customers page.
 *
 * Reads `GET /api/admin/customers`, which returns every user with
 * `role = "customer"` joined against a grouped query over `orders` for
 * the lifetime order count and spend. Search and the active/inactive
 * filter are passed to the backend as query params, so the filtering
 * happens against the database rather than a local copy.
 *
 * The per-customer order list comes from
 * `GET /api/admin/customers/{id}/orders` and is fetched on demand when a
 * row is opened.
 *
 * Read-only: the backend exposes no admin write surface for user records,
 * so this page reports state rather than changing it.
 */
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
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
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { orderStatusLabel } from "../../constants/order";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type { AdminCustomer, AdminOrder } from "../../constants/types";

type FilterKey = "all" | "active" | "inactive";

const formatCurrency = (n: number) =>
  `TZS ${Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<AdminCustomer | null>(null);
  const [viewOrders, setViewOrders] = useState<AdminOrder[] | null>(null);

  // Debounce the search so a keystroke doesn't fire a request per letter.
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

  // Load the selected customer's orders from the backend on open.
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
          style={[styles.cellText, { color: Colors.primary, fontWeight: "800" }]}
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
    <AdminLayout
      title="Customers"
      subtitle="All customers registered in the database"
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
        loadingLabel="Loading customers…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Customers Shown"
            value={customers.length}
            icon="👥"
            tone="primary"
          />
          <AdminStatTile
            label="Active"
            value={activeCount}
            icon="✅"
            tone="success"
          />
          <AdminStatTile
            label="Inactive"
            value={customers.length - activeCount}
            icon="💤"
            tone="warning"
          />
          <AdminStatTile
            label="Combined Spend"
            value={formatCurrency(totalSpend)}
            icon="💰"
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
            onFilterChange={(k) => setFilter(k as FilterKey)}
          />
          {customers.length === 0 ? (
            <AdminEmptyState
              icon="👥"
              title="No customers found"
              message={
                search || filter !== "all"
                  ? "No customer in the database matches this search."
                  : "No customer accounts have been registered yet."
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
});
