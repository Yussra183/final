import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { EmptyState } from "../../src/components/EmptyState";
import { ReceiptModal } from "../../src/components/ReceiptModal";
import { useStore } from "../../src/store/StoreContext";
import { PaymentsApi } from "../../src/api/endpoints";
import { Payment, Order } from "../../constants/types";
import { formatCurrency, formatDate } from "../../src/utils/format";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  paymentTone,
} from "../../src/lib/payment";

/**
 * My Payments — `/payments`.
 *
 * Customer-facing payment history. Pulls every payment for the
 * signed-in customer via `GET /api/payments/mine` and renders it
 * newest-first. Tapping a row opens the in-app Receipt modal so the
 * customer can view / save the receipt details without leaving the
 * app. Failed / pending cash payments surface a "Retry" shortcut.
 */
export default function PaymentsScreen() {
  const router = useRouter();
  const { orders } = useStore();

  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Receipt modal state — opens on tap of any payment row. */
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await PaymentsApi.mine();
      setPayments(list);
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to load payments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /** Resolve the order for a payment — pulled from the in-memory store
   *  so the receipt can render the items list without an extra fetch. */
  const orderFor = useCallback(
    (p: Payment): Order | undefined =>
      orders.find((o) => o.id === p.orderId),
    [orders],
  );

  /**
   * Aggregate tiles so the customer sees their totals at a glance.
   * Only count COMPLETED payments in the "paid" tile — refunds and
   * failed attempts would muddy the figure.
   */
  const totals = useMemo(() => {
    const list = payments ?? [];
    let paid = 0;
    let refunded = 0;
    let pending = 0;
    for (const p of list) {
      if (p.status === "completed") paid += p.amount;
      else if (p.status === "refunded") refunded += p.amount;
      else if (p.status === "pending") pending += p.amount;
    }
    return { paid, refunded, pending, count: list.length };
  }, [payments]);

  const renderItem = ({ item }: { item: Payment }) => {
    const numericTail = item.orderId.replace(/[^0-9]/g, "");
    const shortNumber =
      numericTail.length > 0 && numericTail.length <= 6
        ? numericTail
        : item.orderId.slice(-6);
    const orderNumber = `#${shortNumber}`;
    const ts = item.paidAt ?? item.createdAt;
    return (
      <Pressable
        onPress={() => setReceiptPayment(item)}
        accessibilityRole="button"
        accessibilityLabel="View receipt"
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.orderNumberWrap}>
              <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
              <Text style={styles.orderNumber}>Order {orderNumber}</Text>
            </View>
            <StatusPill
              label={paymentStatusLabel(item.status)}
              tone={paymentTone(item.status)}
            />
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={styles.amountValue}>
              {formatCurrency(item.amount)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Method</Text>
            <Text style={styles.rowValue}>
              {paymentMethodLabel(item.method)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>
              {item.paidAt ? "Paid" : "Created"}
            </Text>
            <Text style={styles.rowValue}>{formatDate(ts)}</Text>
          </View>
          {item.transactionRef ? (
            <View style={styles.refRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.refText}>{item.transactionRef}</Text>
            </View>
          ) : null}

          {/* View receipt hint */}
          <View style={styles.viewReceiptRow}>
            <Ionicons
              name="document-text-outline"
              size={14}
              color={Colors.primary}
            />
            <Text style={styles.viewReceiptText}>Tap card to view receipt</Text>
          </View>

          {/* Retry shortcut for incomplete payments */}
          {(item.status === "pending" || item.status === "failed") &&
          item.method !== "cash" ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/(customer)/pay",
                  params: { id: item.orderId },
                } as any)
              }
              style={styles.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Retry payment"
            >
              <Text style={styles.retryText}>Retry payment</Text>
            </Pressable>
          ) : null}

          {/* Refund banner */}
          {item.status === "refunded" ? (
            <View style={styles.refundBanner}>
              <Ionicons
                name="refresh-circle"
                size={16}
                color={Colors.textMuted}
              />
              <Text style={styles.refundText}>
                Refunded
                {item.refundedAt
                  ? ` on ${formatDate(item.refundedAt)}`
                  : ""}
                .
              </Text>
            </View>
          ) : null}
        </Card>
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
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
        <Text style={styles.title}>My Payments</Text>
      </View>

      {loading && payments === null ? (
        <View style={styles.center}>
          <Text style={styles.mutedText}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => {
              setLoading(true);
              load();
            }}
            style={styles.retryBtn}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={payments ?? []}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listPad}
          ItemSeparatorComponent={() => (
            <View style={{ height: Spacing.md }} />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.totalsRow}>
              <TotalsTile
                label="Paid"
                value={formatCurrency(totals.paid)}
                tone="success"
              />
              <TotalsTile
                label="Pending"
                value={formatCurrency(totals.pending)}
                tone="warning"
              />
              <TotalsTile
                label="Refunded"
                value={formatCurrency(totals.refunded)}
                tone="muted"
              />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="💳"
              title="No payments yet"
              message="Payments will appear here once you complete an order. Cash payments are recorded when the rider confirms delivery."
              action={
                <Pressable
                  onPress={() => router.push("/(customer)" as any)}
                  style={styles.browseCta}
                >
                  <Text style={styles.browseCtaText}>Browse sellers</Text>
                </Pressable>
              }
            />
          }
        />
      )}

      {/* ---------------- Receipt modal ---------------- */}
      <ReceiptModal
        visible={receiptPayment !== null}
        payment={receiptPayment}
        order={receiptPayment ? orderFor(receiptPayment) ?? null : null}
        onClose={() => setReceiptPayment(null)}
      />
    </SafeAreaView>
  );
}

/** Compact summary tile used in the totals row at the top of the list. */
function TotalsTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "muted";
}) {
  const tint =
    tone === "success"
      ? Colors.success
      : tone === "warning"
      ? Colors.warning
      : Colors.textMuted;
  const bg =
    tone === "success"
      ? "#E6F6EC"
      : tone === "warning"
      ? "#FFF5E0"
      : Colors.surface;
  return (
    <View style={[styles.tile, { backgroundColor: bg }]}>
      <Text style={[styles.tileLabel, { color: tint }]}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listPad: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  mutedText: { color: Colors.textMuted, fontSize: FontSize.sm },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
  totalsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tile: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  tileLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tileValue: {
    marginTop: Spacing.xs,
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  card: { marginBottom: 0 },
  cardHeader: {
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
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.text,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  amountLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  amountValue: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    color: Colors.primary,
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
  viewReceiptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  viewReceiptText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: "600",
  },
  retryBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.primarySoft,
    alignSelf: "flex-start",
  },
  retryText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  /* ----- Browse CTA inside EmptyState ----- */
  browseCta: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  browseCtaText: {
    color: Colors.surface,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  /* ----- Refund banner ----- */
  refundBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surface,
  },
  refundText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    flex: 1,
  },
});
