/**
 * Supplier Profile — the supplier's own profile + summary stats. The
 * legacy restock profile has been replaced with a logistics-flavoured
 * version: avatar, contact info, today's trip, and resource counts.
 */
import React from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Avatar } from "../../src/components/Avatar";
import { AppButton } from "../../src/components/AppButton";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { StatCard } from "../../src/components/StatCard";

const ACCENT = "#6366F1";

export default function SupplierProfile() {
  const router = useRouter();
  const { session, logout, routes, vehicles, riders, getTripsForSupplier } = useStore();
  const user = session?.user!;
  const supplierTrips = getTripsForSupplier(user.id);
  const completed = supplierTrips.filter((t) => t.status === "completed").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
        <View style={styles.headerRow}>
          <DrawerMenuButton />
          <Text style={[styles.title, { flex: 1 }]}>Profile</Text>
        </View>

        <Card style={{ alignItems: "center" }}>
          <Avatar name={user.fullName} size={80} color={ACCENT} />
          <Text style={styles.name}>{user.fullName}</Text>
          <Text style={styles.role}>@{user.username} • Supplier</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user.email}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{user.phone}</Text>
            </View>
          </View>
        </Card>

        {/* Stats summary */}
        <Text style={styles.sectionTitle}>Operations summary</Text>
        <View style={styles.statsRow}>
          <StatCard
            label="Routes"
            value={routes.length}
            icon="🗺️"
            tone="primary"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Trips"
            value={supplierTrips.length}
            icon="🚛"
            tone="info"
          />
        </View>
        <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
          <StatCard
            label="Completed"
            value={completed}
            icon="✅"
            tone="accent"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Fleet"
            value={`${vehicles.length}V / ${riders.length}R`}
            icon="🪪"
            tone="warning"
          />
        </View>

        <AppButton
          title="Logout"
          variant="outline"
          fullWidth
          style={{ marginTop: Spacing.xl }}
          onPress={() =>
            Alert.alert("Logout", "Sign out of your account?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Logout",
                style: "destructive",
                onPress: () => {
                  logout();
                  router.replace("/auth/login" as any);
                },
              },
            ])
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  role: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  infoRow: { flexDirection: "row", width: "100%", marginTop: Spacing.md },
  infoItem: { flex: 1 },
  infoLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "600",
  },
  infoValue: { color: Colors.text, fontWeight: "700", marginTop: 2 },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  statsRow: { flexDirection: "row" },
});