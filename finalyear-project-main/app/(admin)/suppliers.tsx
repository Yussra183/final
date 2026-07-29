/**
 * Admin Dashboard – Suppliers page.
 *
 * Reads `GET /api/admin/suppliers`, which returns every user with
 * `role = "supplier"`. Search and the active/inactive filter are passed
 * to the backend as query params, so the filtering happens against the
 * database rather than a local copy.
 *
 * Suppliers are simply users with `role = "supplier"` — there is no
 * supplier-profile table in the database. Company name, tax ID, address,
 * routes, vehicles and delivery schedules are therefore NOT available
 * here and are surfaced as a small informational note rather than
 * fabricated from a local mock.
 *
 * Read-only: the backend exposes no admin write surface for user records,
 * so this page reports state rather than changing it.
 */
import React, { useEffect, useState } from "react";
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
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type { AdminUser } from "../../constants/types";

type FilterKey = "all" | "active" | "inactive";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

export default function AdminSuppliersPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<AdminUser | null>(null);

  // Debounce the search so a keystroke doesn't fire a request per letter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const active =
    filter === "all" ? undefined : filter === "active" ? true : false;

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminUser[]
  >(
    () =>
      AdminApi.suppliers({
        q: debouncedSearch || undefined,
        active,
      }),
    [debouncedSearch, active],
  );

  const suppliers = data ?? [];

  const activeCount = suppliers.filter((s) => s.isActive).length;

  const columns: AdminTableColumn<AdminUser>[] = [
    {
      key: "name",
      label: "Supplier",
      flex: 2.4,
      render: (s) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={s.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{s.fullName}</Text>
            <Text style={styles.cellMeta}>
              @{s.username} • {s.email}
            </Text>
          </View>
        </View>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      flex: 1.4,
      render: (s) => <Text style={styles.cellText}>{s.phone ?? "—"}</Text>,
    },
    {
      key: "joined",
      label: "Registered",
      flex: 1.2,
      render: (s) => (
        <Text style={styles.cellText}>{formatDate(s.createdAt)}</Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      flex: 0.9,
      render: (s) => (
        <AdminBadge
          label={s.isActive ? "Active" : "Inactive"}
          tone={s.isActive ? "success" : "neutral"}
        />
      ),
    },
  ];

  return (
    <AdminLayout
      title="Suppliers"
      subtitle="All supplier accounts registered in the database"
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
        loadingLabel="Loading suppliers…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Suppliers Shown"
            value={suppliers.length}
            icon="🏭"
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
            value={suppliers.length - activeCount}
            icon="💤"
            tone="warning"
          />
          <AdminStatTile
            label="Role"
            value="supplier"
            icon="📦"
            tone="info"
          />
        </View>

        <View style={styles.infoNote}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Supplier business details (company name, tax ID, address,
            vehicles) and delivery schedules are not yet stored in the
            backend — only user-level fields are available here.
          </Text>
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
          {suppliers.length === 0 ? (
            <AdminEmptyState
              icon="🏭"
              title="No suppliers found"
              message={
                search || filter !== "all"
                  ? "No supplier in the database matches this search."
                  : "No supplier accounts have been registered yet."
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: 900 }}>
                <AdminTable
                  columns={columns}
                  rows={suppliers}
                  keyExtractor={(s) => s.id}
                  rowActions={(s) => (
                    <View style={styles.actionRow}>
                      <AdminButton
                        label="View"
                        variant="secondary"
                        size="sm"
                        onPress={() => setViewTarget(s)}
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
          onClose={() => setViewTarget(null)}
          title={viewTarget.fullName}
          hideFooter
        >
          <View style={styles.detailHeader}>
            <AdminAvatar name={viewTarget.fullName} size={64} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.detailTitle}>{viewTarget.fullName}</Text>
              <Text style={styles.detailMeta}>
                @{viewTarget.username} • Supplier
              </Text>
              <View style={{ marginTop: 6, flexDirection: "row", gap: 6 }}>
                <AdminBadge
                  label={viewTarget.isActive ? "Active" : "Inactive"}
                  tone={viewTarget.isActive ? "success" : "neutral"}
                />
                <AdminBadge label="Supplier" tone="info" />
              </View>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <Row label="Email" value={viewTarget.email} />
            <Row label="Phone" value={viewTarget.phone ?? "—"} />
            <Row label="Role" value={viewTarget.role} />
            <Row label="Registered" value={formatDate(viewTarget.createdAt)} />
            <Row label="Last Updated" value={formatDate(viewTarget.updatedAt)} />
          </View>

          <Text style={styles.subHeading}>Note</Text>
          <Text style={styles.detailNote}>
            Supplier business details (company name, tax ID, address,
            vehicles, delivery schedules) are not yet stored in the
            backend.
          </Text>
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
  infoNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.lg,
  },
  infoIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
    lineHeight: 18,
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
  detailNote: {
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
    lineHeight: 18,
  },
});