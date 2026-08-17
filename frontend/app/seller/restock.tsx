/**
 * Seller-side restock page (FR-06).
 *
 * Three sections, all driven by the live backend through the store:
 *
 *   1. New request — pick a supplier (only APPROVED suppliers appear),
 *      choose a product from the seller's catalogue, set a quantity,
 *      submit. The store routes the body to {@code POST /api/restock}.
 *   2. In flight   — every row currently in PENDING / ACCEPTED /
 *      PREPARING / DISPATCHED, with a "Cancel" action while still
 *      cancellable.
 *   3. Awaiting receipt — every DELIVERED row that needs the seller
 *      to tap "Confirm receipt". The backend transitions the row to
 *      RECEIVED and replenishes the matching product stock in the
 *      same transaction (see {@code SupplyOrderService.updateStatus}).
 *
 * Cancelled + rejected rows collapse into a history list at the bottom.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { EmptyState } from "../../src/components/EmptyState";
import { formatDate } from "../../src/utils/format";
import {
  RestockRequest,
  RESTOCK_STATUS_LABELS,
  normalizeRestockStatus,
  GasProduct,
} from "../../constants/types";

const ACCENT = "#0EA5E9";

export default function SellerRestock() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
      <View style={styles.header}>
        <DrawerMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Restock from supplier</Text>
          <Text style={styles.subtitle}>
            Raise a supply request, track it through to delivery, and
            confirm receipt.
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <NewRequestCard />
        <AwaitingReceiptSection />
        <InFlightSection />
        <HistorySection />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- New request form ---------- */

