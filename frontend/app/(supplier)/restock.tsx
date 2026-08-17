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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatCard } from "../../src/components/StatCard";
import { StatusPill } from "../../src/components/StatusPill";
import { Avatar } from "../../src/components/Avatar";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { AppButton } from "../../src/components/AppButton";
import { EmptyState } from "../../src/components/EmptyState";
import { formatDate } from "../../src/utils/format";
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";
import { RestockRequest, RESTOCK_STATUS_LABELS, normalizeRestockStatus } from "../../constants/types";

type RestockTab = "home" | "requests" | "deliveries";
const ACCENT = "#6366F1";

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

      {/* Tab bar — segmented control */}
      <View style={styles.tabBar}>
        {(
          [
            { key: "home", label: "Home", icon: "🏠" },
            { key: "requests", label: "Requests", icon: "📥" },
            { key: "deliveries", label: "Deliveries", icon: "🚚" },
          ] as { key: RestockTab; label: string; icon: string }[]
        ).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              activeOpacity={0.85}
              onPress={() => setTab(t.key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === "home" ? (
        <RestockHomeSection />
      ) : tab === "requests" ? (
        <RestockRequestsSection />
      ) : (
        <RestockDeliveriesSection />
      )}
    </SafeAreaView>
  );
}

/* ---------- Restock Home (KPI strip + awaiting + dispatches) ---------- */

