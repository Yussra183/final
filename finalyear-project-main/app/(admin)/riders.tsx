/**
 * Admin Dashboard – Riders page.
 *
 * Lists all riders with their info, assigned seller, status and
 * approval status. Supports view, edit, suspend and remove actions.
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
  AdminInput,
  AdminFormField,
  AdminFormGrid,
  AdminModal,
  AdminSearchBar,
  AdminStatTile,
  AdminTable,
  RiderApprovalBadge,
  RiderStatusBadge,
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { Rider, RIDERS } from "../../src/store/adminData";

type FilterKey = "all" | "active" | "inactive" | "suspended";

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[]>(RIDERS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<Rider | null>(null);
  const [editTarget, setEditTarget] = useState<Rider | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rider | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Rider | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return riders.filter((r) => {
      const matchQ =
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.vehiclePlate.toLowerCase().includes(q) ||
        r.phone.includes(q);
      const matchF = filter === "all" || r.status === filter;
      return matchQ && matchF;
    });
  }, [riders, search, filter]);

  const counts = useMemo(
    () => ({
      all: riders.length,
      active: riders.filter((r) => r.status === "active").length,
      inactive: riders.filter((r) => r.status === "inactive").length,
      suspended: riders.filter((r) => r.status === "suspended").length,
    }),
    [riders],
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    setRiders((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleSuspend = () => {
    if (!suspendTarget) return;
    setRiders((prev) =>
      prev.map((r) =>
        r.id === suspendTarget.id
          ? {
              ...r,
              status: r.status === "active" ? "suspended" : "active",
            }
          : r,
      ),
    );
    setSuspendTarget(null);
  };

  const columns: AdminTableColumn<Rider>[] = [
    {
      key: "name",
      label: "Rider",
      flex: 2.2,
      render: (r) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={r.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{r.fullName}</Text>
            <Text style={styles.cellMeta}>{r.phone}</Text>
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
          <Text style={styles.cellText}>{r.vehicleType}</Text>
          <Text style={styles.cellMeta}>{r.vehiclePlate}</Text>
        </View>
      ),
    },
    {
      key: "seller",
      label: "Assigned Seller",
      flex: 1.6,
      render: (r) =>
        r.assignedSellerName ? (
          <View style={styles.cellRow}>
            <AdminAvatar name={r.assignedSellerName} size={28} />
            <Text style={styles.cellText}>{r.assignedSellerName}</Text>
          </View>
        ) : (
          <AdminBadge label="Unassigned" tone="warning" />
        ),
    },
    {
      key: "approval",
      label: "Approval",
      flex: 0.9,
      render: (r) => <RiderApprovalBadge status={r.approvalStatus} />,
    },
    {
      key: "status",
      label: "Status",
      flex: 0.8,
      render: (r) => <RiderStatusBadge status={r.status} />,
    },
  ];

  return (
    <AdminLayout title="Riders" subtitle="Manage all riders on the platform">
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Riders"
          value={counts.all}
          icon="🛵"
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
          label="Unassigned"
          value={riders.filter((r) => !r.assignedSellerId).length}
          icon="📭"
          tone="warning"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name, phone or vehicle plate"
          filters={[
            { key: "all", label: "All", count: counts.all },
            { key: "active", label: "Active", count: counts.active },
            { key: "inactive", label: "Inactive", count: counts.inactive },
            { key: "suspended", label: "Suspended", count: counts.suspended },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as FilterKey)}
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            icon="🛵"
            title="No riders match"
            message="Try adjusting your search or filters."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 900 }}>
              <AdminTable
                columns={columns}
                rows={filtered}
                keyExtractor={(r) => r.id}
                rowActions={(r) => (
                  <View style={styles.actionRow}>
                    <AdminButton
                      label="View"
                      variant="secondary"
                      size="sm"
                      onPress={() => setViewTarget(r)}
                    />
                    <AdminButton
                      label="Edit"
                      variant="ghost"
                      size="sm"
                      icon="✎"
                      onPress={() => setEditTarget(r)}
                    />
                    <AdminButton
                      label={r.status === "active" ? "Suspend" : "Activate"}
                      variant={r.status === "active" ? "warning" : "success"}
                      size="sm"
                      onPress={() => setSuspendTarget(r)}
                    />
                    <AdminButton
                      label="Remove"
                      variant="danger"
                      size="sm"
                      onPress={() => setDeleteTarget(r)}
                    />
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
          onClose={() => setViewTarget(null)}
          title={viewTarget.fullName}
          hideFooter
        >
          <View style={styles.detailHeader}>
            <AdminAvatar name={viewTarget.fullName} size={64} />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.detailTitle}>{viewTarget.fullName}</Text>
              <Text style={styles.detailMeta}>
                {viewTarget.vehicleType} • {viewTarget.vehiclePlate}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 6, marginTop: 6 }}
              >
                <RiderStatusBadge status={viewTarget.status} />
                <RiderApprovalBadge status={viewTarget.approvalStatus} />
              </View>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <Row label="Phone" value={viewTarget.phone} />
            <Row label="Email" value={viewTarget.email} />
            <Row label="National ID" value={viewTarget.nationalId} />
            <Row label="Driving License" value={viewTarget.drivingLicense} />
            <Row label="Vehicle" value={viewTarget.vehicleType} />
            <Row label="Plate" value={viewTarget.vehiclePlate} />
            <Row label="Joined" value={viewTarget.joinedDate} />
            <Row
              label="Assigned Seller"
              value={viewTarget.assignedSellerName ?? "Unassigned"}
            />
          </View>
        </AdminModal>
      ) : null}

      {editTarget ? (
        <RiderFormModal
          rider={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) => {
            setRiders((prev) =>
              prev.map((r) => (r.id === editTarget.id ? { ...r, ...data } : r)),
            );
            setEditTarget(null);
          }}
        />
      ) : null}

      <AdminModal
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Rider?"
        subtitle={`${deleteTarget?.fullName ?? ""} will be removed from the platform.`}
        onConfirm={handleDelete}
        confirmLabel="Remove"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          Removing the rider will unassign them from their seller. This
          action cannot be undone.
        </Text>
      </AdminModal>

      <AdminModal
        visible={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        title={
          suspendTarget?.status === "active"
            ? "Suspend Rider?"
            : "Activate Rider?"
        }
        subtitle={
          suspendTarget?.fullName ??
          ""
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
          The rider will be unable to receive new deliveries while
          suspended.
        </Text>
      </AdminModal>
    </AdminLayout>
  );
}

function RiderFormModal({
  rider,
  onClose,
  onSubmit,
}: {
  rider: Rider;
  onClose: () => void;
  onSubmit: (data: Partial<Rider>) => void;
}) {
  const [fullName, setFullName] = useState(rider.fullName);
  const [phone, setPhone] = useState(rider.phone);
  const [email, setEmail] = useState(rider.email);
  const [vehicleType, setVehicleType] = useState(rider.vehicleType);
  const [vehiclePlate, setVehiclePlate] = useState(rider.vehiclePlate);

  return (
    <AdminModal
      visible
      onClose={onClose}
      title="Edit Rider"
      hideFooter
    >
      <ScrollView style={{ maxHeight: 480 }}>
        <AdminFormGrid columns={2}>
          <AdminFormField label="Full Name" required>
            <AdminInput value={fullName} onChangeText={setFullName} />
          </AdminFormField>
          <AdminFormField label="Phone" required>
            <AdminInput value={phone} onChangeText={setPhone} />
          </AdminFormField>
          <AdminFormField label="Email">
            <AdminInput value={email} onChangeText={setEmail} />
          </AdminFormField>
          <AdminFormField label="National ID">
            <AdminInput value={rider.nationalId} editable={false} />
          </AdminFormField>
          <AdminFormField label="Vehicle Type">
            <AdminInput value={vehicleType} onChangeText={setVehicleType} />
          </AdminFormField>
          <AdminFormField label="Plate">
            <AdminInput
              value={vehiclePlate}
              onChangeText={(v) => setVehiclePlate(v.toUpperCase())}
            />
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
              onSubmit({ fullName, phone, email, vehicleType, vehiclePlate })
            }
          />
        </View>
      </ScrollView>
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
    gap: Spacing.sm,
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
});