/**
 * Supplier → Profile screen.
 *
 * Mirrors the Rider Profile's structure exactly so every role follows
 * the same self-service pattern:
 *
 *   1. Account card — Avatar, full name, `@username · Supplier`.
 *   2. Quick link to the dedicated License page where the supplier
 *      handles the verification workflow, application form download,
 *      document upload, submission, and post-approval certificate
 *      download. Verification / licensing lives on its own page now
 *      (see `app/(supplier)/license.tsx`); this screen stays focused
 *      on account information.
 *
 * Logout is no longer surfaced here — it lives in the avatar dropdown
 * menu (`SupplierHeaderAvatar`) in the supplier header so this page
 * stays focused on account information. The underlying logout flow is
 * unchanged — only the entry point moved.
 *
 * The verification business logic, API calls, storage paths, and
 * lifecycle are unchanged — only the UI placement moved.
 *
 * No mock data; every interaction talks to the live API.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Avatar } from "../../src/components/Avatar";
import { AppButton } from "../../src/components/AppButton";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";

const ACCENT = "#6366F1";

export default function SupplierProfile() {
  const router = useRouter();
  const { session } = useStore();
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

        {/* License shortcut — the verification / licensing workflow has
            moved to its own page. Tapping this card opens
            `/(supplier)/license`, which hosts the shared
            `SupplierVerificationSection`. Keeping the profile clean
            while ensuring the verification surface is one tap away. */}
        <Text style={styles.sectionTitle}>License</Text>
        <Card>
          <View style={styles.licenseRow}>
            <View style={styles.licenseIconWrap}>
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color={Colors.supplier}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.licenseTitle}>
                Verification & Supplier Certificate
              </Text>
              <Text style={styles.licenseSub}>
                Upload your documents, submit for administrator approval,
                and download your official Gas Supplier Certificate once
                approved.
              </Text>
            </View>
          </View>
          <AppButton
            title="Open License"
            variant="primary"
            leftIcon={
              <Ionicons name="arrow-forward-outline" size={18} color="#FFF" />
            }
            onPress={() => router.push("/(supplier)/license" as any)}
            style={{ marginTop: Spacing.md }}
          />
        </Card>
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
  licenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  licenseIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  licenseTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  licenseSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
});
