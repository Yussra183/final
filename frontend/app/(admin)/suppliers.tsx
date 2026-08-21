/**
 * Admin Dashboard – Suppliers page.
 *
 * Combines two surface areas in one tabbed page:
 *
 *   Tab 1: "Suppliers"
 *       Every supplier account registered in the system. Reads
 *       `GET /api/admin/suppliers` and reuses the Admin directory API
 *       exactly as before. No business-logic change.
 *
 *   Tab 2: "Supplier Applications"
 *       The supplier verification queue. Backed by the live
 *       `AdminSupplierApplicationsApi` (list / approve / reject /
 *       documents / certificate preview) — no new application flow is
 *       introduced. The approve → supplier-active path runs server-side
 *       through the existing backend endpoint.
 *
 * Existing route /api/admin/supplier-applications stays intact.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { AdminIcon } from "../../src/components/admin/Icon";
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
  AdminTabs,
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { AdminApi, AdminSupplierApplicationsApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import { useStore } from "../../src/store/StoreContext";
import { DocumentPreviewModal } from "../../src/components/DocumentPreviewModal";
import type {
  AdminUser,
  SupplierApplication,
  SupplierApplicationDocument,
} from "../../constants/types";

type Tab = "suppliers" | "applications";
type SupplierFilter = "all" | "active" | "inactive";
type AppFilter = "all" | "pending" | "approved" | "rejected" | "under_review";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

export default function SuppliersPage(): React.ReactElement {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("suppliers");

  return (
    <AdminLayout
      title="Suppliers"
      subtitle="Manage supplier accounts and their verification applications"
    >
      <AdminTabs
        tabs={[
          { key: "suppliers", label: "Suppliers", icon: "suppliers" },
          {
            key: "applications",
            label: "Supplier Applications",
            icon: "documents",
          },
        ]}
        active={tab}
        onChange={(k: string) => setTab(k as Tab)}
      />

      {tab === "suppliers" ? <SuppliersTab /> : <ApplicationsTab />}
    </AdminLayout>
  );
}

/* ===========================================================
 * Tab 1 – Suppliers directory
 * ========================================================= */
function SuppliersTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SupplierFilter>("all");
  const [viewTarget, setViewTarget] = useState<AdminUser | null>(null);

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
    <View style={styles.tabBody}>
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Suppliers Shown"
          value={suppliers.length}
          icon="suppliers"
          tone="primary"
        />
        <AdminStatTile
          label="Active"
          value={activeCount}
          icon="approve"
          tone="success"
        />
        <AdminStatTile
          label="Inactive"
          value={suppliers.length - activeCount}
          icon="inactive"
          tone="warning"
        />
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
          onFilterChange={(k) => setFilter(k as SupplierFilter)}
        />
        <AdminAsyncBoundary
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          loadingLabel="Loading suppliers…"
        >
          {suppliers.length === 0 ? (
            <AdminEmptyState
              icon="suppliers"
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
        </AdminAsyncBoundary>
      </AdminCard>

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
    </View>
  );
}

/* ===========================================================
 * Tab 2 – Supplier Applications
 *
 * Reuses store.fetchAdminSupplierApplications() and the existing
 * approve / reject action methods so the application's state machine
 * (PENDING → APPROVED/REJECTED → backend notifies the supplier) is
 * unchanged.
 * ========================================================= */
function ApplicationsTab() {
  const store = useStore();

  const [applications, setApplications] = useState<SupplierApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AppFilter>("all");
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
      render: (a) => (
        <AdminBadge
          label={a.status[0].toUpperCase() + a.status.slice(1).replace("_", " ")}
          tone={
            a.status === "approved"
              ? "success"
              : a.status === "rejected"
              ? "danger"
              : a.status === "under_review"
              ? "info"
              : "warning"
          }
        />
      ),
    },
  ];

  return (
    <View style={styles.tabBody}>
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Applications"
          value={counts.all}
          icon="documents"
          tone="info"
        />
        <AdminStatTile
          label="Pending"
          value={counts.pending + counts.under_review}
          icon="pending"
          tone="warning"
        />
        <AdminStatTile
          label="Approved"
          value={counts.approved}
          icon="approve"
          tone="success"
        />
        <AdminStatTile
          label="Rejected"
          value={counts.rejected}
          icon="reject"
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
            {
              key: "under_review",
              label: "Under Review",
              count: counts.under_review,
            },
            { key: "approved", label: "Approved", count: counts.approved },
            { key: "rejected", label: "Rejected", count: counts.rejected },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as AppFilter)}
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
            icon="documents"
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
                          icon="approve"
                          onPress={() => setApproveTarget(a)}
                        />
                        <AdminButton
                          label="Reject"
                          variant="danger"
                          size="sm"
                          icon="reject"
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
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <AdminAvatar name={supplierName(viewTarget)} size={56} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.detailTitle}>{supplierName(viewTarget)}</Text>
                <Text style={styles.detailMeta}>
                  Supplier ID #{viewTarget.supplierId}
                </Text>
                <View style={{ marginTop: 6 }}>
                  <AdminBadge
                    label={
                      viewTarget.status[0].toUpperCase() +
                      viewTarget.status.slice(1).replace("_", " ")
                    }
                    tone={
                      viewTarget.status === "approved"
                        ? "success"
                        : viewTarget.status === "rejected"
                        ? "danger"
                        : viewTarget.status === "under_review"
                        ? "info"
                        : "warning"
                    }
                  />
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
                <Row label="Reviewed By" value={viewTarget.reviewedByName} />
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
              <Text style={styles.docHelper}>No documents attached yet.</Text>
            ) : (
              <View style={styles.docList}>
                {viewDocs.map((d) => (
                  <View key={d.id} style={styles.docItem}>
                    <AdminIcon name="documents" size={18} color={Colors.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docName}>
                        {humanDocumentLabel(d.documentType)}
                      </Text>
                      <Text style={styles.docMeta}>
                        {d.originalName} · {(d.sizeBytes / 1024).toFixed(1)} KB
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
                  icon="approve"
                  onPress={() => {
                    setApproveTarget(viewTarget);
                    setViewTarget(null);
                  }}
                  style={{ flex: 1, marginRight: Spacing.sm }}
                />
                <AdminButton
                  label="Reject"
                  variant="danger"
                  icon="reject"
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
                  Certificate PDF is regenerated on demand by the server.
                </Text>
                <View style={styles.detailActions}>
                  <AdminButton
                    label="Download Certificate"
                    variant="primary"
                    icon="download"
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
        confirmLabel={actionBusy ? "Approving…" : "Approve"}
        confirmVariant="success"
      >
        <Text style={styles.dialogText}>
          The applicant will be notified and immediately become eligible to
          supply gas to sellers and receive supply requests.
        </Text>
        {actionError ? (
          <Text style={styles.actionError}>{actionError}</Text>
        ) : null}
      </AdminModal>

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
        confirmLabel={actionBusy ? "Rejecting…" : "Reject"}
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          The applicant will receive your reason and may resubmit after
          addressing the issues.
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
    </View>
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
  tabBody: {
    marginTop: Spacing.lg,
  },
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
  docList: { gap: 6 },
  docItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.sm,
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
    backgroundColor: Colors.dangerSoft,
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
