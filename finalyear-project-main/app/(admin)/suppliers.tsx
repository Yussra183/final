/**
 * Admin Dashboard – Suppliers page.
 *
 * Lists registered suppliers with search, status filter, view, edit,
 * suspend and delete actions. Includes a "Register Supplier" form
 * modal and per-row confirmation dialogs.
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
  AdminCard,
  AdminAvatar,
  AdminButton,
  AdminEmptyState,
  AdminInput,
  AdminFormField,
  AdminFormGrid,
  AdminModal,
  AdminSearchBar,
  AdminStatTile,
  AdminTable,
  SupplierStatusBadge,
  AdminBadge,
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { Supplier, SUPPLIERS } from "../../src/store/adminData";

type FilterKey = "all" | "active" | "suspended";

export default function AdminSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>(SUPPLIERS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showRegister, setShowRegister] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [viewTarget, setViewTarget] = useState<Supplier | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Supplier | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      const matchQ =
        !q ||
        s.companyName.toLowerCase().includes(q) ||
        s.contactPerson.toLowerCase().includes(q) ||
        s.location.toLowerCase().includes(q);
      const matchF = filter === "all" || s.status === filter;
      return matchQ && matchF;
    });
  }, [suppliers, search, filter]);

  const counts = useMemo(
    () => ({
      all: suppliers.length,
      active: suppliers.filter((s) => s.status === "active").length,
      suspended: suppliers.filter((s) => s.status === "suspended").length,
    }),
    [suppliers],
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    setSuppliers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleSuspend = () => {
    if (!suspendTarget) return;
    setSuppliers((prev) =>
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

  const handleSaveEdit = (next: Supplier) => {
    setSuppliers((prev) => prev.map((s) => (s.id === next.id ? next : s)));
    setEditTarget(null);
  };

  const handleRegister = (data: Omit<Supplier, "id" | "joinedDate">) => {
    const newSupplier: Supplier = {
      ...data,
      id: `sup-${Math.floor(Math.random() * 9000 + 1000)}`,
      joinedDate: new Date().toISOString().slice(0, 10),
    };
    setSuppliers((prev) => [newSupplier, ...prev]);
    setShowRegister(false);
  };

  const columns: AdminTableColumn<Supplier>[] = [
    {
      key: "company",
      label: "Company",
      flex: 2.4,
      render: (s) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={s.companyName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{s.companyName}</Text>
            <Text style={styles.cellMeta}>{s.email}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "contact",
      label: "Contact",
      flex: 1.6,
      render: (s) => (
        <View>
          <Text style={styles.cellText}>{s.contactPerson}</Text>
          <Text style={styles.cellMeta}>{s.phone}</Text>
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
      key: "routes",
      label: "Routes",
      flex: 0.6,
      align: "center",
      render: (s) => (
        <View style={styles.routesBubble}>
          <Text style={styles.routesText}>{s.routes}</Text>
        </View>
      ),
    },
    {
      key: "status",
      label: "Status",
      flex: 0.8,
      render: (s) => <SupplierStatusBadge status={s.status} />,
    },
    {
      key: "joined",
      label: "Joined",
      flex: 0.8,
      render: (s) => (
        <Text style={[styles.cellText, { color: Colors.textSecondary }]}>
          {s.joinedDate}
        </Text>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Suppliers"
      rightActions={
        <AdminButton
          icon="＋"
          label="Register Supplier"
          onPress={() => setShowRegister(true)}
        />
      }
    >
      {/* KPI strip */}
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Suppliers"
          value={suppliers.length}
          icon="🏭"
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
          label="Routes Managed"
          value={suppliers.reduce((s, x) => s + x.routes, 0)}
          icon="🗺️"
          tone="info"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by company, contact or location"
          filters={[
            { key: "all", label: "All", count: counts.all },
            { key: "active", label: "Active", count: counts.active },
            { key: "suspended", label: "Suspended", count: counts.suspended },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as FilterKey)}
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            icon="🏭"
            title="No suppliers match your search"
            message="Try clearing your filters or registering a new supplier."
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

      {/* Register modal */}
      {showRegister ? (
        <SupplierFormModal
          mode="create"
          onClose={() => setShowRegister(false)}
          onSubmit={handleRegister}
        />
      ) : null}

      {editTarget ? (
        <SupplierFormModal
          mode="edit"
          supplier={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) =>
            handleSaveEdit({ ...editTarget, ...data } as Supplier)
          }
        />
      ) : null}

      {viewTarget ? (
        <SupplierDetailsModal
          supplier={viewTarget}
          onClose={() => setViewTarget(null)}
        />
      ) : null}

      <AdminModal
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Supplier?"
        subtitle={`This will permanently remove ${deleteTarget?.companyName ?? ""}.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          Deleting a supplier removes their routes, seller linkages and any
          historical reports. This action cannot be undone.
        </Text>
      </AdminModal>

      <AdminModal
        visible={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        title={
          suspendTarget?.status === "active"
            ? "Suspend Supplier?"
            : "Activate Supplier?"
        }
        subtitle={
          suspendTarget?.status === "active"
            ? `Suspending ${suspendTarget?.companyName ?? ""} will halt all incoming orders.`
            : `Reactivating ${suspendTarget?.companyName ?? ""} will resume operations.`
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
          Sellers and riders linked to this supplier will be notified.
        </Text>
      </AdminModal>
    </AdminLayout>
  );
}

interface SupplierFormProps {
  mode: "create" | "edit";
  supplier?: Supplier;
  onClose: () => void;
  onSubmit: (data: Omit<Supplier, "id" | "joinedDate">) => void;
}

function SupplierFormModal({
  mode,
  supplier,
  onClose,
  onSubmit,
}: SupplierFormProps) {
  const [companyName, setCompanyName] = useState(supplier?.companyName ?? "");
  const [contactPerson, setContactPerson] = useState(
    supplier?.contactPerson ?? "",
  );
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [location, setLocation] = useState(supplier?.location ?? "");
  const [routes, setRoutes] = useState(String(supplier?.routes ?? 0));
  const [status, setStatus] = useState<"active" | "suspended">(
    supplier?.status ?? "active",
  );
  const [submitted, setSubmitted] = useState(false);

  const valid =
    companyName.trim() && contactPerson.trim() && phone.trim() && location.trim();

  const handleSubmit = () => {
    setSubmitted(true);
    if (!valid) return;
    onSubmit({
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      routes: Number(routes) || 0,
      status,
    });
  };

  return (
    <AdminModal
      visible
      onClose={onClose}
      title={mode === "create" ? "Register Supplier" : "Edit Supplier"}
      subtitle={
        mode === "create"
          ? "Add a new gas supplier to the platform"
          : "Update supplier information"
      }
      hideFooter
    >
      <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
        <AdminFormGrid columns={2}>
          <AdminFormField label="Company Name" required>
            <AdminInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="e.g. TotalGas Distributors"
              invalid={submitted && !companyName.trim()}
            />
          </AdminFormField>
          <AdminFormField label="Contact Person" required>
            <AdminInput
              value={contactPerson}
              onChangeText={setContactPerson}
              placeholder="Full name"
              invalid={submitted && !contactPerson.trim()}
            />
          </AdminFormField>
          <AdminFormField label="Email">
            <AdminInput
              value={email}
              onChangeText={setEmail}
              placeholder="contact@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </AdminFormField>
          <AdminFormField label="Phone" required>
            <AdminInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+254 7XX XXX XXX"
              keyboardType="phone-pad"
              invalid={submitted && !phone.trim()}
            />
          </AdminFormField>
          <AdminFormField label="Location" required>
            <AdminInput
              value={location}
              onChangeText={setLocation}
              placeholder="Depot / Region"
              invalid={submitted && !location.trim()}
            />
          </AdminFormField>
          <AdminFormField label="Number of Routes">
            <AdminInput
              value={routes}
              onChangeText={(v) => setRoutes(v.replace(/[^0-9]/g, ""))}
              placeholder="0"
              keyboardType="number-pad"
            />
          </AdminFormField>
          <AdminFormField label="Status">
            <View style={styles.segmented}>
              {(["active", "suspended"] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setStatus(opt)}
                  style={[
                    styles.segItem,
                    status === opt && styles.segItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segText,
                      status === opt && styles.segTextActive,
                    ]}
                  >
                    {opt[0].toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
            label={mode === "create" ? "Register" : "Save Changes"}
            onPress={handleSubmit}
          />
        </View>
      </ScrollView>
    </AdminModal>
  );
}

function SupplierDetailsModal({
  supplier,
  onClose,
}: {
  supplier: Supplier;
  onClose: () => void;
}) {
  return (
    <AdminModal visible onClose={onClose} title={supplier.companyName} hideFooter>
      <View style={{ gap: Spacing.md }}>
        <View style={styles.detailHeader}>
          <AdminAvatar name={supplier.companyName} size={56} />
          <View style={{ flex: 1, marginLeft: Spacing.md }}>
            <Text style={styles.detailTitle}>{supplier.companyName}</Text>
            <Text style={styles.detailMeta}>
              {supplier.contactPerson} • {supplier.location}
            </Text>
            <View style={{ marginTop: 6 }}>
              <SupplierStatusBadge status={supplier.status} />
            </View>
          </View>
        </View>

        <View style={styles.detailGrid}>
          <DetailRow label="Email" value={supplier.email} />
          <DetailRow label="Phone" value={supplier.phone} />
          <DetailRow label="Routes Managed" value={String(supplier.routes)} />
          <DetailRow label="Joined" value={supplier.joinedDate} />
        </View>

        <View style={styles.detailBadges}>
          <AdminBadge label={`${supplier.routes} routes`} tone="info" />
          <AdminBadge label="Verified" tone="success" icon="✓" />
        </View>
      </View>
    </AdminModal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
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
  routesBubble: {
    backgroundColor: Colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  routesText: {
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
  segmented: {
    flexDirection: "row",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: 4,
  },
  segItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  segItemActive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  segTextActive: {
    color: Colors.text,
    fontWeight: "800",
  },
  formFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: Spacing.md,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
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
  detailBadges: {
    flexDirection: "row",
    gap: 6,
  },
});