/**
 * Seller → Licences
 *
 * Owns the seller's permit / licence workflow: download the official
 * application form, upload the four required documents, submit for
 * verification, and download the issued Gas Selling Permit Certificate
 * once approved.
 *
 * The workflow itself lives in
 * {@link LicenseApplicationSection} (`src/components/LicenseApplicationSection.tsx`),
 * which talks directly to the live API through the store — so this
 * screen is just a shell that:
 *
 *   * wraps the section in the seller drawer chrome (`SellerHeader`),
 *   * refetches the permit on every focus so an admin approval made in
 *     another session flips the status pill here immediately, and
 *   * adds a small intro / outro note so the seller understands the
 *     steps without having to read the section's helper text.
 *
 * Profile-level concerns (shop name, owner details, password change,
 * business address) are handled on `app/seller/profile.tsx`. This
 * screen deliberately does NOT render any of those modals.
 */
import React, { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { LicenseApplicationSection } from "../../src/components/LicenseApplicationSection";
import { useStore } from "../../src/store/StoreContext";

export default function SellerLicences() {
  const { session, fetchMyPermit } = useStore();
  const user = session?.user;

  // Same focus-refresh pattern the profile screen uses: pick up an
  // admin approval performed in another session without forcing the
  // seller to sign out and back in.
  useFocusEffect(
    useCallback(() => {
      fetchMyPermit().catch(() => {});
    }, []),
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Licences" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Intro card — explains what this screen is for. */}
        <Card style={styles.intro}>
          <View style={styles.introHead}>
            <View style={styles.introIcon}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color={Colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.introTitle}>Gas Selling Permit</Text>
              <Text style={styles.introSub}>
                Download the official application form, attach the
                required documents, submit for verification, and
                download the issued certificate once approved.
              </Text>
            </View>
          </View>

          <View style={styles.stepList}>
            <Step label="Download the official application form" />
            <Step label="Upload the four required documents" />
            <Step label="Submit for verification" />
            <Step label="Download the issued Gas Selling Permit Certificate" />
          </View>
        </Card>

        {/* Full licence workflow — the section talks to the live API
            through the store, so no parent wiring is required here. */}
        <Text style={styles.sectionTitle}>Seller License Application</Text>
        <LicenseApplicationSection user={user!} />

        {/* Footer pointer — surface the link back to the profile so the
            seller can still find shop / owner details without hunting
            through the drawer. */}
        <View style={styles.footer}>
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={Colors.textSecondary}
          />
          <Text style={styles.footerText}>
            Need to update your shop name, owner details or business
            address? Head to{" "}
            <Text style={styles.footerLink}>Shop Profile</Text> in the
            drawer.
          </Text>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ label }: { label: string }) {
  return (
    <View style={styles.step}>
      <Ionicons
        name="checkmark-circle-outline"
        size={16}
        color={Colors.primary}
      />
      <Text style={styles.stepText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  intro: { marginBottom: Spacing.lg },
  introHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  introSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },

  stepList: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  stepText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "600",
  },

  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  footer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
  },
  footerText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  footerLink: {
    color: Colors.primary,
    fontWeight: "800",
  },
});
