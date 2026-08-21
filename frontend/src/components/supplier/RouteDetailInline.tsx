/**
 * src/components/supplier/RouteDetailInline.tsx
 *
 * Reusable "Route Details" sections used by the supplier's Delivery
 * Operations page (Tab 2 of the three-tab flow). Originally lived
 * inline in `app/(supplier)/routes/[id].tsx`; extracted here so the
 * three-tab operations page can render them without re-implementing
 * the layout.
 *
 * The sections are intentionally minimal — they read the current
 * route + any active trip from the store and render the four
 * supplier-visible buckets:
 *
 *   Route → Supervisor → Rider → Sellers
 *
 * Everything matches the existing mini-page 2 visuals exactly so
 * existing screenshots, copy, and accessibility labels keep working.
 */
import React from "react";
import {
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../../constants/colors";
import { Card } from "../Card";
import { useStore } from "../../store/StoreContext";
import {
  DeliveryRoute,
  DeliveryTrip,
} from "../../../constants/types";

/* ---------------- public component ---------------- */

export function RouteDetailInline({
  route,
  trip,
}: {
  route: DeliveryRoute;
  trip?: DeliveryTrip & {
    supervisorName?: string | null;
    supervisorPhone?: string | null;
  };
}) {
  const { users, session, supplierRiders } = useStore();
  // The supplier is the signed-in user (`session.user`), not a member
  // of the global `users` directory — that list holds every account on
  // the platform (customers, sellers, riders, admins). Use the session
  // user as the supervisor fallback so we don't accidentally render the
  // first admin or unrelated account whose role field is "supplier".
  const supplier = session?.user;
  const user = supplier;

  // V19 — fall back to the route row's denormalised crew before
  // showing the "Not yet assigned" / "Supplier" placeholder. The
  // route row is the durable source (captured at Add / Edit Route),
  // so a route created with crew never looks unassigned just because
  // no trip has been started yet.
  //
  // As a last resort, resolve the rider from the supplier's own
  // `supplierRiders` collection (the source of truth for the
  // supplier-owned riders). We deliberately do NOT fetch the rider
  // via a second API call: any per-rider endpoint that re-checks
  // supplier ownership could surface "Rider does not belong to this
  // supplier" as a 400, which would then mask the actual problem on
  // Route Details. Resolving locally is always safe because the
  // supplier's roster is already loaded into the store.
  const supplierRider = route.riderId
    ? supplierRiders.find((r) => r.id === route.riderId)
    : undefined;
  const riderName =
    trip?.riderName ??
    route.riderName ??
    supplierRider?.fullName ??
    "Not yet assigned";
  // V19.1 — resolve the rider phone from the route row first
  // (denormalised by the backend), then from the local supplier
  // roster, otherwise leave null. We do NOT issue a second API call
  // here — any per-rider lookup that re-checks supplier ownership
  // could surface "Rider does not belong to this supplier" as a
  // 400 and mask the real cause on Route Details.
  const riderPhone =
    route.riderPhone ?? supplierRider?.phone ?? null;
  const vehiclePlate =
    trip?.vehiclePlate ?? route.vehiclePlate ?? "Not yet assigned";
  const routeStatus = routeStatusFor(route, trip);

  return (
    <View>
      <RouteDetailsSection route={route} status={routeStatus} />
      {/*
        V19 — supervisor identity prefers the trip (per-instance),
        then the route row (durable), then the supplier themselves.
        All three layers may carry the supervisor; we pick the most
        specific.
      */}
      <SupervisorSection
        name={
          trip?.supervisorName ??
          route.supervisorName ??
          user?.fullName ??
          "Supplier"
        }
        phone={
          trip?.supervisorPhone ?? route.supervisorPhone ?? user?.phone
        }
      />
      <RiderSection
        routeName={route.name}
        trip={trip}
        fallbackName={riderName}
        fallbackVehicle={vehiclePlate}
        phone={riderPhone}
      />
      <SellersSection route={route} trip={trip} />
    </View>
  );
}

/* ---------------- private sections ---------------- */

function RouteDetailsSection({
  route,
  status,
}: {
  route: DeliveryRoute;
  status: { label: string; color: string; bg: string; icon: string };
}) {
  return (
    <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
      <SectionHeader icon="map-outline" title="Route details" />
      <Card>
        <View style={styles.routeTopRow}>
          <View>
            <Text style={styles.routeBig}>{route.name} Route</Text>
            <Text style={styles.routeSub}>
              Weekly recurrence · {route.stops.length} stops
            </Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
            <Ionicons
              name={status.icon as any}
              size={12}
              color={status.color}
            />
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <MetaChip icon="calendar-outline" text={`Every ${route.scheduleDay}`} />
          <MetaChip icon="time-outline" text={route.scheduleTime} />
          <MetaChip
            icon="location-outline"
            text={`${route.stops.length} stops`}
          />
        </View>
      </Card>
    </View>
  );
}

function SupervisorSection({
  name,
  phone,
}: {
  name: string;
  phone?: string;
}) {
  return (
    <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
      <SectionHeader
        icon="shield-checkmark-outline"
        title="Supervisor"
        subtitle="Operator of record for the route"
      />
      <Card>
        <View style={styles.personRow}>
          <View style={[styles.avatar, { backgroundColor: "#EEF2FF" }]}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.supplier} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.personName}>{name}</Text>
            <Text style={styles.personMeta}>
              Supplier · responsible for this operation
            </Text>
          </View>
          {phone ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${phone}`)}
              style={styles.callBtn}
            >
              <Ionicons
                name="call-outline"
                size={14}
                color={Colors.supplier}
              />
              <Text style={styles.callBtnText}>Call</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function RiderSection({
  routeName,
  trip,
  fallbackName,
  fallbackVehicle,
  phone,
}: {
  routeName: string;
  trip?: DeliveryTrip;
  fallbackName: string;
  fallbackVehicle: string;
  phone?: string | null;
}) {
  const name = trip?.riderName ?? fallbackName;
  const vehicle = trip?.vehiclePlate ?? fallbackVehicle;
  const isAssigned = name !== "Not yet assigned";

  return (
    <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
      <SectionHeader
        icon="bicycle-outline"
        title="Rider"
        subtitle={isAssigned ? "Will drive this route" : "Pick one in the next step"}
      />
      <Card>
        <View style={styles.personRow}>
          <View style={[styles.avatar, { backgroundColor: "#EEF2FF" }]}>
            <Ionicons name="bicycle" size={20} color={Colors.supplier} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.personName}>{name}</Text>
            <Text style={styles.personMeta}>
              Vehicle {vehicle}
            </Text>
            {!isAssigned ? (
              <View style={styles.riderHint}>
                <Ionicons
                  name="information-circle-outline"
                  size={11}
                  color={Colors.textSecondary}
                />
                <Text style={styles.riderHintText}>
                  You'll select the rider and vehicle on the next step
                  when starting the {routeName} route.
                </Text>
              </View>
            ) : null}
          </View>
          {isAssigned && phone ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${phone}`)}
              style={styles.callBtn}
            >
              <Ionicons
                name="call-outline"
                size={14}
                color={Colors.supplier}
              />
              <Text style={styles.callBtnText}>Call</Text>
            </TouchableOpacity>
          ) : isAssigned ? (
            <View style={styles.assignedPill}>
              <Ionicons
                name="checkmark-circle"
                size={12}
                color={Colors.success}
              />
              <Text style={styles.assignedPillText}>Assigned</Text>
            </View>
          ) : (
            <View style={styles.pendingPill}>
              <Ionicons name="time-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.pendingPillText}>Pending</Text>
            </View>
          )}
        </View>
      </Card>
    </View>
  );
}

