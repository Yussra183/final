import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
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
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { AppButton } from "../../src/components/AppButton";
import { RiderVerificationRequiredCard } from "../../src/components/RiderVerificationRequiredCard";
import { useRiderVerificationStatus } from "../../src/hooks/useRiderVerificationStatus";
import {
  formatCurrency,
  orderStatusLabel,
  orderTone,
} from "../../src/utils/format";

// Demo pricing used across the rider module.
const PAY_PER_DELIVERY = 3500;

export default function RiderDashboard() {
  const router = useRouter();
  const { session, getOrdersForUser } = useStore();
  const user = session!.user;
  // Verification gate — mirrors the seller "pending permit" pattern.
  // The card itself is only rendered when the rider is NOT approved
  // (see RiderVerificationRequiredCard). Delivery-related sections
  // (Next delivery, Recent history, Browse requests CTA) are hidden
  // until the admin approves the application.
  const verification = useRiderVerificationStatus();
  const orders = verification.isApproved
    ? getOrdersForUser(user.id, "rider")
    : [];

  const active = orders.filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled",
  );
  const completed = orders.filter((o) => o.status === "delivered");
  const today = completed.filter((o) => {
    const d = new Date(o.updatedAt);
    const t = new Date();
    return d.toDateString() === t.toDateString();
  });

  const next = active[0];
  const recent = completed.slice(-2).reverse();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title={`Hi, ${user.fullName.split(" ")[0]} 🛵`}
        subtitle="Ready to deliver?"
        left={<DrawerMenuButton />}
        right={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Avatar name={user.fullName} size={44} color={Colors.rider} />
            <LogoutButton />
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        {/* Rider Verification Required banner — only renders when the
            rider is NOT approved (see RiderVerificationRequiredCard). */}
        {!verification.isApproved ? (
          <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.sm }}>
            <RiderVerificationRequiredCard
              info={verification}
              onOpenVerification={() => router.push("/rider/licences")}
            />
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <StatCard
            label="Active"
            value={active.length}
            icon="📦"
            tone="primary"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Completed"
            value={completed.length}
            icon="✅"
            tone="info"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Today"
            value={today.length}
            icon="📅"
            tone="accent"
          />
        </View>

        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.sm }}>
          <StatCard
            label="Estimated earnings"
            value={formatCurrency(completed.length * PAY_PER_DELIVERY)}
            icon="💰"
            tone="warning"
            hint={`Based on ${formatCurrency(PAY_PER_DELIVERY)} per delivery`}
          />
        </View>

        <Text style={styles.sectionTitle}>Next delivery</Text>
        {next ? (
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <Card>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    Order #{next.id.slice(-4)} • {next.customerName}
                  </Text>
                  <Text style={styles.sub}>{next.deliveryLocation.address}</Text>
                </View>
                <StatusPill
                  label={orderStatusLabel(next.status)}
                  tone={orderTone(next.status)}
                />
              </View>
              <Text style={[styles.sub, { marginTop: Spacing.sm }]}>
                Total {formatCurrency(next.total)}
              </Text>
              <AppButton
                title="Open active delivery"
                style={{ marginTop: Spacing.md }}
                onPress={() =>
                  router.push({
                    pathname: "/rider/active-delivery",
                    params: { id: next.id },
                  })
                }
              />
            </Card>
          </View>
        ) : verification.isApproved ? (
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <Card>
              <Text style={styles.cardTitle}>No active deliveries</Text>
              <Text style={styles.sub}>
                Browse requests or wait for a seller to assign you one.
              </Text>
              <AppButton
                title="Browse requests"
                variant="outline"
                style={{ marginTop: Spacing.md }}
                onPress={() => router.push("/rider/delivery-requests")}
              />
            </Card>
          </View>
        ) : null}

        {verification.isApproved ? (
          <>
            <Text style={styles.sectionTitle}>Shortcuts</Text>
            <View style={styles.shortcutRow}>
              <ShortcutCard
                icon="📥"
                label="Requests"
                onPress={() => router.push("/rider/delivery-requests")}
              />
              <ShortcutCard
                icon="💸"
                label="Earnings"
                onPress={() => router.push("/rider/earnings")}
              />
              <ShortcutCard
                icon="🛡️"
                label="Safety"
                onPress={() => router.push("/rider/safety-guidelines")}
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent history</Text>
              {completed.length > 0 ? (
                <TouchableOpacity onPress={() => router.push("/rider/delivery-history")}>
                  <Text style={styles.linkText}>See all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {recent.length === 0 ? (
              <View style={{ paddingHorizontal: Spacing.lg }}>
                <Card>
                  <Text style={styles.sub}>
                    Completed trips will appear here once you finish a delivery.
                  </Text>
                </Card>
              </View>
            ) : (
              <View style={{ paddingHorizontal: Spacing.lg }}>
                {recent.map((o) => (
                  <Card key={o.id} style={{ marginBottom: Spacing.sm }}>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>
                          Order #{o.id.slice(-4)} • {o.customerName}
                        </Text>
                        <Text style={styles.sub}>{o.deliveryLocation.address}</Text>
                      </View>
                      <StatusPill
                        label={orderStatusLabel(o.status)}
                        tone={orderTone(o.status)}
                      />
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShortcutCard({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{ flex: 1 }}>
      <View style={styles.shortcut}>
        <Text style={styles.shortcutIcon}>{icon}</Text>
        <Text style={styles.shortcutLabel}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
  },
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
    paddingRight: Spacing.lg,
  },
  linkText: {
    color: Colors.rider,
    fontWeight: "700",
  },
  row: { flexDirection: "row", alignItems: "center" },
  cardTitle: {
    fontWeight: "800",
    color: Colors.text,
    fontSize: FontSize.md,
  },
  sub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  shortcutRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  shortcut: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  shortcutIcon: { fontSize: 24, marginBottom: 4 },
  shortcutLabel: {
    fontWeight: "700",
    color: Colors.text,
    fontSize: FontSize.sm,
  },
});