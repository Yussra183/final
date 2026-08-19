/**
 * Seller → Inventory
 *
 * Lists every gas product owned by the current seller with its size,
 * price and available stock. Each card exposes Add Stock / Edit /
 * Delete actions and a low-stock warning fires automatically when
 * stock falls below the per-product threshold.
 *
 * FR-05 — the threshold comes from the backend (`product.lowStockThreshold`)
 * so the warning matches the same number the server uses to trigger the
 * in-app stock notification. We keep the local default below for legacy
 * rows / mock data that don't carry the field yet.
 *
 * All mutations go through `useStore()` so wiring the real Spring Boot
 * REST API later is a drop-in.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { useStore } from "../../src/store/StoreContext";
import { formatCurrency } from "../../src/utils/format";
import { GasProduct } from "../../constants/types";
import { ALL_GAS_SIZES } from "../../constants/gasCatalog";
import { useRouter } from "expo-router";

const FALLBACK_LOW_STOCK_THRESHOLD = 10;

type SizeFilter = "all" | string;

/** Inventory card — image · name · size · stock bar · price · actions. */
function ProductCard({
  product,
  onAddStock,
  onEdit,
  onDelete,
}: {
  product: GasProduct;
  onAddStock: (p: GasProduct) => void;
  onEdit: (p: GasProduct) => void;
  onDelete: (p: GasProduct) => void;
}) {
  const threshold = product.lowStockThreshold ?? FALLBACK_LOW_STOCK_THRESHOLD;
  const isLow = product.stock <= threshold;
  const stockPct = Math.min(100, (product.stock / Math.max(50, threshold * 10)) * 100);
  const barColor = isLow
    ? Colors.danger
    : product.stock < Math.max(threshold * 2, 25)
      ? Colors.warning
      : Colors.success;

  return (
    <Card style={styles.productCard}>
      {isLow ? (
        <View style={styles.lowStockBanner}>
          <Ionicons name="warning-outline" size={14} color="#B45309" />
          <Text style={styles.lowStockText}>
            Low stock — only {product.stock} units left
          </Text>
        </View>
      ) : null}

      <View style={styles.cardTop}>
        <View style={styles.productImage}>
          <Text style={styles.productEmoji}>{product.image ?? "🔥"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName} numberOfLines={1}>
            {product.name}
          </Text>
          <View style={styles.sizeRow}>
            <View style={styles.sizeChip}>
              <Text style={styles.sizeChipText}>{product.size}</Text>
            </View>
            <Text style={styles.categoryText}>
              {product.category === "refill"
                ? "Refill"
                : product.category === "new_cylinder"
                  ? "New Cylinder"
                  : "Accessory"}
            </Text>
          </View>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.priceLabel}>Price</Text>
          <Text style={styles.priceValue}>{formatCurrency(product.price)}</Text>
        </View>
      </View>

      {/* Stock bar */}
      <View style={styles.stockRow}>
        <Text style={styles.stockLabel}>Available</Text>
        <Text style={[styles.stockValue, isLow && { color: Colors.danger }]}>
          {product.stock} units
        </Text>
      </View>
      <View style={styles.stockBar}>
        <View
          style={[
            styles.stockBarFill,
            { width: `${stockPct}%`, backgroundColor: barColor },
          ]}
        />
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.btnAddStock]}
          onPress={() => onAddStock(product)}
        >
          <Ionicons name="add-circle-outline" size={16} color={Colors.textInverse} />
          <Text style={styles.actionBtnText}>Add Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.btnEdit]}
          onPress={() => onEdit(product)}
        >
          <Ionicons name="create-outline" size={16} color={Colors.primary} />
          <Text style={[styles.actionBtnText, styles.btnEditText]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.btnDelete]}
          onPress={() => onDelete(product)}
        >
          <Ionicons name="trash-outline" size={16} color={Colors.danger} />
          <Text style={[styles.actionBtnText, styles.btnDeleteText]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

/** "Add Stock" modal — increments the existing stock by a user amount. */
function AddStockModal({
  product,
  visible,
  onClose,
  onConfirm,
}: {
  product: GasProduct | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [amount, setAmount] = useState("");

  // Reset the input every time a different product is opened.
  React.useEffect(() => {
    if (visible) setAmount("");
  }, [visible, product?.id]);

  if (!product) return null;

  const submit = () => {
    const n = parseInt(amount, 10);
    if (Number.isNaN(n) || n <= 0) {
      Alert.alert("Invalid amount", "Please enter a positive number.");
      return;
    }
    onConfirm(n);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Add Stock</Text>
          <Text style={styles.modalSub}>
            {product.size} {product.name}
          </Text>
          <Text style={styles.modalMeta}>
            Current stock: {product.stock} units
          </Text>

          <AppInput
            label="Units to add"
            placeholder="e.g. 25"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />

          <View style={styles.modalActions}>
            <AppButton
              title="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={onClose}
            />
            <AppButton
              title="Confirm"
              variant="primary"
              style={{ flex: 1 }}
              onPress={submit}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** "Edit" modal — update product price and description inline. */
function EditProductModal({
  product,
  visible,
  onClose,
  onConfirm,
}: {
  product: GasProduct | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (patch: { price: number; description: string }) => void;
}) {
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  React.useEffect(() => {
    if (visible && product) {
      setPrice(String(product.price));
      setDescription(product.description);
    }
  }, [visible, product]);

  if (!product) return null;

  const submit = () => {
    const n = parseInt(price, 10);
    if (Number.isNaN(n) || n < 0) {
      Alert.alert("Invalid price", "Please enter a valid amount.");
      return;
    }
    onConfirm({ price: n, description });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit Product</Text>
          <Text style={styles.modalSub}>
            {product.size} {product.name}
          </Text>

          <AppInput
            label="Price (TSh)"
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />
          <AppInput
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          <View style={styles.modalActions}>
            <AppButton
              title="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={onClose}
            />
            <AppButton
              title="Save"
              variant="primary"
              style={{ flex: 1 }}
              onPress={submit}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SellerInventory() {
  const router = useRouter();
  const {
    session,
    products,
    addProduct,
    updateProduct,
    updateProductStock,
    deleteProduct,
  } = useStore();

  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("all");
  const [stockTarget, setStockTarget] = useState<GasProduct | null>(null);
  const [editTarget, setEditTarget] = useState<GasProduct | null>(null);

  const user = session?.user;
  const myProducts = useMemo(
    () =>
      (user
        ? products.filter((p) => p.sellerId === user.id)
        : products
      ).slice(),
    [user, products],
  );

  const filtered = useMemo(() => {
    if (sizeFilter === "all") return myProducts;
    return myProducts.filter((p) => p.size === sizeFilter);
  }, [myProducts, sizeFilter]);

  const sizeFilters = useMemo(
    () => [
      { key: "all", label: "All" },
      ...ALL_GAS_SIZES.map((size) => ({ key: size, label: size })),
    ],
    [],
  );

  const lowCount = useMemo(
    () =>
      myProducts.filter(
        (p) =>
          p.stock <= (p.lowStockThreshold ?? FALLBACK_LOW_STOCK_THRESHOLD),
      ).length,
    [myProducts],
  );

  const handleAddStockConfirm = (amount: number) => {
    if (!stockTarget) return;
    updateProductStock(stockTarget.id, stockTarget.stock + amount);
    Alert.alert(
      "Stock updated",
      `${amount} units added to ${stockTarget.size} ${stockTarget.name}.`,
    );
    setStockTarget(null);
  };

  const handleEditConfirm = (patch: { price: number; description: string }) => {
    if (!editTarget) return;
    updateProduct(editTarget.id, patch);
    Alert.alert(
      "Saved",
      `Pricing and description updated for ${editTarget.size} ${editTarget.name}.`,
    );
    setEditTarget(null);
  };

  const handleDelete = (p: GasProduct) => {
    Alert.alert(
      "Delete product?",
      `${p.size} ${p.name} will be removed from your inventory.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteProduct(p.id);
            Alert.alert("Removed", `${p.size} ${p.name} has been removed.`);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Inventory" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Stat row */}
        <View style={styles.statRow}>
          <View style={[styles.statBox, { backgroundColor: Colors.primarySoft }]}>
            <Text style={styles.statValue}>{myProducts.length}</Text>
            <Text style={styles.statLabel}>Products</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: Colors.warningSoft }]}>
            <Text style={[styles.statValue, { color: Colors.warning }]}>
              {lowCount}
            </Text>
            <Text style={styles.statLabel}>Low Stock</Text>
          </View>
          <View
            style={[
              styles.statBox,
              { backgroundColor: Colors.successSoft },
            ]}
          >
            <Text style={[styles.statValue, { color: Colors.success }]}>
              {myProducts.reduce((s, p) => s + p.stock, 0)}
            </Text>
            <Text style={styles.statLabel}>Total Units</Text>
          </View>
        </View>

        {lowCount > 0 ? (
          <Card style={styles.bannerCard}>
            <View style={styles.bannerRow}>
              <View style={styles.bannerIcon}>
                <Ionicons name="alert-circle" size={22} color={Colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>
                  {lowCount} product{lowCount > 1 ? "s" : ""} running low
                </Text>
                <Text style={styles.bannerMeta}>
                  Tap “Add Stock” to restock or contact your supplier.
                </Text>
              </View>
              <StatusPill label={`${lowCount}`} tone="warning" />
            </View>
            <TouchableOpacity
              style={styles.bannerCta}
              onPress={() => router.push("/seller/restock" as any)}
            >
              <Ionicons name="cloud-download-outline" size={16} color={Colors.primary} />
              <Text style={styles.bannerCtaText}>Request gas from supplier</Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {/* Size filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {sizeFilters.map((f) => {
            const active = sizeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setSizeFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <EmptyState
            icon="📦"
            title="No products in this view"
            message="Adjust your filter or add new inventory."
          />
        ) : (
          filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onAddStock={setStockTarget}
              onEdit={setEditTarget}
              onDelete={handleDelete}
            />
          ))
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <AddStockModal
        product={stockTarget}
        visible={!!stockTarget}
        onClose={() => setStockTarget(null)}
        onConfirm={handleAddStockConfirm}
      />

      <EditProductModal
        product={editTarget}
        visible={!!editTarget}
        onClose={() => setEditTarget(null)}
        onConfirm={handleEditConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Stat row
  statRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statBox: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: "center",
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
    marginTop: 2,
  },

  // Banner
  bannerCard: { marginBottom: Spacing.md },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.warningSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  bannerMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bannerCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bannerCtaText: {
    color: Colors.primary,
    fontWeight: "700",
    fontSize: FontSize.sm,
  },

  // Filter chips
  filterRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: Colors.textInverse,
  },

  // Product card
  productCard: { marginBottom: Spacing.md },
  lowStockBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.warningSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    marginBottom: Spacing.sm,
  },
  lowStockText: {
    fontSize: FontSize.xs,
    color: "#B45309",
    fontWeight: "700",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  productImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  productEmoji: { fontSize: 28 },
  productName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 4,
  },
  sizeChip: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  sizeChipText: {
    fontSize: FontSize.xs,
    color: Colors.textInverse,
    fontWeight: "800",
  },
  categoryText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  priceCol: {
    alignItems: "flex-end",
  },
  priceLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  priceValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },

  // Stock bar
  stockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  stockLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  stockValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "800",
  },
  stockBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.surfaceMuted,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  stockBarFill: {
    height: "100%",
    borderRadius: 4,
  },

  // Actions
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    flex: 1,
  },
  btnAddStock: { backgroundColor: Colors.primary },
  btnEdit: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  btnDelete: {
    backgroundColor: Colors.dangerSoft,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  actionBtnText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  btnEditText: { color: Colors.primary },
  btnDeleteText: { color: Colors.danger },

  // Modal shared
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.scrim,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  modalSub: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  modalMeta: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
