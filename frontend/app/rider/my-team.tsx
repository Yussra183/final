/**
 * Rider → My Team
 *
 * Surfaces the seller the rider is currently assigned to plus every
 * other approved rider sharing that seller assignment. The signed-in
 * rider is highlighted (a bright left border + "You" pill) so the
 * rider can immediately see their own row among their teammates.
 *
 * When no assignment exists, the page renders the brief's verbatim
 * waiting message ("You have not yet been assigned to a Seller.")
 * instead of the seller card, matching the rider profile screen.
 *
 * All data is fetched from `GET /api/riders/me/team` — no mock data,
 * no fallback. The dispatch queue filter continues to scope by the
 * same `seller_riders` join table, so what this page displays is the
 * same source of truth the admin sees in the Rider Assignments screen.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Avatar } from "../../src/components/Avatar";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { StatusPill } from "../../src/components/StatusPill";
import { AppButton } from "../../src/components/AppButton";
import { useRiderLock } from "../../src/hooks/useRiderLock";
import { RidersApi } from "../../src/api/endpoints";
import { ApiError } from "../../src/api/errors";
import {
  RiderAssignedSeller,
  RiderTeam,
  RiderTeamMember,
} from "../../constants/types";

function renderField(
  icon: keyof typeof Ionicons.glyphMap,
  label: string,
  value: string | null | undefined,
  tint?: string,
) {
  const display = value && value.trim().length > 0 ? value : "—";
  return (
    <View style={styles.field}>
      <View
        style={[
          styles.fieldIcon,
          { backgroundColor: (tint ?? Colors.primary) + "22" },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={tint ?? Colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{display}</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function RiderMyTeam() {
  const { session } = useStore();
  const sessionUserId = session?.user.id;

  // Lock banner + modal — rendered inline at the top of the page so
  // the original layout (cards, list, spacing) is unchanged.
  const { Banner, Modal, isApproved } = useRiderLock();

  const [team, setTeam] = useState<RiderTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeam = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      setError(null);
      try {
        const data = await RidersApi.team();
        setTeam(data);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : (err as Error)?.message ??
              "Could not load your team.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchTeam("initial");
  }, [fetchTeam]);

  // Re-fetch every time the rider re-enters the screen so admin
  // changes (a new teammate, a seller swap) surface immediately.
  useFocusEffect(
    useCallback(() => {
      fetchTeam("refresh").catch(() => {
        /* surfaced via the next full fetch */
      });
    }, [fetchTeam]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTeam("refresh");
  }, [fetchTeam]);

  const seller: RiderAssignedSeller | null = team?.seller ?? null;

  // The signed-in rider is implicitly part of the team even though
  // the backend excludes them from the teammates list to keep payloads
  // small. We surface the rider themselves as the first row so the
  // page reads as a single, contiguous team list.
  const meRow: RiderTeamMember | null = sessionUserId
    ? {
        id: sessionUserId,
        fullName: session?.user.fullName ?? null,
        phone: session?.user.phone ?? null,
        vehicleType: null,
        vehiclePlate: null,
        available: true,
        active: true,
        isMe: true,
      }
    : null;

  const teammates = team?.riders ?? [];

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="My Team"
        subtitle="Your assigned seller and teammates"
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.rider}
          />
        }
      >
        {Banner}

        <View style={{ paddingHorizontal: Spacing.lg }}>
          {loading && !team ? (
            <Card>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.rider} />
                <Text style={styles.loadingText}>Loading your team…</Text>
              </View>
            </Card>
          ) : null}

          {error && !loading ? (
            <Card>
              <Text style={styles.errorTitle}>Team is taking a moment</Text>
              <Text style={styles.errorBody}>
                We couldn't refresh your team just now ({error}). The
                sections below are still safe to browse — tap Retry once
                your connection is back.
              </Text>
              <AppButton
                title="Retry"
                variant="outline"
                onPress={() => fetchTeam("initial")}
                style={{ marginTop: Spacing.md }}
              />
            </Card>
          ) : null}

          {/* Assigned Seller card */}
          <Text style={styles.sectionTitle}>Assigned Seller</Text>
          {seller ? (
            <Card style={!isApproved ? styles.cardLocked : null}>
              {renderField(
                "storefront-outline",
                "Business Name",
                seller.businessName,
                Colors.primary,
              )}
              <Divider />
              {renderField(
                "person-outline",
                "Seller Name",
                seller.sellerName,
                Colors.accent,
              )}
              <Divider />
              {renderField(
                "call-outline",
                "Phone Number",
                seller.phone,
                Colors.secondary,
              )}
              <Divider />
              {renderField(
                "map-outline",
                "Region",
                seller.region,
                Colors.info,
              )}
              <Divider />
              {renderField(
                "navigate-outline",
                "District",
                seller.district,
                Colors.info,
              )}
            </Card>
          ) : (
            <Card>
              <View style={styles.waitingRow}>
                <Ionicons
                  name="hourglass-outline"
                  size={32}
                  color={Colors.warning}
                />
              </View>
              <Text style={styles.waitingTitle}>
                Awaiting Seller Assignment
              </Text>
              <Text style={styles.waitingBody}>
                You have not yet been assigned to a Seller.
              </Text>
              <Text style={styles.waitingSub}>
                Once the administrator assigns you, your seller and
                teammates will appear here.
              </Text>
            </Card>
          )}

          {/* Teammates — only render when we actually have a seller. */}
          {seller ? (
            <>
              <Text style={styles.sectionTitle}>My Teammates</Text>
              <Card style={!isApproved ? styles.cardLocked : null}>
                {meRow ? (
                  <TeamRow member={meRow} />
                ) : null}
                {teammates.length === 0 && !meRow ? (
                  <Text style={styles.emptyNote}>
                    You are the only rider assigned to this seller.
                  </Text>
                ) : null}
                {teammates.map((m, idx) => (
                  <View key={m.id}>
                    {meRow || idx > 0 ? <Divider /> : null}
                    <TeamRow member={m} />
                  </View>
                ))}
                {teammates.length === 0 && meRow ? (
                  <Text style={styles.emptyNote}>
                    You are the only rider assigned to this seller so far.
                  </Text>
                ) : null}
              </Card>
            </>
          ) : null}
        </View>
      </ScrollView>
      {Modal}
    </SafeAreaView>
  );
}

