/**
 * Admin Dashboard – Routes & Schedules page.
 *
 * Create, edit and delete delivery routes. Each route is assigned to
 * a supplier, has stops, delivery days and a delivery time window.
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
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminFormField,
  AdminFormGrid,
  AdminModal,
  AdminSearchBar,
  AdminSelect,
  AdminStatTile,
} from "../../src/components/admin";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../constants/colors";
import {
  DeliveryRoute,
  ROUTES,
  SUPPLIERS,
} from "../../src/store/adminData";

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function RoutesPage() {
  const [routes, setRoutes] = useState<DeliveryRoute[]>(ROUTES);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [editTarget, setEditTarget] = useState<DeliveryRoute | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeliveryRoute | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return routes.filter((r) => {
      const matchQ =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q);
      const matchF = filter === "all" || r.status === filter;
      return matchQ && matchF;
    });
  }, [routes, search, filter]);

  const counts = useMemo(
    () => ({
      all: routes.length,
      active: routes.filter((r) => r.status === "active").length,
      inactive: routes.filter((r) => r.status === "inactive").length,
    }),
    [routes],
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    setRoutes((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <AdminLayout
      title="Routes & Schedules"
      subtitle="Create delivery routes and assign them to suppliers"
      rightActions={
        <AdminButton
          icon="＋"
          label="Create Route"
          onPress={() => setCreateOpen(true)}
        />
      }
    >
      <View style={styles.kpiRow}>
        <AdminStatTile
          label="Total Routes"
          value={counts.all}
          icon="🗺️"
          tone="primary"
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
          label="Total Stops"
          value={routes.reduce((s, r) => s + r.stops.length, 0)}
          icon="📍"
          tone="info"
        />
      </View>

      <AdminCard style={{ marginTop: Spacing.lg }}>
        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search routes or suppliers"
          filters={[
            { key: "all", label: "All", count: counts.all },
            { key: "active", label: "Active", count: counts.active },
            { key: "inactive", label: "Inactive", count: counts.inactive },
          ]}
          activeFilter={filter}
          onFilterChange={(k) => setFilter(k as "all" | "active" | "inactive")}
        />

        {filtered.length === 0 ? (
          <AdminEmptyState
            icon="🗺️"
            title="No routes yet"
            message="Create your first delivery route to get started."
          />
        ) : (
          <View style={{ gap: Spacing.md, marginTop: Spacing.md }}>
            {filtered.map((r) => (
              <View key={r.id} style={styles.routeCard}>
                <View style={styles.routeHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routeName}>{r.name}</Text>
                    <Text style={styles.routeMeta}>
                      Supplier: {r.supplierName}
                    </Text>
                  </View>
                  <AdminBadge
                    label={r.status[0].toUpperCase() + r.status.slice(1)}
                    tone={r.status === "active" ? "success" : "neutral"}
                  />
                </View>

                <View style={styles.routeGrid}>
                  <View style={styles.routeItem}>
                    <Text style={styles.routeLabel}>Start → End</Text>
                    <Text style={styles.routeValue}>
                      {r.startLocation} → {r.endLocation}
                    </Text>
                  </View>
                  <View style={styles.routeItem}>
                    <Text style={styles.routeLabel}>Delivery Days</Text>
                    <View style={styles.daysRow}>
                      {r.deliveryDays.map((d) => (
                        <View key={d} style={styles.dayChip}>
                          <Text style={styles.dayText}>{d.slice(0, 3)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.routeItem}>
                    <Text style={styles.routeLabel}>Time Window</Text>
                    <Text style={styles.routeValue}>{r.deliveryTime}</Text>
                  </View>
                  <View style={styles.routeItem}>
                    <Text style={styles.routeLabel}>Stops</Text>
                    <Text style={styles.routeValue}>{r.stops.length}</Text>
                  </View>
                </View>

                <View style={styles.stopsRow}>
                  {r.stops.map((s, idx) => (
                    <View key={s} style={styles.stopItem}>
                      <View style={styles.stopNumber}>
                        <Text style={styles.stopNumberText}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.stopName}>{s}</Text>
                      {idx < r.stops.length - 1 ? (
                        <Text style={styles.stopArrow}>›</Text>
                      ) : null}
                    </View>
                  ))}
                </View>

                <View style={styles.routeActions}>
                  <AdminButton
                    label="Edit"
                    variant="secondary"
                    size="sm"
                    icon="✎"
                    onPress={() => setEditTarget(r)}
                  />
                  <AdminButton
                    label="Delete"
                    variant="danger"
                    size="sm"
                    icon="🗑"
                    onPress={() => setDeleteTarget(r)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </AdminCard>

      {(createOpen || editTarget) && (
        <RouteFormModal
          route={editTarget ?? undefined}
          onClose={() => {
            setCreateOpen(false);
            setEditTarget(null);
          }}
          onSubmit={(data) => {
            if (editTarget) {
              setRoutes((prev) =>
                prev.map((r) =>
                  r.id === editTarget.id ? { ...r, ...data } : r,
                ),
              );
            } else {
              setRoutes((prev) => [
                {
                  ...data,
                  id: `rt-${Math.floor(Math.random() * 9000 + 1000)}`,
                } as DeliveryRoute,
                ...prev,
              ]);
            }
            setCreateOpen(false);
            setEditTarget(null);
          }}
        />
      )}

      <AdminModal
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Route?"
        subtitle={`Route "${deleteTarget?.name ?? ""}" will be removed.`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        <Text style={styles.dialogText}>
          Deleting this route stops all scheduled deliveries. Suppliers and
          sellers will be notified.
        </Text>
      </AdminModal>
    </AdminLayout>
  );
}

interface RouteFormProps {
  route?: DeliveryRoute;
  onClose: () => void;
  onSubmit: (data: Omit<DeliveryRoute, "id">) => void;
}

function RouteFormModal({ route, onClose, onSubmit }: RouteFormProps) {
  const [name, setName] = useState(route?.name ?? "");
  const [supplierId, setSupplierId] = useState(
    route?.supplierId ?? SUPPLIERS[0]?.id ?? "",
  );
  const [startLocation, setStartLocation] = useState(
    route?.startLocation ?? "",
  );
  const [endLocation, setEndLocation] = useState(route?.endLocation ?? "");
  const [stopsText, setStopsText] = useState(route?.stops.join(", ") ?? "");
  const [deliveryTime, setDeliveryTime] = useState(route?.deliveryTime ?? "");
  const [days, setDays] = useState<string[]>(route?.deliveryDays ?? []);
  const [status, setStatus] = useState<"active" | "inactive">(
    route?.status ?? "active",
  );

  const toggleDay = (d: string) => {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const valid =
    name.trim() &&
    supplierId &&
    startLocation.trim() &&
    endLocation.trim() &&
    stopsText.trim() &&
    deliveryTime.trim() &&
    days.length > 0;

  const handleSubmit = () => {
    if (!valid) return;
    const supplier = SUPPLIERS.find((s) => s.id === supplierId)!;
    onSubmit({
      name: name.trim(),
      supplierId,
      supplierName: supplier.companyName,
      startLocation: startLocation.trim(),
      endLocation: endLocation.trim(),
      stops: stopsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      deliveryDays: days,
      deliveryTime: deliveryTime.trim(),
      status,
    });
  };

  return (
    <AdminModal
      visible
      onClose={onClose}
      title={route ? "Edit Route" : "Create Route"}
      subtitle={
        route
          ? "Update route details and schedule"
          : "Set up a new delivery route"
      }
      hideFooter
    >
      <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
        <AdminFormGrid columns={2}>
          <AdminFormField label="Route Name" required>
            <AdminInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Nairobi West Circuit"
            />
          </AdminFormField>
          <AdminFormField label="Supplier" required>
            <AdminSelect
              value={supplierId}
              onValueChange={setSupplierId}
              options={SUPPLIERS.map((s) => ({
                label: s.companyName,
                value: s.id,
              }))}
              placeholder="Select supplier"
            />
          </AdminFormField>
          <AdminFormField label="Start Location" required>
            <AdminInput
              value={startLocation}
              onChangeText={setStartLocation}
              placeholder="Depot / Start point"
            />
          </AdminFormField>
          <AdminFormField label="End Location" required>
            <AdminInput
              value={endLocation}
              onChangeText={setEndLocation}
              placeholder="Final drop-off"
            />
          </AdminFormField>
          <AdminFormField
            label="Stops"
            required
            hint="Comma-separated, in order"
          >
            <AdminInput
              value={stopsText}
              onChangeText={setStopsText}
              placeholder="Stop 1, Stop 2, Stop 3"
            />
          </AdminFormField>
          <AdminFormField label="Delivery Time" required>
            <AdminInput
              value={deliveryTime}
              onChangeText={setDeliveryTime}
              placeholder="e.g. 08:00 - 14:00"
            />
          </AdminFormField>
        </AdminFormGrid>

        <View style={{ marginTop: Spacing.sm }}>
          <Text style={styles.label}>Delivery Days</Text>
          <View style={styles.daysPicker}>
            {ALL_DAYS.map((d) => {
              const active = days.includes(d);
              return (
                <TouchableOpacity
                  key={d}
                  onPress={() => toggleDay(d)}
                  activeOpacity={0.85}
                  style={[
                    styles.dayPickerChip,
                    active && styles.dayPickerChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayPickerText,
                      active && styles.dayPickerTextActive,
                    ]}
                  >
                    {d.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: Spacing.md }}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.segmented}>
            {(["active", "inactive"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => setStatus(opt)}
                style={[styles.segItem, status === opt && styles.segItemActive]}
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
        </View>

        <View style={styles.formFooter}>
          <AdminButton
            label="Cancel"
            variant="secondary"
            onPress={onClose}
            style={{ marginRight: Spacing.sm }}
          />
          <AdminButton
            label={route ? "Save Changes" : "Create Route"}
            onPress={handleSubmit}
          />
        </View>
      </ScrollView>
    </AdminModal>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  routeCard: {
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  routeName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  routeMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  routeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  routeItem: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 200,
  },
  routeLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  routeValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
  },
  daysRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  dayChip: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  dayText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "800",
  },
  stopsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    backgroundColor: Colors.surface,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
    gap: 6,
  },
  stopItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stopNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.admin,
    alignItems: "center",
    justifyContent: "center",
  },
  stopNumberText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "800",
  },
  stopName: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
  },
  stopArrow: {
    fontSize: 18,
    color: Colors.textSecondary,
    marginHorizontal: 2,
  },
  routeActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: Spacing.md,
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
  daysPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dayPickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayPickerChipActive: {
    backgroundColor: Colors.admin,
    borderColor: Colors.admin,
  },
  dayPickerText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  dayPickerTextActive: {
    color: "#FFF",
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
});