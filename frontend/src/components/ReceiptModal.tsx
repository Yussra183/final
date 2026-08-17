import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "./Card";
import { StatusPill } from "./StatusPill";
import { Payment, Order } from "../../constants/types";
import { formatCurrency, formatDateTime } from "../../src/utils/format";
import {
  paymentMethodLabel,
  paymentStatusLabel,
  paymentTone,
} from "../../src/lib/payment";

/**
 * In-app payment receipt — rendered as a modal sheet the customer can
 * view immediately after paying or from the payment history list.
 *
 * The receipt surfaces every field that matters for the customer's
 * records (and for any dispute they might raise later):
 *
 *   • Receipt number (derived from the payment id + created date so it
 *     stays unique and human-readable)
 *   • Date / time of payment
 *   • Status badge
 *   • Customer + seller names
 *   • Order reference
 *   • Payment method + M-Pesa phone (if applicable)
 *   • Transaction reference (the synthetic TXN-… code)
 *   • Itemised list pulled from the linked Order
 *   • Subtotal / total
 *   • Notes from the customer
 *   • Footer with the issuing business name
 *
 * The receipt intentionally re-uses the order's `items` snapshot rather
 * than the live catalogue so the receipt always reflects what the
 * customer actually paid for, even if a product has since been deleted
 * or repriced.
 */
interface Props {
  visible: boolean;
  payment: Payment | null;
  /** The order this payment belongs to. Optional — the receipt degrades
   *  gracefully if the order can't be loaded. */
  order?: Order | null;
  onClose: () => void;
}

