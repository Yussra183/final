/**
 * Admin Dashboard – Seller Applications page.
 *
 * Lists every seller application, supports search, status filter, view
 * details (with document previews), and approve/reject actions. Backed
 * by the live API (`/api/admin/permits`) through {@link useStore}.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { useStore } from "../../src/store/StoreContext";
import { DocumentPreviewModal } from "../../src/components/DocumentPreviewModal";
import { PermitsApi } from "../../src/api/endpoints";
import type {
  PermitDocument,
  PermitStatus,
  SellerPermit,
} from "../../constants/types";

type FilterKey = "all" | "pending" | "approved" | "rejected" | "under_review";

export default function SellerApplicationsPage() {
  const store = useStore();

  // ---- Live state ----------------------------------------------------
  const [permits, setPermits] = useState<SellerPermit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- Shared UI state ------------------------------------------------
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<SellerPermit | null>(null);
  const [viewDocs, setViewDocs] = useState<PermitDocument[] | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PermitDocument | null>(null);
  /**
   * Permit preview state — used by the View modal when the admin opens
   * the regenerated Gas Selling Permit PDF. Distinct from `previewDoc`
   * (which carries a `PermitDocument` row from the documents listing)
   * because the new admin license endpoint returns raw bytes, not a
   * `PermitDocument` record. `null` means the preview is closed.
   */
  const [permitPreview, setPermitPreview] = useState<
    { url: string; filename: string } | null
  >(null);
  const [approveTarget, setApproveTarget] = useState<SellerPermit | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SellerPermit | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Fetch the admin queue on mount + whenever the seller permit slice
  // mutates (admin approves a permit → re-pull so the row updates).
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await store.fetchAdminPermits();
      setPermits(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error)?.message ?? "Couldn't load applications.");
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return permits.filter((a) => {
      const matchQ =
        !q ||
        a.businessName.toLowerCase().includes(q) ||
        a.sellerName.toLowerCase().includes(q);
      const matchF = filter === "all" || a.status === filter;
      return matchQ && matchF;
    });
  }, [permits, search, filter]);

  const counts = useMemo(
    () => ({
      all: permits.length,
      pending: permits.filter((a) => a.status === "pending").length,
      under_review: permits.filter((a) => a.status === "under_review").length,
      approved: permits.filter((a) => a.status === "approved").length,
      rejected: permits.filter((a) => a.status === "rejected").length,
    }),
    [permits],
  );

  // ---- Actions -------------------------------------------------------
  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await store.approveAdminPermit(approveTarget.id);
      await reload();
      setApproveTarget(null);
    } catch (err) {
      setActionError(
        (err as Error)?.message ?? "Could not approve this application.",
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) {
      setActionError("Please provide a rejection reason.");
      return;
    }
    setActionError(null);
    setActionBusy(true);
    try {
      await store.rejectAdminPermit(rejectTarget.id, rejectionReason.trim());
      await reload();
      setRejectTarget(null);
      setRejectionReason("");
    } catch (err) {
      setActionError(
        (err as Error)?.message ?? "Could not reject this application.",
      );
    } finally {
      setActionBusy(false);
    }
  };

  const openDocuments = async (permit: SellerPermit) => {
    setViewTarget(permit);
    try {
      // Direct call — `PermitsApi` is already a top-level import. The
      // previous dynamic `await import(...)` was redundant and added a
      // module-resolution tick that occasionally surfaced as the
      // documents list not rendering until the next modal open.
      const docs = await PermitsApi.listDocumentsForAdmin(permit.id);
      setViewDocs(docs);
    } catch {
      setViewDocs([]);
    }
  };

  const formatSubmitted = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return "—";
    }
  };

  const columns: AdminTableColumn<SellerPermit>[] = [
    {
      key: "business",
      label: "Business",
      flex: 2.2,
      render: (a) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={a.businessName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{a.businessName}</Text>
            <Text style={styles.cellMeta}>#{a.id.slice(-4)}</Text>
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
          <Text style={styles.cellText}>{a.sellerName}</Text>
          <Text style={styles.cellMeta}>ID #{a.sellerId}</Text>
        </View>
      ),
    },
    {
      key: "submitted",
      label: "Submitted",
      flex: 0.9,
      render: (a) => (
        <Text style={[styles.cellText, { color: Colors.textSecondary }]}>
          {formatSubmitted(a.submittedAt)}
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
          value={counts.pending + counts.under_review}
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
          placeholder="Search by business or owner"
          filters={[
            { key: "all", label: "All", count: counts.all },
            { key: "pending", label: "Pending", count: counts.pending },
            { key: "under_review", label: "Under Review", count: counts.under_review },
            { key: "approved", label: "Approved", count: counts.approved },
            { key: "rejected", label: "Rejected", count: counts.rejected },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as FilterKey)}
        />
        {loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <AdminButton
              label="Retry"
              variant="secondary"
              size="sm"
              onPress={reload}
            />
          </View>
        ) : null}
        {loading && permits.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading applications…</Text>
          </View>
        ) : filtered.length === 0 ? (
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
                      onPress={() => openDocuments(a)}
                    />
                    {a.status === "pending" || a.status === "under_review" ? (
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

      {/* View Details + Documents */}
      {viewTarget ? (
        <AdminModal
          visible
          onClose={() => {
            setPreviewDoc(null);
            setViewTarget(null);
            setViewDocs(null);
            setPermitPreview(null);
          }}
          title={viewTarget.businessName}
          subtitle={`Application #${viewTarget.id}`}
          hideFooter
        >
          <ScrollView
            style={{ maxHeight: 460 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailHeader}>
              <AdminAvatar name={viewTarget.businessName} size={56} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.detailTitle}>
                  {viewTarget.businessName}
                </Text>
                <Text style={styles.detailMeta}>
                  {viewTarget.sellerName}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <ApplicationStatusBadge status={viewTarget.status} />
                </View>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <Row label="Owner" value={viewTarget.sellerName} />
              <Row label="Seller ID" value={viewTarget.sellerId} />
              <Row label="Business Name" value={viewTarget.businessName} />
              <Row
                label="Submitted"
                value={formatSubmitted(viewTarget.submittedAt)}
              />
              <Row
                label="Reviewed"
                value={formatSubmitted(viewTarget.reviewedAt)}
              />
              {viewTarget.reviewedByName ? (
                <Row
                  label="Reviewed By"
                  value={viewTarget.reviewedByName}
                />
              ) : null}
              {viewTarget.rejectionReason ? (
                <Row
                  label="Rejection Reason"
                  value={viewTarget.rejectionReason}
                />
              ) : null}
            </View>

            <Text style={styles.subSection}>Documents</Text>
            {viewDocs === null ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading documents…</Text>
              </View>
            ) : viewDocs.length === 0 ? (
              <Text style={styles.docHelper}>
                No documents attached yet.
              </Text>
            ) : (
              <View style={styles.docList}>
                {viewDocs.map((d) => (
                  <View key={d.id} style={styles.docItem}>
                    <Text style={styles.docIcon}>📄</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docName}>
                        {humanDocumentLabel(d.documentType)}
                      </Text>
                      <Text style={styles.docMeta}>
                        {d.originalName} ·{" "}
                        {(d.sizeBytes / 1024).toFixed(1)} KB
                      </Text>
                    </View>
                    <AdminButton
                      label="Open"
                      variant="secondary"
                      size="sm"
                      onPress={() => setPreviewDoc(d)}
                    />
                  </View>
                ))}
              </View>
            )}

            {viewTarget.status === "pending" ||
            viewTarget.status === "under_review" ? (
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

            {viewTarget.status === "approved" ? (
              <View style={styles.permitSection}>
                <Text style={styles.subSection}>Gas Selling Permit</Text>
                <Text style={styles.permitHelper}>
                  This application is approved. The official Gas Selling
                  Permit PDF is regenerated on demand by the server from
                  the latest application data — you can view or
                  re-download it any time.
                </Text>
                <View style={styles.detailActions}>
                  <AdminButton
                    label="View Permit"
                    variant="secondary"
                    icon="👁"
                    onPress={() =>
                      setPermitPreview({
                        url: PermitsApi.adminLicenseUrl(viewTarget.id),
                        filename: `Gas_Selling_Permit-${viewTarget.sellerId}.pdf`,
                      })
                    }
                    style={{ flex: 1, marginRight: Spacing.sm }}
                  />
                  <AdminButton
                    label="Download Permit"
                    variant="primary"
                    icon="⬇"
                    onPress={() =>
                      setPermitPreview({
                        url: PermitsApi.adminLicenseUrl(viewTarget.id),
                        filename: `Gas_Selling_Permit-${viewTarget.sellerId}.pdf`,
                      })
                    }
                    style={{ flex: 1 }}
                  />
                </View>
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
        subtitle={`${approveTarget?.businessName ?? ""} will become a verified seller.`}
        onConfirm={handleApprove}
        confirmLabel="Approve"
        confirmVariant="success"
      >
        <Text style={styles.dialogText}>
          The applicant will be notified and immediately become visible to
          customers. Their account will be activated automatically.
        </Text>
        {actionError ? (
          <Text style={styles.actionError}>{actionError}</Text>
        ) : null}
      </AdminModal>

      {/* Reject confirmation */}
      <AdminModal
        visible={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setRejectionReason("");
          setActionError(null);
        }}
        title="Reject Seller Application?"
        subtitle={`${rejectTarget?.businessName ?? ""} will be notified with your reason.`}
        onConfirm={handleReject}
        confirmLabel="Reject"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          The applicant will receive your reason in their in-app feed and
          may resubmit after addressing the issues.
        </Text>
        <View style={{ marginTop: Spacing.md }}>
          <Text style={styles.label}>Rejection reason</Text>
          <TextInput
            value={rejectionReason}
            onChangeText={setRejectionReason}
            placeholder="Provide a clear reason…"
            placeholderTextColor={Colors.textMuted}
            multiline
            style={styles.textarea}
          />
        </View>
        {actionError ? (
          <Text style={styles.actionError}>{actionError}</Text>
        ) : null}
      </AdminModal>

      <DocumentPreviewModal
        visible={previewDoc != null}
        onClose={() => setPreviewDoc(null)}
        downloadUrl={previewDoc?.downloadUrl ?? ""}
        contentType={previewDoc?.contentType ?? ""}
        originalName={previewDoc?.originalName ?? previewDoc?.documentType}
      />

      {/* Gas Selling Permit preview — opened by the View Permit /
          Download Permit buttons in the admin modal. Distinct from
          `previewDoc` because the admin license endpoint returns raw
          PDF bytes, not a `PermitDocument` metadata row. The modal
          streams the bytes with the bearer token and hands the PDF to
          the system viewer / share sheet via `expo-sharing`. */}
      <DocumentPreviewModal
        visible={permitPreview != null}
        onClose={() => setPermitPreview(null)}
        downloadUrl={permitPreview?.url ?? ""}
        contentType="application/pdf"
        originalName={permitPreview?.filename ?? "Gas_Selling_Permit.pdf"}
      />
    </AdminLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function humanDocumentLabel(t: string): string {
  switch (t) {
    case "application_form":
      return "Signed Application Form";
    case "national_id":
      return "National ID Copy";
    case "business_license":
      return "Business License";
    case "passport_photo":
      return "Passport Photo";
    case "license":
      return "Gas Selling Permit";
    default:
      return t;
  }
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
    gap: Spacing.md,
  },
  detailLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
    minWidth: 110,
  },
  detailValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
  },
  subSection: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  permitSection: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
  },
  permitHelper: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
    lineHeight: 18,
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
  docMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  docHelper: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontStyle: "italic",
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
    color: Colors.text,
    fontSize: FontSize.sm,
    textAlignVertical: "top",
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FEE2E2",
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    flex: 1,
  },
  actionError: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
    fontWeight: "600",
  },
});