function TeamRow({ member }: { member: RiderTeamMember }) {
  return (
    <View
      style={[
        styles.memberRow,
        member.isMe ? styles.memberRowHighlight : null,
      ]}
    >
      <Avatar
        name={member.fullName ?? member.id}
        size={40}
        color={member.isMe ? Colors.rider : Colors.primary}
      />
      <View style={{ flex: 1, marginLeft: Spacing.md }}>
        <View style={styles.memberNameRow}>
          <Text
            style={[
              styles.memberName,
              member.isMe ? { color: Colors.rider } : null,
            ]}
            numberOfLines={1}
          >
            {member.fullName ?? `Rider #${member.id}`}
          </Text>
          {member.isMe ? (
            <View style={styles.youPill}>
              <Text style={styles.youPillText}>You</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.memberMeta} numberOfLines={1}>
          {member.phone ?? "—"}
          {member.vehiclePlate ? ` · ${member.vehiclePlate}` : ""}
        </Text>
      </View>
      <StatusPill
        label={member.available ? "Available" : "Offline"}
        tone={member.available ? "success" : "muted"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  errorTitle: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  errorBody: {
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  fieldIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  fieldValue: {
    fontSize: FontSize.md,
    color: Colors.text,
    marginTop: 2,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  waitingRow: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  waitingTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "center",
  },
  waitingBody: {
    color: Colors.text,
    fontSize: FontSize.sm,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  waitingSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 16,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
    paddingLeft: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  memberRowHighlight: {
    borderLeftColor: Colors.rider,
    backgroundColor: Colors.rider + "11",
    borderRadius: Radius.md,
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  memberName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    flexShrink: 1,
  },
  memberMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  youPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.rider + "22",
  },
  youPillText: {
    color: Colors.rider,
    fontSize: FontSize.xs,
    fontWeight: "800",
  },
  emptyNote: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  cardLocked: {
    opacity: 0.55,
  },
});