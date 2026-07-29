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

type Tab = "available" | "accepted" | "active";

export default function DeliveryRequests() {
  const router = useRouter();
  const {
    session,
    orders,
    getOrdersForUser,
    availableOrdersForUser,
    claimOrder,
  } = useStore();
  const user = session!.user;
  const [tab, setTab] = useState<Tab>("available");

  // Orders accepted by sellers, awaiting a rider. The store layer
  // already filters out anything the actor can't claim (e.g. orders
  // already assigned to someone else).
  const available = useMemo(() => {
    const next = availableOrdersForUser();
    if (__DEV__) {
      console.info(
        "[RIDER_ORDERS][MEMO_AVAILABLE]",
        JSON.stringify({ count: next.length, orderIds: next.map((o) => o.id) }),
      );
    }
    return next;
    // `availableOrdersForUser` is stable per-render via `useCallback`,
    // but we list its dep so React's lint sees the relationship.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableOrdersForUser, session, /* re-derive on store refresh */]);

  // Orders already assigned to this rider but not yet picked up.
  const accepted = useMemo(() => {
    const next = getOrdersForUser(user.id, "rider").filter(
      (o) => o.status === "assigned",
    );
    if (__DEV__) {
      console.info(
        "[RIDER_ORDERS][MEMO_ACCEPTED]",
        JSON.stringify({ count: next.length, orderIds: next.map((o) => o.id) }),
      );
    }
    return next;
  }, [user.id, getOrdersForUser]);

  // Every in-flight order for this rider: PENDING, ACCEPTED,
  // ASSIGNED, PICKED_UP, IN_TRANSIT. Backed by the store selector,
  // which already returns every order for sellers in the rider's
  // `seller_riders` set, sorted by `updatedAt DESC`. The terminal
  // states (DELIVERED, CANCELLED, REJECTED) are intentionally excluded
  // here because the Delivery History screen surfaces those.
  //
  // This is the "everything the rider is currently responsible for"
  // list — without it, a rider had no way to see PICKED_UP or
  // IN_TRANSIT orders that aren't yet completed.
  const active = useMemo(() => {
    const next = getOrdersForUser(user.id, "rider").filter((o) =>
      ["pending", "accepted", "assigned", "picked_up", "in_transit"].includes(
        o.status,
      ),
    );
    if (__DEV__) {
      console.info(
        "[RIDER_ORDERS][MEMO_ACTIVE]",
        JSON.stringify({ count: next.length, orderIds: next.map((o) => o.id) }),
      );
    }
    return next;
  }, [user.id, getOrdersForUser]);

  const listData =
    tab === "available" ? available : tab === "accepted" ? accepted : active;

  if (__DEV__) {
    console.info(
      "[RIDER_ORDERS][STATE]",
      JSON.stringify({ count: orders.length, orderIds: orders.map((o) => o.id) }),
    );
    console.info(
      "[RIDER_ORDERS][LIST_DATA]",
      JSON.stringify({
        tab,
        count: listData.length,
        orderIds: listData.map((o) => o.id),
      }),
    );
  }

  function countForTab(k: Tab): number {
    if (k === "available") return available.length;
    if (k === "accepted") return accepted.length;
    return active.length;
  }

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
            ["active", "My orders"],
          ] as [Tab, string][]
        ).map(([k, l]) => {
          const active = tab === k;
          const count = countForTab(k);
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
        data={listData}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          tab === "available" ? (
            <EmptyState
              icon="📭"
              title="No available orders"
              message="When a seller accepts an order, it will appear here. Closest riders see it first."
            />
          ) : tab === "accepted" ? (
            <EmptyState
              icon="🛵"
              title="Nothing accepted yet"
              message="Accept an order from the Available tab and it will show up here until pickup."
            />
          ) : (
            <EmptyState
              icon="📋"
              title="No active orders"
              message="When a seller has work for you it will show up here."
            />
          )
        }
        renderItem={({ item }) => {
          if (__DEV__) {
            console.info(
              "[RIDER_ORDERS][RENDER_ITEM]",
              JSON.stringify({
                tab,
                orderId: item.id,
                status: item.status,
                sellerId: item.sellerId,
                riderId: item.riderId ?? null,
              }),
            );
          }
          return (
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
          );
        }}
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