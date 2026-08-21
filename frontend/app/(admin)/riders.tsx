/**
 * Admin Dashboard – Riders page.
 *
 * Combines two surfaces into one tabbed page:
 *
 *   Tab 1: "Riders"
 *       The rider directory. Reads `GET /api/admin/riders`, joins
 *       against rider_profiles and surfaces vehicle, availability and
 *       workload counters. Read-only — there is no admin mutation.
 *
 *   Tab 2: "Rider Applications"
 *       The rider verification queue. Backed by the live
 *       `AdminRiderPermitsApi` and `store.fetchAdminRiderApplications()`,
 *       running the same approve / reject / certificate pipeline the
 *       standalone page used. No new application flow is created.
 *
 * Existing route /api/admin/rider-permits and the dedicated
 * rider-applications.tsx screen stay intact for backward compatibility.
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
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { orderStatusLabel } from "../../constants/order";
import {
  AdminApi,
  AdminRiderPermitsApi,
  UsersApi,
} from "../../src/api/endpoints";
import { useAdminResource } from "../../src/hooks/useAdminResource";
import { useStore } from "../../src/store/StoreContext";
import { DocumentPreviewModal } from "../../src/components/DocumentPreviewModal";
import type {
  AdminOrder,
  AdminRider,
  RiderApplicationDocument,
  RiderPermitSummary,
} from "../../constants/types";

type Tab = "riders" | "applications";
type RiderFilter = "all" | "available" | "offline";
type AppFilter = "all" | "pending" | "approved" | "rejected" | "under_review";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

export default function RidersPage() {
  const [tab, setTab] = useState<Tab>("riders");

  return (
    <AdminLayout
      title="Riders"
      subtitle="Manage delivery riders and their verification applications"
    >
      <AdminTabs
        tabs={[
          { key: "riders", label: "Riders", icon: "riders" },
          {
            key: "applications",
            label: "Rider Applications",
            icon: "documents",
          },
        ]}
        active={tab}
        onChange={(k: string) => setTab(k as Tab)}
      />

      {tab === "riders" ? <RidersTab /> : <ApplicationsTab />}
    </AdminLayout>
  );
}

/* ===========================================================
 * Tab 1 – Riders directory
 * ========================================================= */
function RidersTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RiderFilter>("all");
  const [viewTarget, setViewTarget] = useState<AdminRider | null>(null);
  const [viewOrders, setViewOrders] = useState<AdminOrder[] | null>(null);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const available =
    filter === "all" ? undefined : filter === "available" ? true : false;

  const { data, loading, error, reload } = useAdminResource<AdminRider[]>(
    () =>
      AdminApi.riders({
        q: debouncedSearch || undefined,
        available,
      }),
    [debouncedSearch, available],
  );

  const riders = data ?? [];

  const openRider = useCallback(async (r: AdminRider) => {
    setViewTarget(r);
    setViewOrders(null);
    try {
      setViewOrders(await AdminApi.riderOrders(r.id));
    } catch {
      setViewOrders([]);
    }
  }, []);

  const availableCount = riders.filter((r) => r.available).length;
  const assignedOrdersTotal = riders.reduce(
    (s, r) => s + (r.assignedOrders ?? 0),
    0,
  );
  const completedDeliveriesTotal = riders.reduce(
    (s, r) => s + (r.completedDeliveries ?? 0),
    0,
  );

  const columns: AdminTableColumn<AdminRider>[] = [
    {
      key: "name",
      label: "Rider",
      flex: 2.0,
      render: (r) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={r.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{r.fullName}</Text>
            <Text style={styles.cellMeta}>{r.email}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "vehicle",
      label: "Vehicle",
      flex: 1.6,
      render: (r) => (
        <View>
          <Text style={styles.cellText}>{r.vehicleType ?? "—"}</Text>
          <Text style={styles.cellMeta}>
            {[r.vehiclePlate, r.vehicleModel].filter(Boolean).join(" • ") || "—"}
          </Text>
        </View>
      ),
    },
    {
      key: "license",
      label: "License No",
      flex: 1.1,
      render: (r) => (
        <Text style={styles.cellText}>{r.licenseNo ?? "—"}</Text>
      ),
    },
    {
      key: "orders",
      label: "Assigned Orders",
      flex: 0.9,
      align: "center",
      render: (r) => (
        <View style={styles.countBubble}>
          <Text style={styles.countText}>{r.assignedOrders}</Text>
        </View>
      ),
    },
    {
      key: "completed",
      label: "Completed",
      flex: 0.9,
      align: "center",
      render: (r) => (
        <View style={styles.countBubble}>
          <Text style={styles.countText}>{r.completedDeliveries}</Text>
        </View>
      ),
    },
    {
      key: "availability",
      label: "Availability",
      flex: 1.1,
      align: "center",
      render: (r) => (
        <AdminBadge
          label={r.available ? "Available" : "Offline"}
          tone={r.available ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "status",
      label: "Account",
      flex: 0.9,
      align: "center",
      render: (r) => (
        <AdminBadge
          label={r.isActive ? "Active" : "Inactive"}
          tone={r.isActive ? "info" : "neutral"}
        />
      ),
    },
  ];

  return (
    <View style={styles.tabBody}>
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Riders Shown"
          value={riders.length}
          icon="riders"
          tone="primary"
        />
        <AdminStatTile
          label="Available"
          value={availableCount}
          icon="approve"
          tone="success"
        />
        <AdminStatTile
          label="Assigned Orders"
          value={assignedOrdersTotal}
          icon="products"
          tone="info"
        />
        <AdminStatTile
          label="Completed Deliveries"
          value={completedDeliveriesTotal}
          icon="approve"
          tone="accent"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name, username, email or plate"
          filters={[
            { key: "all", label: "All" },
            { key: "available", label: "Available" },
            { key: "offline", label: "Offline" },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as RiderFilter)}
        />
        <AdminAsyncBoundary
          loading={loading}
          error={error}
          onRetry={reload}
          hasData={!!data}
          loadingLabel="Loading riders…"
        >
          {riders.length === 0 ? (
            <AdminEmptyState
              icon="riders"
              title="No riders found"
              message={
                search || filter !== "all"
                  ? "No rider in the database matches this search."
                  : "No rider accounts have been registered yet."
              }
            />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ minWidth: 900 }}>
                <AdminTable
                  columns={columns}
                  rows={riders}
                  keyExtractor={(r) => r.id}
                  rowActions={(r) => (
                    <View style={styles.actionRow}>
                      <AdminButton
                        label="View"
                        variant="secondary"
                        size="sm"
                        onPress={() => openRider(r)}
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
          onClose={() => {
            setViewTarget(null);
            setViewOrders(null);
          }}
          title={viewTarget.fullName}
          hideFooter
        >
          <View style={styles.detailHeader}>
            <AdminAvatar name={viewTarget.fullName} size={64} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.detailTitle}>{viewTarget.fullName}</Text>
              <Text style={styles.detailMeta}>@{viewTarget.username}</Text>
              <View style={{ marginTop: 6, flexDirection: "row", gap: 6 }}>
                <AdminBadge
                  label={viewTarget.available ? "Available" : "Offline"}
                  tone={viewTarget.available ? "success" : "neutral"}
                />
                <AdminBadge
                  label={viewTarget.isActive ? "Active" : "Inactive"}
                  tone={viewTarget.isActive ? "info" : "neutral"}
                />
              </View>
            </View>
          </View>

          <View style={styles.detailGrid}>
            <Row label="Email" value={viewTarget.email} />
            <Row label="Phone" value={viewTarget.phone ?? "—"} />
            <Row label="Registered" value={formatDate(viewTarget.createdAt)} />
            <Row label="Vehicle Type" value={viewTarget.vehicleType ?? "—"} />
            <Row label="Vehicle Plate" value={viewTarget.vehiclePlate ?? "—"} />
            <Row label="Vehicle Model" value={viewTarget.vehicleModel ?? "—"} />
            <Row label="License No" value={viewTarget.licenseNo ?? "—"} />
            <Row
              label="Assigned Sellers"
              value={String(viewTarget.assignedSellers)}
            />
            <Row
              label="Assigned Orders"
              value={String(viewTarget.assignedOrders)}
            />
            <Row
              label="Completed Deliveries"
              value={String(viewTarget.completedDeliveries)}
            />
          </View>

          <Text style={styles.subHeading}>Last known profile location</Text>
          <Text style={styles.cellMeta}>
            {viewTarget.lat != null && viewTarget.lng != null
              ? `lat ${viewTarget.lat.toFixed(4)}, lng ${viewTarget.lng.toFixed(4)}`
              : "No profile coordinates recorded."}
          </Text>

          <Text style={styles.subHeading}>Recent Orders</Text>
          {viewOrders === null ? (
            <Text style={styles.cellMeta}>Loading orders…</Text>
          ) : viewOrders.length === 0 ? (
            <Text style={styles.cellMeta}>This rider has no recent orders.</Text>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {viewOrders.map((o) => (
                <View key={o.id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cellTitle}>#{o.id}</Text>
                    <Text style={styles.cellMeta}>
                      {o.sellerName} • {formatDate(o.createdAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.cellTitle}>
                      TZS {Number(o.total ?? 0).toLocaleString("en-US")}
                    </Text>
                    <Text style={styles.cellMeta}>
                      {orderStatusLabel(o.status)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </AdminModal>
      ) : null}
    </View>
  );
}

/* ===========================================================
 * Tab 2 – Rider Applications
 * ========================================================= */
function ApplicationsTab() {
  const store = useStore();

  const [applications, setApplications] = useState<RiderPermitSummary[]>([]);
  const [riderNames, setRiderNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AppFilter>("all");
  const [viewTarget, setViewTarget] = useState<RiderPermitSummary | null>(
    null,
  );
  const [viewDocs, setViewDocs] = useState<RiderApplicationDocument[] | null>(
    null,
  );
  const [previewDoc, setPreviewDoc] =
    useState<RiderApplicationDocument | null>(null);
  const [certPreview, setCertPreview] = useState<
    { url: string; filename: string } | null
  >(null);
  const [approveTarget, setApproveTarget] =
    useState<RiderPermitSummary | null>(null);
  const [rejectTarget, setRejectTarget] =
    useState<RiderPermitSummary | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await store.fetchAdminRiderApplications();
      setApplications(rows);
      const names: Record<string, string> = {};
      await Promise.all(
        rows.map(async (a) => {
          if (!a.riderId || names[a.riderId]) return;
          try {
            const user = await UsersApi.byId(a.riderId);
            names[a.riderId] = user.fullName;
          } catch {
            names[a.riderId] = `Rider #${a.riderId}`;
          }
        }),
      );
      setRiderNames(names);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        (err as Error)?.message ?? "Couldn't load rider applications.",
      );
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      const matchQ =
        !q ||
        (riderNames[a.riderId] ?? "").toLowerCase().includes(q) ||
        (a.certificateNumber ?? "").toLowerCase().includes(q);
      const matchF = filter === "all" || a.status === filter;
      return matchQ && matchF;
    });
  }, [applications, search, filter, riderNames]);

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
      await store.approveAdminRiderApplication(approveTarget.id);
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
      await store.rejectAdminRiderApplication(
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

  const openDocuments = async (application: RiderPermitSummary) => {
    setViewTarget(application);
    try {
      const docs = await AdminRiderPermitsApi.listDocumentsForAdmin(
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

  const columns: AdminTableColumn<RiderPermitSummary>[] = [
    {
      key: "rider",
      label: "Rider",
      flex: 2.2,
      render: (a) => (
        <View style={styles.cellRow}>
          <AdminAvatar
            name={riderNames[a.riderId] ?? `Rider #${a.riderId}`}
            size={36}
          />
          <View>
            <Text style={styles.cellTitle}>
              {riderNames[a.riderId] ?? `Rider #${a.riderId}`}
            </Text>
            <Text style={styles.cellMeta}>#{a.id.slice(-4)}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "rider-id",
      label: "Rider ID",
      flex: 0.9,
      render: (a) => (
        <Text style={[styles.cellText, { color: Colors.textSecondary }]}>
          #{a.riderId}
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
          placeholder="Search by rider name or certificate"
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
          title={riderNames[viewTarget.riderId] ?? `Rider #${viewTarget.riderId}`}
          subtitle={`Application #${viewTarget.id}`}
          hideFooter
        >
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailHeader}>
              <AdminAvatar
                name={riderNames[viewTarget.riderId] ?? `Rider #${viewTarget.riderId}`}
                size={56}
              />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text style={styles.detailTitle}>
                  {riderNames[viewTarget.riderId] ??
                    `Rider #${viewTarget.riderId}`}
                </Text>
                <Text style={styles.detailMeta}>
                  Rider ID #{viewTarget.riderId}
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
              <Row label="Rider ID" value={`#${viewTarget.riderId}`} />
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
                <Text style={styles.subSection}>Rider Certificate</Text>
                <Text style={styles.permitHelper}>
                  This application is approved. The official Gas Delivery
                  Rider Certificate PDF is regenerated on demand by the server.
                </Text>
                <View style={styles.detailActions}>
                  <AdminButton
                    label="Download Certificate"
                    variant="primary"
                    icon="download"
                    onPress={() =>
                      setCertPreview({
                        url: AdminRiderPermitsApi.adminCertificateUrl(viewTarget.id),
                        filename: `Rider_Permit-${viewTarget.riderId}.pdf`,
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
        title="Approve Rider Application?"
        subtitle={`${
          approveTarget
            ? riderNames[approveTarget.riderId] ??
              `Rider #${approveTarget.riderId}`
            : ""
        } will become a verified rider.`}
        onConfirm={handleApprove}
        confirmLabel={actionBusy ? "Approving…" : "Approve"}
        confirmVariant="success"
      >
        <Text style={styles.dialogText}>
          The applicant will be notified and immediately become eligible to
          receive delivery orders.
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
        title="Reject Rider Application?"
        subtitle={`${
          rejectTarget
            ? riderNames[rejectTarget.riderId] ??
              `Rider #${rejectTarget.riderId}`
            : ""
        } will be notified with your reason.`}
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
        originalName={certPreview?.filename ?? "Rider_Permit.pdf"}
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
    case "rider_application_form":
      return "Signed Rider Application Form";
    case "rider_national_id":
      return "National ID Copy";
    case "rider_driving_licence":
      return "Driving Licence";
    case "rider_passport_photo":
      return "Passport Photo";
    case "rider_vehicle_registration":
      return "Vehicle Registration Card";
    case "rider_permit":
      return "Gas Delivery Rider Certificate";
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
  countBubble: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  countText: {
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
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
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
