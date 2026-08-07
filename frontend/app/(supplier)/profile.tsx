/**
 * Supplier → Profile screen.
 *
 * Mirrors the Rider Profile's structure exactly so every role follows
 * the same self-service pattern:
 *
 *   1. Account card   — Avatar, full name, `@username · Supplier`,
 *                       status pill.
 *   2. Supplier Verification section — status card, download the
 *                       Supplier Application Form, upload the six
 *                       required documents, submit, then post-approval
 *                       the official Gas Supplier Certificate (View /
 *                       Download). Implemented by
 *                       {@link SupplierVerificationSection}, which owns
 *                       all fetch + upload + certificate download state
 *                       so this screen stays a thin embedding layer.
 *
 * Editing locks automatically when the application is submitted,
 * under review, or approved — same rule the rider module enforces.
 *
 * No mock data; every interaction talks to the live API.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Avatar } from "../../src/components/Avatar";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SupplierVerificationSection } from "../../src/components/SupplierVerificationSection";

const ACCENT = "#6366F1";

export default function SupplierProfile() {
  const { session, logout } = useStore();
  const user = session?.user!;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      >
        <View style={styles.headerRow}>
          <DrawerMenuButton />
          <Text style={[styles.title, { flex: 1 }]}>Profile</Text>
        </View>

        {/* Account card */}
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

        {/* Supplier Verification — owns status, form download, document
            upload/replace/remove, submit, and post-approval certificate
            download. Mirrors <RiderVerificationSection /> in
            app/rider/profile.tsx. */}
        <Text style={styles.sectionTitle}>Supplier Verification</Text>
        <SupplierVerificationSection />

        <Text
          onPress={() => {
            logout();
            // Auth context handles navigation on logout.
          }}
          style={styles.logoutLink}
        >
          Logout
        </Text>
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
  logoutLink: {
    marginTop: Spacing.xl,
    textAlign: "center",
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
});
