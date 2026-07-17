import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { DrawerNavigationProp } from "@react-navigation/drawer";
import { TouchableOpacity } from "react-native";
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
  const { orders, advanceDelivery } = useStore();
  const order = id ? orders.find((o) => o.id === id) : undefined;

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
            <Text style={styles.totalValue}>
              {formatCurrency(order.total)}
            </Text>
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