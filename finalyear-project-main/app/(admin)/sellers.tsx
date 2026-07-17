/**
 * Admin Dashboard – Sellers page.
 *
 * Lists all sellers with their info, assigned riders, order count and
 * status. Supports view, edit, suspend and delete actions.
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
  AdminInput,
  AdminFormField,
  AdminFormGrid,
  AdminModal,
  AdminSearchBar,
  AdminStatTile,
  AdminTable,
  SellerStatusBadge,
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import {
  RIDERS,
  Seller,
  SELLERS,
} from "../../src/store/adminData";

type FilterKey = "all" | "active" | "suspended" | "inactive";

export default function SellersPage() {
  const [sellers, setSellers] = useState<Seller[]>(SELLERS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<Seller | null>(null);
  const [editTarget, setEditTarget] = useState<Seller | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Seller | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Seller | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sellers.filter((s) => {
      const matchQ =
        !q ||
        s.businessName.toLowerCase().includes(q) ||
        s.ownerName.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q);
      const matchF = filter === "all" || s.status === filter;
      return matchQ && matchF;
    });
  }, [sellers, search, filter]);

  const counts = useMemo(
    () => ({
      all: sellers.length,
      active: sellers.filter((s) => s.status === "active").length,
      suspended: sellers.filter((s) => s.status === "suspended").length,
      inactive: sellers.filter((s) => s.status === "inactive").length,
    }),
    [sellers],
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    setSellers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleSuspend = () => {
    if (!suspendTarget) return;
    setSellers((prev) =>
      prev.map((s) =>
        s.id === suspendTarget.id
          ? {
              ...s,
              status: s.status === "active" ? "suspended" : "active",
            }
          : s,
      ),
    );
    setSuspendTarget(null);
  };

  const columns: AdminTableColumn<Seller>[] = [
    {
      key: "business",
      label: "Business",
      flex: 2.2,
      render: (s) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={s.businessName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{s.businessName}</Text>
            <Text style={styles.cellMeta}>{s.ownerName}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "location",
      label: "Location",
      flex: 1.4,
      render: (s) => <Text style={styles.cellText}>{s.location}</Text>,
    },
    {
      key: "riders",
      label: "Assigned Riders",
      flex: 1.6,
      render: (s) => (
        <View>
          <Text style={styles.cellText}>{s.assignedRiders.length} rider(s)</Text>
          <Text style={styles.cellMeta} numberOfLines={1}>
            {s.assignedRiders
              .map(
                (rid) => RIDERS.find((r) => r.id === rid)?.fullName ?? "Unknown",
              )
              .join(", ") || "—"}
          </Text>
        </View>
      ),
    },
    {
      key: "orders",
      label: "Orders",
      flex: 0.7,
      align: "center",
      render: (s) => (
        <View style={styles.ordersBubble}>
          <Text style={styles.ordersText}>{s.orderCount}</Text>
        </View>
      ),
    },
    {
      key: "status",
      label: "Status",
      flex: 0.9,
      render: (s) => <SellerStatusBadge status={s.status} />,
    },
  ];

  return (
    <AdminLayout
      title="Sellers"
      subtitle="Manage all sellers operating on the platform"
    >
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Sellers"
          value={counts.all}
          icon="🏪"
          tone="primary"
        />
        <AdminStatTile
          label="Active"
          value={counts.active}
          icon="✅"
          tone="success"
        />
        <AdminStatTile
          label="Suspended"
          value={counts.suspended}
          icon="⛔"
          tone="danger"
        />
        <AdminStatTile
          label="Total Orders"
          value={sellers.reduce((s, x) => s + x.orderCount, 0)}
          icon="🧾"
          tone="info"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by business, owner or location"
          filters={[
            { key: "all", label: "All", count: counts.all },
            { key: "active", label: "Active", count: counts.active },
            { key: "suspended", label: "Suspended", count: counts.suspended },
            { key: "inactive", label: "Inactive", count: counts.inactive },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as FilterKey)}
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            icon="🏪"
            title="No sellers found"
            message="Try adjusting your search or filters."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 900 }}>
              <AdminTable
                columns={columns}
                rows={filtered}
                keyExtractor={(s) => s.id}
                rowActions={(s) => (
                  <View style={styles.actionRow}>
                    <AdminButton
                      label="View"
                      variant="secondary"
                      size="sm"
                      onPress={() => setViewTarget(s)}
                    />
                    <AdminButton
                      label="Edit"
                      variant="ghost"
                      size="sm"
                      icon="✎"
                      onPress={() => setEditTarget(s)}
                    />
                    <AdminButton
                      label={s.status === "active" ? "Suspend" : "Activate"}
                      variant={s.status === "active" ? "warning" : "success"}
                      size="sm"
                      onPress={() => setSuspendTarget(s)}
                    />
                    <AdminButton
                      label="Delete"
                      variant="danger"
                      size="sm"
                      onPress={() => setDeleteTarget(s)}
                    />
                  </View>
                )}
              />
            </View>
          </ScrollView>
        )}
      </AdminCard>

      {viewTarget ? (
        <SellerDetailsModal
          seller={viewTarget}
          onClose={() => setViewTarget(null)}
        />
      ) : null}

      {editTarget ? (
        <SellerFormModal
          seller={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) => {
            setSellers((prev) =>
              prev.map((s) => (s.id === editTarget.id ? { ...s, ...data } : s)),
            );
            setEditTarget(null);
          }}
        />
      ) : null}

      <AdminModal
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Seller?"
        subtitle={`Permanently remove ${deleteTarget?.businessName ?? ""}.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          All orders, riders and reports linked to this seller will be
          archived. This action cannot be undone.
        </Text>
      </AdminModal>

      <AdminModal
        visible={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        title={
          suspendTarget?.status === "active"
            ? "Suspend Seller?"
            : "Activate Seller?"
        }
        subtitle={
          suspendTarget?.status === "active"
            ? `Suspending ${suspendTarget?.businessName ?? ""} will halt incoming orders.`
            : `Reactivating ${suspendTarget?.businessName ?? ""} will resume operations.`
        }
        onConfirm={handleSuspend}
        confirmLabel={
          suspendTarget?.status === "active" ? "Suspend" : "Activate"
        }
        confirmVariant={
          suspendTarget?.status === "active" ? "warning" : "success"
        }
      >
        <Text style={styles.dialogText}>
          Assigned riders will be notified of the seller's status change.
        </Text>
      </AdminModal>
    </AdminLayout>
  );
}

interface SellerFormProps {
  seller: Seller;
  onClose: () => void;
  onSubmit: (data: Partial<Seller>) => void;
}

function SellerFormModal({ seller, onClose, onSubmit }: SellerFormProps) {
  const [businessName, setBusinessName] = useState(seller.businessName);
  const [ownerName, setOwnerName] = useState(seller.ownerName);
  const [phone, setPhone] = useState(seller.phone);
  const [email, setEmail] = useState(seller.email);
  const [location, setLocation] = useState(seller.location);
  const [license, setLicense] = useState(seller.license);

  return (
    <AdminModal
      visible
      onClose={onClose}
      title="Edit Seller"
      hideFooter
    >
      <ScrollView style={{ maxHeight: 480 }}>
        <AdminFormGrid columns={2}>
          <AdminFormField label="Business Name" required>
            <AdminInput value={businessName} onChangeText={setBusinessName} />
          </AdminFormField>
          <AdminFormField label="Owner" required>
            <AdminInput value={ownerName} onChangeText={setOwnerName} />
          </AdminFormField>
          <AdminFormField label="Phone" required>
            <AdminInput value={phone} onChangeText={setPhone} />
          </AdminFormField>
          <AdminFormField label="Email">
            <AdminInput value={email} onChangeText={setEmail} />
          </AdminFormField>
          <AdminFormField label="Location" required>
            <AdminInput value={location} onChangeText={setLocation} />
          </AdminFormField>
          <AdminFormField label="License">
            <AdminInput value={license} onChangeText={setLicense} />
          </AdminFormField>
        </AdminFormGrid>
        <View style={styles.formFooter}>
          <AdminButton
            label="Cancel"
            variant="secondary"
            onPress={onClose}
            style={{ marginRight: Spacing.sm }}
          />
          <AdminButton
            label="Save Changes"
            onPress={() =>
              onSubmit({
                businessName,
                ownerName,
                phone,
                email,
                location,
                license,
              })
            }
          />
        </View>
      </ScrollView>
    </AdminModal>
  );
}

function SellerDetailsModal({
  seller,
  onClose,
}: {
  seller: Seller;
  onClose: () => void;
}) {
  const assignedRiders = RIDERS.filter((r) =>
    seller.assignedRiders.includes(r.id),
  );
  return (
    <AdminModal visible onClose={onClose} title={seller.businessName} hideFooter>
      <View style={styles.detailHeader}>
        <AdminAvatar name={seller.businessName} size={56} />
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.detailTitle}>{seller.businessName}</Text>
          <Text style={styles.detailMeta}>
            {seller.ownerName} • {seller.location}
          </Text>
          <View style={{ marginTop: 6 }}>
            <SellerStatusBadge status={seller.status} />
          </View>
        </View>
      </View>
      <View style={styles.detailGrid}>
        <Row label="Phone" value={seller.phone} />
        <Row label="Email" value={seller.email} />
        <Row label="License" value={seller.license} />
        <Row label="Joined" value={seller.joinedDate} />
        <Row label="Total Orders" value={String(seller.orderCount)} />
      </View>

      <Text style={styles.subSection}>Assigned Riders</Text>
      {assignedRiders.length === 0 ? (
        <View style={styles.emptyRiders}>
          <Text style={styles.emptyRidersText}>
            No riders assigned yet. Use the Rider Assignments page.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {assignedRiders.map((r) => (
            <View key={r.id} style={styles.riderRow}>
              <AdminAvatar name={r.fullName} size={32} />
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <Text style={styles.riderName}>{r.fullName}</Text>
                <Text style={styles.riderMeta}>
                  {r.vehicleType} • {r.vehiclePlate}
                </Text>
              </View>
              <AdminBadge label="Active" tone="success" />
            </View>
          ))}
        </View>
      )}
    </AdminModal>
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
  ordersBubble: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  ordersText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  actionRow: {
    flexDirection: "row",
    gap: 4,
    justifyContent: "flex-end",
  },
  dialogText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  formFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: Spacing.md,
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
  emptyRiders: {
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  emptyRidersText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  riderName: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  riderMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
});