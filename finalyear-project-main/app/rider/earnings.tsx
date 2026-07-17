import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { StatCard } from "../../src/components/StatCard";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { EmptyState } from "../../src/components/EmptyState";
import {
  formatCurrency,
  formatDate,
} from "../../src/utils/format";

// Demo rate kept in sync with the dashboard's "Estimated earnings" hint.
const PAY_PER_DELIVERY = 3500;

/**
 * Returns true when both dates fall on the same calendar Monday-to-Sunday
 * week as `now`. We use this to bucket "this week" earnings from
 * `order.updatedAt` without pulling in a date library.
 */
function isSameWeek(d: Date, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Roll back to Monday.
  const day = start.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = (day + 6) % 7; // days since Monday
  start.setDate(start.getDate() - diff);
  return d >= start && d <= now;
}

export default function Earnings() {
  const { session, getOrdersForUser } = useStore();
  const user = session!.user;
  const completed = useMemo(
    () =>
      getOrdersForUser(user.id, "rider").filter(
        (o) => o.status === "delivered",
      ),
    [user.id, getOrdersForUser],
  );

  const now = new Date();
  const today = completed.filter(
    (o) => new Date(o.updatedAt).toDateString() === now.toDateString(),
  );
  const thisWeek = completed.filter((o) =>
    isSameWeek(new Date(o.updatedAt), now),
  );

  const totalEarnings = completed.length * PAY_PER_DELIVERY;
  const weekEarnings = thisWeek.length * PAY_PER_DELIVERY;
  const todayEarnings = today.length * PAY_PER_DELIVERY;

  // Newest first.
  const recent = useMemo(
    () => [...completed].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [completed],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Earnings"
        subtitle={`Pace: ${formatCurrency(PAY_PER_DELIVERY)} per delivery`}
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={styles.statsRow}>
          <StatCard
            label="Today"
            value={formatCurrency(todayEarnings)}
            icon="📅"
            tone="accent"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="This week"
            value={formatCurrency(weekEarnings)}
            icon="🗓️"
            tone="info"
            style={{ marginRight: Spacing.sm }}
          />
          <StatCard
            label="Total"
            value={formatCurrency(totalEarnings)}
            icon="💰"
            tone="warning"
          />
        </View>

        <Text style={styles.sectionTitle}>Recent earnings</Text>
        {recent.length === 0 ? (
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <Card>
              <EmptyState
                icon="📭"
                title="No earnings yet"
                message="Complete a delivery and your earnings will appear here."
              />
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
                    <Text style={styles.sub}>{formatDate(o.updatedAt)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.amount}>
                      {formatCurrency(PAY_PER_DELIVERY)}
                    </Text>
                    <Text style={styles.sub}>earned</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}

        <Text style={styles.footnote}>
          Earnings are estimated at {formatCurrency(PAY_PER_DELIVERY)} per
          delivery. Final payout is calculated at the end of each week.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
  row: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontWeight: "800", color: Colors.text, fontSize: FontSize.md },
  sub: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2 },
  amount: { color: Colors.primary, fontWeight: "800", fontSize: FontSize.md },
  footnote: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    textAlign: "center",
  },
});