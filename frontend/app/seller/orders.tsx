/**
 * Seller → Orders
 *
 * Tabbed list of all customer orders grouped by lifecycle stage:
 *   • New       — pending / confirmed (awaiting seller action)
 *   • Accepted  — assigned (seller has accepted & a rider may be assigned)
 *   • Preparing — picked_up / in_transit (out for delivery)
 *   • Delivered — delivered (completed)
 *   • Cancelled — cancelled (rejected or refunded)
 *
 * Each card exposes Accept / Reject / View Details / Assign Rider
 * actions wired through `useStore()` so the data layer stays the only
 * thing to swap when the backend lands.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { useStore } from "../../src/store/StoreContext";
import {
  formatCurrency,
  formatDateTime,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";
import { Order, OrderStatus } from "../../constants/types";

type TabKey = "new" | "accepted" | "preparing" | "delivered" | "rejected";

interface TabDef {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Order statuses that count as belonging to this tab. */
  statuses: OrderStatus[];
}

const TABS: TabDef[] = [
  {
    key: "new",
    label: "New Orders",
    icon: "alert-circle-outline",
    statuses: ["pending"],
  },
  {
    key: "accepted",
    label: "Accepted",
    icon: "checkmark-circle-outline",
    statuses: ["accepted", "assigned"],
  },
  {
    key: "preparing",
    label: "Preparing",
    icon: "car-outline",
    statuses: ["picked_up", "in_transit"],
  },
  {
    key: "delivered",
    label: "Delivered",
    icon: "bag-check-outline",
    statuses: ["delivered"],
  },
  {
    key: "rejected",
    label: "Rejected",
    icon: "close-circle-outline",
    statuses: ["cancelled", "rejected"],
  },
];

