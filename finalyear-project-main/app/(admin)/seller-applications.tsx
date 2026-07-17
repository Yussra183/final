/**
 * Admin Dashboard – Seller Applications page.
 *
 * Lists every seller application, supports search, status filter,
 * view details, approve and reject actions. Approved applicants are
 * added to the SELLERS list (mocked in-memory).
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
  SellerApplication,
  SELLER_APPLICATIONS,
  SELLERS,
} from "../../src/store/adminData";

type FilterKey = "all" | "pending" | "approved" | "rejected";

export default function SellerApplicationsPage() {
  const [apps, setApps] = useState<SellerApplication[]>(SELLER_APPLICATIONS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<SellerApplication | null>(null);
  const [approveTarget, setApproveTarget] = useState<SellerApplication | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<SellerApplication | null>(
    null,
  );
  const [rejectionReason, setRejectionReason] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) => {
      const matchQ =
        !q ||
        a.businessName.toLowerCase().includes(q) ||
        a.ownerName.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q);
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
    setRejectionReason("");
  };

  const columns: AdminTableColumn<SellerApplication>[] = [
    {
      key: "business",
      label: "Business",
      flex: 2.2,
      render: (a) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={a.businessName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{a.businessName}</Text>
            <Text style={styles.cellMeta}>{a.license}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "owner",
      label: "Owner",
      flex: 1.6,
      render: (a) => (
        <View>
          <Text style={styles.cellText}>{a.ownerName}</Text>
          <Text style={styles.cellMeta}>{a.phone}</Text>
        </View>
      ),
    },
    {
      key: "location",
      label: "Location",
      flex: 1.4,
      render: (a) => <Text style={styles.cellText}>{a.location}</Text>,
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
      flex: 0.9,
      render: (a) => <ApplicationStatusBadge status={a.status} />,
    },
  ];

  return (
    <AdminLayout
      title="Seller Applications"
      subtitle="Review and approve businesses applying to sell on the platform"
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
          placeholder="Search by business, owner or location"
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
            icon="📋"
            title="No applications found"
            message="Try adjusting your search or filters."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 900 }}>
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

      {/* View Details */}
      {viewTarget ? (
        <AdminModal
          visible
          onClose={() => setViewTarget(null)}
          title={viewTarget.businessName}
          subtitle={`Application #${viewTarget.id}`}
          hideFooter
        >
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <AdminAvatar name={viewTarget.businessName} size={56} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.detailTitle}>{viewTarget.businessName}</Text>
                <Text style={styles.detailMeta}>
                  {viewTarget.ownerName} • {viewTarget.location}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <ApplicationStatusBadge status={viewTarget.status} />
                </View>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <Row label="Owner" value={viewTarget.ownerName} />
              <Row label="Phone" value={viewTarget.phone} />
              <Row label="Email" value={viewTarget.email} />
              <Row label="License" value={viewTarget.license} />
              <Row label="Submitted" value={viewTarget.submittedDate} />
              <Row label="Location" value={viewTarget.location} />
            </View>

            <Text style={styles.subSection}>Documents</Text>
            <View style={styles.docList}>
              {viewTarget.documents.map((d) => (
                <View key={d} style={styles.docItem}>
                  <Text style={styles.docIcon}>📄</Text>
                  <Text style={styles.docName}>{d}</Text>
                  <AdminBadge label="Uploaded" tone="success" />
                </View>
              ))}
            </View>

            {viewTarget.status === "pending" ? (
              <View style={styles.detailActions}>
                <AdminButton
                  label="Approve Application"
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

      {/* Approve confirmation */}
      <AdminModal
        visible={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve Seller Application?"
        subtitle={`${approveTarget?.businessName ?? ""} will join the Sellers list.`}
        onConfirm={handleApprove}
        confirmLabel="Approve"
        confirmVariant="success"
      >
        <Text style={styles.dialogText}>
          The applicant will receive an SMS and email notification. They
          will then be able to log in, manage orders, and accept assigned
          riders.
        </Text>
      </AdminModal>

      {/* Reject confirmation */}
      <AdminModal
        visible={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setRejectionReason("");
        }}
        title="Reject Seller Application?"
        subtitle={`${rejectTarget?.businessName ?? ""} will be notified.`}
        onConfirm={handleReject}
        confirmLabel="Reject"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          The applicant will be notified with a reason. They can resubmit
          after addressing the issues.
        </Text>
        <View style={{ marginTop: Spacing.md }}>
          <Text style={styles.label}>Rejection reason (optional)</Text>
          <View style={styles.textarea}>
            <ScrollView>
              <Text style={styles.textareaPlaceholder}>
                {rejectionReason || "Provide a brief reason…"}
              </Text>
            </ScrollView>
          </View>
        </View>
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
  label: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
  },
  textarea: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    minHeight: 80,
  },
  textareaPlaceholder: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
});