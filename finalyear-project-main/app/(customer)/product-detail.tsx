import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { formatCurrency } from "../../src/utils/format";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { Card } from "../../src/components/Card";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { products, session, placeOrder } = useStore();
  const product = products.find((p) => p.id === id);
  const [qty, setQty] = useState(1);
  const [address, setAddress] = useState(session?.user.address ?? "");
  const [phone, setPhone] = useState(session?.user.phone ?? "");
  const [notes, setNotes] = useState("");

  if (!product) {
    return (
      <View style={styles.center}>
        <Text>Product not found.</Text>
      </View>
    );
  }

  const handleOrder = async () => {
    if (!session) return;
    if (qty < 1) {
      Alert.alert("Invalid quantity", "Please select at least 1.");
      return;
    }
    if (qty > product.stock) {
      Alert.alert("Not enough stock", `Only ${product.stock} available.`);
      return;
    }
    if (!address.trim()) {
      Alert.alert("Address required", "Please provide a delivery address.");
      return;
    }
    const order = await placeOrder({
      customerId: session.user.id,
      customerName: session.user.fullName,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      items: [
        {
          productId: product.id,
          productName: product.name,
          size: product.size,
          quantity: qty,
          unitPrice: product.price,
        },
      ],
      total: qty * product.price,
      phone: phone.trim() || session.user.phone,
      deliveryLocation: { address: address.trim() },
      notes: notes.trim() || undefined,
    });
    Alert.alert(
      "Order placed",
      `Order #${order.id.slice(-4)} has been sent to ${product.sellerName}.`,
      [
        {
          text: "Track now",
          onPress: () =>
            router.replace({
              pathname: "/(customer)/tracking",
              params: { id: order.id },
            } as any),
        },
      ],
    );
  };

  const total = qty * product.price;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Product",
          headerStyle: { backgroundColor: Colors.surface },
          headerTitleStyle: { color: Colors.text },
          headerTintColor: Colors.primary,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{product.image ?? "🔥"}</Text>
        </View>

        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.size}>{product.size} • from {product.sellerName}</Text>
        <Text style={styles.price}>{formatCurrency(product.price)}</Text>
        <Text style={styles.desc}>{product.description}</Text>

        <Card style={{ marginTop: Spacing.lg }}>
          <Text style={styles.sectionLabel}>Quantity</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{qty}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQty((q) => Math.min(product.stock, q + 1))}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <Text style={styles.subTotal}>
              Subtotal: <Text style={{ color: Colors.primary }}>{formatCurrency(total)}</Text>
            </Text>
          </View>
        </Card>

        <Card style={{ marginTop: Spacing.md }}>
          <AppInput
            label="Delivery address"
            value={address}
            onChangeText={setAddress}
            placeholder="Street, area, city"
          />
          <AppInput
            label="Phone for delivery"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="e.g. +255 712 000 000"
          />
          <AppInput
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. Call on arrival"
            multiline
          />
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{formatCurrency(total)}</Text>
        </View>
        <AppButton
          title="Place order"
          onPress={handleOrder}
          style={{ paddingHorizontal: Spacing.xl }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    height: 180,
    borderRadius: Radius.lg,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  heroEmoji: { fontSize: 96 },
  name: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  size: {
    color: Colors.textSecondary,
    marginTop: 4,
    fontSize: FontSize.sm,
  },
  price: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
    marginTop: Spacing.sm,
  },
  desc: {
    color: Colors.text,
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  sectionLabel: {
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.primary,
  },
  qtyValue: {
    minWidth: 36,
    textAlign: "center",
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  subTotal: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    boxShadow: "0 6px 12px rgba(0,0,0,0.12)",
  },
  footerLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  footerTotal: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
  },
});
