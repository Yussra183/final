/**
 * Supplier → License.
 *
 * Dedicated page for the Supplier Verification / Licensing workflow.
 * Previously the verification section lived inline on the supplier
 * Profile screen; this new route gives it a first-class entry point
 * in the sidebar without forking any business logic.
 *
 * The actual upload / replace / remove / submit / certificate-download
 * UX is owned by the shared `SupplierVerificationSection` component —
 * the same component the Profile screen embeds. Re-using it here keeps
 * the verification surface single-sourced: there is exactly one set of
 * API calls, one editability/locking rule, and one certificate download
 * path. Anything the supplier could do on Profile, they can do here.
 *
 * The numbered workflow steps (form download → upload required docs →
 * submit → certificate download) all live inside that section; this
 * screen is a thin embedding layer with two small additions:
 *
 *   • A header that names the page "License" so it matches the
 *     sidebar label.
 *   • A focus refresh so an admin approval made in another session
 *     flips the status pill here immediately (mirrors the seller
 *     `licences.tsx` page so the two roles behave consistently).
 */
import React, { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { SupplierVerificationSection } from "../../src/components/SupplierVerificationSection";
import { useStore } from "../../src/store/StoreContext";

export default function SupplierLicense() {
  const { fetchMySupplierApplication } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Focus refresh — silent on failure because pull-to-refresh is the
  // manual retry surface. We surface the error here too so an approved
  // supplier is never stuck looking at "Pending" because of a network
  // blip (matches the seller licences page).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoadError(null);
      fetchMySupplierApplication().catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Could not load your license application. Try again.",
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }, [fetchMySupplierApplication]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      await fetchMySupplierApplication();
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not load your license application. Try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [fetchMySupplierApplication]);

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <ScreenHeader
          title="License"
          subtitle="Verification & official supplier certificate"
          left={<DrawerMenuButton />}
        />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.supplier}
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

          {/* The full verification workflow — owned by the shared
              section component, same source of truth as the Profile
              screen. No duplicated logic, no forked API calls. */}
          <SupplierVerificationSection />
        </ScrollView>
      </SafeAreaView>
    </SidebarLayout>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  errorCard: { marginBottom: Spacing.lg, padding: Spacing.md },
  errorRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  errorText: {
    flex: 1,
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
});