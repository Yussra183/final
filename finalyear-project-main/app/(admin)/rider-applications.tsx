/**
 * Admin Dashboard – Rider Applications page.
 *
 * Lists all rider applications with full details (full name, phone,
 * driving license, national ID, vehicle information, submitted date),
 * with search, status filter, view, approve, and reject actions.
 */
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
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
  AdminTable,
  ApplicationStatusBadge,
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import {
  RIDER_APPLICATIONS,
  RiderApplication,
} from "../../src/store/adminData";

type FilterKey = "all" | "pending" | "approved" | "rejected";

export default function RiderApplicationsPage() {
  const [apps, setApps] = useState<RiderApplication[]>(RIDER_APPLICATIONS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<RiderApplication | null>(null);
  const [approveTarget, setApproveTarget] = useState<RiderApplication | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<RiderApplication | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) => {
      const matchQ =
        !q ||
        a.fullName.toLowerCase().includes(q) ||
        a.phone.includes(q) ||
        a.vehiclePlate.toLowerCase().includes(q);
      const matchF = filter === "all" || a.status === filter;
      return matchQ && matchF;
    });
  }, [apps, search, filter]);

  const counts = useMemo(
    () => ({
      all: apps.length,
      pending: apps.filter((a) => a.status === "pending").length,
      approved: apps.filter((a) => a.status === "approved").length,
      rejected: apps.filter((a) => a.status === "rejected").length,
    }),
    [apps],
  );

  const handleApprove = () => {
    if (!approveTarget) return;
    setApps((prev) =>
      prev.map((a) =>
        a.id === approveTarget.id ? { ...a, status: "approved" } : a,
      ),
    );
    setApproveTarget(null);
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    setApps((prev) =>
      prev.map((a) =>
        a.id === rejectTarget.id ? { ...a, status: "rejected" } : a,
      ),
    );
    setRejectTarget(null);
  };

  const columns: AdminTableColumn<RiderApplication>[] = [
    {
      key: "name",
      label: "Full Name",
      flex: 2.2,
      render: (a) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={a.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{a.fullName}</Text>
            <Text style={styles.cellMeta}>{a.phone}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "license",
      label: "Driving License",
      flex: 1.4,
      render: (a) => <Text style={styles.cellText}>{a.drivingLicense}</Text>,
    },
    {
      key: "national",
      label: "National ID",
      flex: 1.2,
      render: (a) => <Text style={styles.cellText}>{a.nationalId}</Text>,
    },
    {
      key: "vehicle",
      label: "Vehicle",
      flex: 1.6,
      render: (a) => (
        <View>
          <Text style={styles.cellText}>{a.vehicleType}</Text>
          <Text style={styles.cellMeta}>{a.vehiclePlate}</Text>
        </View>
      ),
    },
    {
      key: "submitted",
      label: "Submitted",
      flex: 0.9,
      render: (a) => (
        <Text style={[styles.cellText, { color: Colors.textSecondary }]}>
          {a.submittedDate}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      flex: 0.8,
      render: (a) => <ApplicationStatusBadge status={a.status} />,
    },
  ];

  return (
    <AdminLayout
      title="Rider Applications"
      subtitle="Review and approve riders applying to deliver on the platform"
    >
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Applications"
          value={counts.all}
          icon="📋"
          tone="info"
        />
        <AdminStatTile
          label="Pending"
          value={counts.pending}
          icon="⏳"
          tone="warning"
        />
        <AdminStatTile
          label="Approved"
          value={counts.approved}
          icon="✅"
          tone="success"
        />
        <AdminStatTile
          label="Rejected"
          value={counts.rejected}
          icon="⛔"
          tone="danger"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name, phone or vehicle plate"
          filters={[
            { key: "all", label: "All", count: counts.all },
            { key: "pending", label: "Pending", count: counts.pending },
            { key: "approved", label: "Approved", count: counts.approved },
            { key: "rejected", label: "Rejected", count: counts.rejected },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as FilterKey)}
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            icon="🛵"
            title="No applications match"
            message="Try clearing your filters or check back later."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 1000 }}>
              <AdminTable
                columns={columns}
                rows={filtered}
                keyExtractor={(a) => a.id}
                rowActions={(a) => (
                  <View style={styles.actionRow}>
                    <AdminButton
                      label="View"
                      variant="secondary"
                      size="sm"
                      onPress={() => setViewTarget(a)}
                    />
                    {a.status === "pending" ? (
                      <>
                        <AdminButton
                          label="Approve"
                          variant="success"
                          size="sm"
                          icon="✓"
                          onPress={() => setApproveTarget(a)}
                        />
                        <AdminButton
                          label="Reject"
                          variant="danger"
                          size="sm"
                          icon="✕"
                          onPress={() => setRejectTarget(a)}
                        />
                      </>
                    ) : (
                      <AdminButton
                        label={
                          a.status === "approved" ? "Approved" : "Rejected"
                        }
                        variant="ghost"
                        size="sm"
                        disabled
                      />
                    )}
                  </View>
                )}
              />
            </View>
          </ScrollView>
        )}
      </AdminCard>

      {/* View details */}
      {viewTarget ? (
        <AdminModal
          visible
          onClose={() => setViewTarget(null)}
          title={viewTarget.fullName}
          subtitle={`Application #${viewTarget.id}`}
          hideFooter
        >
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <AdminAvatar name={viewTarget.fullName} size={64} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.detailTitle}>{viewTarget.fullName}</Text>
                <Text style={styles.detailMeta}>
                  {viewTarget.vehicleType} • {viewTarget.vehiclePlate}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <ApplicationStatusBadge status={viewTarget.status} />
                </View>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <Row label="Phone" value={viewTarget.phone} />
              <Row label="Email" value={viewTarget.email} />
              <Row label="Driving License" value={viewTarget.drivingLicense} />
              <Row label="National ID" value={viewTarget.nationalId} />
              <Row label="Vehicle Type" value={viewTarget.vehicleType} />
              <Row label="Plate Number" value={viewTarget.vehiclePlate} />
              <Row label="Submitted" value={viewTarget.submittedDate} />
            </View>

            <Text style={styles.subSection}>Verifications</Text>
            <View style={styles.docList}>
              <DocRow label="Driving License" status="Verified" />
              <DocRow label="National ID Copy" status="Verified" />
              <DocRow label="Vehicle Registration" status="Pending" />
              <DocRow label="Background Check" status="Pending" />
            </View>

            {viewTarget.status === "pending" ? (
              <View style={styles.detailActions}>
                <AdminButton
                  label="Approve"
                  variant="success"
                  icon="✓"
                  onPress={() => {
                    setApproveTarget(viewTarget);
                    setViewTarget(null);
                  }}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <AdminButton
                  label="Reject"
                  variant="danger"
                  icon="✕"
                  onPress={() => {
                    setRejectTarget(viewTarget);
                    setViewTarget(null);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            ) : null}
          </ScrollView>
        </AdminModal>
      ) : null}

      <AdminModal
        visible={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve Rider Application?"
        subtitle={`${approveTarget?.fullName ?? ""} will join the Riders list.`}
        onConfirm={handleApprove}
        confirmLabel="Approve"
        confirmVariant="success"
      >
        <Text style={styles.dialogText}>
          Approved riders become available for assignment to sellers via
          the Rider Assignments page.
        </Text>
      </AdminModal>

      <AdminModal
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject Rider Application?"
        subtitle={`${rejectTarget?.fullName ?? ""} will be notified.`}
        onConfirm={handleReject}
        confirmLabel="Reject"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          The applicant will receive an SMS with the rejection reason and
          may reapply after 30 days.
        </Text>
      </AdminModal>
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

function DocRow({
  label,
  status,
}: {
  label: string;
  status: "Verified" | "Pending";
}) {
  return (
    <View style={styles.docItem}>
      <Text style={styles.docIcon}>📄</Text>
      <Text style={styles.docName}>{label}</Text>
      <AdminBadge
        label={status}
        tone={status === "Verified" ? "success" : "warning"}
      />
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
  subSection: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  docList: {
    gap: 6,
  },
  docItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  docIcon: {
    fontSize: 18,
  },
  docName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
  },
  detailActions: {
    flexDirection: "row",
    marginTop: Spacing.lg,
  },
  dialogText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
});