/**
 * Fleet page — consolidates the supplier's Riders and Vehicles screens
 * into one tabbed page so the team and equipment can be managed side by
 * side without leaving the page.
 *
 * Tabs:
 *   • Riders   — list of every rider with active/inactive toggle and an
 *                inline "Add rider" form
 *   • Vehicles — list of every vehicle with active/inactive toggle and an
 *                inline "Add vehicle" form
 *
 * All functionality from the two merged pages is preserved verbatim;
 * only the chrome has changed.
 */
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { RiderRow } from "../../src/components/RiderRow";
import { VehicleRow } from "../../src/components/VehicleRow";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";

type FleetTab = "riders" | "vehicles";

export default function SupplierFleet() {
  return (
    <SupplierApprovalGate title="Fleet">
      <FleetContent />
    </SupplierApprovalGate>
  );
}

function FleetContent() {
  const [tab, setTab] = useState<FleetTab>("riders");

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Fleet</Text>
            <Text style={styles.subtitle}>
              Riders and vehicles you can dispatch on a delivery
            </Text>
          </View>
        </View>

        {/* Tab bar — segmented control */}
        <View style={styles.tabBar}>
          {(
            [
              { key: "riders", label: "Riders", icon: "🪪" },
              { key: "vehicles", label: "Vehicles", icon: "🚚" },
            ] as { key: FleetTab; label: string; icon: string }[]
          ).map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                activeOpacity={0.85}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={styles.tabIcon}>{t.icon}</Text>
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === "riders" ? <RidersSection /> : <VehiclesSection />}
      </SafeAreaView>
    </SidebarLayout>
  );
}

/* ---------- Riders ---------- */

function RidersSection() {
  const { riders, addRider, toggleRiderActive } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNo, setLicenseNo] = useState("");

  const handleAdd = async () => {
    if (!name.trim() || !phone.trim() || !licenseNo.trim()) {
      Alert.alert("Missing fields", "All three fields are required.");
      return;
    }
    await addRider({
      fullName: name.trim(),
      phone: phone.trim(),
      licenseNo: licenseNo.trim(),
      active: true,
    });
    setName("");
    setPhone("");
    setLicenseNo("");
    setShowForm(false);
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingTop: 0,
        paddingBottom: Spacing.xxl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.subHeader}>
        <Text style={styles.subHeaderTitle}>Riders</Text>
        <Text style={styles.subHeaderMeta}>
          {riders.filter((r) => r.active).length} active • {riders.length} total
        </Text>
        <AppButton
          title={showForm ? "Cancel" : "+ Add"}
          variant={showForm ? "outline" : "primary"}
          onPress={() => setShowForm((v) => !v)}
          style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}
        />
      </View>

      {showForm ? (
        <View style={styles.form}>
          <AppInput
            label="Full name"
            placeholder="e.g. Salim Yusuf"
            value={name}
            onChangeText={setName}
          />
          <AppInput
            label="Phone"
            placeholder="+2557..."
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <AppInput
            label="License number"
            placeholder="TZ-DL-1234"
            value={licenseNo}
            onChangeText={setLicenseNo}
          />
          <AppButton
            title="Save rider"
            variant="primary"
            fullWidth
            onPress={handleAdd}
          />
        </View>
      ) : null}

      {riders.map((r) => (
        <RiderRow
          key={r.id}
          rider={r}
          onToggle={(active) => toggleRiderActive(r.id, active)}
        />
      ))}
    </ScrollView>
  );
}

/* ---------- Vehicles ---------- */

function VehiclesSection() {
  const { vehicles, addVehicle, toggleVehicleActive } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [capacity, setCapacity] = useState("");

  const handleAdd = async () => {
    if (!plate.trim() || !model.trim() || !capacity.trim()) {
      Alert.alert("Missing fields", "Plate, model, and capacity are required.");
      return;
    }
    const cap = parseInt(capacity, 10);
    if (!Number.isFinite(cap) || cap <= 0) {
      Alert.alert("Invalid capacity", "Capacity must be a positive number.");
      return;
    }
    await addVehicle({
      plate: plate.trim(),
      model: model.trim(),
      capacityKg: cap,
      active: true,
    });
    setPlate("");
    setModel("");
    setCapacity("");
    setShowForm(false);
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingTop: 0,
        paddingBottom: Spacing.xxl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.subHeader}>
        <Text style={styles.subHeaderTitle}>Vehicles</Text>
        <Text style={styles.subHeaderMeta}>
          {vehicles.filter((v) => v.active).length} active •{" "}
          {vehicles.length} total
        </Text>
        <AppButton
          title={showForm ? "Cancel" : "+ Add"}
          variant={showForm ? "outline" : "primary"}
          onPress={() => setShowForm((v) => !v)}
          style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}
        />
      </View>

      {showForm ? (
        <View style={styles.form}>
          <AppInput
            label="Plate"
            placeholder="T 123 ABC"
            value={plate}
            onChangeText={setPlate}
          />
          <AppInput
            label="Model"
            placeholder="Isuzu NPR"
            value={model}
            onChangeText={setModel}
          />
          <AppInput
            label="Capacity (kg)"
            placeholder="3000"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="numeric"
          />
          <AppButton
            title="Save vehicle"
            variant="primary"
            fullWidth
            onPress={handleAdd}
          />
        </View>
      ) : null}

      {vehicles.map((v) => (
        <VehicleRow
          key={v.id}
          vehicle={v}
          onToggle={(active) => toggleVehicleActive(v.id, active)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  /* segmented tab bar */
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
  },
  tabIcon: { fontSize: 14 },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  tabTextActive: { color: "#FFF" },
  /* per-section sub-header (count + Add button) */
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  subHeaderTitle: {
    flex: 1,
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  subHeaderMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginRight: Spacing.sm,
  },
  form: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});