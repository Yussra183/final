/**
 * Admin Dashboard – Rider Assignments page.
 *
 * Reads `GET /api/admin/assignments`, which returns every row of the
 * `seller_riders` join table — i.e. every (seller, rider) pairing the
 * backend currently knows about. Each row carries the seller name and
 * business name, the rider name and availability, and the timestamp of
 * when the pairing was created.
 *
 * The endpoint is read-only — the backend exposes no admin surface to
 * create or delete a pairing. Pairings are managed directly in the
 * database today, so the page displays them and explains why the
 * historical "Assign Rider" / "Simulate seller response" actions have
 * been removed. A short info line below the header makes this visible.
 *
 * Search is performed client-side against the returned array — the
 * endpoint takes no query params and the result set is small.
 */
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAsyncBoundary,
  AdminAvatar,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminSearchBar,
  AdminStatTile,
} from "../../src/components/admin";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AdminApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import type { AdminAssignment } from "../../constants/types";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

/** Group pairings by seller so each card lists the riders for one seller. */
function groupBySeller(rows: AdminAssignment[]) {
  const map = new Map<
    string,
    {
      sellerId: string;
      sellerName: string | null;
      businessName: string | null;
      pairings: AdminAssignment[];
    }
  >();
  for (const a of rows) {
    const key = a.sellerId;
    const existing = map.get(key);
    if (existing) {
      existing.pairings.push(a);
    } else {
      map.set(key, {
        sellerId: a.sellerId,
        sellerName: a.sellerName,
        businessName: a.businessName,
        pairings: [a],
      });
    }
  }
  // Sort sellers by business name (falling back to seller name / id).
  return Array.from(map.values()).sort((x, y) => {
    const ax = (x.businessName ?? x.sellerName ?? x.sellerId).toLowerCase();
    const ay = (y.businessName ?? y.sellerName ?? y.sellerId).toLowerCase();
    return ax.localeCompare(ay);
  });
}

export default function RiderAssignmentsPage() {
  const [search, setSearch] = useState("");

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminAssignment[]
  >(() => AdminApi.assignments(), []);

  const assignments = data ?? [];

  // Client-side search across seller / business / rider names.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => {
      return (
        (a.sellerName ?? "").toLowerCase().includes(q) ||
        (a.businessName ?? "").toLowerCase().includes(q) ||
        (a.riderName ?? "").toLowerCase().includes(q)
      );
    });
  }, [assignments, search]);

  const grouped = useMemo(() => groupBySeller(filtered), [filtered]);

  const riderIdsAssigned = useMemo(
    () => new Set(filtered.map((a) => a.riderId)),
    [filtered],
  );

  return (
    <AdminLayout
      title="Rider Assignments"
      subtitle="Seller ↔ rider pairings from the seller_riders table"
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
      <View style={styles.infoNote}>
        <Text style={styles.infoNoteText}>
          Assignments are managed directly in the database today — this
          screen only displays existing pairings and cannot yet change them.
        </Text>
      </View>

      <AdminAsyncBoundary
        loading={loading}
        error={error}
        onRetry={reload}
        hasData={!!data}
        loadingLabel="Loading assignments…"
      >
        <View style={styles.kpiRow}>
          <AdminStatTile
            label="Total Pairings"
            value={filtered.length}
            icon="🔗"
            tone="primary"
          />
          <AdminStatTile
            label="Sellers With Riders"
            value={grouped.length}
            icon="🏪"
            tone="info"
          />
          <AdminStatTile
            label="Riders Assigned"
            value={riderIdsAssigned.size}
            icon="🛵"
            tone="accent"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <AdminSearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by seller, business or rider name"
          />
          {grouped.length === 0 ? (
            <AdminEmptyState
              icon="🔗"
              title="No assignments found"
              message={
                search
                  ? "No pairing matches this search."
                  : "No seller↔rider pairings have been recorded yet."
              }
            />
          ) : (
            <View style={styles.groupList}>
              {grouped.map((g) => (
                <View key={g.sellerId} style={styles.sellerCard}>
                  <View style={styles.sellerHeader}>
                    <AdminAvatar
                      name={g.businessName ?? g.sellerName ?? g.sellerId}
                      size={40}
                    />
                    <View style={{ flex: 1, marginLeft: Spacing.md }}>
                      <Text style={styles.sellerTitle}>
                        {g.businessName ?? g.sellerName ?? g.sellerId}
                      </Text>
                      {g.businessName && g.sellerName ? (
                        <Text style={styles.sellerMeta}>
                          {g.sellerName}
                        </Text>
                      ) : null}
                      <Text style={styles.sellerMeta}>
                        {g.pairings.length}{" "}
                        {g.pairings.length === 1 ? "rider" : "riders"} assigned
                      </Text>
                    </View>
                  </View>

                  <View style={styles.riderList}>
                    {g.pairings.map((p) => (
                      <View key={`${p.sellerId}-${p.riderId}`} style={styles.riderRow}>
                        <AdminAvatar
                          name={p.riderName ?? p.riderId}
                          size={32}
                        />
                        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                          <Text style={styles.riderName}>
                            {p.riderName ?? p.riderId}
                          </Text>
                          <Text style={styles.riderMeta}>
                            Assigned {formatDate(p.assignedAt)}
                          </Text>
                        </View>
                        <AdminBadge
                          label={p.riderAvailable ? "Available" : "Offline"}
                          tone={p.riderAvailable ? "success" : "neutral"}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </AdminCard>

        {grouped.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 600 }} />
          </ScrollView>
        ) : null}
      </AdminAsyncBoundary>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  infoNote: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoNoteText: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  groupList: {
    gap: Spacing.md,
  },
  sellerCard: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sellerHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sellerTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  sellerMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  riderList: {
    gap: Spacing.sm,
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  riderName: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  riderMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
});
