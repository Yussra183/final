import React, { useMemo, useState } from "react";
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { formatCurrency } from "../../src/utils/format";
import { GasProduct } from "../../constants/types";

type Category = "all" | "refill" | "new_cylinder" | "accessory";

export default function ProductsScreen() {
  const router = useRouter();
  const { products } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category>("all");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchQ = q
        ? (p.name + p.size + p.sellerName)
            .toLowerCase()
            .includes(q.toLowerCase())
        : true;
      const matchC = cat === "all" ? true : p.category === cat;
      return matchQ && matchC;
    });
  }, [products, q, cat]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Browse Gas</Text>
        <Text style={styles.subtitle}>
          {filtered.length} product{filtered.length === 1 ? "" : "s"} available
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          placeholder="Search by name, size, or seller"
          placeholderTextColor={Colors.textMuted}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.chipRow}>
        {([
          ["all", "All"],
          ["refill", "Refill"],
          ["new_cylinder", "Cylinders"],
          ["accessory", "Accessories"],
        ] as [Category, string][]).map(([k, label]) => {
          const active = cat === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setCat(k)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No products match your filters.</Text>
        }
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onPress={() =>
              router.push({
                pathname: "/(customer)/product-detail",
                params: { id: item.id },
              } as any)
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function ProductCard({
  product,
  onPress,
}: {
  product: GasProduct;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View style={styles.card}>
        <View style={styles.thumb}>
          <Text style={styles.thumbEmoji}>{product.image ?? "🔥"}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.productName} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.productMeta}>
            {product.size} • {product.sellerName}
          </Text>
          <View style={styles.productRow}>
            <Text style={styles.productPrice}>{formatCurrency(product.price)}</Text>
            <View
              style={[
                styles.stockPill,
                product.stock < 5 && { backgroundColor: "#FEE2E2" },
              ]}
            >
              <Text
                style={[
                  styles.stockText,
                  product.stock < 5 && { color: "#B91C1C" },
                ]}
              >
                {product.stock} in stock
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    color: Colors.textSecondary,
    marginTop: 2,
    fontSize: FontSize.sm,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  searchIcon: { fontSize: 18, marginRight: 6 },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  chipTextActive: { color: "#FFF" },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  thumb: {
    width: 80,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbEmoji: { fontSize: 40 },
  productName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  productMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  productPrice: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
  },
  stockPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#CCFBF1",
    borderRadius: Radius.pill,
  },
  stockText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
  },
  empty: {
    textAlign: "center",
    color: Colors.textSecondary,
    marginTop: Spacing.xl,
  },
});
