import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { StatusPill } from "../../src/components/StatusPill";
import { ReceiptModal } from "../../src/components/ReceiptModal";
import { useStore } from "../../src/store/StoreContext";
import { Order, Payment } from "../../constants/types";
import { PaymentsApi } from "../../src/api/endpoints";
import { formatCurrency, formatDate } from "../../src/utils/format";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  paymentTone,
} from "../../src/lib/payment";
import { PaymentMethod, PaymentStatus } from "../../constants/types";

/**
 * Pay Now screen — `/pay?id=<orderId>`.
 *
 * Customer initiates a payment for one of their orders. The flow:
 *   1. Load the order from the in-memory store (already cached after
 *      login via `useStore().orders`).
 *   2. Pick a payment method (Cash / M-Pesa / Card / Bank).
 *   3. Submit `POST /api/payments/pay` — backend is idempotent so
 *      re-tapping "Pay" returns the existing row instead of creating a
 *      duplicate.
 *   4. On success, navigate back to the order tracker so the rider /
 *      status pill reflects the new payment state.
 *
 * Idempotency note: the backend's unique index on
 * `(order_id) WHERE status IN ('PENDING','COMPLETED')` is the source of
 * truth — this screen just shows the same friendly message whether
 * it's a brand-new payment or a retry of an existing one.
 */
type Method = PaymentMethod;

const METHODS: { key: Method; label: string; icon: string; description: string }[] = [
  {
    key: "cash",
    label: "Cash on delivery",
    icon: "cash-outline",
    description: "Pay the rider in cash when the gas arrives.",
  },
  {
    key: "mpesa",
    label: "M-Pesa",
    icon: "phone-portrait-outline",
    description: "Mobile money transfer (simulated).",
  },
  {
    key: "card",
    label: "Card",
    icon: "card-outline",
    description: "Debit or credit card (simulated).",
  },
  {
    key: "bank",
    label: "Bank transfer",
    icon: "business-outline",
    description: "Direct bank transfer (simulated).",
  },
];

