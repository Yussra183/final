/**
 * Admin Dashboard → Supplier Applications page.
 *
 * Lists every supplier verification application, supports search, status
 * filter, view details (with document previews), and approve/reject
 * actions. Backed by the live API
 * (`/api/admin/supplier-applications`) through {@link useStore}.
 *
 * Mirrors `rider-applications.tsx` end-to-end so all three admin
 * review queues (seller, rider, supplier) share the same UX.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAvatar,
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
import { AdminSupplierApplicationsApi } from "../../src/api/endpoints";
import type {
  SupplierApplication,
  SupplierApplicationDocument,
} from "../../constants/types";

type FilterKey = "all" | "pending" | "approved" | "rejected" | "under_review";

export default function SupplierApplicationsPage() {
  const store = useStore();

  // ---- Live state ----------------------------------------------------
  const [applications, setApplications] = useState<SupplierApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- Shared UI state ------------------------------------------------
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<SupplierApplication | null>(
    null,
  );
  const [viewDocs, setViewDocs] = useState<
    SupplierApplicationDocument[] | null
  >(null);
  const [previewDoc, setPreviewDoc] =
    useState<SupplierApplicationDocument | null>(null);
  const [certPreview, setCertPreview] = useState<
    { url: string; filename: string } | null
  >(null);
  const [approveTarget, setApproveTarget] =
    useState<SupplierApplication | null>(null);
  const [rejectTarget, setRejectTarget] =
    useState<SupplierApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // ---- Data loading --------------------------------------------------
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await store.fetchAdminSupplierApplications();
      setApplications(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        (err as Error)?.message ?? "Couldn't load supplier applications.",
      );
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Resolves the supplier's display name — backend denormalises it
   * onto the DTO so the table never has to do a second lookup. */
  const supplierName = (a: SupplierApplication): string =>
    a.supplierName && a.supplierName.length > 0
      ? a.supplierName
      : `Supplier #${a.supplierId}`;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      const matchQ =
        !q ||
        supplierName(a).toLowerCase().includes(q) ||
        (a.certificateNumber ?? "").toLowerCase().includes(q);
      const matchF = filter === "all" || a.status === filter;
      return matchQ && matchF;
    });
  }, [applications, search, filter]);

  const counts = useMemo(
    () => ({
      all: applications.length,
      pending: applications.filter((a) => a.status === "pending").length,
      under_review: applications.filter(
        (a) => a.status === "under_review",
      ).length,
      approved: applications.filter((a) => a.status === "approved").length,
      rejected: applications.filter((a) => a.status === "rejected").length,
    }),
    [applications],
  );

  // ---- Actions -------------------------------------------------------
  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionError(null);
    setActionBusy(true);
    try {
      await store.approveAdminSupplierApplication(approveTarget.id);
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
      await store.rejectAdminSupplierApplication(
        rejectTarget.id,
        rejectionReason.trim(),
      );
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

  const openDocuments = async (application: SupplierApplication) => {
    setViewTarget(application);
    try {
      const docs = await AdminSupplierApplicationsApi.listDocumentsForAdmin(
        application.id,
      );
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

  const columns: AdminTableColumn<SupplierApplication>[] = [
    {
      key: "supplier",
      label: "Supplier",
      flex: 2.2,
      render: (a) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={supplierName(a)} size={36} />
          <View>
            <Text style={styles.cellTitle}>{supplierName(a)}</Text>
            <Text style={styles.cellMeta}>#{a.id.slice(-4)}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "supplier-id",
      label: "Supplier ID",
      flex: 0.9,
      render: (a) => (
        <Text style={[styles.cellText, { color: Colors.textSecondary }]}>
          #{a.supplierId}
        </Text>
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
      title="Supplier Applications"
      subtitle="Review and approve suppliers applying to deliver gas to the platform"
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
          placeholder="Search by supplier name or certificate"
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
        {loading && applications.length === 0 ? (
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
            setCertPreview(null);
          }}
          title={supplierName(viewTarget)}
          subtitle={`Application #${viewTarget.id}`}
          hideFooter
        >
          <ScrollView
            style={{ maxHeight: 460 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.detailHeader}>
              <AdminAvatar name={supplierName(viewTarget)} size={56} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.detailTitle}>{supplierName(viewTarget)}</Text>
                <Text style={styles.detailMeta}>
                  Supplier ID #{viewTarget.supplierId}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <ApplicationStatusBadge status={viewTarget.status} />
                </View>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <Row label="Supplier ID" value={`#${viewTarget.supplierId}`} />
              {viewTarget.supplierEmail ? (
                <Row label="Email" value={viewTarget.supplierEmail} />
              ) : null}
              {viewTarget.supplierPhone ? (
                <Row label="Phone" value={viewTarget.supplierPhone} />
              ) : null}
              <Row
                label="Certificate No."
                value={viewTarget.certificateNumber ?? "—"}
              />
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
              {viewTarget.validUntil ? (
                <Row label="Valid Until" value={viewTarget.validUntil} />
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
                <Text style={styles.subSection}>Supplier Certificate</Text>
                <Text style={styles.permitHelper}>
                  This application is approved. The official Gas Supplier
                  Certificate PDF is regenerated on demand by the server
                  from the latest application data — you can view or
                  re-download it any time.
                </Text>
                <View style={styles.detailActions}>
                  <AdminButton
                    label="View Certificate"
                    variant="secondary"
                    icon="👁"
                    onPress={() =>
                      setCertPreview({
                        url: AdminSupplierApplicationsApi.adminCertificateUrl(
                          viewTarget.id,
                        ),
                        filename: `Supplier_Certificate-app-${viewTarget.id}.pdf`,
                      })
                    }
                    style={{ flex: 1, marginRight: Spacing.sm }}
                  />
                  <AdminButton
                    label="Download Certificate"
                    variant="primary"
                    icon="⬇"
                    onPress={() =>
                      setCertPreview({
                        url: AdminSupplierApplicationsApi.adminCertificateUrl(
                          viewTarget.id,
                        ),
                        filename: `Supplier_Certificate-app-${viewTarget.id}.pdf`,
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
        title="Approve Supplier Application?"
        subtitle={
          approveTarget
            ? `${supplierName(approveTarget)} will become a verified supplier.`
            : ""
        }
        onConfirm={handleApprove}
        confirmLabel="Approve"
        confirmVariant="success"
      >
        <Text style={styles.dialogText}>
          The applicant will be notified and immediately become eligible to
          supply gas to sellers and receive supply requests. An official
          Gas Supplier Certificate will be available for download from
          their Profile.
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
        title="Reject Supplier Application?"
        subtitle={
          rejectTarget
            ? `${supplierName(rejectTarget)} will be notified with your reason.`
            : ""
        }
        onConfirm={handleReject}
        confirmLabel="Reject"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          The applicant will receive your reason in their in-app feed and
          may re-upload corrected documents and submit a new application.
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

      <DocumentPreviewModal
        visible={certPreview != null}
        onClose={() => setCertPreview(null)}
        downloadUrl={certPreview?.url ?? ""}
        contentType="application/pdf"
        originalName={certPreview?.filename ?? "Supplier_Certificate.pdf"}
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
    case "supplier_application_form":
      return "Signed Supplier Application Form";
    case "supplier_national_id":
      return "Company Registration ID";
    case "supplier_business_registration":
      return "Business Registration Certificate";
    case "supplier_tin_certificate":
      return "Tax Identification Certificate (TIN)";
    case "supplier_business_licence":
      return "Business Licence";
    case "supplier_certificate":
      return "Gas Supplier Certificate";
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