function RestockHomeSection() {
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
  const inTransitCount = requests.filter(
    (r) => normalizeRestockStatus(r.status) === "dispatched",
  ).length;
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
          onPress: (reason) => {
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

  const handleMarkDelivered = (r: RestockRequest) => {
    updateRestockStatus(r.id, { status: "delivered" });
  };

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
        <Avatar name={user.fullName} size={48} color={ACCENT} />
      </View>

      {/* KPI strip */}
      <View style={styles.statsRow}>
        <StatCard
          label="Pending"
          value={pendingCount}
          icon="⏳"
          tone="warning"
          style={{ marginRight: Spacing.sm }}
        />
        <StatCard
          label="Accepted"
          value={acceptedCount}
          icon="✅"
          tone="primary"
          style={{ marginRight: Spacing.sm }}
        />
      </View>
      <View style={[styles.statsRow, { marginTop: Spacing.sm }]}>
        <StatCard
          label="Dispatched"
          value={inTransitCount}
          icon="🚚"
          tone="info"
          style={{ marginRight: Spacing.sm }}
        />
        <StatCard
          label="Delivered"
          value={deliveredCount}
          icon="📦"
          tone="primary"
        />
      </View>

      {/* Awaiting your action */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Awaiting your action</Text>
        <TouchableOpacity
          onPress={() => router.push("/(supplier)/restock" as any)}
        >
          <Text style={styles.linkText}>View all</Text>
        </TouchableOpacity>
      </View>
      {awaiting.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            icon="🎉"
            title="All clear"
            message="No pending requests right now."
          />
        </View>
      ) : (
        awaiting.slice(0, 3).map((r) => (
          <Card
            key={r.id}
            style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
          >
            <View style={styles.row}>
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
                onPress={() => handleAccept(r)}
                style={{ flex: 1, marginRight: 6 }}
              />
              <AppButton
                title="Reject"
                variant="danger"
                onPress={() => handleReject(r)}
                style={{ flex: 1, marginLeft: 6 }}
              />
            </View>
          </Card>
        ))
      )}

      {/* Today's dispatches */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Today's dispatches</Text>
        <TouchableOpacity
          onPress={() => router.push("/(supplier)/restock" as any)}
        >
          <Text style={styles.linkText}>Deliveries</Text>
        </TouchableOpacity>
      </View>
      {dispatching.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            icon="🚛"
            title="Nothing on the road"
            message="Accepted and dispatched requests will appear here."
          />
        </View>
      ) : (
        dispatching.slice(0, 4).map((r) => {
          const s = normalizeRestockStatus(r.status);
          return (
            <Card
              key={r.id}
              style={{ marginHorizontal: Spacing.lg, marginBottom: Spacing.sm }}
            >
              <View style={styles.row}>
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
                <AppButton
                  title="Confirm delivery"
                  variant="primary"
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                  onPress={() => handleMarkDelivered(r)}
                />
              )}
            </Card>
          );
        })
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.actionGrid}>
        {[
          { label: "Requests", icon: "📥", route: "/(supplier)/restock" },
          { label: "Deliveries", icon: "🚚", route: "/(supplier)/restock" },
          { label: "Profile", icon: "👤", route: "/(supplier)/profile" },
          { label: "Guide", icon: "📘", route: "/(supplier)/guide" },
        ].map((a) => (
          <TouchableOpacity
            key={a.label}
            style={styles.actionTile}
            activeOpacity={0.8}
            onPress={() => router.push(a.route as any)}
          >
            <Text style={styles.actionIcon}>{a.icon}</Text>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
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
    "all", "pending", "accepted", "preparing", "dispatched",
    "delivered", "received", "rejected", "cancelled",
  ];

  return (
    <>
      <View style={styles.tabRow}>
        {filters.map((f) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.subTab, active && styles.subTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[styles.subTabText, active && styles.subTabTextActive]}
              >
                {RESTOCK_STATUS_LABELS[f]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingTop: 0 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon="📭"
            title="No requests"
            message="Restock requests from sellers will appear here."
          />
        }
        renderItem={({ item }) => {
          const s = normalizeRestockStatus(item.status);
          return (
            <Card>
              <View style={styles.row}>
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
              {s === "pending" ? (
                <View style={styles.actionRow}>
                  <AppButton
                    title="Accept"
                    variant="primary"
                    onPress={() => setSupplier(item)}
                    style={{ flex: 1, marginRight: 6 }}
                  />
                  <AppButton
                    title="Reject"
                    variant="danger"
                    onPress={() => handleRejectInline(item)}
                    style={{ flex: 1, marginLeft: 6 }}
                  />
                </View>
              ) : null}
              {s === "accepted" ? (
                <AppButton
                  title="Start preparing"
                  variant="secondary"
                  onPress={() => updateRestockStatus(item.id, { status: "preparing" })}
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                />
              ) : null}
              {s === "preparing" ? (
                <AppButton
                  title="Dispatch"
                  variant="secondary"
                  onPress={() => updateRestockStatus(item.id, { status: "dispatched" })}
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                />
              ) : null}
              {s === "dispatched" ? (
                <AppButton
                  title="Confirm delivery"
                  variant="primary"
                  onPress={() => updateRestockStatus(item.id, { status: "delivered" })}
                  fullWidth
                  style={{ marginTop: Spacing.sm }}
                />
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
      <Text style={styles.sectionTitle}>Active</Text>
      {active.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            icon="🚚"
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

      <Text style={styles.sectionTitle}>History</Text>
      {history.length === 0 ? (
        <View style={{ marginHorizontal: Spacing.lg }}>
          <EmptyState
            icon="🗂️"
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
  },
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  /* segmented tab bar */
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
  },
  tabIcon: { fontSize: 14 },
  tabText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  tabTextActive: { color: "#FFF" },
  /* home */
  subPageHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  subGreeting: { fontSize: FontSize.xl, fontWeight: "800", color: Colors.text },
  statsRow: { flexDirection: "row", paddingHorizontal: Spacing.lg },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linkText: { color: ACCENT, fontWeight: "700", marginRight: Spacing.lg },
  row: { flexDirection: "row", alignItems: "center" },
  itemTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  itemMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  actionRow: { flexDirection: "row", marginTop: Spacing.sm },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  actionTile: {
    flexBasis: "47%",
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: "center",
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  actionIcon: { fontSize: 28, marginBottom: 4 },
  actionLabel: { fontSize: FontSize.xs, fontWeight: "700", color: Colors.text },
  /* requests filter chips */
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
    flexWrap: "wrap",
  },
  subTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subTabActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  subTabText: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  subTabTextActive: { color: "#FFF" },
  qty: { marginTop: Spacing.sm, fontWeight: "700", color: Colors.text },
});