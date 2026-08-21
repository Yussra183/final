/**
 * Restock page — consolidates the supplier's three legacy restock screens
 * (Restock Home dashboard, Restock Requests list, Restock Deliveries
 * list) into one tabbed page.
 *
 * Tabs:
 *   • Home       — KPIs + "Awaiting your action" + "Today's dispatches"
 *                  + Quick actions grid (the original restock dashboard)
 *   • Requests   — every restock request with status filter chips
 *   • Deliveries — Active vs History lists for in-flight and closed
 *                  restock dispatches
 *
 * All functionality from the three merged pages is preserved verbatim;
 * only the chrome has changed.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatCard } from "../../src/components/StatCard";
import { StatusPill } from "../../src/components/StatusPill";
import { Avatar } from "../../src/components/Avatar";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { EmptyState } from "../../src/components/EmptyState";
import { SegmentedTabs, SegmentedTab } from "../../src/components/SegmentedTabs";
import { PressableScale } from "../../src/components/MicroAnimations";
import { formatDate } from "../../src/utils/format";
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";
import {
  RestockRequest,
  RESTOCK_STATUS_LABELS,
  normalizeRestockStatus,
} from "../../constants/types";

type RestockTab = "home" | "requests" | "deliveries";

const RESTOCK_TABS: SegmentedTab[] = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "requests", label: "Requests", icon: "cloud-download-outline" },
  { key: "deliveries", label: "Deliveries", icon: "car-sport-outline" },
];

export default function SupplierRestock() {
  return (
    <SupplierApprovalGate title="Restock">
      <RestockContent />
    </SupplierApprovalGate>
  );
}

function RestockContent() {
  const [tab, setTab] = useState<RestockTab>("home");

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <View style={styles.header}>
        <DrawerMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Restock</Text>
          <Text style={styles.subtitle}>
            Manage restock requests from sellers
          </Text>
        </View>
      </View>

      <SegmentedTabs
        tabs={RESTOCK_TABS}
        active={tab}
        onChange={(k) => setTab(k as RestockTab)}
      />

      {tab === "home" ? (
        <RestockHomeSection onNavigate={setTab} />
      ) : tab === "requests" ? (
        <RestockRequestsSection />
      ) : (
        <RestockDeliveriesSection />
      )}
    </SafeAreaView>
  );
}

/* ---------- Restock Home (KPI strip + awaiting + dispatches) ---------- */

