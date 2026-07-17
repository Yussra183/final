import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import {
  formatCurrency,
  formatDateTime,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";
import { AppButton } from "../../src/components/AppButton";
import { OrderStatusTimeline } from "../../src/components/OrderStatusTimeline";

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { orders, session } = useStore();
  const order = orders.find((o) => o.id === id);

  if (!order) {
    return (
      <View style={styles.center}>
        <Text>Order not found.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Order #${order.id.slice(-4)}`,
          headerStyle: { backgroundColor: Colors.surface },
          headerTitleStyle: { color: Colors.text },
          headerTintColor: Colors.primary,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
        <Card>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heading}>Status</Text>
              <Text style={styles.sub}>
                Last update: {formatDateTime(order.updatedAt)}
              </Text>
            </View>
            <StatusPill
              label={orderStatusLabel(order.status)}
              tone={orderTone(order.status)}
            />
          </View>

          <View style={styles.timelineWrap}>
            <OrderStatusTimeline order={order} />
          </View>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.heading}>Items</Text>
          {order.items.map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>
                  {it.productName} ({it.size})
                </Text>
                <Text style={styles.itemMeta}>
                  {formatCurrency(it.unitPrice)} × {it.quantity}
                </Text>
              </View>
              <Text style={styles.itemTotal}>
                {formatCurrency(it.unitPrice * it.quantity)}
              </Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.total)}</Text>
          </View>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <Text style={styles.heading}>Delivery</Text>
          <Text style={styles.itemMeta}>Address</Text>
          <Text style={styles.itemName}>{order.deliveryLocation.address}</Text>
          {order.phone ? (
            <>
              <Text style={[styles.itemMeta, { marginTop: Spacing.sm }]}>Phone</Text>
              <Text style={styles.itemName}>{order.phone}</Text>
            </>
          ) : null}
          {order.riderName ? (
            <>
              <Text style={[styles.itemMeta, { marginTop: Spacing.sm }]}>Rider</Text>
              <Text style={styles.itemName}>{order.riderName}</Text>
            </>
          ) : (
            <Text style={[styles.itemName, { color: Colors.textMuted }]}>
              Waiting for a rider to be assigned.
            </Text>
          )}
          {order.notes ? (
            <>
              <Text style={[styles.itemMeta, { marginTop: Spacing.sm }]}>Notes</Text>
              <Text style={styles.itemName}>{order.notes}</Text>
            </>
          ) : null}
        </Card>
      </ScrollView>

      {order.status === "delivered" ? (
        <View style={styles.footer}>
          <AppButton
            title="Reorder"
            variant="primary"
            onPress={() => router.push("/(customer)/products" as any)}
            style={{ flex: 1 }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  heading: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  sub: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  timelineWrap: { marginTop: Spacing.md },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  itemName: { color: Colors.text, fontWeight: "700" },
  itemMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  itemTotal: {
    color: Colors.primary,
    fontWeight: "800",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalLabel: {
    color: Colors.text,
    fontWeight: "800",
    fontSize: FontSize.md,
  },
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
    flexDirection: "row",
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