export function ReceiptModal({ visible, payment, order, onClose }: Props) {
  if (!payment) {
    return null;
  }

  const numericTail = payment.id.replace(/[^0-9]/g, "");
  const shortPayment =
    numericTail.length > 0 && numericTail.length <= 6
      ? numericTail
      : payment.id.slice(-6);
  const orderTail = payment.orderId.replace(/[^0-9]/g, "");
  const shortOrder =
    orderTail.length > 0 && orderTail.length <= 6
      ? orderTail
      : payment.orderId.slice(-6);

  // Stable, human-readable receipt number — RCPT-YYYYMMDD-NNNN.
  const created = new Date(payment.createdAt);
  const datePart = [
    created.getFullYear(),
    String(created.getMonth() + 1).padStart(2, "0"),
    String(created.getDate()).padStart(2, "0"),
  ].join("");
  const receiptNumber = `RCPT-${datePart}-${shortPayment.toUpperCase()}`;

  const isPaid = payment.status === "completed";
  const isRefunded = payment.status === "refunded";
  const isFailed = payment.status === "failed";
  const isPending = payment.status === "pending";

  // Compute the subtotal from the order's items. If the order isn't
  // available we just show the total — better than a broken screen.
  const subtotal = order?.items.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity,
    0,
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />

        <View style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.dragHandle} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.eyebrow}>PAYMENT RECEIPT</Text>
              <Text style={styles.title}>{receiptNumber}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close receipt"
            >
              <Ionicons name="close" size={20} color={Colors.text} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollPad}
            showsVerticalScrollIndicator={false}
          >
            {/* ---------- Status hero ---------- */}
            <View
              style={[
                styles.statusHero,
                isPaid && styles.statusHeroPaid,
                isRefunded && styles.statusHeroRefunded,
                isFailed && styles.statusHeroFailed,
                isPending && styles.statusHeroPending,
              ]}
            >
              <View style={styles.statusHeroIconWrap}>
                <Ionicons
                  name={
                    isPaid
                      ? "checkmark-circle"
                      : isRefunded
                      ? "refresh-circle"
                      : isFailed
                      ? "close-circle"
                      : "time"
                  }
                  size={40}
                  color={
                    isPaid
                      ? Colors.success
                      : isRefunded
                      ? Colors.textMuted
                      : isFailed
                      ? Colors.danger
                      : Colors.warning
                  }
                />
              </View>
              <Text style={styles.statusHeroLabel}>
                {paymentStatusLabel(payment.status)}
              </Text>
              <Text style={styles.statusHeroAmount}>
                {formatCurrency(payment.amount)}
              </Text>
              <Text style={styles.statusHeroDate}>
                {payment.paidAt
                  ? `Paid ${formatDateTime(payment.paidAt)}`
                  : `Created ${formatDateTime(payment.createdAt)}`}
              </Text>
              <View style={{ marginTop: Spacing.sm }}>
                <StatusPill
                  label={paymentStatusLabel(payment.status)}
                  tone={paymentTone(payment.status)}
                />
              </View>
            </View>

            {/* ---------- Parties ---------- */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Parties</Text>
              <Row label="Customer" value={order?.customerName ?? "—"} />
              <Row
                label="Seller"
                value={order?.sellerName ?? `Seller #${payment.sellerId}`}
              />
              <Row
                label="Order"
                value={`#${shortOrder}`}
                mono
              />
            </Card>

            {/* ---------- Payment ---------- */}
            <Card style={styles.section}>
              <Text style={styles.sectionTitle}>Payment</Text>
              <Row
                label="Method"
                value={paymentMethodLabel(payment.method)}
              />
              {payment.phone ? (
                <Row label="Phone" value={payment.phone} mono />
              ) : null}
              {payment.transactionRef ? (
                <Row
                  label="Confirmation"
                  value={payment.transactionRef}
                  mono
                />
              ) : null}
              {payment.refundedAt ? (
                <Row
                  label="Refunded at"
                  value={formatDateTime(payment.refundedAt)}
                />
              ) : null}
            </Card>

            {/* ---------- Items ---------- */}
            {order && order.items.length > 0 ? (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Items</Text>
                {order.items.map((item, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.itemRow,
                      idx < order.items.length - 1 && styles.itemRowDivider,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.productName}</Text>
                      <Text style={styles.itemMeta}>
                        {item.size} · {formatCurrency(item.unitPrice)} ×{" "}
                        {item.quantity}
                      </Text>
                    </View>
                    <Text style={styles.itemTotal}>
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </Text>
                  </View>
                ))}
                {subtotal !== undefined && subtotal !== payment.amount ? (
                  <>
                    <Divider />
                    <Row
                      label="Subtotal"
                      value={formatCurrency(subtotal)}
                      mono
                    />
                  </>
                ) : null}
                <Divider />
                <Row
                  label="Total paid"
                  value={formatCurrency(payment.amount)}
                  emphasis
                />
              </Card>
            ) : (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Total</Text>
                <Row
                  label="Total paid"
                  value={formatCurrency(payment.amount)}
                  emphasis
                />
              </Card>
            )}

            {/* ---------- Notes ---------- */}
            {payment.notes ? (
              <Card style={styles.section}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.notesText}>{payment.notes}</Text>
              </Card>
            ) : null}

            {/* ---------- Refund banner ---------- */}
            {isRefunded ? (
              <View style={styles.refundBanner}>
                <Ionicons
                  name="refresh-circle"
                  size={18}
                  color={Colors.textMuted}
                />
                <Text style={styles.refundBannerText}>
                  This payment has been refunded. The amount will be reversed
                  to your original payment method within 3-5 business days.
                </Text>
              </View>
            ) : null}

            {/* ---------- Footer ---------- */}
            <View style={styles.footer}>
              <Text style={styles.footerTitle}>
                Gas Delivery and Supplying System
              </Text>
              <Text style={styles.footerText}>
                Issued by the GDSA platform. Keep this receipt for your
                records — it serves as proof of payment for the order
                referenced above.
              </Text>
              <Text style={styles.footerText}>
                This is a system-generated receipt. No signature is required.
              </Text>
              <Text style={styles.footerMono}>{receiptNumber}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Compact key/value row used throughout the receipt. */
function Row({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && styles.rowMono,
          emphasis && styles.rowEmphasis,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  backdropPress: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: "92%",
    paddingTop: Spacing.sm,
  },
  dragHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: { flex: 1 },
  eyebrow: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: "800",
    marginTop: 2,
    fontFamily: "monospace",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollPad: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
  },

  /* ----- Status hero ----- */
  statusHero: {
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  statusHeroPaid: { backgroundColor: "#E6F6EC" },
  statusHeroRefunded: { backgroundColor: Colors.surface },
  statusHeroFailed: { backgroundColor: "#FBE9E9" },
  statusHeroPending: { backgroundColor: "#FFF5E0" },
  statusHeroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  statusHeroLabel: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Colors.textMuted,
  },
  statusHeroAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  statusHeroDate: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },

  /* ----- Sections ----- */
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  rowLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    flex: 1,
  },
  rowValue: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
    textAlign: "right",
    flex: 1.4,
  },
  rowMono: {
    fontFamily: "monospace",
  },
  rowEmphasis: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },

  /* ----- Items ----- */
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
  },
  itemRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemName: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  itemMeta: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  itemTotal: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "700",
    marginLeft: Spacing.md,
  },

  /* ----- Notes ----- */
  notesText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  /* ----- Refund banner ----- */
  refundBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.md,
  },
  refundBannerText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  /* ----- Footer ----- */
  footer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: "center",
  },
  footerTitle: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: "center",
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  footerMono: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontFamily: "monospace",
    marginTop: Spacing.sm,
  },
});
