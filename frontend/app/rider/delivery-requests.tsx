import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
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
import { useRiderVerificationStatus } from "../../src/hooks/useRiderVerificationStatus";
import { useRiderLock } from "../../src/hooks/useRiderLock";
import { OrdersApi } from "../../src/api/endpoints";
import { ApiError } from "../../src/api/errors";
import {
  formatCurrency,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";
import { OrderServiceError } from "../../src/services/orderErrors";

type Tab = "available" | "accepted" | "active";

const AVAILABLE_REFRESH_MS = 15000;

export default function DeliveryRequests() {
  // Single page — no wrapper. The lock banner is rendered inline at the
  // top of the existing layout, and the modal is mounted inside the
  // existing SafeAreaView so the page remains a single render tree.
  const router = useRouter();
  const {
    session,
    orders,
    getOrdersForUser,
    claimOrder,
  } = useStore();
  const user = session!.user;
  const verification = useRiderVerificationStatus();
  const { Banner, Modal, onLockedAction, isApproved } = useRiderLock();

  const [tab, setTab] = useState<Tab>("available");
  const [available, setAvailable] = useState<typeof orders>([]);
  const [availableError, setAvailableError] = useState<string | null>(null);

  const refreshAvailable = useCallback(async () => {
    if (!verification.isApproved) {
      setAvailable([]);
      setAvailableError(null);
      return;
    }
    try {
      setAvailable(await OrdersApi.availableForRiders());
      setAvailableError(null);
    } catch (err) {
      setAvailable([]);
      setAvailableError(
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ?? "Could not load available deliveries.",
      );
    }
  }, [verification.isApproved]);

  useEffect(() => {
    refreshAvailable();
  }, [refreshAvailable]);

  useEffect(() => {
    if (!verification.isApproved) return;
    const timer = setInterval(() => {
      refreshAvailable().catch(() => {
        /* surfaced in local state */
      });
    }, AVAILABLE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshAvailable, verification.isApproved]);

  useFocusEffect(
    useCallback(() => {
      refreshAvailable().catch(() => {
        /* surfaced in local state */
      });
    }, [refreshAvailable]),
  );

  const availableList = useMemo(() => {
    if (__DEV__) {
      console.info(
        "[RIDER_ORDERS][MEMO_AVAILABLE]",
        JSON.stringify({ count: available.length, orderIds: available.map((o) => o.id) }),
      );
    }
    return available;
  }, [available]);

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
    tab === "available" ? availableList : tab === "accepted" ? accepted : active;

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
    if (k === "available") return availableList.length;
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

      {/* Lock status banner — renders inline at the top of the page
          for NEW / PENDING / REJECTED riders. Renders nothing for
          approved riders. The page layout is unchanged. */}
      {Banner}

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

      <View style={{ flex: 1 }}>
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
                message={
                  availableError ??
                  "When a seller marks an order ready for pickup, it will appear here for available riders."
                }
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
              <Card
                style={[
                  !isApproved ? styles.cardLocked : null,
                ]}
              >
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
                      disabled={!isApproved}
                      onPress={async () => {
                        if (!isApproved) {
                          onLockedAction();
                          return;
                        }
                        try {
                          await claimOrder(item.id);
                          await refreshAvailable();
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
                              ? "This order has already been taken by another rider."
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
                      disabled={!isApproved}
                      onPress={() => {
                        if (!isApproved) {
                          onLockedAction();
                          return;
                        }
                        router.push({
                          pathname: "/rider/active-delivery",
                          params: { id: item.id },
                        });
                      }}
                    />
                  )}
                </View>
              </Card>
            );
          }}
        />
      </View>

      {/* Locked-action modal — renders nothing while the rider is
          approved. Mounted inside the page so the modal lifecycle is
          scoped to the screen. */}
      {Modal}
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
  cardLocked: {
    opacity: 0.55,
  },
});
