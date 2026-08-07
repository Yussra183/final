/**
 * Admin Dashboard – Rider Assignments page.
 *
 * Lists every approved rider and seller so the admin can:
 *   • Assign an unassigned rider to an approved seller.
 *   • Change a rider's seller assignment later.
 *   • Remove the assignment entirely.
 *
 * Backed by:
 *   GET    /api/admin/assignments            — every (seller, rider) row
 *   GET    /api/admin/riders                 — full rider directory
 *   GET    /api/admin/sellers?permitStatus=  — approved sellers only
 *   PUT    /api/admin/riders/{id}/assigned-seller
 *   DELETE /api/admin/riders/{id}/assigned-seller
 *
 * The PUT replaces every prior `seller_riders` row for the rider so the
 * rider ends up assigned to exactly one seller, matching the brief.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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
} from "../../src/components/admin";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AdminApi } from "../../src/api/endpoints";
import { api } from "../../src/api/client";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import { ApiError } from "../../src/api/errors";
import type {
  AdminAssignment,
  AdminRider,
  AdminSeller,
} from "../../constants/types";

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

/**
 * Derive the seller id assigned to a given rider from the latest
 * `assignments` fetch. Returns null when the rider has no assignment.
 */
function assignedSellerIdFor(
  assignments: AdminAssignment[],
  riderId: string,
): string | null {
  const rows = assignments.filter((a) => a.riderId === riderId);
  if (rows.length === 0) return null;
  rows.sort((a, b) => (a.assignedAt < b.assignedAt ? -1 : 1));
  return rows[0].sellerId;
}

