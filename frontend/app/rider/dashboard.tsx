import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { RiderVerificationRequiredCard } from "../../src/components/RiderVerificationRequiredCard";
import { useRiderVerificationStatus } from "../../src/hooks/useRiderVerificationStatus";
import { OrdersApi, SellersApi } from "../../src/api/endpoints";
import { ApiError } from "../../src/api/errors";
import { NearbySellersMap } from "../../src/components/NearbySellersMap";
import { useDeviceLocation } from "../../src/hooks/useDeviceLocation";
import { AppButton } from "../../src/components/AppButton";
import type { Order, SellerProfile } from "../../constants/types";
import { haversineMeters } from "../../src/lib/location";
import { formatDateTime } from "../../src/utils/format";
import { ZANZIBAR_CENTRE } from "../../constants/zanzibar";

const DASHBOARD_REFRESH_MS = 15000;
const RIDER_MAP_INITIAL_ZOOM = 0.18;

function distanceKm(
  from?: { lat?: number; lng?: number },
  to?: { lat?: number; lng?: number },
) {
  if (
    !from ||
    !to ||
    !Number.isFinite(from.lat) ||
    !Number.isFinite(from.lng) ||
    !Number.isFinite(to.lat) ||
    !Number.isFinite(to.lng)
  ) {
    return null;
  }
  return haversineMeters(
    { lat: from.lat!, lng: from.lng! },
    { lat: to.lat!, lng: to.lng! },
  ) / 1000;
}