/** Tabs bar — horizontally scrollable so labels never truncate. */
function TabBar({
  active,
  onChange,
  counts,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  counts: Record<TabKey, number>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabBar}
    >
      {TABS.map((t) => {
        const isActive = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            activeOpacity={0.85}
            onPress={() => onChange(t.key)}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <Ionicons
              name={t.icon}
              size={16}
              color={isActive ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {t.label}
            </Text>
            <View
              style={[
                styles.tabBadge,
                isActive ? styles.tabBadgeActive : null,
              ]}
            >
              <Text
                style={[
                  styles.tabBadgeText,
                  isActive ? styles.tabBadgeTextActive : null,
                ]}
              >
                {counts[t.key]}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** Full order card rendered for the active tab. */
function OrderCard({
  order,
  tab,
  onAccept,
  onReject,
  onView,
}: {
  order: Order;
  tab: TabKey;
  onAccept: (o: Order) => void;
  onReject: (o: Order) => void;
  onView: (o: Order) => void;
}) {
  const first = order.items[0];
  return (
    <Card style={styles.orderCard}>
      {/* Top row — order # + status */}
      <View style={styles.orderHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderId}>Order #{order.id.slice(-4)}</Text>
          <Text style={styles.orderCustomer} numberOfLines={1}>
            {order.customerName}
          </Text>
        </View>
        <StatusPill
          label={orderStatusLabel(order.status)}
          tone={orderTone(order.status)}
        />
      </View>

      {/* Body — items summary */}
      <View style={styles.bodyRow}>
        <View style={styles.bodyItem}>
          <Ionicons name="flame-outline" size={16} color={Colors.primary} />
          <Text style={styles.bodyLabel}>Gas Type</Text>
          <Text style={styles.bodyValue} numberOfLines={1}>
            {first?.productName ?? "—"}
          </Text>
        </View>
        <View style={styles.bodyItem}>
          <Ionicons name="resize-outline" size={16} color={Colors.primary} />
          <Text style={styles.bodyLabel}>Size</Text>
          <Text style={styles.bodyValue}>{first?.size ?? "—"}</Text>
        </View>
        <View style={styles.bodyItem}>
          <Ionicons name="layers-outline" size={16} color={Colors.primary} />
          <Text style={styles.bodyLabel}>Qty</Text>
          <Text style={styles.bodyValue}>{first?.quantity ?? 0}</Text>
        </View>
      </View>

      {/* Address */}
      <View style={styles.addressRow}>
        <Ionicons name="location-outline" size={16} color={Colors.accent} />
        <Text style={styles.addressText} numberOfLines={2}>
          {order.deliveryLocation.address}
        </Text>
      </View>

      {/* Footer — total + time + actions */}
      <View style={styles.footerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalText}>{formatCurrency(order.total)}</Text>
          <Text style={styles.timeText}>{formatDateTime(order.createdAt)}</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionRow}>
        {tab === "new" ? (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnAccept]}
              onPress={() => onAccept(order)}
            >
              <Ionicons name="checkmark" size={16} color="#FFF" />
              <Text style={styles.actionBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnReject]}
              onPress={() => onReject(order)}
            >
              <Ionicons name="close" size={16} color="#FFF" />
              <Text style={styles.actionBtnText}>Reject</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <TouchableOpacity
          style={[styles.actionBtn, styles.btnView]}
          onPress={() => onView(order)}
        >
          <Ionicons name="eye-outline" size={16} color={Colors.primary} />
          <Text style={[styles.actionBtnText, styles.btnViewText]}>
            View Details
          </Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

/** Bottom-sheet style detail modal — built from primitives so no extra deps. */
function OrderDetailModal({
  order,
  visible,
  onClose,
}: {
  order: Order | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!order) return null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Order Details</Text>
            <StatusPill
              label={orderStatusLabel(order.status)}
              tone={orderTone(order.status)}
            />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <DetailRow label="Order #" value={`#${order.id.slice(-4)}`} />
            <DetailRow label="Customer" value={order.customerName} />
            <DetailRow label="Placed" value={formatDateTime(order.createdAt)} />
            <DetailRow label="Last update" value={formatDateTime(order.updatedAt)} />
            <DetailRow
              label="Delivery address"
              value={order.deliveryLocation.address}
            />
            {order.riderName ? (
              <DetailRow label="Assigned rider" value={order.riderName} />
            ) : null}
            {order.notes ? <DetailRow label="Notes" value={order.notes} /> : null}
            {order.status === "rejected" && order.rejectReason ? (
              <DetailRow label="Rejection reason" value={order.rejectReason} />
            ) : null}
            {order.phone ? (
              <DetailRow label="Customer phone" value={order.phone} />
            ) : null}

            <Text style={styles.itemsHeader}>Items</Text>
            {order.items.map((it) => (
              <View key={it.productId} style={styles.itemRow}>
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
          </ScrollView>

          <TouchableOpacity style={styles.modalClose} onPress={onClose}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/**
 * Modal that captures the seller's optional rejection reason before the
 * `rejectOrder` call. The reason (when present) is shown verbatim in
 * the customer's order history so they know why the order was declined.
 */
function RejectReasonModal({
  visible,
  order,
  reason,
  onChangeReason,
  onSubmit,
  submitting,
  onClose,
}: {
  visible: boolean;
  order: Order | null;
  reason: string;
  onChangeReason: (s: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerSheet} onPress={() => {}}>
          <Text style={styles.pickerTitle}>Reject this order?</Text>
          <Text style={styles.pickerSub}>
            Tell the customer why this order can't be fulfilled.
            Leave empty for a generic decline.
          </Text>
          {order ? (
            <Text style={styles.rejectOrderMeta}>
              Order #{order.id.slice(-4)} • {order.customerName}
            </Text>
          ) : null}
          <TextInput
            value={reason}
            onChangeText={onChangeReason}
            placeholder="e.g. Out of stock, closing early…"
            placeholderTextColor={Colors.textMuted}
            multiline
            style={styles.rejectInput}
          />
          <View style={styles.rejectActions}>
            <TouchableOpacity
              style={[styles.modalClose, styles.modalCloseGhost]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={[styles.modalCloseText, styles.modalCloseTextGhost]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalClose, styles.modalCloseDanger]}
              onPress={onSubmit}
              disabled={submitting}
            >
              <Text style={styles.modalCloseText}>
                {submitting ? "Rejecting…" : "Reject order"}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function SellerOrders() {
  const {
    session,
    getOrdersForUser,
    acceptOrder,
    rejectOrder,
  } = useStore();

  const [activeTab, setActiveTab] = useState<TabKey>("new");
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [rejectForOrder, setRejectForOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const user = session?.user;
  const allOrders = useMemo(
    () => (user ? getOrdersForUser(user.id, "seller") : []),
    [user, getOrdersForUser],
  );

  // Counts per tab — used for badges on the tab bar.
  const counts = useMemo(() => {
    const out: Record<TabKey, number> = {
      new: 0,
      accepted: 0,
      preparing: 0,
      delivered: 0,
      rejected: 0,
    };
    for (const tab of TABS) {
      out[tab.key] = allOrders.filter((o) => tab.statuses.includes(o.status)).length;
    }
    return out;
  }, [allOrders]);

  const filtered = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab)!;
    return allOrders.filter((o) => tab.statuses.includes(o.status));
  }, [activeTab, allOrders]);

  // ---- Actions ------------------------------------------------------
  const onAccept = (o: Order) => {
    Alert.alert(
      "Accept order?",
      `Confirm accepting order #${o.id.slice(-4)} from ${o.customerName}. The system will then match a nearby rider for delivery.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: async () => {
            try {
              await acceptOrder(o.id);
              Alert.alert(
                "Order accepted",
                `Order #${o.id.slice(-4)} is now broadcasting to nearby riders.`,
              );
            } catch (err) {
              Alert.alert(
                "Could not accept",
                (err as Error)?.message ?? "Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const onReject = (o: Order) => {
    setRejectForOrder(o);
    setRejectReason("");
  };

  const submitReject = async () => {
    if (!rejectForOrder) return;
    setRejecting(true);
    try {
      await rejectOrder(rejectForOrder.id, rejectReason.trim() || undefined);
      setRejectForOrder(null);
      setRejectReason("");
    } catch (err) {
      Alert.alert(
        "Could not reject",
        (err as Error)?.message ?? "Please try again.",
      );
    } finally {
      setRejecting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Orders" />

      <TabBar active={activeTab} onChange={setActiveTab} counts={counts} />

      <ScrollView contentContainerStyle={styles.content}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={
              activeTab === "new"
                ? "📥"
                : activeTab === "accepted"
                  ? "✅"
                  : activeTab === "preparing"
                    ? "🚚"
                    : activeTab === "delivered"
                      ? "📦"
                      : "🚫"
            }
            title={`No ${TABS.find((t) => t.key === activeTab)?.label.toLowerCase()}`}
            message="Orders will show up here when they reach this stage."
          />
        ) : (
          filtered.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              tab={activeTab}
              onAccept={onAccept}
              onReject={onReject}
              onView={setDetailsOrder}
            />
          ))
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <OrderDetailModal
        order={detailsOrder}
        visible={!!detailsOrder}
        onClose={() => setDetailsOrder(null)}
      />

      <RejectReasonModal
        visible={!!rejectForOrder}
        order={rejectForOrder}
        reason={rejectReason}
        onChangeReason={setRejectReason}
        onSubmit={submitReject}
        submitting={rejecting}
        onClose={() => {
          if (!rejecting) {
            setRejectForOrder(null);
            setRejectReason("");
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Tabs
  tabBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    gap: 6,
  },
  tabActive: {
    backgroundColor: "#CCFBF1",
  },
  tabLabel: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.primary,
  },
  tabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeActive: {
    backgroundColor: Colors.primary,
  },
  tabBadgeText: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: "800",
  },
  tabBadgeTextActive: {
    color: "#FFF",
  },

  // Order card
  orderCard: { marginBottom: Spacing.md },
  orderHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  orderId: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  orderCustomer: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  bodyRow: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  bodyItem: { flex: 1 },
  bodyLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },
  bodyValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
    marginTop: 2,
  },

  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  addressText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
  },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  totalText: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.primary,
  },
  timeText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    flex: 1,
  },
  btnAccept: { backgroundColor: Colors.success },
  btnReject: { backgroundColor: Colors.danger },
  btnView: {
    backgroundColor: "#CCFBF1",
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  actionBtnText: {
    color: "#FFF",
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  btnViewText: { color: Colors.primary },

  // Modal — order detail
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: "85%",
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalTitle: {
    flex: 1,
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  detailRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  detailLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  detailValue: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: "600",
    marginTop: 2,
  },
  itemsHeader: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemName: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: "700",
  },
  itemMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  totalLabel: {
    fontSize: FontSize.md,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
  },
  modalClose: {
    marginTop: Spacing.md,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#FFF",
    fontSize: FontSize.md,
    fontWeight: "700",
  },

  // Picker modal
  pickerSheet: {
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  pickerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  pickerSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  riderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  riderName: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: "700",
  },

  // Reject modal
  rejectInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    color: Colors.text,
    fontSize: FontSize.md,
    backgroundColor: Colors.surfaceMuted,
    marginBottom: Spacing.md,
  },
  rejectOrderMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginBottom: Spacing.sm,
  },
  rejectActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  modalCloseGhost: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginTop: 0,
  },
  modalCloseDanger: {
    flex: 1,
    backgroundColor: Colors.danger,
    marginTop: 0,
  },
  modalCloseTextGhost: {
    color: Colors.text,
  },
});