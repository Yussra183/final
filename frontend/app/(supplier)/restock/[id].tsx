/**
 * Supplier → Supply Order Details.
 *
 * A single supply order (FR-06) for the signed-in supplier. Opens
 * either from the supplier notifications list (deep-link via the
 * notification's `data.supplyOrderId`), from the supplier Restock
 * page's row tap, or from a manual URL.
 *
 * Backend contract: `GET /api/restock/{id}` returns the row scoped
 * to the caller; `PATCH /api/restock/{id}/status` performs the
 * state-machine transition. Both go through {@link SupplyOrderService}
 * which enforces ownership and per-role legality, so this screen
 * cannot mutate a row that doesn't belong to the signed-in supplier.
 *
 * Action matrix:
 *
 * | from        | to           | button shown     | reason required |
 * |-------------|--------------|------------------|-----------------|
 * | PENDING     | ACCEPTED     | Accept Order     | no              |
 * | PENDING     | REJECTED     | Reject Order     | yes             |
 * | ACCEPTED    | PREPARING    | Start Preparing  | no              |
 * | PREPARING   | DISPATCHED   | Dispatch Order   | no              |
 * | DISPATCHED  | —            | none (awaiting   | —               |
 * |             |              | seller receipt)  |                 |
 * | DELIVERED   | —            | none (closed)    | —               |
 * | CANCELLED   | —            | none             | —               |
 * | REJECTED    | —            | none             | —               |
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../../constants/colors";
import { Card } from "../../../src/components/Card";
import { StatusPill } from "../../../src/components/StatusPill";
import { EmptyState } from "../../../src/components/EmptyState";
import { AppButton } from "../../../src/components/AppButton";
import { SidebarLayout } from "../../../src/components/SidebarLayout";
import { SupplierApprovalGate } from "../../../src/components/SupplierApprovalGate";
import { RestockApi } from "../../../src/api/endpoints";
import { ApiError } from "../../../src/api/errors";
import {
  RestockRequest,
  RESTOCK_STATUS_LABELS,
  normalizeRestockStatus,
} from "../../../constants/types";
import { formatDate, formatDateTime } from "../../../src/utils/format";

export default function SupplierRestockDetail() {
  return (
    <SupplierApprovalGate title="Supply Order">
      <RestockDetailContent />
    </SupplierApprovalGate>
  );
}

function RestockDetailContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const orderId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params.id]);

  const { session, getRestockForSupplier, updateRestockStatus, refresh } =
    useStore();
  const user = session?.user!;

  // Keep a local cache of "the row I'm looking at" so deep-link reload
  // can paint instantly even before `refresh()` lands; we then merge the
  // server response in.
  const supplierRows = getRestockForSupplier(user.id);
  const cached = useMemo<RestockRequest | null>(() => {
    if (orderId == null) return null;
    return supplierRows.find((r) => Number(r.id) === orderId) ?? null;
  }, [orderId, supplierRows]);

  const [order, setOrder] = useState<RestockRequest | null>(cached);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const fetchOrder = useCallback(async () => {
    if (orderId == null) return;
    setLoading(true);
    setError(null);
    try {
      // The unified list endpoint is the same shape as `GET /{id}` for
      // the supplier — use it because it returns every row the supplier
      // owns in one round-trip and the auth filter rejects any row that
      // isn't theirs. This keeps the cold-start cost to one fetch.
      const all = await RestockApi.list();
      const found = all.find((r) => Number(r.id) === orderId) ?? null;
      if (!found) {
        setError("This supply order is no longer available to you.");
      } else {
        setOrder(found);
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ?? "Could not load the supply order.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId == null) return;
    // Refresh once on mount so the screen always reflects the
    // authoritative server state — pulling a notification straight to
    // here would otherwise show a stale "PENDING" row.
    void refresh()
      .then(() => fetchOrder())
      .catch(() => fetchOrder());
  }, [orderId, refresh, fetchOrder]);

  /**
   * Apply a transition. The backend is the source of truth — on
   * success we refresh the store (which `updateRestockStatus` already
   * mutates), then pull the updated row back into local state. On
   * failure we surface the real error (no silent mutation).
   */
  const transition = useCallback(
    async (
      next: RestockRequest["status"],
      reason?: string,
      confirmMessage?: string,
    ) => {
      if (!order) return;
      const run = async () => {
        setActing(true);
        try {
          await updateRestockStatus(order.id, {
            status: next,
            ...(reason ? { reason } : {}),
          });
          // updateRestockStatus mutates the store's `restockRequests`
          // array in place, but the local `order` snapshot above is a
          // stale reference — pull the freshly-saved row out of the
          // store so the detail page reflects the new status without
          // a full refresh.
          const refreshed = supplierRows.find(
            (r) => r.id === order.id,
          );
          if (refreshed) setOrder(refreshed);
          if (confirmMessage) {
            Alert.alert("Done", confirmMessage);
          }
        } catch (err) {
          const msg =
            err instanceof ApiError
              ? err.message
              : (err as Error)?.message ??
                "The action could not be completed.";
          Alert.alert("Action failed", msg);
        } finally {
          setActing(false);
        }
      };
      run();
    },
    [order, updateRestockStatus, supplierRows],
  );

  const handleAccept = () => {
    if (!order) return;
    Alert.alert(
      "Accept order?",
      `Confirm you will fulfil ${order.sellerName}'s request for `
        + `${order.quantity} × ${order.productName} (${order.size}).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Accept",
          onPress: () =>
            transition("accepted", undefined, "Order accepted."),
        },
      ],
    );
  };

  const handleReject = () => {
    if (!order) return;
    Alert.prompt(
      "Reject order?",
      `Tell the seller why (required).`,
      [
        { text: "Keep request", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: (reason?: string) => {
            const trimmed = (reason ?? "").trim();
            if (!trimmed) {
              Alert.alert("Reason required", "Please enter a reason.");
              return;
            }
            transition("rejected", trimmed, "Order rejected.");
          },
        },
      ],
      "plain-text",
    );
  };

  const handleStartPreparing = () => {
    transition("preparing", undefined, "Marked as preparing.");
  };

  const handleDispatch = () => {
    if (!order) return;
    Alert.alert(
      "Dispatch order?",
      `Mark this restock as dispatched. The seller will be notified and can confirm receipt to update their stock.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Dispatch",
          onPress: () => transition("dispatched", undefined, "Order dispatched."),
        },
      ],
    );
  };

  if (orderId == null) {
    return (
      <SidebarLayout>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
          <View style={styles.empty}>
            <EmptyState
              icon="❓"
              title="Missing supply order id"
              message="Open this screen from a notification or the restock list."
            />
            <AppButton
              title="Back to Restock"
              variant="outline"
              onPress={() => router.replace("/(supplier)/restock" as any)}
            />
          </View>
        </SafeAreaView>
      </SidebarLayout>
    );
  }

  if (error && !order) {
    return (
      <SidebarLayout>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
          <View style={styles.empty}>
            <EmptyState icon="⚠️" title="Order unavailable" message={error} />
            <AppButton
              title="Retry"
              variant="primary"
              onPress={fetchOrder}
              style={{ marginTop: Spacing.md }}
            />
            <AppButton
              title="Back to Restock"
              variant="outline"
              onPress={() => router.replace("/(supplier)/restock" as any)}
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        </SafeAreaView>
      </SidebarLayout>
    );
  }

  if (!order) {
    return (
      <SidebarLayout>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
          <View style={styles.empty}>
            <Text style={styles.loading}>Loading…</Text>
          </View>
        </SafeAreaView>
      </SidebarLayout>
    );
  }

  const status = normalizeRestockStatus(order.status);
  const tone = (() => {
    switch (status) {
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
  })();

  return (
    <SidebarLayout>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              Supply Order #{order.id}
            </Text>
            <Text style={styles.subtitle}>
              From {order.sellerName} • {formatDate(order.createdAt)}
            </Text>
          </View>
          <StatusPill
            label={RESTOCK_STATUS_LABELS[status]}
            tone={tone}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => fetchOrder()}
            />
          }
        >
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Order details</Text>
            <DetailRow label="Seller" value={order.sellerName} />
            <DetailRow label="Gas" value={order.productName} />
            <DetailRow label="Size" value={order.size} />
            <DetailRow label="Quantity" value={`${order.quantity} units`} />
            <DetailRow
              label="Status"
              value={RESTOCK_STATUS_LABELS[status]}
            />
            <DetailRow
              label="Created"
              value={formatDateTime(order.createdAt)}
            />
            {order.notes ? (
              <DetailRow label="Notes" value={order.notes} multiline />
            ) : null}
            {order.rejectReason ? (
              <DetailRow
                label="Rejection reason"
                value={order.rejectReason}
                multiline
              />
            ) : null}
          </Card>

          {/* Action panel — only the legal next step is shown. */}
          <Card style={[styles.card, { marginTop: Spacing.md }]}>
            <Text style={styles.sectionLabel}>Next step</Text>
            {status === "pending" ? (
              <View style={styles.actionRow}>
                <AppButton
                  title="Accept Order"
                  variant="primary"
                  style={{ flex: 1, marginRight: 6 }}
                  onPress={handleAccept}
                  disabled={acting}
                />
                <AppButton
                  title="Reject Order"
                  variant="danger"
                  style={{ flex: 1, marginLeft: 6 }}
                  onPress={handleReject}
                  disabled={acting}
                />
              </View>
            ) : status === "accepted" ? (
              <AppButton
                title="Start Preparing"
                variant="primary"
                fullWidth
                onPress={handleStartPreparing}
                disabled={acting}
              />
            ) : status === "preparing" ? (
              <AppButton
                title="Dispatch Order"
                variant="primary"
                fullWidth
                onPress={handleDispatch}
                disabled={acting}
              />
            ) : status === "dispatched" ? (
              <Text style={styles.note}>
                On the way — awaiting the seller's receipt confirmation.
              </Text>
            ) : status === "delivered" || status === "received" ? (
              <Text style={styles.note}>
                Closed. The seller confirmed receipt and their stock has
                been credited.
              </Text>
            ) : status === "rejected" ? (
              <Text style={styles.note}>
                You rejected this order.
              </Text>
            ) : status === "cancelled" ? (
              <Text style={styles.note}>
                This order was cancelled.
              </Text>
            ) : (
              <Text style={styles.note}>
                Nothing to do for this order right now.
              </Text>
            )}
          </Card>

          {/* Timeline — a simple record of every status the row has
              been through, computed from timestamps we already carry
              on the wire shape. */}
          <Card style={[styles.card, { marginTop: Spacing.md }]}>
            <Text style={styles.sectionLabel}>Timeline</Text>
            <TimelineRow
              done
              label="Request raised"
              at={order.createdAt}
            />
            {status !== "pending" ? (
              <TimelineRow
                done
                label="Accepted"
              />
            ) : null}
            {(status === "preparing" ||
              status === "dispatched" ||
              status === "delivered" ||
              status === "received") ? (
              <TimelineRow done label="Preparing" />
            ) : null}
            {(status === "dispatched" ||
              status === "delivered" ||
              status === "received") ? (
              <TimelineRow done label="Dispatched" />
            ) : null}
            {(status === "delivered" || status === "received") ? (
              <TimelineRow
                done
                label="Seller confirmed receipt"
              />
            ) : null}
            {status === "rejected" ? (
              <TimelineRow done label="Rejected" danger />
            ) : null}
            {status === "cancelled" ? (
              <TimelineRow done label="Cancelled" danger />
            ) : null}
          </Card>

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </SidebarLayout>
  );
}

function DetailRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={[styles.detailRow, multiline && { alignItems: "flex-start" }]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, multiline && { textAlign: "right" }]}
      >
        {value}
      </Text>
    </View>
  );
}

function TimelineRow({
  done,
  label,
  at,
  danger,
}: {
  done: boolean;
  label: string;
  at?: string;
  danger?: boolean;
}) {
  const color = !done
    ? Colors.textMuted
    : danger
      ? Colors.danger
      : Colors.success;
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineDot, { backgroundColor: color }]}>
        <Ionicons
          name={done ? "checkmark" : "ellipse-outline"}
          size={12}
          color="#FFF"
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.timelineLabel, { color }]}>{label}</Text>
        {at ? (
          <Text style={styles.timelineTime}>{formatDateTime(at)}</Text>
        ) : null}
      </View>
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
    gap: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  card: {
    padding: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  detailLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  detailValue: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "700",
    flexShrink: 1,
    marginLeft: Spacing.md,
  },
  actionRow: {
    flexDirection: "row",
  },
  note: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: Spacing.sm,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLabel: {
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  timelineTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  loading: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
});