function riderOrderStatusLabel(status: Order["status"]) {
  if (status === "accepted") return "Ready for pickup";
  if (status === "assigned") return "Accepted by you";
  if (status === "picked_up") return "Picked up";
  if (status === "in_transit") return "Out for delivery";
  if (status === "delivered") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function waitingMinutes(createdAt?: string) {
  if (!createdAt) return null;
  const started = new Date(createdAt).getTime();
  if (!Number.isFinite(started)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
  return minutes;
}

export default function RiderDashboard() {
  const router = useRouter();
  const { session, getOrdersForUser, claimOrder } = useStore();
  const user = session!.user;
  const verification = useRiderVerificationStatus();
  const { coords } = useDeviceLocation({ enableWatch: true });

  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingOrderId, setAcceptingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const riderOrders = verification.isApproved
    ? getOrdersForUser(user.id, "rider")
    : [];
  const activeOrder = riderOrders.find((order) =>
    ["assigned", "picked_up", "in_transit"].includes(order.status),
  );
  const riderBusy = !!activeOrder;

  const refreshDashboard = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!verification.isApproved) {
      setSellers([]);
      setAvailableOrders([]);
      setSelectedSellerId(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (mode === "initial") setLoading(true);
    setError(null);
    try {
      const [sellerRows, orderRows] = await Promise.all([
        SellersApi.list(),
        OrdersApi.availableForRiders(),
      ]);
      setSellers(sellerRows);
      setAvailableOrders(orderRows);
      setSelectedSellerId((current) => {
        if (current && sellerRows.some((seller) => seller.sellerId === current)) {
          return current;
        }
        const sellerWithOrders = sellerRows.find((seller) =>
          orderRows.some((order) => order.sellerId === seller.sellerId),
        );
        return sellerWithOrders?.sellerId ?? sellerRows[0]?.sellerId ?? null;
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ?? "Could not load rider dashboard.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [verification.isApproved]);

  useEffect(() => {
    refreshDashboard("initial");
  }, [refreshDashboard]);

  useEffect(() => {
    if (!verification.isApproved) return;
    const timer = setInterval(() => {
      refreshDashboard("refresh").catch(() => {
        /* surfaced through local state */
      });
    }, DASHBOARD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshDashboard, verification.isApproved]);

  useFocusEffect(
    useCallback(() => {
      refreshDashboard("refresh").catch(() => {
        /* surfaced through local state */
      });
    }, [refreshDashboard]),
  );

  const sellerCards = useMemo(() => {
    return sellers.map((seller) => {
      const orders = availableOrders.filter((order) => order.sellerId === seller.sellerId);
      return {
        seller,
        orders,
        orderCount: orders.length,
        hasAvailableOrders: orders.length > 0,
      };
    });
  }, [availableOrders, sellers]);

  const selectedSellerCard = sellerCards.find((entry) => entry.seller.sellerId === selectedSellerId)
    ?? sellerCards[0]
    ?? null;

  const highlightedSellers = sellerCards.filter((entry) => entry.orderCount > 0).length;
  const visibleOrders = selectedSellerCard?.orders ?? availableOrders;

  const markers = sellerCards
    .filter((entry) => Number.isFinite(entry.seller.lat) && Number.isFinite(entry.seller.lng))
    .map((entry) => ({
      id: entry.seller.sellerId,
      lat: entry.seller.lat!,
      lng: entry.seller.lng!,
      name: entry.seller.businessName,
      label: entry.orderCount > 0
        ? `${entry.orderCount} New Order${entry.orderCount > 1 ? "s" : ""}`
        : "Seller",
      badgeLabel: entry.orderCount > 1 ? `NEW ${entry.orderCount}` : entry.orderCount === 1 ? "NEW ORDER" : undefined,
      badgeCount: entry.orderCount,
      hasAlert: entry.orderCount > 0,
      distanceKm: distanceKm(coords, {
        lat: entry.seller.lat,
        lng: entry.seller.lng,
      }) ?? undefined,
      status: entry.seller.openNow ? ("Active" as const) : ("Closed" as const),
      selected: entry.seller.sellerId === selectedSellerId,
      color: entry.orderCount > 0 ? "#E96B2C" : undefined,
    }));

  const riderMapCenter = useMemo(() => {
    const lat = Number.isFinite(coords.lat) ? coords.lat : ZANZIBAR_CENTRE.lat;
    const lng = Number.isFinite(coords.lng) ? coords.lng : ZANZIBAR_CENTRE.lng;
    return { lat, lng };
  }, [coords.lat, coords.lng]);

  const onAccept = useCallback(async (orderId: string) => {
    setAcceptingOrderId(orderId);
    try {
      await claimOrder(orderId);
      await refreshDashboard("refresh");
      router.push({ pathname: "/rider/active-delivery", params: { id: orderId } });
    } catch (err) {
      Alert.alert(
        "Could not accept delivery",
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ?? "The order is no longer available.",
      );
    } finally {
      setAcceptingOrderId(null);
    }
  }, [claimOrder, refreshDashboard, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
      <ScreenHeader
        title="Available Deliveries"
        subtitle={riderBusy ? "Status: BUSY" : "Status: AVAILABLE"}
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />

      {!verification.isApproved ? (
        <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm }}>
          <RiderVerificationRequiredCard
            info={verification}
            onOpenVerification={() => router.push("/rider/licences")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: Spacing.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                refreshDashboard("refresh");
              }}
              tintColor={Colors.rider}
            />
          }
        >
          <View style={styles.heroRow}>
            <Card style={styles.heroCard}>
              <Text style={styles.heroLabel}>All sellers on map</Text>
              <Text style={styles.heroValue}>{sellerCards.length}</Text>
            </Card>
            <Card style={styles.heroCard}>
              <Text style={styles.heroLabel}>Sellers with new orders</Text>
              <Text style={styles.heroValue}>{highlightedSellers}</Text>
            </Card>
            <Card style={styles.heroCard}>
              <Text style={styles.heroLabel}>Available deliveries</Text>
              <Text style={styles.heroValue}>{availableOrders.length}</Text>
            </Card>
          </View>

          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Dispatch Map</Text>
            <Text style={styles.sectionSub}>
              Your live position, every approved seller, and highlighted shops with ready pickups.
            </Text>
            <View style={styles.mapWrap}>
              {loading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={Colors.rider} />
                  <Text style={styles.loadingText}>Loading rider map…</Text>
                </View>
              ) : (
                <NearbySellersMap
                  markers={markers}
                  center={riderMapCenter}
                  fitMode="fixed"
                  zoom={RIDER_MAP_INITIAL_ZOOM}
                  selectedId={selectedSellerId ?? undefined}
                  showUserPin
                  onMarkerTap={setSelectedSellerId}
                  style={{ flex: 1 }}
                />
              )}
            </View>
          </View>

          {error ? (
            <View style={styles.sectionWrap}>
              <Card>
                <Text style={styles.errorText}>{error}</Text>
              </Card>
            </View>
          ) : null}

          {activeOrder ? (
            <View style={styles.sectionWrap}>
              <Card style={styles.busyCard}>
                <Text style={styles.busyTitle}>Active delivery in progress</Text>
                <Text style={styles.busyText}>
                  Finish order #{activeOrder.id.slice(-4)} before accepting another delivery.
                </Text>
                <AppButton
                  title="Open active delivery"
                  style={{ marginTop: Spacing.md }}
                  onPress={() =>
                    router.push({
                      pathname: "/rider/active-delivery",
                      params: { id: activeOrder.id },
                    })
                  }
                />
              </Card>
            </View>
          ) : null}

          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>
              {availableOrders.length} New Order{availableOrders.length === 1 ? "" : "s"} Nearby
            </Text>
            {selectedSellerCard ? (
              <Card style={styles.sellerPanel}>
                <View style={styles.sellerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sellerName}>{selectedSellerCard.seller.businessName}</Text>
                    <Text style={styles.sellerMeta}>{selectedSellerCard.seller.location}</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {selectedSellerCard.orderCount > 0
                        ? `${selectedSellerCard.orderCount} NEW ORDER${selectedSellerCard.orderCount > 1 ? "S" : ""}`
                        : "NO NEW ORDERS"}
                    </Text>
                  </View>
                </View>

                {selectedSellerCard.orders.length === 0 ? (
                  <Text style={styles.emptySellerText}>
                    This seller is visible on the map but has no ready-for-pickup orders right now.
                  </Text>
                ) : (
                  selectedSellerCard.orders.map((order) => {
                    const firstItem = order.items[0];
                    const sellerDistance = distanceKm(coords, {
                      lat: selectedSellerCard.seller.lat,
                      lng: selectedSellerCard.seller.lng,
                    });
                    return (
                      <View key={order.id} style={styles.orderCard}>
                        <Text style={styles.orderTitle}>Order #{order.id.slice(-4)}</Text>
                        <Text style={styles.orderLine}>
                          Gas: {firstItem?.productName ?? "Gas"} • {firstItem?.size ?? "N/A"} x {firstItem?.quantity ?? 0}
                        </Text>
                        <Text style={styles.orderLine}>Customer: {order.deliveryLocation.address}</Text>
                        <Text style={styles.orderLine}>
                          Estimated distance: {sellerDistance == null ? "N/A" : `${sellerDistance.toFixed(1)} km to seller`}
                        </Text>
                        <Text style={styles.orderLine}>
                          Waiting time: {waitingMinutes(order.createdAt) == null ? "N/A" : `${waitingMinutes(order.createdAt)} min`}
                        </Text>
                        <Text style={styles.orderLine}>Created: {formatDateTime(order.createdAt)}</Text>
                        <Text style={styles.orderLine}>Status: {riderOrderStatusLabel(order.status)}</Text>
                        <AppButton
                          title={acceptingOrderId === order.id ? "Accepting..." : "Accept Delivery"}
                          disabled={riderBusy || acceptingOrderId === order.id}
                          style={{ marginTop: Spacing.md }}
                          onPress={() => onAccept(order.id)}
                        />
                      </View>
                    );
                  })
                )}
              </Card>
            ) : (
              <Card>
                <Text style={styles.emptySellerText}>
                  No approved sellers are available to display on the rider map.
                </Text>
              </Card>
            )}
          </View>

          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Available Deliveries</Text>
            {visibleOrders.length === 0 ? (
              <Card>
                <Text style={styles.emptySellerText}>
                  Ready-for-pickup orders will appear here after a seller accepts a customer order.
                </Text>
              </Card>
            ) : (
              visibleOrders.map((order) => {
                const seller = sellers.find((row) => row.sellerId === order.sellerId);
                const firstItem = order.items[0];
                const deliveryDistance = distanceKm(
                  { lat: seller?.lat, lng: seller?.lng },
                  { lat: order.deliveryLocation.lat, lng: order.deliveryLocation.lng },
                );
                return (
                  <TouchableOpacity
                    key={order.id}
                    activeOpacity={0.9}
                    onPress={() => setSelectedSellerId(order.sellerId)}
                  >
                    <Card style={styles.listCard}>
                      <Text style={styles.orderTitle}>
                        {seller?.businessName ?? order.sellerName}
                      </Text>
                      <Text style={styles.orderLine}>
                        {firstItem?.productName ?? "Gas"} - {firstItem?.size ?? "N/A"} x {firstItem?.quantity ?? 0}
                      </Text>
                      <Text style={styles.orderLine}>Customer: {order.deliveryLocation.address}</Text>
                      <Text style={styles.orderLine}>
                        Distance: {deliveryDistance == null ? "N/A" : `${deliveryDistance.toFixed(1)} km`}
                      </Text>
                      <Text style={styles.orderLine}>
                        Waiting: {waitingMinutes(order.createdAt) == null ? "N/A" : `${waitingMinutes(order.createdAt)} min`}
                      </Text>
                      <View style={styles.listActions}>
                        <Text style={styles.statusText}>{riderOrderStatusLabel(order.status)}</Text>
                        <Text style={styles.viewLink}>View Order</Text>
                      </View>
                    </Card>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  heroCard: {
    flex: 1,
    minHeight: 100,
    justifyContent: "space-between",
  },
  heroLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  heroValue: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: "900",
  },
  sectionWrap: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "900",
    color: Colors.text,
  },
  sectionSub: {
    marginTop: 4,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  mapWrap: {
    height: 320,
    overflow: "hidden",
    borderRadius: Radius.xl,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  errorText: {
    color: Colors.danger,
    fontWeight: "700",
  },
  busyCard: {
    backgroundColor: "#FFF3E8",
    borderColor: "#F0C29A",
  },
  busyTitle: {
    color: Colors.text,
    fontWeight: "900",
    fontSize: FontSize.md,
  },
  busyText: {
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  sellerPanel: {
    marginTop: Spacing.md,
  },
  sellerHeader: {
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "flex-start",
  },
  sellerName: {
    color: Colors.text,
    fontWeight: "900",
    fontSize: FontSize.md,
  },
  sellerMeta: {
    color: Colors.textSecondary,
    marginTop: 4,
  },
  badge: {
    backgroundColor: "#FFE0CC",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  badgeText: {
    color: "#B64A11",
    fontWeight: "900",
    fontSize: FontSize.xs,
  },
  emptySellerText: {
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  orderCard: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  orderTitle: {
    color: Colors.text,
    fontWeight: "900",
    fontSize: FontSize.md,
  },
  orderLine: {
    color: Colors.textSecondary,
    marginTop: 4,
  },
  listCard: {
    marginTop: Spacing.sm,
  },
  listActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
  },
  statusText: {
    color: "#B64A11",
    fontWeight: "800",
  },
  viewLink: {
    color: Colors.rider,
    fontWeight: "800",
  },
});
