/**
 * Delivery Routes screen — list of every route the supplier runs.
 *
 * Tapping a route opens its detail page with the polyline preview and
 * ordered stop list.
 */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { RouteCard } from "../../src/components/RouteCard";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { DeliveryDay } from "../../constants/types";

const DAYS: DeliveryDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SupplierRoutes() {
  const router = useRouter();
  const { routes } = useStore();
  const [filter, setFilter] = useState<DeliveryDay | "All">("All");

  const filtered =
    filter === "All" ? routes : routes.filter((r) => r.scheduleDay === filter);

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Delivery Routes</Text>
            <Text style={styles.subtitle}>
              {routes.length} routes • {routes.reduce((acc, r) => acc + r.stops.length, 0)} total stops
            </Text>
          </View>
        </View>

        {/* Day filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {(["All", ...DAYS] as const).map((d) => {
            const active = filter === d;
            return (
              <Text
                key={d}
                onPress={() => setFilter(d as DeliveryDay | "All")}
                style={[styles.chip, active && styles.chipActive]}
              >
                {d}
              </Text>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}>
          {filtered.length === 0 ? (
            <EmptyState
              icon="🗺️"
              title="No routes for that day"
              message="Try a different day filter."
            />
          ) : (
            filtered.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                onPress={() => router.push(`/(supplier)/routes/${r.id}` as any)}
              />
            ))
          )}
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
  chipsRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.textSecondary,
    fontWeight: "700",
    fontSize: FontSize.xs,
    overflow: "hidden",
  },
  chipActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
    color: "#FFF",
  },
});