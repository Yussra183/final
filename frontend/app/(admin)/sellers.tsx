/**
 * Admin Dashboard – Sellers page.
 *
 * Reads `GET /api/admin/sellers`, which joins every user with
 * `role = "seller"` against their `seller_profiles` row and their latest
 * permit application. Search and the permit-status filter are passed to
 * the backend as query params, so the filtering happens against the
 * database rather than a local copy.
 *
 * `permitStatus` is null for legacy sellers that predate the permit flow
 * and have no application row — surfaced here as "No application" so we
 * never invent a status that the backend doesn't actually carry.
 *
 * Read-only: the backend exposes no admin write surface for sellers,
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
import type { AdminSeller, PermitStatus } from "../../constants/types";

type FilterKey = "all" | "pending" | "approved" | "rejected";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

const PERMIT_LABEL: Record<PermitStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  under_review: "Under Review",
  approved: "Approved",
  rejected: "Rejected",
};

const PERMIT_TONE: Record<
  PermitStatus,
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  draft: "neutral",
  pending: "warning",
  under_review: "info",
  approved: "success",
  rejected: "danger",
};

export default function SellersPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<AdminSeller | null>(null);

  // Debounce the search so a keystroke doesn't fire a request per letter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const permitStatus =
    filter === "all"
      ? undefined
      : (filter as Exclude<FilterKey, "all">);

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminSeller[]
  >(
    () =>
      AdminApi.sellers({
        q: debouncedSearch || undefined,
        permitStatus,
      }),
    [debouncedSearch, permitStatus],
  );

  const sellers = data ?? [];

  // KPIs are computed off the live dataset so they always reflect what's
  // on screen after the permit-status filter.
  const approvedCount = sellers.filter(
    (s) => s.permitStatus === "approved",
  ).length;
  const pendingCount = sellers.filter(
    (s) => s.permitStatus === "pending" || s.permitStatus === "under_review",
  ).length;
  const rejectedCount = sellers.filter(
    (s) => s.permitStatus === "rejected",
  ).length;

  const columns: AdminTableColumn<AdminSeller>[] = [
    {
      key: "business",
      label: "Business",
      flex: 2.2,
      render: (s) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={s.businessName ?? s.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>
              {s.businessName ?? "Unnamed business"}
            </Text>
            <Text style={styles.cellMeta}>
              {s.fullName} • {s.email}
            </Text>
          </View>
        </View>
      ),
    },
    {
      key: "location",
      label: "Location",
      flex: 1.4,
      render: (s) => (
        <View>
          <Text style={styles.cellText}>{s.address ?? "—"}</Text>
          <Text style={styles.cellMeta}>
            {[s.district, s.region].filter(Boolean).join(", ") || "—"}
          </Text>
        </View>
      ),
    },
    {
      key: "products",
      label: "Products",
      flex: 0.7,
      align: "center",
      render: (s) => (
        <View style={styles.productsBubble}>
          <Text style={styles.productsText}>{s.productCount}</Text>
        </View>
      ),
    },
    {
      key: "joined",
      label: "Registered",
      flex: 1.1,
      render: (s) => (
        <Text style={styles.cellText}>{formatDate(s.createdAt)}</Text>
      ),
    },
    {
      key: "permit",
      label: "Permit",
      flex: 1.1,
      render: (s) => {
        if (!s.permitStatus) {
          return <AdminBadge label="No application" tone="neutral" />;
        }
        return (
          <AdminBadge
            label={PERMIT_LABEL[s.permitStatus]}
            tone={PERMIT_TONE[s.permitStatus]}
          />
        );
      },
    },
  ];

  const filterIsPermit = filter !== "all";

  return (
    <AdminLayout
      title="Sellers"
      subtitle="All sellers operating on the platform"
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
        loadingLabel="Loading sellers…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Sellers Shown"
            value={sellers.length}
            icon="🏪"
            tone="primary"
          />
          <AdminStatTile
            label="Approved"
            value={approvedCount}
            icon="✅"
            tone="success"
          />
          <AdminStatTile
            label="Pending"
            value={pendingCount}
            icon="⏳"
            tone="warning"
          />
          <AdminStatTile
            label="Rejected"
            value={rejectedCount}
            icon="⛔"
            tone="danger"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by business name, owner or email"
            filters={[
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "approved", label: "Approved" },
              { key: "rejected", label: "Rejected" },
            ]}
            activeFilter={filter}
            onFilterChange={(k) => setFilter(k as FilterKey)}
          />
          {sellers.length === 0 ? (
            <AdminEmptyState
              icon="🏪"
              title="No sellers found"
              message={
                search || filterIsPermit
                  ? "No seller in the database matches this search."
                  : "No seller accounts have been registered yet."
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: 900 }}>
                <AdminTable
                  columns={columns}
                  rows={sellers}
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
          title={viewTarget.businessName ?? viewTarget.fullName}
          hideFooter
        >
          <View style={styles.detailHeader}>
            <AdminAvatar
              name={viewTarget.businessName ?? viewTarget.fullName}
              size={64}
            />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.detailTitle}>
                {viewTarget.businessName ?? "Unnamed business"}
              </Text>
              <Text style={styles.detailMeta}>
                Owned by {viewTarget.fullName} • @{viewTarget.username}
              </Text>
              <View style={{ marginTop: 6, flexDirection: "row", gap: 6 }}>
                {viewTarget.permitStatus ? (
                  <AdminBadge
                    label={PERMIT_LABEL[viewTarget.permitStatus]}
                    tone={PERMIT_TONE[viewTarget.permitStatus]}
                  />
                ) : (
                  <AdminBadge label="No application" tone="neutral" />
                )}
                <AdminBadge
                  label={viewTarget.isActive ? "Active" : "Inactive"}
                  tone={viewTarget.isActive ? "success" : "neutral"}
                />
              </View>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <Row label="Email" value={viewTarget.email} />
            <Row label="Phone" value={viewTarget.phone ?? "—"} />
            <Row label="Address" value={viewTarget.address ?? "—"} />
            <Row label="District" value={viewTarget.district ?? "—"} />
            <Row label="Region" value={viewTarget.region ?? "—"} />
            <Row
              label="Coordinates"
              value={
                viewTarget.lat !== null && viewTarget.lng !== null
                  ? `${viewTarget.lat.toFixed(4)}, ${viewTarget.lng.toFixed(4)}`
                  : "—"
              }
            />
            <Row
              label="Rating"
              value={
                viewTarget.rating !== null
                  ? `${viewTarget.rating.toFixed(1)} / 5`
                  : "—"
              }
            />
            <Row
              label="Open Now"
              value={
                viewTarget.openNow === null
                  ? "—"
                  : viewTarget.openNow
                  ? "Yes"
                  : "No"
              }
            />
            <Row
              label="Products"
              value={String(viewTarget.productCount)}
            />
            <Row label="Registered" value={formatDate(viewTarget.createdAt)} />
            <Row
              label="Permit Submitted"
              value={formatDate(viewTarget.permitSubmittedAt)}
            />
            <Row
              label="Permit Reviewed"
              value={formatDate(viewTarget.permitReviewedAt)}
            />
          </View>

          {viewTarget.permitStatus === "rejected" ? (
            <>
              <Text style={styles.subHeading}>Rejection Reason</Text>
              <Text style={styles.rejectionText}>
                {viewTarget.rejectionReason ?? "No reason provided."}
              </Text>
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
  productsBubble: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  productsText: {
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
  rejectionText: {
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
});