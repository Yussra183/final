/**
 * Route detail screen — single Delivery Route. Shows the planned
 * polyline, the ordered stop list with addresses, and a "Start delivery"
 * shortcut to begin a trip on this route.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../../constants/colors";
import { Card } from "../../../src/components/Card";
import { LogisticsMap } from "../../../src/components/LogisticsMap";
import { DrawerMenuButton } from "../../../src/components/DrawerMenuButton";
import { AppButton } from "../../../src/components/AppButton";

export default function SupplierRouteDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getRoute } = useStore();
  const route = id ? getRoute(id) : undefined;

  if (!route) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
        <View style={styles.header}>
          <DrawerMenuButton />
          <Text style={styles.title}>Route not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const supplierPos =
    route.polyline.length > 0
      ? route.polyline[Math.floor(route.polyline.length / 2)]
      : { lat: route.stops[0]?.lat ?? 0, lng: route.stops[0]?.lng ?? 0 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
      <View style={styles.header}>
        <DrawerMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{route.name} Route</Text>
          <Text style={styles.subtitle}>
            Every {route.scheduleDay} at {route.scheduleTime} • {route.stops.length} stops
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.sm }}>
          <LogisticsMap
            stops={route.stops}
            polyline={route.polyline}
            supplier={supplierPos}
            height={220}
          />
        </View>

        <View style={{ margin: Spacing.lg, marginBottom: Spacing.sm }}>
          <AppButton
            title="Start delivery on this route"
            variant="primary"
            fullWidth
            onPress={() =>
              router.push({
                pathname: "/(supplier)/start-delivery" as any,
                params: { routeId: route.id },
              })
            }
          />
        </View>

        <Text style={styles.sectionTitle}>Stops</Text>
        {route.stops.map((s) => (
          <TouchableOpacity
            key={s.sellerId}
            activeOpacity={0.85}
            style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
          >
            <Card>
              <View style={styles.row}>
                <View style={styles.sequenceBox}>
                  <Text style={styles.sequenceText}>{s.sequence}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName}>{s.sellerName}</Text>
                  <Text style={styles.stopAddress}>{s.address}</Text>
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
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
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
  sequenceBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  sequenceText: { color: Colors.supplier, fontWeight: "800", fontSize: FontSize.md },
  stopName: { fontSize: FontSize.md, fontWeight: "800", color: Colors.text },
  stopAddress: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
});