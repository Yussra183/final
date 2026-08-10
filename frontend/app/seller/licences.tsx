/**
 * Seller → Licences
 *
 * Shell that wraps `LicenseApplicationSection` (the actual workflow that
 * talks to the live API). Two jobs:
 *
 *   • Refetch the permit on every focus so an admin approval made in
 *     another session flips the status pill here immediately.
 *   • Surface a small footer pointer that hands the seller off to the
 *     Shop Profile when they need to update shop / owner details.
 *
 * The numbered workflow steps live inside `LicenseApplicationSection` —
 * they used to be duplicated here as a "stepList" which produced three
 * overlapping copies of the same instructions before the first actionable
 * control, so that block has been deleted.
 */
import React, { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { LicenseApplicationSection } from "../../src/components/LicenseApplicationSection";
import { useStore } from "../../src/store/StoreContext";

export default function SellerLicences() {
  const router = useRouter();
  const { session, fetchMyPermit } = useStore();
  const user = session?.user;
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Focus refresh — silent on failure because pull-to-refresh exists as the
  // manual retry surface. We surface the error here too so an approved
  // seller is never stuck looking at "Not Submitted" because of a network
  // blip.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoadError(null);
      fetchMyPermit().catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Could not load your permit. Try again.",
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }, [fetchMyPermit]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      await fetchMyPermit();
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not load your permit. Try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [fetchMyPermit]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Licences" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {loadError ? (
          <Card style={styles.errorCard}>
            <View style={styles.errorRow}>
              <Ionicons
                name="alert-circle-outline"
                size={20}
                color={Colors.danger}
              />
              <Text style={styles.errorText}>{loadError}</Text>
            </View>
          </Card>
        ) : null}

        {user ? (
          <LicenseApplicationSection user={user} />
        ) : (
          <EmptyState
            icon="🔒"
            title="Session expired"
            message="Please sign in again to view your licence application."
          />
        )}

        {/* Footer pointer — the whole row is now tappable, not just the
            emphasised "Shop Profile" text. The 44px-tall surface gives the
            affordance a screen-reader-actionable label. */}
        <TouchableOpacity
          style={styles.footer}
          activeOpacity={0.85}
          onPress={() => router.push("/seller/profile")}
          accessibilityRole="link"
          accessibilityLabel="Open Shop Profile to update shop name, owner details or business address"
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={Colors.textSecondary}
          />
          <Text style={styles.footerText}>
            Need to update your shop name, owner details or business address?
            Open{" "}
            <Text style={styles.footerLink}>Shop Profile</Text>.
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  errorCard: { marginBottom: Spacing.lg, padding: Spacing.md },
  errorRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },

  footer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    minHeight: 44,
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