function RestockHomeSection({
  onNavigate,
}: {
  onNavigate: (tab: RestockTab) => void;
}) {
  const router = useRouter();
  const {
    session,
    getRestockForSupplier,
    updateRestockStatus,
  } = useStore();
  const user = session?.user!;
  const requests = getRestockForSupplier(user.id);

  // FR-06 lifecycle counters. Legacy values (`approved`, `in_transit`)
  // are normalised so screens still receiving the old wire shape keep
  // counting correctly.
  const pendingCount = requests.filter(
    (r) => normalizeRestockStatus(r.status) === "pending",
  ).length;
  const acceptedCount = requests.filter(
    (r) => normalizeRestockStatus(r.status) === "accepted",
  ).length;
  // "In transit" is now the supplier's terminal-ish state: once a row
  // hits DISPATCHED, the supplier's job is done. The seller then
  // confirms receipt which moves the row to DELIVERED, and the
  // supplier sees the count move out of this bucket automatically.
  const inTransitCount = requests.filter(
    (r) => normalizeRestockStatus(r.status) === "dispatched",
  ).length;
  // "Delivered" KPI counts rows the seller has confirmed receipt of —
  // i.e. truly finished. Useful for the supplier's reconciliation.
  const deliveredCount = requests.filter(
    (r) => normalizeRestockStatus(r.status) === "delivered",
  ).length;

  const awaiting = useMemo(
    () =>
      requests.filter(
        (r) => normalizeRestockStatus(r.status) === "pending",
      ),
    [requests],
  );

  const dispatching = useMemo(
    () =>
      requests.filter((r) => {
        const s = normalizeRestockStatus(r.status);
        return s === "accepted" || s === "preparing" || s === "dispatched";
      }),
    [requests],
  );

  const handleAccept = (r: RestockRequest) => {
    updateRestockStatus(r.id, { status: "accepted" });
    Alert.alert("Request accepted", `${r.sellerName}'s request accepted.`);
  };

  /**
   * Reject a request with a free-text reason. The backend's state
   * machine rejects transitions into REJECTED without a reason, so we
   * prompt the supplier inline rather than via the legacy bare-Alert
   * which had no input.
   */
  const handleReject = (r: RestockRequest) => {
    Alert.prompt(
      "Reject request?",
      `${r.sellerName} will be notified. Add a reason (required).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: (reason?: string) => {
            const trimmed = (reason ?? "").trim();
            if (!trimmed) {
              Alert.alert("Reason required", "Please enter a reason.");
              return;
            }
            updateRestockStatus(r.id, { status: "rejected", reason: trimmed });
          },
        },
      ],
      "plain-text",
    );
  };

  const handleStartPreparing = (r: RestockRequest) => {
    updateRestockStatus(r.id, { status: "preparing" });
  };

  const handleDispatch = (r: RestockRequest) => {
    updateRestockStatus(r.id, { status: "dispatched" });
  };

  // NOTE: the supplier does NOT mark a restock DELIVERED. Per the
  // business diagram, the supplier stages up to DISPATCHED; the seller
  // is the one who confirms physical receipt, which transitions the
  // row to DELIVERED and credits inventory. Showing a "Confirm
  // delivery" button here would re-introduce the old state machine
  // (and silently fail at the API because the supplier is no longer
  // authorised to transition DISPATCHED → DELIVERED).

  const statusPillTone = (s: RestockRequest["status"]) => {
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
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      {/* Header with greeting + avatar */}
      <View style={styles.subPageHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subGreeting}>Supplier Hub</Text>
        </View>
        <Avatar name={user.fullName} size={48} color={Colors.supplier} />
      </View>

      {/* KPI strip */}
      <View style={styles.statsRow}>
        <StatCard
          label="Pending"
          value={pendingCount}
          iconName="hourglass-outline"
          tone="warning"
          style={{ marginRight: Spacing.sm }}
        />
        <StatCard
          label="Accepted"
          value={acceptedCount}
          iconName="checkmark-outline"
          tone="supplier"
        />
      </View>
      <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
        <StatCard
          label="Dispatched"
          value={inTransitCount}
          iconName="car-sport-outline"
          tone="info"
          style={{ marginRight: Spacing.sm }}
        />
        <StatCard
          label="Delivered"
          value={deliveredCount}
          iconName="cube-outline"
          tone="accent"
        />
      </View>

      {/* Awaiting your action */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitleRow}>
          <Ionicons
            name="alert-circle-outline"
            size={16}
            color={Colors.warning}
          />
          <Text style={styles.sectionTitle}>Awaiting your action</Text>
        </View>
        <TouchableOpacity
          onPress={() => onNavigate("requests")}
          style={styles.linkPill}
        >
          <Text style={styles.linkText}>View all</Text>
          <Ionicons
            name="chevron-forward"
            size={12}
            color={Colors.supplier}
          />
        </TouchableOpacity>
      </View>
      {awaiting.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            iconName="checkmark-done-outline"
            title="All clear"
            message="No pending requests right now."
            iconColor={Colors.success}
          />
        </View>
      ) : (
        awaiting.slice(0, 3).map((r) => (
          <PressableScale
            key={r.id}
            onPress={() =>
              router.push({
                pathname: "/(supplier)/restock/[id]",
                params: { id: r.id },
              } as any)
            }
            style={styles.pendingCardWrap}
          >
            <Card style={styles.pendingCard}>
              <View style={styles.row}>
                <View style={styles.pendingBubble}>
                  <Ionicons name="cube" size={20} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>
                    {r.productName} ({r.size}) ×{r.quantity}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {r.sellerName} • {formatDate(r.createdAt)}
                  </Text>
                </View>
                <StatusPill label="Pending" tone="warning" />
              </View>
              <View style={styles.actionRow}>
                <AppButton
                  title="Accept"
                  variant="primary"
                  leftIcon={<Ionicons name="checkmark" size={14} color="#FFF" />}
                  onPress={() => handleAccept(r)}
                  style={{ flex: 1, marginRight: 6 }}
                />
                <AppButton
                  title="Reject"
                  variant="danger"
                  leftIcon={<Ionicons name="close" size={14} color="#FFF" />}
                  onPress={() => handleReject(r)}
                  style={{ flex: 1, marginLeft: 6 }}
                />
              </View>
            </Card>
          </PressableScale>
        ))
      )}

      {/* Today's dispatches */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitleRow}>
          <Ionicons
            name="car-sport-outline"
            size={16}
            color={Colors.supplier}
          />
          <Text style={styles.sectionTitle}>In flight</Text>
        </View>
        <TouchableOpacity
          onPress={() => onNavigate("deliveries")}
          style={styles.linkPill}
        >
          <Text style={styles.linkText}>Deliveries</Text>
          <Ionicons
            name="chevron-forward"
            size={12}
            color={Colors.supplier}
          />
        </TouchableOpacity>
      </View>
      {dispatching.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            iconName="car-outline"
            title="Nothing on the road"
            message="Accepted and dispatched requests will appear here."
          />
        </View>
      ) : (
        dispatching.slice(0, 4).map((r) => {
          const s = normalizeRestockStatus(r.status);
          return (
            <PressableScale
              key={r.id}
              onPress={() =>
                router.push({
                  pathname: "/(supplier)/restock/[id]",
                  params: { id: r.id },
                } as any)
              }
              style={styles.pendingCardWrap}
            >
              <Card>
                <View style={styles.row}>
                  <View style={styles.supplierBubble}>
                    <Ionicons
                      name="cube-outline"
                      size={18}
                      color={Colors.supplier}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>
                      {r.productName} ({r.size}) ×{r.quantity}
                    </Text>
                    <Text style={styles.itemMeta}>
                      To {r.sellerName} • {formatDate(r.createdAt)}
                    </Text>
                  </View>
                  <StatusPill
                    label={RESTOCK_STATUS_LABELS[s]}
                    tone={statusPillTone(s)}
                  />
                </View>
                {s === "accepted" ? (
                  <AppButton
                    title="Start preparing"
                    variant="secondary"
                    fullWidth
                    style={{ marginTop: Spacing.sm }}
                    onPress={() => handleStartPreparing(r)}
                  />
                ) : s === "preparing" ? (
                  <AppButton
                    title="Dispatch"
                    variant="secondary"
                    fullWidth
                    style={{ marginTop: Spacing.sm }}
                    onPress={() => handleDispatch(r)}
                  />
                ) : (
                  <View style={styles.awaitingRow}>
                    <Ionicons
                      name="time-outline"
                      size={12}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.itemMeta}>
                      Awaiting seller's receipt confirmation
                    </Text>
                  </View>
                )}
              </Card>
            </PressableScale>
          );
        })
      )}
    </ScrollView>
  );
}

/* ---------- Restock Requests list ---------- */

type RequestFilter =
  | "all"
  | "pending"
  | "accepted"
  | "preparing"
  | "dispatched"
  | "delivered"
  | "received"
  | "rejected"
  | "cancelled";

function RestockRequestsSection() {
  const router = useRouter();
  const { session, getRestockForSupplier, updateRestockStatus } = useStore();
  const user = session?.user!;
  const requests = getRestockForSupplier(user.id);
  const [filter, setFilter] = useState<RequestFilter>("all");

  const filtered =
    filter === "all"
      ? requests
      : requests.filter((r) => normalizeRestockStatus(r.status) === filter);

  const setSupplier = (r: RestockRequest) => {
    updateRestockStatus(r.id, { status: "accepted" });
    Alert.alert("Request accepted", `You accepted ${r.sellerName}'s request.`);
  };

  const handleRejectInline = (r: RestockRequest) => {
    Alert.prompt(
      "Reject request?",
      `Notify ${r.sellerName}. Add a reason (required).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: (reason?: string) => {
            const trimmed = (reason ?? "").trim();
            if (!trimmed) {
              Alert.alert("Reason required", "Please enter a reason.");
              return;
            }
            updateRestockStatus(r.id, { status: "rejected", reason: trimmed });
          },
        },
      ],
      "plain-text",
    );
  };

  const filters: RequestFilter[] = [
    "all",
    "pending",
    "accepted",
    "preparing",
    "dispatched",
    "delivered",
    "received",
    "rejected",
    "cancelled",
  ];

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {filters.map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.subTab, active && styles.subTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.subTabText,
                  active && styles.subTabTextActive,
                ]}
              >
                {f === "all"
                  ? "All"
                  : RESTOCK_STATUS_LABELS[f as keyof typeof RESTOCK_STATUS_LABELS]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            iconName="cloud-download-outline"
            title="No requests"
            message="Restock requests from sellers will appear here."
          />
        }
        renderItem={({ item }) => {
          const s = normalizeRestockStatus(item.status);
          return (
            <Card>
              <PressableScale
                onPress={() =>
                  router.push({
                    pathname: "/(supplier)/restock/[id]",
                    params: { id: item.id },
                  } as any)
                }
              >
                <View style={styles.row}>
                  <View style={styles.supplierBubble}>
                    <Ionicons
                      name="cube-outline"
                      size={18}
                      color={Colors.supplier}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>
                      {item.productName} ({item.size})
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.sellerName} • {formatDate(item.createdAt)}
                    </Text>
                  </View>
                  <StatusPill
                    label={RESTOCK_STATUS_LABELS[s]}
                    tone={
                      s === "delivered" || s === "received"
                        ? "success"
                        : s === "rejected" || s === "cancelled"
                          ? "danger"
                          : s === "dispatched" || s === "preparing"
                            ? "info"
                            : s === "accepted"
                              ? "primary"
                              : "warning"
                    }
                  />
                </View>
                <Text style={styles.qty}>Quantity: {item.quantity} units</Text>
              </PressableScale>
              {s === "pending" ? (
                <View style={styles.actionRow}>
                  <AppButton
                    title="Accept"
                    variant="primary"
                    onPress={() => setSupplier(item)}
                    style={{ flex: 1, marginRight: 6 }}
                    leftIcon={
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    }
                  />
                  <AppButton
                    title="Reject"
                    variant="danger"
                    onPress={() => handleRejectInline(item)}
                    style={{ flex: 1, marginLeft: 6 }}
                    leftIcon={
                      <Ionicons name="close" size={14} color="#FFF" />
                    }
                  />
                </View>
              ) : null}
              {s === "accepted" ? (
                <AppButton
                  title="Start preparing"
                  variant="secondary"
                  onPress={() =>
                    updateRestockStatus(item.id, { status: "preparing" })
                  }
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                />
              ) : null}
              {s === "preparing" ? (
                <AppButton
                  title="Dispatch"
                  variant="secondary"
                  onPress={() =>
                    updateRestockStatus(item.id, { status: "dispatched" })
                  }
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                />
              ) : null}
              {s === "dispatched" ? (
                <View style={styles.awaitingRow}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.itemMeta}>
                    On the way — awaiting seller's receipt confirmation.
                  </Text>
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </>
  );
}

/* ---------- Restock Deliveries (active + history) ---------- */

function RestockDeliveriesSection() {
  const { session, getRestockForSupplier } = useStore();
  const user = session?.user!;
  const all = getRestockForSupplier(user.id);
  const active = all.filter(
    (r) => r.status === "in_transit" || r.status === "approved",
  );
  const history = all.filter(
    (r) => r.status === "delivered" || r.status === "rejected",
  );

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitleRow}>
          <Ionicons
            name="car-sport-outline"
            size={16}
            color={Colors.supplier}
          />
          <Text style={styles.sectionTitle}>Active</Text>
        </View>
      </View>
      {active.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            iconName="car-outline"
            title="No active deliveries"
            message="Approved and in-transit requests appear here."
          />
        </View>
      ) : (
        active.map((item) => (
          <Card
            key={`a-${item.id}`}
            style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
          >
            <View style={styles.row}>
              <View style={styles.supplierBubble}>
                <Ionicons
                  name="cube-outline"
                  size={18}
                  color={Colors.supplier}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {item.productName} ({item.size}) ×{item.quantity}
                </Text>
                <Text style={styles.itemMeta}>
                  To {item.sellerName} • {formatDate(item.createdAt)}
                </Text>
              </View>
              <StatusPill
                label={item.status.replace("_", " ")}
                tone={item.status === "in_transit" ? "info" : "primary"}
              />
            </View>
          </Card>
        ))
      )}

      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitleRow}>
          <Ionicons
            name="archive-outline"
            size={16}
            color={Colors.textSecondary}
          />
          <Text style={styles.sectionTitle}>History</Text>
        </View>
      </View>
      {history.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            iconName="archive-outline"
            title="No history yet"
            message="Completed deliveries will be archived here."
          />
        </View>
      ) : (
        history.map((item) => (
          <Card
            key={`h-${item.id}`}
            style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
          >
            <View style={styles.row}>
              <View style={styles.supplierBubble}>
                <Ionicons
                  name="cube-outline"
                  size={18}
                  color={Colors.supplier}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {item.productName} ({item.size}) ×{item.quantity}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.sellerName} • {formatDate(item.createdAt)}
                </Text>
              </View>
              <StatusPill
                label={item.status}
                tone={item.status === "delivered" ? "success" : "danger"}
              />
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  /* home */
  subPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  subGreeting: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.lg },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  linkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  linkText: {
    color: Colors.supplier,
    fontWeight: "800",
    fontSize: FontSize.xs,
  },
  row: { flexDirection: "row", alignItems: "center" },
  pendingCardWrap: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  pendingCard: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  pendingBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.warningSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  supplierBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
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
  actionRow: { flexDirection: "row", marginTop: Spacing.sm },
  awaitingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
  },
  /* requests filter chips */
  tabRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  subTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subTabActive: { backgroundColor: Colors.supplier, borderColor: Colors.supplier },
  subTabText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  subTabTextActive: { color: "#FFF" },
  qty: { marginTop: Spacing.sm, fontWeight: "700", color: Colors.text },
});