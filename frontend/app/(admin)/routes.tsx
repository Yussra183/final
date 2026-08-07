/**
 * Admin Dashboard – Routes & Schedules page.
 *
 * There is no `delivery_routes` table in the database and no backend
 * endpoint for route management. Previously this page showed a list of
 * hard-coded routes and let the admin create / edit / delete them
 * locally. With the move to backend-driven data, the rows and the
 * actions are gone — the page is a real, honest empty state.
 *
 * Order-level delivery tracking (rider location, dispatch queue) is on
 * the Orders page; supplier fleet management is on the Suppliers page.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminButton,
  AdminCard,
  AdminEmptyState,
} from "../../src/components/admin";
import { Spacing } from "../../constants/colors";
import { useRouter } from "expo-router";

export default function RoutesPage() {
  const router = useRouter();
  return (
    <AdminLayout
      title="Routes & Schedules"
      subtitle="Planned delivery routes and their delivery windows"
    >
      <AdminCard>
        <View style={styles.body}>
          <AdminEmptyState
            icon="🗺️"
            title="No route-planning workflow yet"
            message="The database does not currently store delivery routes or schedules — orders are dispatched directly to assigned riders. The dispatch queue and live tracking are on the Orders page."
          />
          <View style={styles.buttonRow}>
            <AdminButton
              label="Go to Orders"
              icon="📦"
              onPress={() => router.push("/orders" as any)}
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
