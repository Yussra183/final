/**
 * Admin Dashboard – Riders page.
 *
 * Reads `GET /api/admin/riders`, which returns every user with
 * `role = "rider"` joined against:
 *   • their vehicle profile (type / plate / model / licenseNo)
 *   • their current availability (`available`, from `RiderAvailability`)
 *   • their workload counters — `assignedOrders` is the count of orders
 *     currently in this rider's hands (assigned → in_transit), and
 *     `completedDeliveries` is the lifetime delivered count.
 *
 * Search and the available/offline filter are passed to the backend as
 * query params, so the filtering happens against the database rather
 * than a local copy.
 *
 * The per-rider order list comes from
 * `GET /api/admin/riders/{id}/orders` and is fetched on demand when a
 * row is opened.
 *
 * Read-only: the backend exposes no admin write surface for rider
 * records, so this page reports state rather than changing it.
 *
 * NOTE: the `lat` / `lng` returned for a rider are the coordinates
 * stored on their registration profile — they are NOT a live position.
 * Live rider tracking is a WebSocket stream and isn't persisted in the
 * admin endpoint. When surfaced in the detail panel they are labelled
 * "Last known profile location".
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
import type { AdminOrder, AdminRider } from "../../constants/types";

type FilterKey = "all" | "available" | "offline";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

export default function RidersPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<AdminRider | null>(null);
  const [viewOrders, setViewOrders] = useState<AdminOrder[] | null>(null);

  // Debounce the search so a keystroke doesn't fire a request per letter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Filter chip → backend `available` query param. `undefined` means "any".
  const available =
    filter === "all" ? undefined : filter === "available" ? true : false;

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminRider[]
  >(
    () =>
      AdminApi.riders({
        q: debouncedSearch || undefined,
        available,
      }),
    [debouncedSearch, available],
  );

  const riders = data ?? [];

  // Load the selected rider's orders from the backend on open.
  const openRider = useCallback(async (r: AdminRider) => {
    setViewTarget(r);
    setViewOrders(null);
    try {
      setViewOrders(await AdminApi.riderOrders(r.id));
    } catch {
      setViewOrders([]);
    }
  }, []);

  const availableCount = riders.filter((r) => r.available).length;
  const assignedOrdersTotal = riders.reduce(
    (s, r) => s + (r.assignedOrders ?? 0),
    0,
  );
  const completedDeliveriesTotal = riders.reduce(
    (s, r) => s + (r.completedDeliveries ?? 0),
    0,
  );

  const columns: AdminTableColumn<AdminRider>[] = [
    {
      key: "name",
      label: "Rider",
      flex: 2.0,
      render: (r) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={r.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{r.fullName}</Text>
            <Text style={styles.cellMeta}>{r.email}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "vehicle",
      label: "Vehicle",
      flex: 1.6,
      render: (r) => (
        <View>
          <Text style={styles.cellText}>{r.vehicleType ?? "—"}</Text>
          <Text style={styles.cellMeta}>
            {[r.vehiclePlate, r.vehicleModel].filter(Boolean).join(" • ") || "—"}
          </Text>
        </View>
      ),
    },
    {
      key: "license",
      label: "License No",
      flex: 1.1,
      render: (r) => (
        <Text style={styles.cellText}>{r.licenseNo ?? "—"}</Text>
      ),
    },
    {
      key: "orders",
      label: "Assigned Orders",
      flex: 0.9,
      align: "center",
      render: (r) => (
        <View style={styles.countBubble}>
          <Text style={styles.countText}>{r.assignedOrders}</Text>
        </View>
      ),
    },
    {
      key: "completed",
      label: "Completed",
      flex: 0.9,
      align: "center",
      render: (r) => (
        <View style={styles.countBubble}>
          <Text style={styles.countText}>{r.completedDeliveries}</Text>
        </View>
      ),
    },
    {
      key: "availability",
      label: "Availability",
      flex: 1.1,
      align: "center",
      render: (r) => (
        <AdminBadge
          label={r.available ? "Available" : "Offline"}
          tone={r.available ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "status",
      label: "Account",
      flex: 0.9,
      align: "center",
      render: (r) => (
        <AdminBadge
          label={r.isActive ? "Active" : "Inactive"}
          tone={r.isActive ? "info" : "neutral"}
        />
      ),
    },
  ];

  return (
    <AdminLayout
      title="Riders"
      subtitle="All riders registered in the database"
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
        loadingLabel="Loading riders…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Riders Shown"
            value={riders.length}
            icon="🛵"
            tone="primary"
          />
          <AdminStatTile
            label="Available"
            value={availableCount}
            icon="✅"
            tone="success"
          />
          <AdminStatTile
            label="Assigned Orders"
            value={assignedOrdersTotal}
            icon="📦"
            tone="info"
          />
          <AdminStatTile
            label="Completed Deliveries"
            value={completedDeliveriesTotal}
            icon="🏁"
            tone="accent"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, username, email or plate"
            filters={[
              { key: "all", label: "All" },
              { key: "available", label: "Available" },
              { key: "offline", label: "Offline" },
            ]}
            activeFilter={filter}
            onFilterChange={(k) => setFilter(k as FilterKey)}
          />
          {riders.length === 0 ? (
            <AdminEmptyState
              icon="🛵"
              title="No riders found"
              message={
                search || filter !== "all"
                  ? "No rider in the database matches this search."
                  : "No rider accounts have been registered yet."
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: 900 }}>
                <AdminTable
                  columns={columns}
                  rows={riders}
                  keyExtractor={(r) => r.id}
                  rowActions={(r) => (
                    <View style={styles.actionRow}>
                      <AdminButton
                        label="View"
                        variant="secondary"
                        size="sm"
                        onPress={() => openRider(r)}
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
                  label={viewTarget.available ? "Available" : "Offline"}
                  tone={viewTarget.available ? "success" : "neutral"}
                />
                <AdminBadge
                  label={viewTarget.isActive ? "Active" : "Inactive"}
                  tone={viewTarget.isActive ? "info" : "neutral"}
                />
              </View>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <Row label="Email" value={viewTarget.email} />
            <Row label="Phone" value={viewTarget.phone ?? "—"} />
            <Row label="Registered" value={formatDate(viewTarget.createdAt)} />
            <Row label="Vehicle Type" value={viewTarget.vehicleType ?? "—"} />
            <Row label="Vehicle Plate" value={viewTarget.vehiclePlate ?? "—"} />
            <Row label="Vehicle Model" value={viewTarget.vehicleModel ?? "—"} />
            <Row label="License No" value={viewTarget.licenseNo ?? "—"} />
            <Row
              label="Assigned Sellers"
              value={String(viewTarget.assignedSellers)}
            />
            <Row
              label="Assigned Orders"
              value={String(viewTarget.assignedOrders)}
            />
            <Row
              label="Completed Deliveries"
              value={String(viewTarget.completedDeliveries)}
            />
          </View>

          <Text style={styles.subHeading}>Last known profile location</Text>
          <Text style={styles.cellMeta}>
            {viewTarget.lat != null && viewTarget.lng != null
              ? `lat ${viewTarget.lat.toFixed(4)}, lng ${viewTarget.lng.toFixed(4)}`
              : "No profile coordinates recorded."}
          </Text>

          <Text style={styles.subHeading}>Recent Orders</Text>
          {viewOrders === null ? (
            <Text style={styles.cellMeta}>Loading orders…</Text>
          ) : viewOrders.length === 0 ? (
            <Text style={styles.cellMeta}>
              This rider has no recent orders.
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
                      TZS {Number(o.total ?? 0).toLocaleString("en-US")}
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
  countBubble: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  countText: {
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
