/**
 * Sellers on Current Route — the supplier's view of every seller on the
 * active trip, with per-stop status, address, ETA, and a "Call" button.
 *
 * Mirrors what the seller-side Track Delivery page shows, but from the
 * supplier's perspective. The supplier can mark a stop delivered from
 * here too.
 */
import React, { useMemo } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StopStatusPill } from "../../src/components/StopStatusPill";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { AppButton } from "../../src/components/AppButton";
import { EmptyState } from "../../src/components/EmptyState";
import { useTripTicker } from "../../src/hooks/useTripTicker";
import { haversineMeters, pointAtProgress, formatDistanceKm, formatEta, Route } from "../../src/lib/location";

export default function SellersOnRoute() {
  const router = useRouter();
  const {
    session,
    getActiveTripForSupplier,
    routes,
    users,
    markStopDelivered,
  } = useStore();
  const user = session?.user!;
  const trip = getActiveTripForSupplier(user.id);
  useTripTicker(trip?.id);

  const supplierPos = useMemo(() => {
    if (!trip) return null;
    const route = routes.find((r) => r.id === trip.routeId);
    const polyline = route?.polyline ?? [];
    if (polyline.length === 0) return null;
    return pointAtProgress({ polyline } as Route, trip.progress);
  }, [trip, routes]);

  if (!trip) {
    return (
      <SidebarLayout>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
          <View style={styles.header}>
            <DrawerMenuButton />
            <Text style={styles.title}>Sellers on Route</Text>
          </View>
          <View style={{ padding: Spacing.lg }}>
            <EmptyState
              icon="🧑‍🤝‍🧑"
              title="No active trip"
              message="Start a delivery to see sellers assigned to your route."
              action={
                <AppButton
                  title="Start delivery"
                  variant="primary"
                  onPress={() => router.push("/(supplier)/start-delivery" as any)}
                />
              }
            />
          </View>
        </SafeAreaView>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Sellers on Route</Text>
            <Text style={styles.subtitle}>
              {trip.routeName} route • {trip.stops.length} stops
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0, paddingBottom: Spacing.xxl }}>
          {trip.stops.map((s) => {
            const seller = users.find((u) => u.id === s.sellerId);
            const distance = supplierPos
              ? haversineMeters(supplierPos, { lat: s.lat, lng: s.lng })
              : null;
            const etaSec = distance != null ? (distance / 1000) / 30 * 3600 : null;
            return (
              <Card key={s.sellerId} style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.seq}>
                    <Text style={styles.seqText}>{s.sequence}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{s.sellerName}</Text>
                    <Text style={styles.address}>{s.address}</Text>
                    {seller ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${seller.phone}`)}
                        style={styles.phoneRow}
                      >
                        <Ionicons name="call-outline" size={12} color={Colors.supplier} />
                        <Text style={styles.phone}>{seller.phone}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={{ marginTop: Spacing.xs }}>
                      <StopStatusPill status={s.status} />
                    </View>
                    {distance != null && s.status !== "delivered" ? (
                      <Text style={styles.distance}>
                        {formatDistanceKm(distance)} away • ETA {formatEta(etaSec ?? 0)}
                      </Text>
                    ) : null}
                  </View>
                  {s.status !== "delivered" ? (
                    <AppButton
                      title="Delivered"
                      variant="primary"
                      style={{ paddingHorizontal: Spacing.md, paddingVertical: 8 }}
                      onPress={() => markStopDelivered(trip.id, s.sellerId)}
                    />
                  ) : (
                    <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
                  )}
                </View>
              </Card>
            );
          })}
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
  card: { marginBottom: Spacing.sm },
  row: { flexDirection: "row", alignItems: "center" },
  seq: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  seqText: { color: Colors.supplier, fontWeight: "800", fontSize: FontSize.md },
  name: { fontSize: FontSize.md, fontWeight: "800", color: Colors.text },
  address: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  phoneRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  phone: { color: Colors.supplier, fontSize: FontSize.xs, fontWeight: "700", marginLeft: 4 },
  distance: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: Spacing.xs, fontWeight: "700" },
});