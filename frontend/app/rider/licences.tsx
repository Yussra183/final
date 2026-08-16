/**
 * Rider → Licences
 *
 * Dedicated page for the Rider Verification Application workflow. Mirrors
 * `app/seller/licences.tsx`: a thin shell that wraps the self-contained
 * `<RiderVerificationSection />` card (which talks directly to the live
 * API). Two responsibilities of the shell:
 *
 *   • Refetch the application on every focus so admin approvals made in
 *     another session flip the status pill here immediately.
 *   • Surface pull-to-refresh as the manual retry surface when the focus
 *     fetch fails silently.
 *
 * The numbered Step 1 / Step 2 / Step 3 / Step 4 blocks live inside
 * `RiderVerificationSection` — they used to be embedded on the Profile
 * screen, which made the profile unwieldy for riders who were already
 * approved. The Profile now only carries a compact summary card that
 * deep-links here.
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
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Spacing,
} from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { AppButton } from "../../src/components/AppButton";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { RiderVerificationSection } from "../../src/components/RiderVerificationSection";
import { useStore } from "../../src/store/StoreContext";

export default function RiderLicences() {
  const { fetchMyRiderApplication } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Focus refresh — silent on failure because pull-to-refresh exists as
  // the manual retry surface. We surface the error here too so an
  // approved rider is never stuck on "Pending" because of a network blip.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoadError(null);
      fetchMyRiderApplication().catch((err) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "Could not load your application. Try again.",
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }, [fetchMyRiderApplication]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      await fetchMyRiderApplication();
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not load your application. Try again.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [fetchMyRiderApplication]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Licences"
        subtitle="Rider Verification Application"
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.rider}
          />
        }
      >
        <View style={{ paddingHorizontal: Spacing.lg }}>
          {loadError ? (
            <Card>
              <View style={styles.errorRow}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={Colors.danger}
                />
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
              <AppButton
                title="Retry"
                variant="outline"
                onPress={() => {
                  setLoadError(null);
                  onRefresh();
                }}
                style={{ marginTop: Spacing.sm }}
              />
            </Card>
          ) : null}

          {/* The full Step 1 / 2 / 3 / 4 workflow lives inside this
              component — kept identical to the version that used to be
              embedded on the Profile screen so existing state hooks,
              file pickers and downloads continue to work. */}
          <RiderVerificationSection />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    flex: 1,
  },
});