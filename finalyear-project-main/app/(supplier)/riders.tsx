/**
 * Riders screen — CRUD for the supplier's rider team. Active riders can
 * be dispatched on a trip; inactive ones are kept for history.
 *
 * Toggling a rider inactive removes them from the Start Delivery picker
 * (the screen filters on `rider.active`).
 */
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { RiderRow } from "../../src/components/RiderRow";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { SidebarLayout } from "../../src/components/SidebarLayout";

export default function RidersScreen() {
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
    await addRider({ fullName: name.trim(), phone: phone.trim(), licenseNo: licenseNo.trim(), active: true });
    setName("");
    setPhone("");
    setLicenseNo("");
    setShowForm(false);
  };

  return (
    <SidebarLayout>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Riders</Text>
            <Text style={styles.subtitle}>
              {riders.filter((r) => r.active).length} active • {riders.length} total
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
              <AppButton title="Save rider" variant="primary" fullWidth onPress={handleAdd} />
            </View>
          ) : null}

          {riders.map((r) => (
            <RiderRow key={r.id} rider={r} onToggle={(active) => toggleRiderActive(r.id, active)} />
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