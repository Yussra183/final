import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Picker } from "@react-native-picker/picker";
import { isPhone } from "../../src/utils/validators";
import { formatCurrency } from "../../src/utils/format";

export default function PlaceOrderScreen() {
  const router = useRouter();
  const { sellerId } = useLocalSearchParams<{ sellerId?: string }>();
  const { session, sellers, products, placeOrder } = useStore();
  const user = session?.user!;

  const [selectedSellerId, setSelectedSellerId] = useState(
    sellerId ?? sellers[0]?.sellerId ?? "",
  );
  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [address, setAddress] = useState(user.address ?? "");
  const [phone, setPhone] = useState(user.phone);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const sellerProducts = useMemo(
    () => products.filter((p) => p.sellerId === selectedSellerId),
    [products, selectedSellerId],
  );

  const sellerSizes = useMemo(
    () =>
      Array.from(new Set(sellerProducts.map((p) => p.size))).sort(),
    [sellerProducts],
  );

  // Auto-pick the first product matching the chosen size.
  const product = useMemo(
    () => sellerProducts.find((p) => p.size === size) ?? sellerProducts[0],
    [sellerProducts, size],
  );

  const total = useMemo(() => {
    if (!product) return 0;
    const n = Math.max(1, Number(quantity) || 1);
    return n * product.price;
  }, [product, quantity]);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!selectedSellerId) next.seller = "Select a seller";
    if (!product) next.gasType = "Select gas type and size";
    if (!size) next.size = "Select cylinder size";
    if (!quantity || Number(quantity) < 1) next.quantity = "Quantity must be at least 1";
    if (product && Number(quantity) > product.stock)
      next.quantity = `Only ${product.stock} in stock`;
    if (!address.trim()) next.address = "Delivery address is required";
    if (!isPhone(phone)) next.phone = "Valid phone is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    let order;
    try {
      order = await placeOrder({
        customerId: user.id,
        customerName: user.fullName,
        sellerId: selectedSellerId,
        sellerName: sellers.find((s) => s.sellerId === selectedSellerId)?.businessName ?? "Seller",
        items: [
          {
            productId: product!.id,
            productName: product!.name,
            size: product!.size,
            quantity: Number(quantity),
            unitPrice: product!.price,
          },
        ],
        total,
        phone: phone.trim(),
        deliveryLocation: { address: address.trim() },
        notes: notes.trim() || undefined,
      });
    } catch (err) {
      setSubmitting(false);
      const message =
        err instanceof Error ? err.message : "Could not place the order.";
      Alert.alert("Order failed", message);
      return;
    }
    setSubmitting(false);

    Alert.alert(
      "Order placed",
      `Order #${order.id.slice(-4)} sent to ${sellers.find((s) => s.sellerId === selectedSellerId)?.businessName}.`,
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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
          <Text style={styles.title}>Place New Order</Text>
          <Text style={styles.subtitle}>
            Pick a seller, choose your gas, and we&apos;ll deliver to your door.
          </Text>

          <Card>
            <Text style={styles.label}>Select Seller</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={selectedSellerId}
                onValueChange={(v) => {
                  setSelectedSellerId(String(v));
                  setSize("");
                }}
              >
                {sellers.map((s) => (
                  <Picker.Item
                    key={s.sellerId}
                    label={`${s.businessName} • ${s.distanceKm.toFixed(1)} km`}
                    value={s.sellerId}
                  />
                ))}
              </Picker>
            </View>
            {errors.seller ? <Text style={styles.error}>{errors.seller}</Text> : null}

            <Text style={styles.label}>Cylinder Size</Text>
            <View style={styles.sizeRow}>
              {sellerSizes.map((s) => {
                const active = size === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sizePill, active && styles.sizePillActive]}
                    onPress={() => setSize(s)}
                  >
                    <Text
                      style={[
                        styles.sizePillText,
                        active && styles.sizePillTextActive,
                      ]}
                    >
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.size ? <Text style={styles.error}>{errors.size}</Text> : null}

            {product ? (
              <View style={styles.productCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productMeta}>
                    {formatCurrency(product.price)} • {product.stock} in stock
                  </Text>
                </View>
                <Text style={styles.productEmoji}>{product.image ?? "🔥"}</Text>
              </View>
            ) : null}

            <AppInput
              label="Quantity"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              error={errors.quantity}
            />

            <AppInput
              label="Delivery Address"
              value={address}
              onChangeText={setAddress}
              placeholder="Street, area, city"
              multiline
              error={errors.address}
            />
            <AppInput
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
            />
            <AppInput
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Please call on arrival"
              multiline
            />
          </Card>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Estimated total</Text>
            <Text style={styles.summaryValue}>{formatCurrency(total)}</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <AppButton
            title="Submit Order"
            fullWidth
            loading={submitting}
            onPress={handleSubmit}
          />
          <AppButton
            title="Cancel"
            variant="outline"
            fullWidth
            style={{ marginTop: Spacing.sm }}
            onPress={() => router.back()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600",
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    marginBottom: Spacing.md,
  },
  sizeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: Spacing.md,
    flexWrap: "wrap",
  },
  sizePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sizePillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sizePillText: { fontWeight: "700", color: Colors.text },
  sizePillTextActive: { color: "#FFF" },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  productName: { fontWeight: "800", color: Colors.text },
  productMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  productEmoji: { fontSize: 36 },
  error: { color: Colors.danger, fontSize: FontSize.xs, marginBottom: Spacing.sm },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  summaryLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: "600",
  },
  summaryValue: {
    color: Colors.primary,
    fontSize: FontSize.xl,
    fontWeight: "800",
  },
  footer: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