export default function RiderAssignmentsPage() {
  const [search, setSearch] = useState("");
  const [riderSearch, setRiderSearch] = useState("");
  const [sellerSearch, setSellerSearch] = useState("");

  const {
    data: allRiders,
    loading: ridersLoading,
    reload: reloadRiders,
  } = useAdminResource<AdminRider[]>(() => AdminApi.riders(), []);

  const {
    data: allSellers,
    loading: sellersLoading,
    reload: reloadSellers,
  } = useAdminResource<AdminSeller[]>(
    () => AdminApi.sellers({ permitStatus: "approved", active: true }),
    [],
  );

  const { data, loading, error, reload, refreshing } = useAdminResource<
    AdminAssignment[]
  >(() => AdminApi.assignments(), []);

  const assignments = data ?? [];

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

  const assignedRiderIds = useMemo(
    () => new Set(assignments.map((a) => a.riderId)),
    [assignments],
  );

  const unassignedRiders = useMemo(() => {
    const q = riderSearch.trim().toLowerCase();
    return (allRiders ?? [])
      .filter((r) => !assignedRiderIds.has(r.id))
      .filter((r) => {
        if (!q) return true;
        return (
          (r.fullName ?? "").toLowerCase().includes(q) ||
          (r.phone ?? "").toLowerCase().includes(q)
        );
      });
  }, [allRiders, assignedRiderIds, riderSearch]);

  const sellersForPicker = useMemo(() => {
    const q = sellerSearch.trim().toLowerCase();
    return (allSellers ?? []).filter((s) => {
      if (!q) return true;
      return (
        (s.businessName ?? "").toLowerCase().includes(q) ||
        (s.fullName ?? "").toLowerCase().includes(q)
      );
    });
  }, [allSellers, sellerSearch]);

  // ---- Assignment mutations --------------------------------------------
  const [assignTarget, setAssignTarget] = useState<AdminRider | null>(null);
  const [pickSellerId, setPickSellerId] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [changeTarget, setChangeTarget] = useState<{
    rider: AdminRider;
    currentSellerId: string;
  } | null>(null);
  const [pickChangeSellerId, setPickChangeSellerId] = useState<string | null>(
    null,
  );
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<AdminRider | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const openAssignFor = useCallback((rider: AdminRider) => {
    setAssignTarget(rider);
    setPickSellerId(null);
    setAssignError(null);
  }, []);

  const closeAssign = useCallback(() => {
    if (assignBusy) return;
    setAssignTarget(null);
    setPickSellerId(null);
    setAssignError(null);
  }, [assignBusy]);

  const submitAssign = useCallback(async () => {
    if (!assignTarget || !pickSellerId) {
      setAssignError("Please choose a seller to assign.");
      return;
    }
    setAssignBusy(true);
    setAssignError(null);
    try {
      await api.put(
        `/api/admin/riders/${encodeURIComponent(assignTarget.id)}/assigned-seller`,
        { sellerId: Number(pickSellerId) },
      );
      setAssignTarget(null);
      setPickSellerId(null);
      await reload();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ?? "Could not assign rider.";
      setAssignError(message);
    } finally {
      setAssignBusy(false);
    }
  }, [assignTarget, pickSellerId, reload]);

  const openChangeFor = useCallback(
    (rider: AdminRider) => {
      const current = assignedSellerIdFor(assignments, rider.id);
      if (!current) return;
      setChangeTarget({ rider, currentSellerId: current });
      setPickChangeSellerId(null);
      setChangeError(null);
    },
    [assignments],
  );

  const closeChange = useCallback(() => {
    if (changeBusy) return;
    setChangeTarget(null);
    setPickChangeSellerId(null);
    setChangeError(null);
  }, [changeBusy]);

  const submitChange = useCallback(async () => {
    if (!changeTarget || !pickChangeSellerId) {
      setChangeError("Please choose the new seller.");
      return;
    }
    if (pickChangeSellerId === changeTarget.currentSellerId) {
      setChangeError("Pick a different seller to change the assignment.");
      return;
    }
    setChangeBusy(true);
    setChangeError(null);
    try {
      await api.put(
        `/api/admin/riders/${encodeURIComponent(changeTarget.rider.id)}/assigned-seller`,
        { sellerId: Number(pickChangeSellerId) },
      );
      setChangeTarget(null);
      setPickChangeSellerId(null);
      await reload();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ?? "Could not change assignment.";
      setChangeError(message);
    } finally {
      setChangeBusy(false);
    }
  }, [changeTarget, pickChangeSellerId, reload]);

  const openRemoveFor = useCallback((rider: AdminRider) => {
    setRemoveTarget(rider);
    setRemoveError(null);
  }, []);

  const closeRemove = useCallback(() => {
    if (removeBusy) return;
    setRemoveTarget(null);
    setRemoveError(null);
  }, [removeBusy]);

  const submitRemove = useCallback(async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await api.delete(
        `/api/admin/riders/${encodeURIComponent(removeTarget.id)}/assigned-seller`,
      );
      setRemoveTarget(null);
      await reload();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ?? "Could not remove assignment.";
      setRemoveError(message);
    } finally {
      setRemoveBusy(false);
    }
  }, [removeTarget, reload]);

  // Eagerly hydrate the rider / seller lists so the assignment UI has
  // data the first time the admin lands on this screen.
  useEffect(() => {
    reloadRiders();
    reloadSellers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([reload(), reloadRiders(), reloadSellers()]);
  }, [reload, reloadRiders, reloadSellers]);

  return (
    <AdminLayout
      title="Rider Assignments"
      subtitle="Assign approved riders to approved sellers"
      rightActions={
        <AdminButton
          label="Refresh"
          icon="↻"
          variant="secondary"
          onPress={refreshAll}
          loading={refreshing}
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshAll}
        />
      }
    >
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
          <AdminStatTile
            label="Riders Unassigned"
            value={unassignedRiders.length}
            icon="🪪"
            tone="warning"
          />
        </View>

        <AdminCard style={{ marginTop: Spacing.lg }}>
          <Text style={styles.cardTitle}>Current Assignments</Text>
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
                    {g.pairings.map((p) => {
                      const rider: AdminRider = {
                        id: p.riderId,
                        fullName: p.riderName ?? `Rider #${p.riderId}`,
                        username: "",
                        email: "",
                        phone: null,
                        isActive: true,
                        createdAt: p.assignedAt ?? new Date().toISOString(),
                        vehicleType: null,
                        vehiclePlate: null,
                        vehicleModel: null,
                        licenseNo: null,
                        available: p.riderAvailable,
                        lat: null,
                        lng: null,
                        assignedOrders: 0,
                        completedDeliveries: 0,
                        assignedSellers: 0,
                      };
                      return (
                        <View
                          key={`${p.sellerId}-${p.riderId}`}
                          style={styles.riderRow}
                        >
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
                          <View style={styles.rowActions}>
                            <AdminButton
                              label="Change"
                              icon="✎"
                              variant="secondary"
                              onPress={() => openChangeFor(rider)}
                            />
                            <AdminButton
                              label="Remove"
                              icon="✕"
                              variant="danger"
                              onPress={() => openRemoveFor(rider)}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </AdminCard>

        {/* Unassigned approved riders — admin can assign each from here. */}
        <AdminCard style={{ marginTop: Spacing.lg }}>
          <Text style={styles.cardTitle}>Unassigned Approved Riders</Text>
          <AdminSearchBar
            value={riderSearch}
            onChange={setRiderSearch}
            placeholder="Search unassigned riders by name or phone"
          />
          {ridersLoading ? (
            <AdminEmptyState
              icon="⏳"
              title="Loading riders…"
              message="Fetching the latest approved rider list."
            />
          ) : unassignedRiders.length === 0 ? (
            <AdminEmptyState
              icon="✅"
              title="Every approved rider is assigned"
              message="When a new rider is approved they will appear here."
            />
          ) : (
            <View style={styles.unassignedList}>
              {unassignedRiders.map((r) => (
                <View key={r.id} style={styles.unassignedRow}>
                  <AdminAvatar name={r.fullName ?? r.id} size={32} />
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Text style={styles.riderName}>
                      {r.fullName ?? r.id}
                    </Text>
                    {r.phone ? (
                      <Text style={styles.riderMeta}>{r.phone}</Text>
                    ) : null}
                  </View>
                  <AdminButton
                    label="Assign"
                    icon="➕"
                    variant="primary"
                    onPress={() => openAssignFor(r)}
                  />
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

      {/* Assign modal — pick a seller for an unassigned rider. */}
      <AdminModal
        visible={!!assignTarget}
        onClose={closeAssign}
        title="Assign Rider to Seller"
        subtitle={
          assignTarget
            ? `Choose an approved seller for ${assignTarget.fullName ?? assignTarget.id}`
            : undefined
        }
        onConfirm={submitAssign}
        confirmLabel={assignBusy ? "Assigning…" : "Assign"}
        confirmVariant="primary"
      >
        <AdminSearchBar
          value={sellerSearch}
          onChange={setSellerSearch}
          placeholder="Search sellers by business or owner name"
        />
        {sellersLoading ? (
          <Text style={styles.modalMuted}>Loading sellers…</Text>
        ) : sellersForPicker.length === 0 ? (
          <Text style={styles.modalMuted}>
            No approved sellers available — ask the seller to complete their
            permit first.
          </Text>
        ) : (
          <View style={styles.pickerList}>
            {sellersForPicker.map((s) => {
              const selected = pickSellerId === s.id;
              return (
                <AdminButton
                  key={s.id}
                  label={`${s.businessName ?? s.fullName ?? s.id}${selected ? "  ✓" : ""}`}
                  icon="🏪"
                  variant={selected ? "primary" : "secondary"}
                  fullWidth
                  onPress={() => setPickSellerId(s.id)}
                />
              );
            })}
          </View>
        )}
        {assignError ? (
          <Text style={styles.modalError}>{assignError}</Text>
        ) : null}
      </AdminModal>

      {/* Change modal — pick a different seller for an assigned rider. */}
      <AdminModal
        visible={!!changeTarget}
        onClose={closeChange}
        title="Change Seller Assignment"
        subtitle={
          changeTarget
            ? `Pick a new seller for ${changeTarget.rider.fullName ?? changeTarget.rider.id}`
            : undefined
        }
        onConfirm={submitChange}
        confirmLabel={changeBusy ? "Changing…" : "Change"}
        confirmVariant="primary"
      >
        <AdminSearchBar
          value={sellerSearch}
          onChange={setSellerSearch}
          placeholder="Search sellers"
        />
        {sellersForPicker.length === 0 ? (
          <Text style={styles.modalMuted}>No sellers available.</Text>
        ) : (
          <View style={styles.pickerList}>
            {sellersForPicker.map((s) => {
              const selected = pickChangeSellerId === s.id;
              const isCurrent = s.id === changeTarget?.currentSellerId;
              return (
                <AdminButton
                  key={s.id}
                  label={`${s.businessName ?? s.fullName ?? s.id}${isCurrent ? "  (current)" : ""}${selected ? "  ✓" : ""}`}
                  icon="🏪"
                  variant={selected ? "primary" : "secondary"}
                  fullWidth
                  onPress={() => setPickChangeSellerId(s.id)}
                />
              );
            })}
          </View>
        )}
        {changeError ? (
          <Text style={styles.modalError}>{changeError}</Text>
        ) : null}
      </AdminModal>

      {/* Remove modal — confirm before clearing the assignment. */}
      <AdminModal
        visible={!!removeTarget}
        onClose={closeRemove}
        title="Remove Rider Assignment"
        subtitle={
          removeTarget
            ? `Remove the seller assignment for ${removeTarget.fullName ?? removeTarget.id}? The rider will go back to "Not assigned".`
            : undefined
        }
        onConfirm={submitRemove}
        confirmLabel={removeBusy ? "Removing…" : "Remove"}
        confirmVariant="danger"
      >
        {removeError ? (
          <Text style={styles.modalError}>{removeError}</Text>
        ) : null}
      </AdminModal>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
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
    gap: Spacing.sm,
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
  rowActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  unassignedList: {
    gap: Spacing.sm,
  },
  unassignedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerList: {
    gap: Spacing.sm,
  },
  modalMuted: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginVertical: Spacing.sm,
  },
  modalError: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    fontWeight: "700",
  },
});