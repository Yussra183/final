/**
 * Vehicles screen — CRUD for the supplier's vehicle fleet.
 */
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { VehicleRow } from "../../src/components/VehicleRow";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { SidebarLayout } from "../../src/components/SidebarLayout";

export default function VehiclesScreen() {
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
    await addVehicle({ plate: plate.trim(), model: model.trim(), capacityKg: cap, active: true });
    setPlate("");
    setModel("");
    setCapacity("");
    setShowForm(false);
  };

  return (
    <SidebarLayout>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Vehicles</Text>
            <Text style={styles.subtitle}>
              {vehicles.filter((v) => v.active).length} active • {vehicles.length} total
            </Text>
          </View>
          <AppButton
            title={showForm ? "Cancel" : "+ Add"}
            variant={showForm ? "outline" : "primary"}
            onPress={() => setShowForm((v) => !v)}
            style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0, paddingBottom: Spacing.xxl }}
          keyboardShouldPersistTaps="handled"
        >
          {showForm ? (
            <View style={styles.form}>
              <AppInput label="Plate" placeholder="T 123 ABC" value={plate} onChangeText={setPlate} />
              <AppInput label="Model" placeholder="Isuzu NPR" value={model} onChangeText={setModel} />
              <AppInput
                label="Capacity (kg)"
                placeholder="3000"
                value={capacity}
                onChangeText={setCapacity}
                keyboardType="numeric"
              />
              <AppButton title="Save vehicle" variant="primary" fullWidth onPress={handleAdd} />
            </View>
          ) : null}

          {vehicles.map((v) => (
            <VehicleRow key={v.id} vehicle={v} onToggle={(active) => toggleVehicleActive(v.id, active)} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </SidebarLayout>
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
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  form: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});