export default function PayNowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const orderId = params.id ?? "";
  const { orders, getOrdersForUser } = useStore();

  const order: Order | undefined = useMemo(
    () => orders.find((o) => o.id === orderId),
    [orders, orderId],
  );

  const [method, setMethod] = useState<Method>("cash");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** Latest payment snapshot for this order — refreshed on mount + after submit. */
  const [latestStatus, setLatestStatus] = useState<PaymentStatus | null>(null);
  const [latestRef, setLatestRef] = useState<string | undefined>(undefined);
  /** Full Payment object for the receipt modal. */
  const [latestPayment, setLatestPayment] = useState<Payment | null>(null);
  /** Toggles the in-app receipt modal. */
  const [showReceipt, setShowReceipt] = useState(false);

  // Bootstrap: load the existing payment (if any) so the screen reflects
  // a "Paid" badge immediately and doesn't ask the customer to pay again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orderId) return;
      try {
        const latest = await PaymentsApi.latestForOrder(orderId);
        if (cancelled || !latest) return;
        setLatestPayment(latest);
        setLatestStatus(latest.status);
        setLatestRef(latest.transactionRef);
        // If the customer already chose M-Pesa, restore the phone so a
        // retry doesn't lose context.
        if (latest.method === "mpesa" && latest.phone) {
          setPhone(latest.phone);
        }
        // If we already have a payment in flight, lock the method to it
        // so a re-submit goes through the same channel.
        setMethod(latest.method);
      } catch {
        // Network / 204 — no payment yet; leave defaults in place.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!orderId || !order) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Pay for order</Text>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={Colors.textMuted}
          />
          <Text style={styles.emptyTitle}>Order not found</Text>
          <Text style={styles.emptyText}>
            We couldn't find this order. Please go back and try again from
            your orders list.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const numericTail = order.id.replace(/[^0-9]/g, "");
  const shortNumber =
    numericTail.length > 0 && numericTail.length <= 6
      ? numericTail
      : order.id.slice(-6);
  const orderNumber = `#${shortNumber}`;

  const isPaid = latestStatus === "completed";
  const isRefunded = latestStatus === "refunded";
  const isFailed = latestStatus === "failed";
  const hasActivePayment = latestStatus === "pending" || isPaid || isRefunded;

  const submit = async () => {
    if (!order) return;
    if (method === "mpesa" && phone.trim().length < 6) {
      Alert.alert("Phone number required", "Please enter the M-Pesa phone number to receive the prompt.");
      return;
    }
    setSubmitting(true);
    try {
      const payment = await PaymentsApi.pay({
        orderId: order.id,
        method,
        phone: method === "mpesa" ? phone.trim() : undefined,
        notes: notes.trim() || undefined,
      });
      setLatestPayment(payment);
      setLatestStatus(payment.status);
      setLatestRef(payment.transactionRef);
      Alert.alert(
        payment.status === "completed" ? "Payment confirmed" : "Payment recorded",
        payment.status === "completed"
          ? `Your payment of ${formatCurrency(payment.amount)} has been received.\n\nConfirmation: ${payment.transactionRef ?? "—"}`
          : "Your cash payment will be collected by the rider on delivery.",
        [
          {
            text: "View order",
            onPress: () =>
              router.replace({
                pathname: "/(customer)/tracking",
                params: { id: order.id },
              } as any),
          },
        ],
      );
    } catch (err) {
      Alert.alert(
        "Payment failed",
        (err as Error)?.message ?? "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollPad}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------- Header ---------------- */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={20} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Pay for order</Text>
        </View>

        {/* ---------------- Order summary card ---------------- */}
        <Card style={styles.orderCard}>
          <View style={styles.orderHeader}>
            <View style={styles.orderNumberWrap}>
              <Ionicons name="cube-outline" size={18} color={Colors.primary} />
              <Text style={styles.orderNumber}>{orderNumber}</Text>
            </View>
            {latestStatus ? (
              <StatusPill
                label={paymentStatusLabel(latestStatus)}
                tone={paymentTone(latestStatus)}
              />
            ) : null}
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Seller</Text>
            <Text style={styles.rowValue}>{order.sellerName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Placed</Text>
            <Text style={styles.rowValue}>{formatDate(order.createdAt)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Items</Text>
            <Text style={styles.rowValue}>
              {order.items.length === 1
                ? `${order.items[0].quantity} × ${order.items[0].productName}`
                : `${order.items.length} items`}
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total to pay</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.total)}</Text>
          </View>
          {latestRef ? (
            <View style={styles.refRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.refText}>
                Confirmation: {latestRef}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* ---------------- Method picker ---------------- */}
        <Text style={styles.sectionTitle}>Payment method</Text>
        <Card padded={false} style={styles.methodList}>
          {METHODS.map((m, idx) => {
            const selected = method === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMethod(m.key)}
                style={[
                  styles.methodRow,
                  idx > 0 && styles.methodRowDivider,
                  selected && styles.methodRowSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={m.label}
              >
                <View style={styles.methodIconWrap}>
                  <Ionicons
                    name={m.icon as any}
                    size={20}
                    color={selected ? Colors.primary : Colors.text}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.methodLabel}>{m.label}</Text>
                  <Text style={styles.methodDescription}>{m.description}</Text>
                </View>
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selected ? Colors.primary : Colors.textMuted}
                />
              </Pressable>
            );
          })}
        </Card>

        {/* ---------------- M-Pesa phone (conditional) ---------------- */}
        {method === "mpesa" ? (
          <View style={styles.phoneWrap}>
            <AppInput
              label="M-Pesa phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="07XX XXX XXX"
              autoCorrect={false}
              helperText="You'll receive a push prompt to confirm the transaction."
            />
          </View>
        ) : null}

        {/* ---------------- Notes ---------------- */}
        <View style={styles.phoneWrap}>
          <AppInput
            label="Note (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any special instructions for the rider…"
            multiline
          />
        </View>

        {/* ---------------- Status messages ---------------- */}
        {isPaid ? (
          <View style={styles.statusBannerSuccess}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={Colors.success}
            />
            <Text style={styles.statusBannerText}>
              This order is fully paid. No further action needed.
            </Text>
          </View>
        ) : null}
        {isRefunded ? (
          <View style={styles.statusBannerMuted}>
            <Ionicons
              name="refresh-circle"
              size={18}
              color={Colors.textMuted}
            />
            <Text style={styles.statusBannerText}>
              This order was refunded. Contact support if you have questions.
            </Text>
          </View>
        ) : null}
        {isFailed ? (
          <View style={styles.statusBannerDanger}>
            <Ionicons
              name="close-circle"
              size={18}
              color={Colors.danger}
            />
            <Text style={styles.statusBannerText}>
              The last payment attempt failed. Please pick a method and try
              again.
            </Text>
          </View>
        ) : null}

        {/* ---------------- Submit button ---------------- */}
        <AppButton
          title={
            submitting
              ? "Submitting…"
              : isPaid
              ? "Already paid"
              : hasActivePayment
              ? "Update payment"
              : `Pay ${formatCurrency(order.total)}`
          }
          onPress={submit}
          disabled={submitting || isPaid}
          style={{ marginTop: Spacing.lg }}
        />

        {/* ---------------- View receipt button ----------------
            Visible whenever we have a payment row on file — the customer
            can re-open the receipt at any time (e.g. for accounting
            or to forward the confirmation reference to the seller). */}
        {latestPayment ? (
          <Pressable
            onPress={() => setShowReceipt(true)}
            style={styles.viewReceiptBtn}
            accessibilityRole="button"
            accessibilityLabel="View receipt"
          >
            <Ionicons
              name="document-text-outline"
              size={18}
              color={Colors.primary}
            />
            <Text style={styles.viewReceiptText}>View receipt</Text>
          </Pressable>
        ) : null}

        <Text style={styles.disclaimer}>
          This is a simulated payment gateway for demonstration. No real
          money is transferred. Every payment carries a synthetic
          confirmation reference and is recorded in your payment history.
        </Text>
      </ScrollView>

      {/* ---------------- Receipt modal ---------------- */}
      <ReceiptModal
        visible={showReceipt}
        payment={latestPayment}
        order={order ?? null}
        onClose={() => setShowReceipt(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollPad: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: "700",
    color: Colors.text,
  },
  orderCard: { marginBottom: Spacing.lg },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  orderNumberWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  orderNumber: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.text,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  rowLabel: { color: Colors.textMuted, fontSize: FontSize.sm },
  rowValue: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
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
    fontSize: FontSize.md,
    fontWeight: "700",
  },
  totalValue: {
    color: Colors.primary,
    fontSize: FontSize.lg,
    fontWeight: "700",
  },
  refRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  refText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontFamily: "monospace",
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  methodList: { marginBottom: Spacing.md, overflow: "hidden" },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  methodRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  methodRowSelected: {
    backgroundColor: Colors.primarySoft,
  },
  methodIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  methodLabel: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: "600",
  },
  methodDescription: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  phoneWrap: { marginTop: Spacing.md },
  /* ----- View receipt (inline link below the submit button) ----- */
  viewReceiptBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  viewReceiptText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  statusBannerSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "#E6F6EC",
  },
  statusBannerMuted: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  statusBannerDanger: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "#FBE9E9",
  },
  statusBannerText: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  disclaimer: {
    marginTop: Spacing.lg,
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: "center",
    lineHeight: 16,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
