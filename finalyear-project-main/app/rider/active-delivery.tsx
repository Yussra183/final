/**
 * Rider → Active Delivery
 *
 * Production-ready screen for the rider's in-flight delivery, with the
 * live-tracking CTA added by the V4 release:
 *
 *   • "Start GPS tracking" — requests foreground location permission
 *     and begins a `Location.watchPositionAsync` subscription (SDK 54)
 *     that emits 3–5 s samples filtered by ≥10 m of movement. Each
 *     sample is published to the backend through the {@code /ws/tracking}
 *     WebSocket (with a REST POST fallback) so the assigned customer
 *     and seller see the rider's position live on Google Maps.
 *
 *   • "Stop tracking" — tears down the GPS subscription + closes the
 *     socket. Also fired automatically when the rider marks the order
 *     as DELIVERED or when the screen unmounts, so no battery is
 *     wasted on a stream that no one is listening to.
 *
 * The rest of the screen is unchanged: order header, customer card,
 * items, seller, status timeline, and the next-step button.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { DrawerNavigationProp } from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { AppButton } from "../../src/components/AppButton";
import { EmptyState } from "../../src/components/EmptyState";
import { LogoutButton } from "../../src/components/LogoutButton";
import {
  formatCurrency,
  formatDateTime,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";
import { OrderStatus } from "../../constants/types";
import { OrderStatusTimeline } from "../../src/components/OrderStatusTimeline";
import { OrderServiceError } from "../../src/services/orderErrors";
import { useRiderGps } from "../../src/hooks/useRiderGps";
import {
  createTrackingClient,
  TrackingClient,
} from "../../src/services/TrackingClient";
import { TrackingApi } from "../../src/api/endpoints";

type ProgressStatus = "picked_up" | "in_transit" | "delivered";

const STEP_BUTTONS: { status: ProgressStatus; label: string }[] = [
  { status: "picked_up", label: "Mark as Picked Up" },
  { status: "in_transit", label: "Start Delivery" },
  { status: "delivered", label: "Mark as Delivered" },
];

export default function ActiveDelivery() {
  const router = useRouter();
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orders, advanceDelivery, session } = useStore();
  const order = id ? orders.find((o) => o.id === id) : undefined;

  // ----- Live GPS tracking (rider only) --------------------------------
  const [trackingActive, setTrackingActive] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  const clientRef = useRef<TrackingClient | null>(null);
  const orderIdNum = order?.id ? Number(order.id) : NaN;

  const onGpsSample = useCallback(
    (sample: {
      lat: number;
      lng: number;
      headingDeg?: number;
      speedMps?: number;
      accuracyM?: number;
      status?: string;
      clientTsMs: number;
    }) => {
      const client = clientRef.current;
      // Prefer the WebSocket; fall back to REST POST so a socket that
      // just dropped doesn't drop the sample.
      const sentOverSocket =
        client?.isConnected() &&
        (client.sendLocation({
          orderId: orderIdNum,
          ...sample,
        }),
        true);
      if (!sentOverSocket) {
        // REST fallback — survives transient socket failures.
        TrackingApi.postLocation(String(orderIdNum), sample).catch((err) => {
          if (__DEV__) {
            console.warn(
              "[TRACKING][REST_POST_FAILED]",
              err instanceof Error ? err.message : err,
            );
          }
        });
      }
    },
    [orderIdNum],
  );

  const gps = useRiderGps({
    onSample: onGpsSample,
    onPermissionDenied: (reason) => {
      setGpsPermissionDenied(true);
      setTrackingError(reason);
    },
  });

  /**
   * Open a WebSocket, start GPS watching, and queue a SUBSCRIBE so
   * the server will accept LOCATION_UPDATE frames for the order. The
   * first sample published by `useRiderGps` lands ~3 s later.
   */
  const startTracking = useCallback(async () => {
    if (!order || !session?.token) return;
    setTrackingError(null);
    try {
      const client = createTrackingClient(
        {
          // Rider-side: we never read frames from the socket, so the
          // inbound handler is a no-op. We still need a stable
          // identity so the client doesn't assert.
          onLocation: () => {},
          onOpen: () => {
            if (Number.isFinite(orderIdNum)) {
              client.subscribe(orderIdNum);
            }
          },
          onError: (msg) => {
            if (__DEV__) console.warn("[TRACKING][FRAME_ERROR]", msg);
          },
          onClose: () => {
            // The TrackingClient retries on its own; nothing to do.
          },
        },
        { token: session.token },
      );
      client.connect();
      clientRef.current = client;
      setTrackingActive(true);
      await gps.start();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start tracking.";
      setTrackingError(msg);
      setTrackingActive(false);
    }
  }, [order, session?.token, gps, orderIdNum]);

  /** Stop the GPS watch + tear down the socket. */
  const stopTracking = useCallback(() => {
    gps.stop();
    try {
      clientRef.current?.disconnect();
    } catch {
      // ignore
    }
    clientRef.current = null;
    setTrackingActive(false);
  }, [gps]);

  // Auto-stop tracking when the order is delivered.
  useEffect(() => {
    if (order?.status === "delivered" && trackingActive) {
      stopTracking();
    }
  }, [order?.status, trackingActive, stopTracking]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => stopTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!order) {
    return (
      <SafeAreaEmpty
        title="No delivery selected"
        message="Pick one from your requests or active list to see details."
        ctaLabel="Browse requests"
        onCta={() => router.push("/rider/delivery-requests")}
      />
    );
  }

  const nextStep = STEP_BUTTONS.find((s) => {
    if (s.status === "picked_up") return order.status === "assigned";
    if (s.status === "in_transit") return order.status === "picked_up";
    if (s.status === "delivered") return order.status === "in_transit";
    return false;
  });

  // Only show the GPS start button for in-flight orders assigned to
  // the signed-in rider — prevents the seller / customer roles from
  // seeing it (the gate is also enforced server-side).
  const isRiderAssignee =
    !!session?.user?.id && session.user.id === order.riderId;
  const showTrackingCta =
    isRiderAssignee &&
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    order.status !== "rejected";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Delivery #${order.id.slice(-4)}`,
          headerStyle: { backgroundColor: Colors.surface },
          headerTitleStyle: { color: Colors.text, fontWeight: "800" },
          headerTintColor: Colors.primary,
          headerLeft: () => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              onPress={() => navigation.openDrawer()}
              style={{
                width: 40,
                height: 40,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: Radius.md,
                backgroundColor: Colors.surface,
                borderWidth: 1,
                borderColor: Colors.border,
                marginLeft: Spacing.sm,
              }}
            >
              <Ionicons name="menu-outline" size={22} color={Colors.text} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={{ marginRight: Spacing.sm }}>
              <LogoutButton />
            </View>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 140 }}
      >
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>Status</Text>
              <Text style={styles.sub}>
                Updated {formatDateTime(order.updatedAt)}
              </Text>
            </View>
            <StatusPill
              label={orderStatusLabel(order.status)}
              tone={orderTone(order.status)}
            />
          </View>
        </Card>

        {showTrackingCta ? (
          <Card style={{ marginTop: Spacing.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heading}>Live tracking</Text>
                <Text style={styles.sub}>
                  {trackingActive
                    ? "Your live location is being shared with the customer and seller."
                    : "Start GPS tracking so the customer and seller can see you on the map."}
                </Text>
              </View>
              <Ionicons
                name={trackingActive ? "location" : "location-outline"}
                size={24}
                color={trackingActive ? Colors.success : Colors.primary}
              />
            </View>
            {gpsPermissionDenied ? (
              <Text
                style={[
                  styles.label,
                  { color: Colors.danger, marginTop: Spacing.sm },
                ]}
              >
                Location permission denied. Enable it in Settings to share
                your route.
              </Text>
            ) : null}
            {trackingError ? (
              <Text
                style={[
                  styles.label,
                  { color: Colors.danger, marginTop: Spacing.sm },
                ]}
              >
                {trackingError}
              </Text>
            ) : null}
            <View style={{ marginTop: Spacing.md }}>
              {trackingActive ? (
                <AppButton
                  title="Stop tracking"
                  variant="outline"
                  fullWidth
                  onPress={stopTracking}
                />
              ) : (
                <AppButton
                  title="Start GPS tracking"
                  fullWidth
                  onPress={startTracking}
                />
              )}
            </View>
          </Card>
        ) : null}

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.heading}>Customer</Text>
          <Text style={styles.value}>{order.customerName}</Text>
          <Text style={styles.label}>Address</Text>
          <Text style={styles.value}>{order.deliveryLocation.address}</Text>
          {order.notes ? (
            <>
              <Text style={styles.label}>Notes</Text>
              <Text style={styles.value}>{order.notes}</Text>
            </>
          ) : null}
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.heading}>Items</Text>
          {order.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>
                  {it.productName} ({it.size}) ×{it.quantity}
                </Text>
              </View>
              <Text style={styles.itemTotal}>
                {formatCurrency(it.unitPrice * it.quantity)}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Order total</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.total)}</Text>
          </View>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.heading}>Seller</Text>
          <Text style={styles.value}>{order.sellerName}</Text>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.heading}>Delivery progress</Text>
          <OrderStatusTimeline order={order} compact />
        </Card>
      </ScrollView>

      {nextStep ? (
        <View style={styles.footer}>
          <AppButton
            title={nextStep.label}
            fullWidth
            onPress={async () => {
              try {
                await advanceDelivery(order.id, nextStep.status);
                // When the rider marks the order as DELIVERED, stop
                // tracking so the customer's map freezes on arrival
                // and we don't waste battery streaming the ride home.
                if (nextStep.status === "delivered") {
                  stopTracking();
                }
                Alert.alert(
                  "Status updated",
                  `Order is now ${orderStatusLabel(nextStep.status)}.`,
                );
              } catch (err) {
                const code =
                  err instanceof OrderServiceError ? err.code : undefined;
                const message =
                  code === "NOT_AUTHORIZED"
                    ? "You can only update deliveries assigned to you."
                    : code === "INVALID_TRANSITION"
                      ? "This order has moved past the next step. Refresh to see the latest status."
                      : (err as Error)?.message ??
                        "Could not update delivery status.";
                Alert.alert("Could not update", message);
              }
            }}
          />
        </View>
      ) : (
        <View style={styles.footer}>
          <AppButton
            title="Back to dashboard"
            variant="outline"
            fullWidth
            onPress={() => router.replace("/rider/dashboard")}
          />
        </View>
      )}
    </View>
  );
}

/**
 * Tiny convenience wrapper around EmptyState so the no-id branch can be
 * a one-liner and stay consistent with the rest of the module.
 */
function SafeAreaEmpty({
  title,
  message,
  ctaLabel,
  onCta,
}: {
  title: string;
  message: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <EmptyState
        icon="📭"
        title={title}
        message={message}
        action={<AppButton title={ctaLabel} onPress={onCta} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  heading: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  sub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
    fontWeight: "600",
  },
  value: { color: Colors.text, fontWeight: "700", marginTop: 2 },
  itemRow: { flexDirection: "row", paddingVertical: 6 },
  itemName: { color: Colors.text, fontWeight: "600" },
  itemTotal: { color: Colors.primary, fontWeight: "800" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalLabel: { color: Colors.text, fontWeight: "800" },
  totalValue: {
    color: Colors.primary,
    fontWeight: "800",
    fontSize: FontSize.lg,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});