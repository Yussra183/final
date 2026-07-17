/**
 * Admin Dashboard – Customers page.
 *
 * Lists all customers with search and filters, including view details
 * and suspend / activate actions.
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
} from "../../src/components/admin";
import { AdminTableColumn } from "../../src/components/admin/AdminTable";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { CUSTOMERS, Customer } from "../../src/store/adminData";

type FilterKey = "all" | "active" | "inactive";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(CUSTOMERS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [viewTarget, setViewTarget] = useState<Customer | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      const matchQ =
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q);
      const matchF = filter === "all" || c.status === filter;
      return matchQ && matchF;
    });
  }, [customers, search, filter]);

  const counts = useMemo(
    () => ({
      all: customers.length,
      active: customers.filter((c) => c.status === "active").length,
      inactive: customers.filter((c) => c.status === "inactive").length,
    }),
    [customers],
  );

  const handleSuspend = () => {
    if (!suspendTarget) return;
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === suspendTarget.id
          ? {
              ...c,
              status: c.status === "active" ? "inactive" : "active",
            }
          : c,
      ),
    );
    setSuspendTarget(null);
  };

  const formatCurrency = (n: number) =>
    `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

  const columns: AdminTableColumn<Customer>[] = [
    {
      key: "name",
      label: "Customer",
      flex: 2.2,
      render: (c) => (
        <View style={styles.cellRow}>
          <AdminAvatar name={c.fullName} size={36} />
          <View>
            <Text style={styles.cellTitle}>{c.fullName}</Text>
            <Text style={styles.cellMeta}>{c.email}</Text>
          </View>
        </View>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      flex: 1.4,
      render: (c) => <Text style={styles.cellText}>{c.phone}</Text>,
    },
    {
      key: "location",
      label: "Location",
      flex: 1.6,
      render: (c) => <Text style={styles.cellText}>{c.location}</Text>,
    },
    {
      key: "orders",
      label: "Orders",
      flex: 0.7,
      align: "center",
      render: (c) => (
        <View style={styles.ordersBubble}>
          <Text style={styles.ordersText}>{c.totalOrders}</Text>
        </View>
      ),
    },
    {
      key: "spent",
      label: "Total Spent",
      flex: 1.1,
      align: "right",
      render: (c) => (
        <Text style={[styles.cellText, { color: Colors.primary, fontWeight: "800" }]}>
          {formatCurrency(c.totalSpent)}
        </Text>
      ),
    },
    {
      key: "status",
      label: "Status",
      flex: 0.9,
      render: (c) => (
        <AdminBadge
          label={c.status[0].toUpperCase() + c.status.slice(1)}
          tone={c.status === "active" ? "success" : "neutral"}
        />
      ),
    },
  ];

  return (
    <AdminLayout title="Customers" subtitle="All customers using the platform">
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Customers"
          value={counts.all}
          icon="👥"
          tone="primary"
          delta="+12%"
          deltaTone="up"
        />
        <AdminStatTile
          label="Active"
          value={counts.active}
          icon="✅"
          tone="success"
        />
        <AdminStatTile
          label="Inactive"
          value={counts.inactive}
          icon="💤"
          tone="warning"
        />
        <AdminStatTile
          label="Avg. Spend"
          value={formatCurrency(
            customers.reduce((s, c) => s + c.totalSpent, 0) /
              Math.max(customers.length, 1),
          )}
          icon="💰"
          tone="accent"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name, email or phone"
          filters={[
            { key: "all", label: "All", count: counts.all },
            { key: "active", label: "Active", count: counts.active },
            { key: "inactive", label: "Inactive", count: counts.inactive },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as FilterKey)}
        />
        {filtered.length === 0 ? (
          <AdminEmptyState
            icon="👥"
            title="No customers found"
            message="Try adjusting your search or filters."
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 900 }}>
              <AdminTable
                columns={columns}
                rows={filtered}
                keyExtractor={(c) => c.id}
                rowActions={(c) => (
                  <View style={styles.actionRow}>
                    <AdminButton
                      label="View"
                      variant="secondary"
                      size="sm"
                      onPress={() => setViewTarget(c)}
                    />
                    <AdminButton
                      label={c.status === "active" ? "Deactivate" : "Activate"}
                      variant={c.status === "active" ? "warning" : "success"}
                      size="sm"
                      onPress={() => setSuspendTarget(c)}
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
              <Text style={styles.detailMeta}>{viewTarget.location}</Text>
              <View style={{ marginTop: 6, flexDirection: "row", gap: 6 }}>
                <AdminBadge
                  label={viewTarget.status[0].toUpperCase() + viewTarget.status.slice(1)}
                  tone={viewTarget.status === "active" ? "success" : "neutral"}
                />
                <AdminBadge label="Customer" tone="info" />
              </View>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <Row label="Email" value={viewTarget.email} />
            <Row label="Phone" value={viewTarget.phone} />
            <Row label="Total Orders" value={String(viewTarget.totalOrders)} />
            <Row label="Total Spent" value={formatCurrency(viewTarget.totalSpent)} />
            <Row label="Joined" value={viewTarget.joinedDate} />
          </View>
        </AdminModal>
      ) : null}

      <AdminModal
        visible={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        title={
          suspendTarget?.status === "active"
            ? "Deactivate Customer?"
            : "Reactivate Customer?"
        }
        subtitle={suspendTarget?.fullName ?? ""}
        onConfirm={handleSuspend}
        confirmLabel={
          suspendTarget?.status === "active" ? "Deactivate" : "Activate"
        }
        confirmVariant={
          suspendTarget?.status === "active" ? "warning" : "success"
        }
      >
        <Text style={styles.dialogText}>
          Deactivating the customer will prevent them from placing new
          orders until reactivated.
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