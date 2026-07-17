/**
 * Delivery Schedule screen — weekly grid (Mon..Sun) showing every
 * route's day + time at a glance. The supplier uses this as a
 * wall-calendar-style overview before clicking into a specific route.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { DeliveryDay, DeliveryRoute } from "../../constants/types";

const DAYS: DeliveryDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SupplierSchedule() {
  const router = useRouter();
  const { routes } = useStore();

  const routesByDay = (day: DeliveryDay) =>
    routes.filter((r) => r.scheduleDay === day && r.active);

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Delivery Schedule</Text>
            <Text style={styles.subtitle}>
              {routes.length} active routes across the week
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
          {DAYS.map((day) => {
            const dayRoutes = routesByDay(day);
            return (
              <View key={day} style={styles.dayBlock}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{day}</Text>
                  <Text style={styles.dayCount}>
                    {dayRoutes.length} route{dayRoutes.length === 1 ? "" : "s"}
                  </Text>
                </View>
                {dayRoutes.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No routes scheduled</Text>
                  </Card>
                ) : (
                  <View style={styles.routesCol}>
                    {dayRoutes.map((r) => (
                      <ScheduleRow
                        key={r.id}
                        route={r}
                        onPress={() => router.push(`/(supplier)/routes/${r.id}` as any)}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </SidebarLayout>
  );
}

function ScheduleRow({ route, onPress }: { route: DeliveryRoute; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card style={styles.routeCard}>
        <View style={styles.row}>
          <View style={styles.timeBox}>
            <Text style={styles.timeText}>{route.scheduleTime}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeName}>{route.name} Route</Text>
            <Text style={styles.routeMeta}>
              {route.stops.length} stops • {route.stops.reduce((acc, s) => acc + 1, 0)} deliveries
            </Text>
          </View>
        </View>
      </Card>
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
  dayBlock: {
    marginBottom: Spacing.md,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  dayLabel: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  dayCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  routesCol: {
    gap: Spacing.sm,
  },
  routeCard: {
    padding: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeBox: {
    width: 64,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  timeText: {
    color: Colors.supplier,
    fontWeight: "800",
    fontSize: FontSize.md,
  },
  routeName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  routeMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  emptyCard: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },
});