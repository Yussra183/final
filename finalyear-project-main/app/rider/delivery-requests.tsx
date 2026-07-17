import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { EmptyState } from "../../src/components/EmptyState";
import { AppButton } from "../../src/components/AppButton";
import {
  formatCurrency,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";
import { OrderServiceError } from "../../src/services/orderErrors";

type Tab = "available" | "accepted";

export default function DeliveryRequests() {
  const router = useRouter();
  const { session, getOrdersForUser, availableOrdersForUser, claimOrder } =
    useStore();
  const user = session!.user;
  const [tab, setTab] = useState<Tab>("available");

  // Orders accepted by sellers, awaiting a rider. The store layer
  // already filters out anything the actor can't claim (e.g. orders
  // already assigned to someone else).
  const available = useMemo(
    () => availableOrdersForUser(),
    // `availableOrdersForUser` is stable per-render via `useCallback`,
    // but we list its dep so React's lint sees the relationship.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [availableOrdersForUser, session, /* re-derive on store refresh */],
  );

  // Orders already assigned to this rider but not yet picked up.
  const accepted = useMemo(
    () =>
      getOrdersForUser(user.id, "rider").filter(
        (o) => o.status === "assigned",
      ),
    [user.id, getOrdersForUser],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Delivery Requests"
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />

      <View style={styles.tabRow}>
        {(
          [
            ["available", "Available"],
            ["accepted", "Accepted"],
          ] as [Tab, string][]
        ).map(([k, l]) => {
          const active = tab === k;
          const count = k === "available" ? available.length : accepted.length;
          return (
            <TouchableOpacity
              key={k}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(k)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {l} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={tab === "available" ? available : accepted}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon={tab === "available" ? "📭" : "🛵"}
            title={
              tab === "available"
                ? "No available orders"
                : "Nothing accepted yet"
            }
            message={
              tab === "available"
                ? "When a seller accepts an order, it will appear here. Closest riders see it first."
                : "Accept an order from the Available tab and it will show up here until pickup."
            }
          />
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Order #{item.id.slice(-4)}
                </Text>
                <Text style={styles.sub}>{item.customerName}</Text>
                <Text style={styles.sub}>{item.deliveryLocation.address}</Text>
              </View>
              <StatusPill
                label={orderStatusLabel(item.status)}
                tone={orderTone(item.status)}
              />
            </View>
            <View style={styles.footer}>
              <Text style={styles.value}>{formatCurrency(item.total)}</Text>
              {tab === "available" ? (
                <AppButton
                  title="Accept"
                  style={styles.actionBtn}
                  onPress={async () => {
                    try {
                      await claimOrder(item.id);
                      Alert.alert(
                        "Accepted",
                        `Order #${item.id.slice(-4)} added to your list.`,
                      );
                    } catch (err) {
                      const code =
                        err instanceof OrderServiceError
                          ? err.code
                          : undefined;
                      const message =
                        code === "RIDER_BUSY"
                          ? "Another rider got there first."
                          : code === "RIDER_OFFLINE"
                            ? "You're not marked as available right now."
                            : (err as Error)?.message ??
                              "Could not claim this delivery.";
                      Alert.alert("Could not accept", message);
                    }
                  }}
                />
              ) : (
                <AppButton
                  title="Open"
                  variant="outline"
                  style={styles.actionBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/rider/active-delivery",
                      params: { id: item.id },
                    })
                  }
                />
              )}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.rider, borderColor: Colors.rider },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  tabTextActive: { color: "#FFF" },
  row: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  sub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  value: { color: Colors.primary, fontWeight: "800" },
  actionBtn: { paddingHorizontal: 20 },
});