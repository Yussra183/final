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
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { useStore } from "../../src/store/StoreContext";
import { Order, OrderStatus } from "../../constants/types";
import {
  formatCurrency,
  formatDate,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";
import {
  derivePaymentStatus,
  paymentStatusLabel,
  paymentTone,
} from "../../src/lib/payment";
import { LiveRiderTracker } from "../../src/components/LiveRiderTracker";
import { FadeIn, PressableScale } from "../../src/components/MicroAnimations";

/**
 * Seller info that may arrive via the Home screen's "Place Order" button,
 * OR via the "Order Again" action on a past order card. Pipe-joined strings
 * so they survive the URL param round-trip safely.
 */
interface PreselectedSeller {
  id: string;
  name: string;
  location: string;
  gasTypes: string[];
  cylinderSizes: string[];
  /** Optional pre-filled values from "Order Again". */
  prefillGasType?: string;
  prefillCylinderSize?: string;
}

/**
 * Decode the seller info from the route params.
 */
function readSeller(params: Record<string, any>): PreselectedSeller | null {
  const id = typeof params.sellerId === "string" ? params.sellerId : null;
  const name = typeof params.sellerName === "string" ? params.sellerName : null;
  if (!id || !name) return null;
  const split = (raw: unknown) =>
    typeof raw === "string" && raw.length
      ? raw.split("|").map((s) => s.trim()).filter(Boolean)
      : [];
  return {
    id,
    name,
    location: typeof params.sellerLocation === "string"
      ? params.sellerLocation
      : "",
    gasTypes: split(params.sellerGasTypes),
    cylinderSizes: split(params.sellerSizes),
    prefillGasType:
      typeof params.prefillGasType === "string" ? params.prefillGasType : undefined,
    prefillCylinderSize:
      typeof params.prefillCylinderSize === "string"
        ? params.prefillCylinderSize
        : undefined,
  };
}

/**
 * Form state. Kept at module scope so it can be reset between
 * submissions without re-creating the setter functions.
 */
interface OrderForm {
  gasType: string;
  cylinderSize: string;
  quantity: string;
  deliveryAddress: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: OrderForm = {
  gasType: "",
  cylinderSize: "",
  quantity: "1",
  deliveryAddress: "",
  phone: "",
  notes: "",
};

/**
 * Build the initial form. Honours any pre-filled gasType/cylinderSize
 * coming through from the route (e.g. via "Order Again"), and falls back
 * to the customer's profile for address/phone.
 */
function buildInitialForm(
  selected: PreselectedSeller | null,
  profileAddress: string,
  profilePhone: string,
): OrderForm {
  return {
    ...EMPTY_FORM,
    gasType: selected?.prefillGasType ?? "",
    cylinderSize: selected?.prefillCylinderSize ?? "",
    phone: profilePhone,
    deliveryAddress: profileAddress,
  };
}

/**
 * Statuses that warrant the Live Rider Tracking card.
 * `assigned`   → rider is on the way to the shop
 * `picked_up`  → rider picked up the cylinder
 * `in_transit` → rider is on the way to the customer
 * `delivered`  → show the final "Arrived" state
 */
const TRACKABLE_STATUSES: OrderStatus[] = [
  "assigned",
  "picked_up",
  "in_transit",
  "delivered",
];

/**
 * Orders — Customer order screen.
 *
 * Two stacked sections:
 *
 *   1. Place New Order
 *      - Pre-filled when the user arrives from a seller card on Home
 *        OR from "Order Again" on a past order.
 *      - Submits via `useStore().placeOrder(...)` and writes a new
 *        pending order at the top of the Order History.
 *
 *   2. Order History
 *      - Lists every order belonging to the current customer, sorted
 *        by `createdAt DESC` (newest first).
 *      - Each card shows the standard set of fields plus a colour-coded
 *        status pill, payment-status pill, a "View Details" link to the
 *        tracking screen, and an "Order Again" button that re-opens the
 *        form pre-filled with the same seller / gas type / cylinder
 *        size.
 *
 *   3. Live Rider Tracking — shows up automatically for any order
 *      that currently has a rider assigned. Surfaces:
 *        • Rider's current position + planned route
 *        • ETA + remaining distance
 *        • Current delivery status (Rider Assigned / On the Way /
 *          Arrived)
 *
 *   Today this reads from the in-memory mock; the shape matches what
 *   `OrdersApi` will return, so swapping to a real backend only
 *   requires updating `useStore()`.
 */
export default function OrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const selected = readSeller(params as Record<string, any>);
  const {
    session,
    orders,
    getOrdersForUser,
    placeOrder,
    cancelOrder,
  } = useStore();

  const [form, setForm] = useState<OrderForm>(() =>
    buildInitialForm(
      selected,
      session?.user?.address ?? "",
      session?.user?.phone ?? "",
    ),
  );
  const [submitting, setSubmitting] = useState(false);

  const update = <K extends keyof OrderForm>(key: K, value: OrderForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * Orders belonging to the current customer, newest first.
   * `getOrdersForUser` already filters by `customerId === user.id`.
   */
  const myOrders = useMemo<Order[]>(() => {
    if (!session) return [];
    return [...getOrdersForUser(session.user.id, "customer")].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }, [orders, session, getOrdersForUser]);

  /**
   * The most recent order that is currently being delivered (or has
   * just been delivered). We surface the live tracker for this order
   * only — otherwise the page would visualise several moving pins at
   * once. Past delivered orders keep their card status pills so the
   * history remains the canonical source of truth.
   */
  const activeTrackingOrder = useMemo<Order | null>(() => {
    for (const o of myOrders) {
      if (TRACKABLE_STATUSES.includes(o.status) && o.riderId) return o;
    }
    return null;
  }, [myOrders]);

  /**
   * Validation messages. Returning an object keeps the per-field errors
   * addressable in the UI later if we ever wire inline field errors.
   */
  const errors = useMemo(() => {
    const e: Partial<Record<keyof OrderForm, string>> = {};
    if (!selected) e.gasType = "Pick a seller from the Home screen first.";
    if (!form.gasType) e.gasType = "Choose a gas type.";
    if (!form.cylinderSize) e.cylinderSize = "Choose a cylinder size.";
    const qty = Number(form.quantity);
    if (!form.quantity || !Number.isFinite(qty) || qty < 1)
      e.quantity = "Quantity must be 1 or more.";
    if (!form.deliveryAddress.trim())
      e.deliveryAddress = "Delivery address is required.";
    if (!form.phone.trim()) e.phone = "Phone number is required.";
    return e;
  }, [form, selected]);

  const canSubmit = Object.keys(errors).length === 0 && !submitting;

  const submit = async () => {
    if (!selected || !session) return;
    setSubmitting(true);
    try {
      const quantity = Math.max(1, Number(form.quantity) || 1);
      // Unit price is not known yet — the seller sets it. We still need
      // a positive total to satisfy the order shape, so we use a
      // placeholder until the API exposes a price quote endpoint.
      const unitPrice = 0;
      const total = unitPrice * quantity;
      await placeOrder({
        customerId: session.user.id,
        customerName: session.user.fullName,
        sellerId: selected.id,
        sellerName: selected.name,
        items: [
          {
            productId: `local-${selected.id}-${form.cylinderSize}`,
            productName: `${form.cylinderSize} ${form.gasType}`,
            size: form.cylinderSize,
            quantity,
            unitPrice,
          },
        ],
        total,
        phone: form.phone.trim(),
        deliveryLocation: { address: form.deliveryAddress.trim() },
        notes: form.notes.trim() || undefined,
      });
      Alert.alert("Order placed", `Your order with ${selected.name} is confirmed.`, [
        {
          text: "View orders",
          onPress: () => {
            setForm(
              buildInitialForm(
                null,
                session.user.address ?? "",
                session.user.phone ?? "",
              ),
            );
          },
        },
        {
          text: "Back to Home",
          onPress: () => router.push("/(customer)" as any),
        },
      ]);
    } catch (err) {
      Alert.alert(
        "Could not place order",
        (err as Error)?.message ?? "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Re-open the form pre-filled with the same seller / gas type /
   * cylinder size as the order being repeated. Implemented by pushing
   * back into this same route with the relevant params; the screen
   * already decodes them via `readSeller()`.
   */
  const reorder = (order: Order) => {
    const item = order.items[0];
    router.push({
      pathname: "/(customer)/orders",
      params: {
        sellerId: order.sellerId,
        sellerName: order.sellerName,
        sellerLocation: order.deliveryLocation.address,
        sellerGasTypes: item?.productName?.split(" ")[1] ?? "",
        sellerSizes: item?.size ?? "",
        prefillGasType: item?.productName?.split(" ")[1] ?? "",
        prefillCylinderSize: item?.size ?? "",
      },
    } as any);
  };

  const viewDetails = (order: Order) => {
    router.push({
      pathname: "/(customer)/tracking",
      params: { id: order.id },
    } as any);
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ---------------- Header ---------------- */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Orders</Text>
              <Text style={styles.subtitle}>
                {selected
                  ? "Complete your order with the selected seller"
                  : "Pick a gas seller from Home to start an order"}
              </Text>
            </View>
            <AppButton
              title="Home"
              variant="ghost"
              onPress={() => router.push("/(customer)" as any)}
            />
          </View>

          {/* ===========================================================
              SECTION 1 — LIVE RIDER TRACKING
              =========================================================== */}
          {activeTrackingOrder ? (
            <FadeIn style={{ marginTop: Spacing.md }}>
              <View style={styles.trackerHeader}>
                <View style={styles.trackerBadge}>
                  <Ionicons name="navigate-outline" size={14} color="#FFF" />
                  <Text style={styles.trackerBadgeText}>LIVE</Text>
                </View>
                <Text style={styles.sectionLabel}>Live Rider Tracking</Text>
              </View>
              <LiveRiderTracker
                orderId={activeTrackingOrder.id}
                riderName={
                  activeTrackingOrder.riderName ?? "Assigned Rider"
                }
                riderPhone={undefined}
                orderStatus={activeTrackingOrder.status}
              />
            </FadeIn>
          ) : null}

          {/* ===========================================================
              SECTION 2 — PLACE NEW ORDER
              =========================================================== */}
          <Text style={styles.sectionLabel}>Place New Order</Text>

          {/* ---------------- Selected Seller ---------------- */}
          {selected ? (
            <Card style={styles.selectedCard}>
              <View style={styles.selectedHeader}>
                <View style={styles.selectedIconBubble}>
                  <Ionicons
                    name="storefront-outline"
                    size={20}
                    color={Colors.primary}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.selectedLabel}>Selected Seller</Text>
                  <Text style={styles.selectedName} numberOfLines={1}>
                    {selected.name}
                  </Text>
                </View>
                <StatusPill label="Pre-filled" tone="primary" />
              </View>

              <View style={styles.selectedMetaRow}>
                <Text style={styles.selectedMetaItem}>
                  <Text style={styles.selectedMetaLabel}>ID: </Text>
                  {selected.id}
                </Text>
                <Text style={styles.selectedMetaItem}>
                  <Text style={styles.selectedMetaLabel}>Location: </Text>
                  {selected.location || "—"}
                </Text>
              </View>

              <View style={styles.selectedMetaRow}>
                <Text style={styles.selectedMetaItem}>
                  <Text style={styles.selectedMetaLabel}>Gas Types: </Text>
                  {selected.gasTypes.length
                    ? selected.gasTypes.join(", ")
                    : "—"}
                </Text>
              </View>

              <View style={styles.selectedMetaRow}>
                <Text style={styles.selectedMetaLabel}>Sizes:</Text>
                <View style={styles.sizeRow}>
                  {selected.cylinderSizes.length ? (
                    selected.cylinderSizes.map((s) => (
                      <View key={s} style={styles.sizePill}>
                        <Text style={styles.sizePillText}>{s}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.selectedMetaItem}>—</Text>
                  )}
                </View>
              </View>
            </Card>
          ) : (
            <Card style={styles.placeholderCard}>
              <Ionicons
                name="cube-outline"
                size={42}
                color={Colors.primary}
              />
              <Text style={styles.placeholderTitle}>No seller selected</Text>
              <Text style={styles.placeholderText}>
                Pick a gas seller from the Home screen to start an order, or
                tap &ldquo;Order Again&rdquo; on a past order below.
              </Text>
              <AppButton
                title="Browse sellers"
                variant="primary"
                onPress={() => router.push("/(customer)" as any)}
                style={{ marginTop: Spacing.md }}
              />
            </Card>
          )}

          {/* ---------------- Order Form ---------------- */}
          {selected ? (
            <Card style={styles.formCard}>
              <Text style={styles.formTitle}>Order details</Text>
              <Text style={styles.formSub}>
                Confirm gas type, size, quantity, and where to deliver.
              </Text>

              <Text style={styles.fieldLabel}>Gas Type</Text>
              <View style={styles.chipRow}>
                {(selected.gasTypes.length
                  ? selected.gasTypes
                  : ["LPG", "Cooking Gas"]
                ).map((g) => {
                  const active = form.gasType === g;
                  return (
                    <PressableScale
                      key={g}
                      onPress={() => update("gasType", g)}
                    >
                      <View style={[styles.chip, active && styles.chipActive]}>
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {g}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Cylinder Size</Text>
              <View style={styles.chipRow}>
                {(selected.cylinderSizes.length
                  ? selected.cylinderSizes
                  : ["6kg", "13kg", "15kg", "38kg"]
                ).map((s) => {
                  const active = form.cylinderSize === s;
                  return (
                    <PressableScale
                      key={s}
                      onPress={() => update("cylinderSize", s)}
                    >
                      <View style={[styles.chip, active && styles.chipActive]}>
                        <Text
                          style={[
                            styles.chipText,
                            active && styles.chipTextActive,
                          ]}
                        >
                          {s}
                        </Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </View>

              <AppInput
                label="Quantity"
                value={form.quantity}
                onChangeText={(v) => update("quantity", v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                placeholder="1"
                error={errors.quantity}
              />

              <AppInput
                label="Delivery Address"
                value={form.deliveryAddress}
                onChangeText={(v) => update("deliveryAddress", v)}
                placeholder="House number, street, area"
                multiline
                numberOfLines={3}
                style={styles.textArea}
                error={errors.deliveryAddress}
              />

              <AppInput
                label="Phone Number"
                value={form.phone}
                onChangeText={(v) => update("phone", v)}
                keyboardType="phone-pad"
                placeholder="+255 …"
                error={errors.phone}
              />

              <AppInput
                label="Additional Notes (optional)"
                value={form.notes}
                onChangeText={(v) => update("notes", v)}
                placeholder="Gate code, landmark, delivery window…"
                multiline
                numberOfLines={3}
                style={styles.textArea}
              />

              <AppButton
                title={submitting ? "Submitting…" : "Submit Order"}
                variant="primary"
                onPress={submit}
                disabled={!canSubmit}
                fullWidth
                style={{ marginTop: Spacing.sm }}
              />
              {Object.keys(errors).length > 0 ? (
                <Text style={styles.formHint}>
                  Fill the highlighted fields to continue.
                </Text>
              ) : null}
            </Card>
          ) : null}

          {/* ===========================================================
              SECTION 3 — ORDER HISTORY
              =========================================================== */}
          <View style={styles.historyHeader}>
            <Text style={styles.sectionLabel}>Order History</Text>
            <Text style={styles.historyMeta}>
              {myOrders.length} {myOrders.length === 1 ? "order" : "orders"}
            </Text>
          </View>

          {myOrders.length === 0 ? (
            <Card style={styles.emptyHistoryCard}>
              <Ionicons
                name="archive-outline"
                size={40}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyHistoryTitle}>No past orders yet</Text>
              <Text style={styles.emptyHistoryText}>
                Once you place an order it will appear here so you can track
                it or reorder with a single tap.
              </Text>
            </Card>
          ) : (
            myOrders.map((order, idx) => {
              const item = order.items[0];
              // Prefer a short readable number ("#1001" for seed data like
              // "o-1001"). For long timestamp ids we fall back to the last
              // 6 chars of the id, which keeps the badge scannable without
              // leaking the full backend id.
              const numericTail = order.id.replace(/[^0-9]/g, "");
              const shortNumber =
                numericTail.length > 0 && numericTail.length <= 6
                  ? numericTail
                  : order.id.slice(-6);
              const orderNumber = `#${shortNumber}`;
              const payStatus = derivePaymentStatus(order.status);
              const gasType =
                (item?.productName ?? "").split(" ").slice(1).join(" ") || "—";
              return (
                <FadeIn key={order.id} delay={idx * 60} style={styles.historyCardWrap}>
                <Card style={styles.historyCard}>
                  {/* ----- Card header: number + status pills ----- */}
                  <View style={styles.historyCardHeader}>
                    <View style={styles.historyNumberWrap}>
                      <Ionicons
                        name="cube-outline"
                        size={16}
                        color={Colors.primary}
                      />
                      <Text style={styles.historyCardNumber}>
                        {orderNumber}
                      </Text>
                    </View>
                    <View style={styles.historyPills}>
                      <StatusPill
                        label={orderStatusLabel(order.status)}
                        tone={orderTone(order.status)}
                      />
                      <StatusPill
                        label={paymentStatusLabel(payStatus)}
                        tone={paymentTone(payStatus)}
                      />
                    </View>
                  </View>

                  {/* ----- Detail rows (all six required fields) ----- */}
                  <View style={styles.historyRow}>
                    <Text style={styles.historyRowLabel}>Gas Type</Text>
                    <Text style={styles.historyRowValue}>{gasType}</Text>
                  </View>
                  <View style={styles.historyRow}>
                    <Text style={styles.historyRowLabel}>Cylinder Size</Text>
                    <Text style={styles.historyRowValue}>
                      {item?.size ?? "—"}
                    </Text>
                  </View>
                  <View style={styles.historyRow}>
                    <Text style={styles.historyRowLabel}>Order Date</Text>
                    <Text style={styles.historyRowValue}>
                      {formatDate(order.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.historyRow}>
                    <Text style={styles.historyRowLabel}>Delivery Status</Text>
                    <Text style={styles.historyRowValue}>
                      {orderStatusLabel(order.status)}
                    </Text>
                  </View>
                  <View style={styles.historyRow}>
                    <Text style={styles.historyRowLabel}>Payment Status</Text>
                    <Text
                      style={[
                        styles.historyRowValue,
                        payStatus === "paid" && { color: "#047857" },
                        payStatus === "refunded" && { color: Colors.textSecondary },
                      ]}
                    >
                      {paymentStatusLabel(payStatus)}
                    </Text>
                  </View>

                  <View style={[styles.historyRow, styles.historyRowTotal]}>
                    <Text style={styles.historyRowLabel}>Total Price</Text>
                    <Text style={styles.historyRowTotalValue}>
                      {formatCurrency(order.total)}
                    </Text>
                  </View>

                  {/* ----- Order Flow: rejection banner / timeline ----- */}
                  {order.status === "rejected" && order.rejectReason ? (
                    <View style={styles.rejectBanner}>
                      <Ionicons
                        name="alert-circle-outline"
                        size={16}
                        color={Colors.danger}
                      />
                      <Text style={styles.rejectBannerText}>
                        Seller declined: {order.rejectReason}
                      </Text>
                    </View>
                  ) : null}

                  {/* ----- Actions ----- */}
                  <View style={styles.historyActions}>
                    <PressableScale
                      onPress={() => viewDetails(order)}
                      style={styles.historyActionBtn}
                    >
                      <View
                        style={[
                          styles.historyActionBtnInner,
                          {
                            borderColor: Colors.primary,
                            backgroundColor: "transparent",
                          },
                        ]}
                      >
                        <Text style={[styles.historyActionText, { color: Colors.primary }]}>
                          View Details
                        </Text>
                      </View>
                    </PressableScale>
                    <PressableScale
                      onPress={() => reorder(order)}
                      style={styles.historyActionBtn}
                    >
                      <View
                        style={[
                          styles.historyActionBtnInner,
                          { backgroundColor: Colors.primary, borderColor: Colors.primary },
                        ]}
                      >
                        <Text style={[styles.historyActionText, { color: "#FFF" }]}>
                          Order Again
                        </Text>
                      </View>
                    </PressableScale>
                  </View>

                  {/* Pending-only secondary action: cancel the order
                      before the seller acts. */}
                  {order.status === "pending" ? (
                    <PressableScale
                      onPress={() => {
                        Alert.alert(
                          "Cancel order?",
                          `Order ${orderNumber} will be cancelled. The seller will be notified.`,
                          [
                            { text: "Keep", style: "cancel" },
                            {
                              text: "Cancel order",
                              style: "destructive",
                              onPress: async () => {
                                try {
                                  await cancelOrder(order.id);
                                } catch (err) {
                                  Alert.alert(
                                    "Could not cancel",
                                    (err as Error)?.message ??
                                      "Please try again.",
                                  );
                                }
                              },
                            },
                          ],
                        );
                      }}
                      style={styles.cancelLinkWrap}
                    >
                      <Text style={styles.cancelLinkText}>Cancel this order</Text>
                    </PressableScale>
                  ) : null}
                </Card>
                </FadeIn>
              );
            })
          )}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  /* ----- Header ----- */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },

  /* ----- Section labels ----- */
  sectionLabel: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  /* ----- Live tracker header ----- */
  trackerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  trackerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: Colors.danger,
    borderRadius: Radius.pill,
  },
  trackerBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },

  /* ----- Selected Seller card ----- */
  selectedCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  selectedIconBubble: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectedName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: 2,
  },
  selectedMetaRow: {
    marginTop: Spacing.sm,
  },
  selectedMetaItem: {
    fontSize: FontSize.sm,
    color: Colors.text,
    marginTop: 2,
  },
  selectedMetaLabel: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  sizeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  sizePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#CCFBF1",
    borderRadius: Radius.pill,
  },
  sizePillText: {
    color: Colors.primary,
    fontWeight: "700",
    fontSize: FontSize.xs,
  },

  /* ----- Placeholder when no seller is selected ----- */
  placeholderCard: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  placeholderTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  placeholderText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },

  /* ----- Form ----- */
  formCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
  },
  formTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  formSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
  },
  chipTextActive: {
    color: "#FFF",
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  formHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    textAlign: "center",
  },

  /* ----- Order History header ----- */
  historyHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  historyMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },

  /* ----- Order History empty state ----- */
  emptyHistoryCard: {
    alignItems: "center",
    padding: Spacing.xl,
  },
  emptyHistoryTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  emptyHistoryText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  /* ----- Order History card ----- */
  historyCardWrap: {
    marginBottom: Spacing.md,
  },
  historyCard: {
    padding: Spacing.lg,
  },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyNumberWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyCardNumber: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  historyPills: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
    gap: Spacing.md,
  },
  historyRowLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
    flexShrink: 0,
    minWidth: 110,
  },
  historyRowValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "600",
    flex: 1,
    textAlign: "right",
  },
  historyRowTotal: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  historyRowTotalValue: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: "800",
    flex: 1,
    textAlign: "right",
  },
  historyActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  historyActionBtn: {
    flex: 1,
  },
  historyActionBtnInner: {
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  historyActionText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
  historyActionGhost: {
    backgroundColor: "transparent",
  },

  /* ----- Order-flow extensions ----- */
  rejectBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FEE2E2",
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rejectBannerText: {
    flex: 1,
    color: Colors.danger,
    fontWeight: "600",
    fontSize: FontSize.sm,
  },
  cancelLinkWrap: {
    alignSelf: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  cancelLinkText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textDecorationLine: "underline",
  },
});
