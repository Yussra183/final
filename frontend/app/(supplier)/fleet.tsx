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
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { RiderRow } from "../../src/components/RiderRow";
import { VehicleRow } from "../../src/components/VehicleRow";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";
import { SegmentedTabs, SegmentedTab } from "../../src/components/SegmentedTabs";

type FleetTab = "riders" | "vehicles";

const FLEET_TABS: SegmentedTab[] = [
  { key: "riders", label: "Riders", icon: "person-outline" },
  { key: "vehicles", label: "Vehicles", icon: "car-sport-outline" },
];

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

        <SegmentedTabs
          tabs={FLEET_TABS}
          active={tab}
          onChange={(k) => setTab(k as FleetTab)}
        />

        {tab === "riders" ? <RidersSection /> : <VehiclesSection />}
      </SafeAreaView>
    </SidebarLayout>
  );
}

/* ---------- Riders ---------- */

function RidersSection() {
  // The supplier creates and owns their riders directly. The Add
  // Rider form below POSTs to /api/supplier-riders/riders, which
  // creates a real `users(role=RIDER)` row + `rider_profiles` row +
  // `supplier_riders` join row in one transaction and returns the
  // freshly persisted rider with its real numeric id — never a
  // synthetic placeholder. The Delivery Operations rider picker
  // reads `supplierRiders`, so the new rider is immediately
  // selectable when creating a route.
  const {
    supplierRiders,
    toggleRiderActive,
    addSupplierRider,
  } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert(
        "Missing fields",
        "Rider name and phone are required.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await addSupplierRider({
        fullName: fullName.trim(),
        phone: phone.trim(),
        licenseNo: licenseNo.trim() || undefined,
        vehiclePlate: plate.trim() || undefined,
        vehicleModel: model.trim() || undefined,
      });
      setFullName("");
      setPhone("");
      setLicenseNo("");
      setPlate("");
      setModel("");
      setShowForm(false);
    } catch (err) {
      Alert.alert(
        "Could not add rider",
        (err as Error)?.message ?? "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
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
        <View style={styles.subHeaderTitleBlock}>
          <Text style={styles.subHeaderTitle}>Riders</Text>
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>
              {supplierRiders.filter((r) => r.active).length} active •{" "}
              {supplierRiders.length} on your roster
            </Text>
          </View>
        </View>
        <AppButton
          title={showForm ? "Cancel" : "Add"}
          variant={showForm ? "outline" : "primary"}
          leftIcon={
            showForm ? null : (
              <Ionicons name="add" size={14} color="#FFF" />
            )
          }
          onPress={() => setShowForm((v) => !v)}
          style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}
        />
      </View>

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            <Ionicons
              name="person-add-outline"
              size={14}
              color={Colors.supplier}
            />
            {" "}Add a rider
          </Text>
          <AppInput
            label="Full name"
            placeholder="e.g. Ali Hassan"
            value={fullName}
            onChangeText={setFullName}
          />
          <AppInput
            label="Phone"
            placeholder="+255 7XX XXX XXX"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <AppInput
            label="License number (optional)"
            placeholder="e.g. T1234567"
            value={licenseNo}
            onChangeText={setLicenseNo}
          />
          <AppInput
            label="Vehicle plate (optional)"
            placeholder="T 123 ABC"
            value={plate}
            onChangeText={setPlate}
          />
          <AppInput
            label="Vehicle model (optional)"
            placeholder="e.g. Honda CG 125"
            value={model}
            onChangeText={setModel}
          />
          <AppButton
            title={submitting ? "Saving…" : "Save rider"}
            variant="primary"
            fullWidth
            disabled={submitting}
            onPress={handleAdd}
            leftIcon={
              submitting ? null : (
                <Ionicons name="checkmark" size={14} color="#FFF" />
              )
            }
          />
        </View>
      ) : null}

      {supplierRiders.length === 0 ? (
        <View style={styles.form}>
          <Text style={styles.helpText}>
            No riders yet. Use the Add button above to register your
            first rider.
          </Text>
        </View>
      ) : (
        supplierRiders.map((r) => (
          <RiderRow
            key={r.id}
            rider={r}
            onToggle={(active) => toggleRiderActive(r.id, active)}
            // V19 — supplier↔rider assignment. The backend's
            // `requireOwnRider` only accepts riders in the supplier's
            // roster, so this toggle is what makes the rider selectable
            // from Add Route / Edit Route / Start Delivery. The id sent
            // to `linkSupplierRider` is the real backend id from
            // `RidersApi.list()` — never a locally generated one.
            assigned={true}
            onAssignToggle={() => undefined}
          />
        ))
      )}
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
        <View style={styles.subHeaderTitleBlock}>
          <Text style={styles.subHeaderTitle}>Vehicles</Text>
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>
              {vehicles.filter((v) => v.active).length} active •{" "}
              {vehicles.length} total
            </Text>
          </View>
        </View>
        <AppButton
          title={showForm ? "Cancel" : "Add"}
          variant={showForm ? "outline" : "primary"}
          leftIcon={
            showForm ? null : (
              <Ionicons name="add" size={14} color="#FFF" />
            )
          }
          onPress={() => setShowForm((v) => !v)}
          style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}
        />
      </View>

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            <Ionicons name="car-sport-outline" size={14} color={Colors.supplier} />
            {" "}Add a vehicle
          </Text>
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
            leftIcon={<Ionicons name="checkmark" size={14} color="#FFF" />}
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
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  /* per-section sub-header (count + Add button) */
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  subHeaderTitleBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  subHeaderTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  metaChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  metaChipText: {
    fontSize: 10,
    color: Colors.supplier,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  form: {
    backgroundColor: "#F5F3FF",
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  formTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.supplier,
    marginBottom: Spacing.sm,
  },
  helpText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
    fontWeight: "600",
  },
});