function NewRequestCard() {
  const {
    session,
    products,
    approvedSuppliers,
    requestRestock,
  } = useStore();
  const me = session?.user;

  const myProducts: GasProduct[] = useMemo(
    () =>
      me
        ? products.filter((p) => p.sellerId === me.id)
        : [],
    [products, me],
  );

  const [supplierId, setSupplierId] = useState<string | null>(
    approvedSuppliers[0]?.id ?? null,
  );
  const [productId, setProductId] = useState<string | null>(
    myProducts[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedSupplier = useMemo(
    () => approvedSuppliers.find((s) => s.id === supplierId) ?? null,
    [approvedSuppliers, supplierId],
  );
  const selectedProduct = useMemo(
    () => myProducts.find((p) => p.id === productId) ?? null,
    [myProducts, productId],
  );
  const qtyNumber = Math.max(1, Number.parseInt(quantity, 10) || 0);

  const canSubmit =
    !!me &&
    !!selectedSupplier &&
    !!selectedProduct &&
    qtyNumber > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!me || !selectedSupplier || !selectedProduct) return;
    setSubmitting(true);
    try {
      await requestRestock({
        sellerId: me.id,
        sellerName: me.fullName,
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.fullName,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        size: selectedProduct.size,
        quantity: qtyNumber,
        notes: notes.trim() || undefined,
      });
      Alert.alert(
        "Restock requested",
        `${selectedSupplier.fullName} has been notified.`,
      );
      setQuantity("1");
      setNotes("");
    } catch (err: any) {
      const message = err?.message ?? "Could not raise the restock request.";
      Alert.alert("Request failed", message);
    } finally {
      setSubmitting(false);
    }
  };

  if (approvedSuppliers.length === 0) {
    return (
      <Card style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
        <Text style={styles.cardTitle}>New supply request</Text>
        <EmptyState
          icon="📭"
          title="No approved suppliers yet"
          message="Approved suppliers will appear here once the administrator
          approves their application. You can still cancel any in-flight
          requests and confirm deliveries below."
        />
      </Card>
    );
  }

  if (myProducts.length === 0) {
    return (
      <Card style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
        <Text style={styles.cardTitle}>New supply request</Text>
        <EmptyState
          icon="�"
          title="Add a product first"
          message="Create a product in your inventory before raising a
          supply request — the supplier needs to know which product to
          replenish."
        />
      </Card>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Card style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
        <Text style={styles.cardTitle}>New supply request</Text>

        <Text style={styles.fieldLabel}>Supplier</Text>
        <View style={styles.chipRow}>
          {approvedSuppliers.map((s) => {
            const active = s.id === supplierId;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSupplierId(s.id)}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {s.fullName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Product</Text>
        <View style={styles.chipRow}>
          {myProducts.map((p) => {
            const active = p.id === productId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setProductId(p.id)}
              >
                <Text
                  style={[styles.chipText, active && styles.chipTextActive]}
                >
                  {p.name} · {p.size}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Quantity</Text>
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="number-pad"
          style={styles.input}
          placeholder="e.g. 20"
        />

        <Text style={styles.fieldLabel}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, { minHeight: 64 }]}
          placeholder="Anything the supplier should know"
          multiline
        />

        <AppButton
          title={submitting ? "Sending..." : "Raise supply request"}
          variant="primary"
          fullWidth
          disabled={!canSubmit}
          onPress={handleSubmit}
          style={{ marginTop: Spacing.md }}
        />
      </Card>
    </KeyboardAvoidingView>
  );
}

/* ---------- Sections ---------- */

function useMyRestock(): RestockRequest[] {
  const { session, restockRequests } = useStore();
  const me = session?.user;
  return useMemo(
    () =>
      me
        ? restockRequests.filter((r) => r.sellerId === me.id)
        : [],
    [restockRequests, me],
  );
}

function pillTone(s: RestockRequest["status"]) {
  const norm = normalizeRestockStatus(s);
  switch (norm) {
    case "delivered":
    case "received":
      return "success" as const;
    case "rejected":
    case "cancelled":
      return "danger" as const;
    case "preparing":
    case "dispatched":
      return "info" as const;
    case "accepted":
      return "primary" as const;
    default:
      return "warning" as const;
  }
}

function RestockRow({
  item,
  rightSlot,
}: {
  item: RestockRequest;
  rightSlot?: React.ReactNode;
}) {
  const s = normalizeRestockStatus(item.status);
  return (
    <Card style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitle}>
            {item.productName} ({item.size}) ×{item.quantity}
          </Text>
          <Text style={styles.itemMeta}>
            Supplier: {item.supplierName ?? "(any)"} •{" "}
            {formatDate(item.createdAt)}
          </Text>
          {item.notes ? (
            <Text style={[styles.itemMeta, { marginTop: 2 }]}>
              Notes: {item.notes}
            </Text>
          ) : null}
        </View>
        <StatusPill label={RESTOCK_STATUS_LABELS[s]} tone={pillTone(s)} />
      </View>
      {rightSlot ? (
        <View style={{ marginTop: Spacing.sm }}>{rightSlot}</View>
      ) : null}
    </Card>
  );
}

function AwaitingReceiptSection() {
  const items = useMyRestock().filter(
    (r) => normalizeRestockStatus(r.status) === "delivered",
  );
  const { updateRestockStatus } = useStore();

  const handleConfirm = (r: RestockRequest) => {
    Alert.alert(
      "Confirm receipt?",
      `This will add ${r.quantity} units to your "${r.productName}"
       (${r.size}) stock. The supplier will be notified.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => updateRestockStatus(r.id, { status: "received" }),
        },
      ],
    );
  };

  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: Spacing.lg }}>
      <Text style={styles.sectionTitle}>Awaiting your receipt</Text>
      {items.map((r) => (
        <RestockRow
          key={r.id}
          item={r}
          rightSlot={
            <AppButton
              title="Confirm receipt"
              variant="primary"
              fullWidth
              onPress={() => handleConfirm(r)}
            />
          }
        />
      ))}
    </View>
  );
}

function InFlightSection() {
  const items = useMyRestock().filter((r) => {
    const s = normalizeRestockStatus(r.status);
    return (
      s === "pending" ||
      s === "accepted" ||
      s === "preparing" ||
      s === "dispatched"
    );
  });
  const { updateRestockStatus } = useStore();

  const handleCancel = (r: RestockRequest) => {
    Alert.prompt(
      "Cancel request?",
      `Tell the supplier why (required).`,
      [
        { text: "Keep request", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: (reason?: string) => {
            const trimmed = (reason ?? "").trim();
            if (!trimmed) {
              Alert.alert("Reason required", "Please enter a reason.");
              return;
            }
            updateRestockStatus(r.id, {
              status: "cancelled",
              reason: trimmed,
            });
          },
        },
      ],
      "plain-text",
    );
  };

  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: Spacing.lg }}>
      <Text style={styles.sectionTitle}>In flight</Text>
      {items.map((r) => (
        <RestockRow
          key={r.id}
          item={r}
          rightSlot={
            <AppButton
              title="Cancel request"
              variant="secondary"
              fullWidth
              onPress={() => handleCancel(r)}
            />
          }
        />
      ))}
    </View>
  );
}

function HistorySection() {
  const items = useMyRestock().filter((r) => {
    const s = normalizeRestockStatus(r.status);
    return s === "received" || s === "rejected" || s === "cancelled";
  });

  if (items.length === 0) {
    return (
      <View style={{ marginTop: Spacing.lg }}>
        <Text style={styles.sectionTitle}>History</Text>
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            icon="📜"
            title="No history yet"
            message="Completed, rejected, and cancelled requests appear here."
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginTop: Spacing.lg }}>
      <Text style={styles.sectionTitle}>History</Text>
      {items.map((r) => (
        <RestockRow key={r.id} item={r} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  chipText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: "700",
  },
  chipTextActive: { color: "#FFF" },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    color: Colors.text,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
  itemTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.md,
  },
  itemMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
