/**
 * Admin Dashboard – Rider Applications page.
 *
 * No `rider_applications` table exists in the database and there is no
 * backend endpoint for rider onboarding. Previously this page showed a
 * hard-coded list of applications and let the admin approve/reject them
 * locally. With the move to backend-driven data, both the rows and the
 * actions are gone — the page is a real, honest empty state.
 *
 * The information an admin needs about riders (vehicle, availability,
 * workload) is on the Riders page, which reads the live `rider_profiles`
 * table.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminButton,
  AdminCard,
  AdminEmptyState,
} from "../../src/components/admin";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { useRouter } from "expo-router";

export default function RiderApplicationsPage() {
  const router = useRouter();
  return (
    <AdminLayout
      title="Rider Applications"
      subtitle="Rider onboarding applications"
    >
      <AdminCard>
        <View style={styles.body}>
          <AdminEmptyState
            icon="📥"
            title="No rider application workflow yet"
            message="The database does not currently store rider applications — riders register directly as users. The data you need (vehicle details, availability, workload) is on the Riders page."
          />
          <View style={styles.buttonRow}>
            <AdminButton
              label="Go to Riders"
              icon="🛵"
              onPress={() => router.push("/riders" as any)}
            />
          </View>
        </View>
      </AdminCard>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingVertical: Spacing.md,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
});
