/**
 * Admin Dashboard – Rider Assignments page.
 *
 * Two-column layout:
 *  • Left: list of approved but unassigned riders with a search field.
 *  • Right: list of active sellers.
 *
 * Admin selects a rider + a seller and clicks "Assign Rider". A new
 * assignment record is created with status `pending_seller_response`.
 * The seller can then accept (rider becomes active under the seller)
 * or reject (rider returns to the unassigned pool).
 *
 * The "Recent Assignments" section lists all assignments by status.
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
  AdminStatTile,
  AssignmentStatusBadge,
} from "../../src/components/admin";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../constants/colors";
import {
  Rider,
  RiderAssignment,
  RIDER_ASSIGNMENTS,
  RIDERS,
  Seller,
  SELLERS,
} from "../../src/store/adminData";

export default function RiderAssignmentsPage() {
  const [riders, setRiders] = useState<Rider[]>(RIDERS);
  const [sellers, setSellers] = useState<Seller[]>(SELLERS);
  const [assignments, setAssignments] =
    useState<RiderAssignment[]>(RIDER_ASSIGNMENTS);

  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [riderSearch, setRiderSearch] = useState("");
  const [sellerSearch, setSellerSearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDetail, setShowDetail] = useState<RiderAssignment | null>(null);

  const unassignedRiders = useMemo(
    () =>
      riders.filter(
        (r) =>
          r.approvalStatus === "approved" &&
          !r.assignedSellerId &&
          (riderSearch.trim() === "" ||
            r.fullName.toLowerCase().includes(riderSearch.toLowerCase()) ||
            r.vehiclePlate.toLowerCase().includes(riderSearch.toLowerCase())),
      ),
    [riders, riderSearch],
  );

  const activeSellers = useMemo(
    () =>
      sellers.filter(
        (s) =>
          s.status === "active" &&
          (sellerSearch.trim() === "" ||
            s.businessName
              .toLowerCase()
              .includes(sellerSearch.toLowerCase()) ||
            s.ownerName.toLowerCase().includes(sellerSearch.toLowerCase())),
      ),
    [sellers, sellerSearch],
  );

  const counts = useMemo(
    () => ({
      unassigned: unassignedRiders.length,
      pending: assignments.filter((a) => a.status === "pending_seller_response")
        .length,
      accepted: assignments.filter((a) => a.status === "accepted").length,
      rejected: assignments.filter((a) => a.status === "rejected").length,
    }),
    [unassignedRiders, assignments],
  );

  const handleAssign = () => {
    if (!selectedRider || !selectedSeller) return;
    const newAssignment: RiderAssignment = {
      id: `asg-${Math.floor(Math.random() * 9000 + 1000)}`,
      riderId: selectedRider.id,
      riderName: selectedRider.fullName,
      sellerId: selectedSeller.id,
      sellerName: selectedSeller.businessName,
      assignedDate: new Date().toISOString().slice(0, 10),
      status: "pending_seller_response",
    };
    setAssignments((prev) => [newAssignment, ...prev]);
    setSelectedRider(null);
    setSelectedSeller(null);
    setShowConfirm(false);
  };

  // Simulate seller responses for demo purposes
  const simulateSellerResponse = (
    a: RiderAssignment,
    response: "accepted" | "rejected",
  ) => {
    setAssignments((prev) =>
      prev.map((x) =>
        x.id === a.id
          ? { ...x, status: response, respondedDate: new Date().toISOString().slice(0, 10) }
          : x,
      ),
    );
    if (response === "accepted") {
      setRiders((prev) =>
        prev.map((r) =>
          r.id === a.riderId
            ? {
                ...r,
                assignedSellerId: a.sellerId,
                assignedSellerName: a.sellerName,
              }
            : r,
        ),
      );
    }
    setShowDetail(null);
  };

  return (
    <AdminLayout
      title="Rider Assignments"
      subtitle="Pair approved riders with active sellers"
      rightActions={
        <AdminButton
          icon="＋"
          label="Assign Rider"
          onPress={() => setShowConfirm(true)}
          disabled={!selectedRider || !selectedSeller}
        />
      }
    >
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Unassigned Riders"
          value={counts.unassigned}
          icon="🛵"
          tone="warning"
        />
        <AdminStatTile
          label="Pending Seller"
          value={counts.pending}
          icon="⏳"
          tone="info"
        />
        <AdminStatTile
          label="Accepted"
          value={counts.accepted}
          icon="✅"
          tone="success"
        />
        <AdminStatTile
          label="Rejected"
          value={counts.rejected}
          icon="✕"
          tone="danger"
        />
      </View>

      <View style={styles.assignRow}>
        {/* Riders column */}
        <AdminCard style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            Approved Riders{" "}
            <Text style={styles.cardCount}>
              ({unassignedRiders.length})
            </Text>
          </Text>
          <Text style={styles.cardSub}>
            Select a rider to assign to a seller
          </Text>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={styles.searchInputWrap}>
                <Text style={styles.searchInput}>
                  {riderSearch || "Search rider…"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <View style={styles.list}>
            {unassignedRiders.length === 0 ? (
              <AdminEmptyState
                icon="🛵"
                title="No unassigned riders"
                message="All approved riders are currently assigned."
              />
            ) : (
              unassignedRiders.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedRider(r)}
                  style={[
                    styles.listItem,
                    selectedRider?.id === r.id && styles.listItemActive,
                  ]}
                >
                  <AdminAvatar name={r.fullName} size={42} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <Text style={styles.listTitle}>{r.fullName}</Text>
                    <Text style={styles.listMeta}>
                      {r.vehicleType} • {r.vehiclePlate}
                    </Text>
                  </View>
                  {selectedRider?.id === r.id ? (
                    <View style={styles.tickBadge}>
                      <Text style={styles.tickBadgeText}>✓</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </View>
        </AdminCard>

        {/* Sellers column */}
        <AdminCard style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            Active Sellers{" "}
            <Text style={styles.cardCount}>({activeSellers.length})</Text>
          </Text>
          <Text style={styles.cardSub}>
            Select a seller to receive the rider
          </Text>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={styles.searchInputWrap}>
                <Text style={styles.searchInput}>
                  {sellerSearch || "Search seller…"}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <View style={styles.list}>
            {activeSellers.length === 0 ? (
              <AdminEmptyState
                icon="🏪"
                title="No active sellers"
                message="Add or activate a seller first."
              />
            ) : (
              activeSellers.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedSeller(s)}
                  style={[
                    styles.listItem,
                    selectedSeller?.id === s.id && styles.listItemActive,
                  ]}
                >
                  <AdminAvatar name={s.businessName} size={42} />
                  <View style={{ flex: 1, marginLeft: Spacing.md }}>
                    <Text style={styles.listTitle}>{s.businessName}</Text>
                    <Text style={styles.listMeta}>
                      {s.ownerName} • {s.location}
                    </Text>
                  </View>
                  {selectedSeller?.id === s.id ? (
                    <View style={styles.tickBadge}>
                      <Text style={styles.tickBadgeText}>✓</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </View>
        </AdminCard>
      </View>

      {/* Selection summary */}
      {(selectedRider || selectedSeller) && (
        <AdminCard style={{ marginTop: Spacing.lg, backgroundColor: Colors.surfaceMuted }}>
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Rider</Text>
              <Text style={styles.summaryValue}>
                {selectedRider?.fullName ?? "Not selected"}
              </Text>
            </View>
            <Text style={styles.summaryArrow}>→</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryLabel}>Seller</Text>
              <Text style={styles.summaryValue}>
                {selectedSeller?.businessName ?? "Not selected"}
              </Text>
            </View>
            <AdminButton
              icon="✓"
              label="Assign Rider"
              onPress={() => setShowConfirm(true)}
              disabled={!selectedRider || !selectedSeller}
            />
          </View>
        </AdminCard>
      )}

      {/* Recent Assignments */}
      <AdminCard style={{ marginTop: Spacing.lg }}>
        <Text style={styles.cardTitle}>Recent Assignments</Text>
        <Text style={styles.cardSub}>
          Status of all current rider–seller pairings
        </Text>
        <View style={{ marginTop: Spacing.md, gap: Spacing.sm }}>
          {assignments.length === 0 ? (
            <AdminEmptyState
              icon="📋"
              title="No assignments yet"
              message="Assign a rider to a seller to get started."
            />
          ) : (
            assignments.map((a) => (
              <TouchableOpacity
                key={a.id}
                activeOpacity={0.85}
                style={styles.assignmentRow}
                onPress={() => setShowDetail(a)}
              >
                <View style={styles.assignmentAvatars}>
                  <View style={styles.avatarLeft}>
                    <AdminAvatar name={a.riderName} size={36} />
                  </View>
                  <View style={styles.avatarRight}>
                    <AdminAvatar name={a.sellerName} size={36} />
                  </View>
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.assignmentTitle}>
                    {a.riderName} → {a.sellerName}
                  </Text>
                  <Text style={styles.assignmentMeta}>
                    Assigned {a.assignedDate}
                    {a.respondedDate ? ` • Responded ${a.respondedDate}` : ""}
                  </Text>
                </View>
                <AssignmentStatusBadge status={a.status} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </AdminCard>

      {/* Confirm modal */}
      <AdminModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Assign Rider?"
        subtitle={`${selectedRider?.fullName ?? ""} → ${selectedSeller?.businessName ?? ""}`}
        onConfirm={handleAssign}
        confirmLabel="Send Invitation"
        confirmVariant="primary"
      >
        <Text style={styles.dialogText}>
          The seller will receive a notification with the rider's details.
          The rider becomes active under the seller only after the seller
          accepts the assignment.
        </Text>
      </AdminModal>

      {/* Detail modal */}
      {showDetail ? (
        <AdminModal
          visible
          onClose={() => setShowDetail(null)}
          title="Assignment Details"
          subtitle={`#${showDetail.id}`}
          hideFooter
        >
          <View style={styles.detailRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>Rider</Text>
              <View style={styles.detailEntity}>
                <AdminAvatar name={showDetail.riderName} size={36} />
                <Text style={styles.detailEntityText}>
                  {showDetail.riderName}
                </Text>
              </View>
            </View>
            <Text style={styles.arrow}>→</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailLabel}>Seller</Text>
              <View style={styles.detailEntity}>
                <AdminAvatar name={showDetail.sellerName} size={36} />
                <Text style={styles.detailEntityText}>
                  {showDetail.sellerName}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ marginTop: Spacing.md, gap: 6 }}>
            <Row label="Assigned Date" value={showDetail.assignedDate} />
            <Row
              label="Responded Date"
              value={showDetail.respondedDate ?? "Pending"}
            />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <AssignmentStatusBadge status={showDetail.status} />
            </View>
          </View>

          {showDetail.status === "pending_seller_response" ? (
            <View style={{ marginTop: Spacing.lg }}>
              <Text style={styles.simLabel}>
                Simulate seller response (demo)
              </Text>
              <View style={styles.simRow}>
                <AdminButton
                  label="Seller Accepts"
                  variant="success"
                  icon="✓"
                  onPress={() => simulateSellerResponse(showDetail, "accepted")}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <AdminButton
                  label="Seller Rejects"
                  variant="danger"
                  icon="✕"
                  onPress={() => simulateSellerResponse(showDetail, "rejected")}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
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
  assignRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginTop: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  cardCount: {
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  cardSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginVertical: Spacing.md,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInputWrap: {
    flex: 1,
  },
  searchInput: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  list: {
    gap: 8,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  listItemActive: {
    borderColor: Colors.admin,
    backgroundColor: "#E0E7FF",
  },
  listTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  listMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  tickBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.admin,
    alignItems: "center",
    justifyContent: "center",
  },
  tickBadgeText: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  summaryValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 2,
  },
  summaryArrow: {
    fontSize: 22,
    color: Colors.textSecondary,
  },
  assignmentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    ...Shadow.card,
  },
  assignmentAvatars: {
    width: 70,
    height: 36,
    position: "relative",
  },
  avatarLeft: {
    position: "absolute",
    left: 0,
  },
  avatarRight: {
    position: "absolute",
    left: 28,
    borderWidth: 2,
    borderColor: Colors.surfaceMuted,
    borderRadius: 18,
  },
  assignmentTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  assignmentMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  dialogText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
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
  detailEntity: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: Spacing.sm,
  },
  detailEntityText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  arrow: {
    fontSize: 22,
    color: Colors.textSecondary,
    marginHorizontal: Spacing.md,
  },
  simLabel: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  simRow: {
    flexDirection: "row",
  },
});