function SellersSection({
  route,
  trip,
}: {
  route: DeliveryRoute;
  trip?: DeliveryTrip;
}) {
  const { users } = useStore();
  const stops = trip?.stops ?? route.stops;
  const total = stops.length;

  return (
    <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
      <SectionHeader
        icon="people-outline"
        title="Sellers"
        rightBadge={`${total} total`}
      />
      <Card>
        {stops.length === 0 ? (
          <Text style={styles.emptySellers}>
            No sellers assigned to this route.
          </Text>
        ) : (
          stops.map((s, idx) => {
            const seller = users.find((u) => u.id === s.sellerId);
            return (
              <View
                key={s.sellerId}
                style={[
                  styles.sellerRow,
                  idx === stops.length - 1 ? null : styles.sellerRowDivider,
                ]}
              >
                <View style={styles.sellerSeq}>
                  <Text style={styles.sellerSeqText}>{s.sequence}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sellerName}>{s.sellerName}</Text>
                  <Text style={styles.sellerAddress} numberOfLines={2}>
                    {s.address}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  rightBadge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  rightBadge?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name={icon} size={14} color={Colors.supplier} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {rightBadge ? (
        <View style={styles.rightBadge}>
          <Text style={styles.rightBadgeText}>{rightBadge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MetaChip({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.metaChip}>
      <Ionicons name={icon} size={11} color={Colors.supplier} />
      <Text style={styles.metaChipText}>{text}</Text>
    </View>
  );
}

function routeStatusFor(
  route: DeliveryRoute,
  trip?: DeliveryTrip
): { label: string; color: string; bg: string; icon: string } {
  if (trip && trip.status !== "completed") {
    return {
      label: "Active",
      color: Colors.danger,
      bg: "#FEE2E2",
      icon: "play-circle",
    };
  }
  if (route.active) {
    return {
      label: "Ready",
      color: Colors.success,
      bg: "#CCFBF1",
      icon: "checkmark-circle",
    };
  }
  return {
    label: "Paused",
    color: Colors.textMuted,
    bg: Colors.surfaceMuted,
    icon: "pause-circle",
  };
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  routeTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  routeBig: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  routeSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  metaRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: Spacing.sm,
    flexWrap: "wrap",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  metaChipText: {
    color: Colors.supplier,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  sectionSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "600",
    marginTop: 4,
    marginLeft: 20,
  },
  rightBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  rightBadgeText: {
    color: Colors.supplier,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  personName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  personMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.supplier,
  },
  callBtnText: {
    color: Colors.supplier,
    fontSize: FontSize.xs,
    fontWeight: "800",
  },
  riderHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginTop: Spacing.xs,
  },
  riderHintText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: "600",
  },
  assignedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: "#CCFBF1",
  },
  assignedPillText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: "800",
  },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
  },
  pendingPillText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
  },
  sellerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
  },
  sellerRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sellerSeq: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  sellerSeqText: {
    color: Colors.supplier,
    fontWeight: "800",
    fontSize: FontSize.xs,
  },
  sellerName: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  sellerAddress: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: 2,
    fontWeight: "600",
  },
  emptySellers: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: Spacing.sm,
  },
});
