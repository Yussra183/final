/**
 * Start Delivery screen — the pre-trip form. Supplier picks:
 *   • Route
 *   • Delivery date
 *   • Departure time
 *   • Vehicle
 *   • Rider
 *
 * Submitting calls `startTrip()` which creates the trip, fans out
 * notifications to every seller on the route, and navigates to the Live
 * Map screen.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { AppButton } from "../../src/components/AppButton";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";

const TIMES = ["04:30", "05:00", "05:30", "06:00", "06:30", "07:00", "08:00"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StartDelivery() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId?: string }>();
  const { routes, vehicles, riders, startTrip } = useStore();

  const [routeId, setRouteId] = useState<string>(params.routeId ?? routes[0]?.id ?? "");
  const [date, setDate] = useState<string>(today());
  const [departureTime, setDepartureTime] = useState<string>("05:00");
  const [vehicleId, setVehicleId] = useState<string>(
    vehicles.find((v) => v.active)?.id ?? "",
  );
  const [riderId, setRiderId] = useState<string>(
    riders.find((r) => r.active)?.id ?? "",
  );

  const route = useMemo(() => routes.find((r) => r.id === routeId), [routes, routeId]);

  const handleSubmit = async () => {
    if (!routeId || !vehicleId || !riderId) {
      Alert.alert("Missing fields", "Select a route, vehicle, and rider.");
      return;
    }
    try {
      const trip = await startTrip({ routeId, vehicleId, riderId, date, departureTime });
      Alert.alert(
        "Delivery started",
        `${trip.routeName} route is now live. ${trip.stops.length} sellers have been notified.`,
      );
      router.replace("/(supplier)/live-map" as any);
    } catch (err) {
      Alert.alert("Could not start", (err as Error).message);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Start Delivery</Text>
            <Text style={styles.subtitle}>Pre-trip planning</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
          {/* Route picker */}
          <Section label="Delivery route">
            {routes.map((r) => (
              <Selectable
                key={r.id}
                label={`${r.name} Route`}
                sub={`Every ${r.scheduleDay} at ${r.scheduleTime} • ${r.stops.length} stops`}
                active={r.id === routeId}
                onPress={() => setRouteId(r.id)}
              />
            ))}
          </Section>

          {/* Date — pick from today + next 3 days */}
          <Section label="Delivery date">
            <View style={styles.row}>
              {[-1, 0, 1, 2].map((offset) => {
                const d = new Date();
                d.setDate(d.getDate() + offset);
                const iso = d.toISOString().slice(0, 10);
                const label = offset === 0
                  ? "Today"
                  : offset === -1
                    ? "Yesterday"
                    : offset === 1
                      ? "Tomorrow"
                      : d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit" });
                return (
                  <Chip
                    key={iso}
                    label={`${label}\n${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`}
                    active={date === iso}
                    onPress={() => setDate(iso)}
                  />
                );
              })}
            </View>
          </Section>

          {/* Time */}
          <Section label="Departure time">
            <View style={styles.row}>
              {TIMES.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={departureTime === t}
                  onPress={() => setDepartureTime(t)}
                />
              ))}
            </View>
          </Section>

          {/* Vehicle */}
          <Section label="Vehicle">
            {vehicles.filter((v) => v.active).map((v) => (
              <Selectable
                key={v.id}
                label={v.plate}
                sub={`${v.model} • ${v.capacityKg} kg`}
                active={v.id === vehicleId}
                onPress={() => setVehicleId(v.id)}
              />
            ))}
            {vehicles.filter((v) => v.active).length === 0 ? (
              <Text style={styles.empty}>No active vehicles. Add one in Vehicles.</Text>
            ) : null}
          </Section>

          {/* Rider */}
          <Section label="Rider">
            {riders.filter((r) => r.active).map((r) => (
              <Selectable
                key={r.id}
                label={r.fullName}
                sub={`${r.phone} • License ${r.licenseNo}`}
                active={r.id === riderId}
                onPress={() => setRiderId(r.id)}
              />
            ))}
            {riders.filter((r) => r.active).length === 0 ? (
              <Text style={styles.empty}>No active riders. Add one in Riders.</Text>
            ) : null}
          </Section>

          {/* Summary */}
          {route ? (
            <Card style={styles.summary}>
              <Text style={styles.summaryTitle}>Trip summary</Text>
              <Text style={styles.summaryLine}>
                • {route.stops.length} stops on {route.name} route
              </Text>
              <Text style={styles.summaryLine}>
                • Departs {date} at {departureTime}
              </Text>
              <Text style={styles.summaryLine}>
                • {vehicles.find((v) => v.id === vehicleId)?.plate ?? "—"} with{" "}
                {riders.find((r) => r.id === riderId)?.fullName ?? "—"}
              </Text>
              <Text style={styles.summaryHint}>
                On start, every seller on this route is notified the truck has left.
              </Text>
            </Card>
          ) : null}

          <AppButton
            title="Start delivery"
            variant="primary"
            fullWidth
            style={{ marginTop: Spacing.lg }}
            onPress={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Selectable({
  label,
  sub,
  active,
  onPress,
}: {
  label: string;
  sub?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.selectable, active && styles.selectableActive]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.selectableLabel, active && styles.selectableLabelActive]}>
          {label}
        </Text>
        {sub ? <Text style={styles.selectableSub}>{sub}</Text> : null}
      </View>
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  selectable: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.xs,
  },
  selectableActive: {
    borderColor: Colors.supplier,
    backgroundColor: "#EEF2FF",
  },
  selectableLabel: { fontWeight: "700", color: Colors.text, fontSize: FontSize.md },
  selectableLabelActive: { color: Colors.supplier },
  selectableSub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: {
    borderColor: Colors.supplier,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.supplier,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    borderColor: Colors.supplier,
    backgroundColor: Colors.supplier,
  },
  chipText: { color: Colors.textSecondary, fontWeight: "700", fontSize: FontSize.xs },
  chipTextActive: { color: "#FFF" },
  summary: {
    backgroundColor: "#EEF2FF",
    borderColor: "#C7D2FE",
  },
  summaryTitle: { fontWeight: "800", color: Colors.supplier, fontSize: FontSize.md, marginBottom: Spacing.xs },
  summaryLine: { color: Colors.text, fontSize: FontSize.sm, marginBottom: 2 },
  summaryHint: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: Spacing.sm, fontWeight: "600" },
  empty: { color: Colors.textSecondary, fontSize: FontSize.xs, fontStyle: "italic" },
});