/**
 * Admin Dashboard – Sellers page.
 *
 * Combines two formerly separate screens into a tabbed page:
 *
 *   Tab 1: "Sellers"
 *       The seller directory. Reads `GET /api/admin/sellers`, which joins
 *       every user with `role = "seller"` against `seller_profiles` and
 *       the latest permit application. Search and the permit-status
 *       filter are passed to the backend, so the database does the work.
 *       Read-only: the backend exposes no admin write surface for sellers.
 *
 *   Tab 2: "Seller Applications"
 *       The seller verification queue. Backed by `useStore.fetchAdminPermits()`,
 *       the existing `PermitsApi.listDocumentsForAdmin` and the same
 *       approve / reject / permit preview pipeline the standalone page used.
 *
 * The original `seller-applications.tsx` route is preserved for backward
 * compatibility — it now re-exports this page's ApplicationsTab.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  AdminTable,
  AdminTabs,
  ApplicationStatusBadge,
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import { AdminIcon } from "../../src/components/admin/Icon";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AdminApi, PermitsApi } from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import { useStore } from "../../src/store/StoreContext";
import { DocumentPreviewModal } from "../../src/components/DocumentPreviewModal";
import type {
  AdminSeller,
  PermitDocument,
  PermitStatus,
  SellerPermit,
} from "../../constants/types";

type Tab = "sellers" | "applications";
type SellerFilter = "all" | "pending" | "approved" | "rejected";
type AppFilter = "all" | "pending" | "approved" | "rejected" | "under_review";

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
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(
    params.tab === "applications" ? "applications" : "sellers",
  );

  return (
    <AdminLayout
      title="Sellers"
      subtitle="All sellers operating on the platform and their verification queue"
    >
      <AdminTabs
        tabs={[
          { key: "sellers", label: "Sellers", icon: "sellers" },
          {
            key: "applications",
            label: "Seller Applications",
            icon: "documents",
          },
        ]}
        active={tab}
        onChange={(k: string) => setTab(k as Tab)}
      />

      {tab === "sellers" ? <SellersTab /> : <ApplicationsTab />}
    </AdminLayout>
  );
}

/* ===========================================================
 * Tab 1 – Sellers directory
 * ========================================================= */
function SellersTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SellerFilter>("all");
  const [viewTarget, setViewTarget] = useState<AdminSeller | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const permitStatus =
    filter === "all" ? undefined : (filter as Exclude<SellerFilter, "all">);

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
    <View style={styles.tabBody}>
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
            icon="sellers"
            tone="primary"
          />
          <AdminStatTile
            label="Approved"
            value={approvedCount}
            icon="approve"
            tone="success"
          />
          <AdminStatTile
            label="Pending"
            value={pendingCount}
            icon="pending"
            tone="warning"
          />
          <AdminStatTile
            label="Rejected"
            value={rejectedCount}
            icon="reject"
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
            onFilterChange={(k) => setFilter(k as SellerFilter)}
          />
          {sellers.length === 0 ? (
            <AdminEmptyState
              icon="sellers"
              title="No sellers found"
              message={
                search || filterIsPermit
                  ? "No seller in the database matches this search."
                  : "No seller accounts have been registered yet."
              }
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={reload} />
              }
            >
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
    </View>
  );
}

/* ===========================================================
 * Tab 2 – Seller Applications
 * ========================================================= */
function ApplicationsTab() {
  const store = useStore();

  const [permits, setPermits] = useState<SellerPermit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AppFilter>("all");
  const [viewTarget, setViewTarget] = useState<SellerPermit | null>(null);
  const [viewDocs, setViewDocs] = useState<PermitDocument[] | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PermitDocument | null>(null);
  const [permitPreview, setPermitPreview] = useState<
    { url: string; filename: string } | null
  >(null);
  const [approveTarget, setApproveTarget] = useState<SellerPermit | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SellerPermit | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

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
          placeholder="Search by business or owner"
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
        {loading && permits.length === 0 ? (
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
                <Text style={styles.detailMeta}>{viewTarget.sellerName}</Text>
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
              <Text style={styles.docHelper}>No documents attached yet.</Text>
            ) : (
              <View style={styles.docList}>
                {viewDocs.map((d) => (
                  <View key={d.id} style={styles.docItem}>
                    <AdminIcon name="documents" size={18} color={Colors.textSecondary} />
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
                <Text style={styles.subSection}>Gas Selling Permit</Text>
                <Text style={styles.permitHelper}>
                  This application is approved. The official Gas Selling
                  Permit PDF is regenerated on demand by the server from
                  the latest application data — you can view or re-download
                  it any time.
                </Text>
                <View style={styles.detailActions}>
                  <AdminButton
                    label="View Permit"
                    variant="secondary"
                    icon="view"
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
                    icon="download"
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

      <AdminModal
        visible={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve Seller Application?"
        subtitle={`${approveTarget?.businessName ?? ""} will become a verified seller.`}
        onConfirm={handleApprove}
        confirmLabel={actionBusy ? "Approving…" : "Approve"}
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
        confirmLabel={actionBusy ? "Rejecting…" : "Reject"}
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

      <DocumentPreviewModal
        visible={permitPreview != null}
        onClose={() => setPermitPreview(null)}
        downloadUrl={permitPreview?.url ?? ""}
        contentType="application/pdf"
        originalName={permitPreview?.filename ?? "Gas_Selling_Permit.pdf"}
      />
    </View>
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
  tabBody: { marginTop: Spacing.lg },
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
  subHeading: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
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
  rejectionText: {
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
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
  docIcon: { fontSize: 18 },
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
