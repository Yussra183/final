/**
 * Seller → Live Tracking
 *
 * Two-tab live tracking surface for the seller portal:
 *
 *   • Track Supplier — watches the supplier's delivery vehicle
 *     en route to the seller's shop, derived from the active
 *     DeliveryTrip in the store.
 *   • Track Rider    — watches the rider fulfilling a customer
 *     order for this seller, derived from the in-flight Order.
 *
 * Both tabs render the same skeleton:
 *
 *   ┌── trip summary chip ────────────────────────────┐
 *   └── LiveTrackingMap (real Google Map, or fallback) ┐
 *   └── live metric row: distance / ETA / progress %   ┐
 *   └── delivery progress timeline (5 steps)           ┐
 *   └── recent event log                               ┐
 *
 * Map rendering uses the new `LiveTrackingMap` component which
 * wraps `react-native-maps` and gracefully falls back to the
 * project's existing stylised-by-data projection when the native
 * module is unavailable (Expo Go).
 *
 * Tab bar pattern mirrors `app/seller/orders.tsx` so the visual
 * language is identical to the rest of the seller module.
 */
import React, { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Shadow, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { EmptyState } from "../../src/components/EmptyState";
import { LiveTrackingMap } from "../../src/components/LiveTrackingMap";
import {
  SUPPLIER_STEPS,
  supplierStatusColor,
  supplierStatusLabel,
  supplierStepIndex,
  useSupplierTracking,
  formatSupplierDistance,
  formatSupplierEta,
} from "../../src/hooks/useSupplierTracking";
import {
  RIDER_STEPS,
  formatRiderDistance,
  formatRiderEta,
  riderStatusColor,
  riderStatusLabel,
  riderStepIndex,
  useRiderTracking,
  type RiderStatus,
} from "../../src/hooks/useRiderTracking";
import { useStore } from "../../src/store/StoreContext";

type TabKey = "supplier" | "rider";

const TABS: {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: "supplier", label: "Track Supplier", icon: "bus-outline" },
  { key: "rider", label: "Track Rider", icon: "bicycle-outline" },
];

/* -------------------------------------------------------------------------- */
/* Stat tile                                                                 */
/* -------------------------------------------------------------------------- */

function StatTile({
  icon,
  value,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Generic status timeline                                                   */
/* -------------------------------------------------------------------------- */

function StatusTimelineRow<S extends string>({
  steps,
  currentKey,
  colorFor,
  indexOf,
}: {
  steps: { key: S; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[];
  currentKey: S;
  colorFor: (s: S) => string;
  indexOf: (s: S) => number;
}) {
  const currentIdx = indexOf(currentKey);
  return (
    <View style={styles.timeline}>
      {steps.map((step, i) => {
        const reached = i <= currentIdx;
        const isCurrent = i === currentIdx;
        const dotColor = reached ? colorFor(step.key) : Colors.border;
        return (
          <View key={String(step.key)} style={styles.timelineRow}>
            <View style={styles.timelineDotCol}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: reached ? dotColor : Colors.surfaceMuted, borderColor: dotColor },
                  isCurrent && { borderWidth: 3 },
                ]}
              >
                <Ionicons
                  name={step.icon}
                  size={12}
                  color={reached ? Colors.textInverse : Colors.textMuted}
                />
              </View>
              {i < steps.length - 1 ? (
                <View
                  style={[
                    styles.timelineLine,
                    reached && i < currentIdx && { backgroundColor: dotColor },
                  ]}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: Spacing.md }}>
              <Text
                style={[
                  styles.timelineLabel,
                  reached && { color: Colors.text },
                  isCurrent && { color: dotColor, fontWeight: "800" },
                ]}
              >
                {step.label}
              </Text>
              {isCurrent ? (
                <Text style={[styles.timelineHint, { color: dotColor }]}>In progress…</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Supplier tab                                                              */
/* -------------------------------------------------------------------------- */

function SupplierTab() {
  const {
    trip,
    myStop,
    vehiclePos,
    distanceM,
    etaSeconds,
    status,
    progress,
    routePolyline,
    events,
    active,
  } = useSupplierTracking();

  if (!trip || !myStop) {
    return (
      <EmptyState
        icon="🚚"
        title="No active supplier delivery"
        message="When the supplier dispatches a trip that includes your shop, you can track the vehicle live here."
      />
    );
  }

  const polylineForMap = routePolyline.length > 0 ? routePolyline : [vehiclePos];
  const tone = supplierStatusColor(status);

  return (
    <View style={styles.tabBody}>
      {/* Trip summary chip */}
      <View style={[styles.summaryChip, { backgroundColor: tone + "1A", borderColor: tone + "55" }]}>
        <View style={[styles.summaryIcon, { backgroundColor: tone + "33" }]}>
          <Ionicons name="bus" size={18} color={tone} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>{trip.routeName} route</Text>
          <Text style={styles.summarySub}>
            {trip.vehiclePlate} · Rider {trip.riderName}
          </Text>
        </View>
        <View style={[styles.livePill, { backgroundColor: tone + "22" }]}>
          <View style={[styles.liveDot, { backgroundColor: tone }]} />
          <Text style={[styles.liveText, { color: tone }]}>LIVE</Text>
        </View>
      </View>

      {/* Map */}
      <LiveTrackingMap
        origin={
          routePolyline.length > 0
            ? routePolyline[0]
            : { lat: myStop.lat, lng: myStop.lng }
        }
        live={vehiclePos}
        destination={{ lat: myStop.lat, lng: myStop.lng }}
        route={polylineForMap}
        liveLabel="Supplier"
        originLabel="Depot"
        destinationLabel="Your Shop"
        routeColor={Colors.primary}
        height={260}
        style={styles.mapShadow}
      />

      {/* Live metrics row */}
      <View style={styles.metricsRow}>
        <StatTile
          icon="navigate-outline"
          value={formatSupplierDistance(distanceM)}
          label="Distance"
          color={Colors.primary}
        />
        <StatTile
          icon="time-outline"
          value={formatSupplierEta(etaSeconds)}
          label="ETA"
          color={Colors.accent}
        />
        <StatTile
          icon="speedometer-outline"
          value={`${Math.round(progress * 100)}%`}
          label="Trip progress"
          color={Colors.info}
        />
      </View>

      {/* Progress bar — percent done */}
      <View style={styles.progressBarWrap}>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: tone },
            ]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: tone }]}>
          {supplierStatusLabel(status)} · {Math.round(progress * 100)}% complete
        </Text>
      </View>

      {/* Timeline */}
      <Card style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>Delivery Progress</Text>
        <StatusTimelineRow
          steps={SUPPLIER_STEPS as any}
          currentKey={status}
          colorFor={supplierStatusColor as any}
          indexOf={supplierStepIndex as any}
        />
      </Card>

      {/* Your stop info */}
      <Card style={styles.stopCard}>
        <View style={styles.stopHeader}>
          <Ionicons name="location" size={16} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Your stop on this route</Text>
        </View>
        <View style={styles.stopRow}>
          <Ionicons name="storefront" size={16} color={Colors.textSecondary} />
          <Text style={styles.stopName}>{myStop.sellerName}</Text>
        </View>
        <Text style={styles.stopAddress}>{myStop.address}</Text>
      </Card>

      {/* Recent events */}
      <Card style={styles.eventsCard}>
        <Text style={styles.sectionTitle}>Recent supplier events</Text>
        {events.length === 0 ? (
          <View style={styles.eventEmpty}>
            <Ionicons name="notifications-off-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.eventEmptyText}>No events yet — supplier just started.</Text>
          </View>
        ) : (
          events.map((e, i) => (
            <View key={`${e.at}-${i}`} style={styles.eventRow}>
              <View
                style={[
                  styles.eventBullet,
                  { backgroundColor: supplierStatusColor(e.status) },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventText}>{e.message}</Text>
                <Text style={styles.eventTime}>
                  {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          ))
        )}
        <Text
          style={[
            styles.footerHint,
            { color: active ? supplierStatusColor(status) : Colors.success },
          ]}
        >
          {active
            ? "Push notifications will fire on every key transition."
            : "This delivery has been completed."}
        </Text>
      </Card>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Rider tab                                                                 */
/* -------------------------------------------------------------------------- */

function RiderTab() {
  const {
    order,
    riderName,
    riderPhone,
    customerName,
    customerAddress,
    customerLatLng,
    shopLatLng,
    riderLatLng,
    route,
    distanceM,
    etaSeconds,
    status,
    progress,
    events,
    active,
    live,
  } = useRiderTracking();

  if (!order || !customerLatLng) {
    return (
      <EmptyState
        icon="🛵"
        title="No rider is currently delivering for you"
        message="Once you assign a rider to a customer order, they will appear here in real-time on Google Maps."
      />
    );
  }

  const tone = riderStatusColor(status as RiderStatus);
  const polylineForMap = route?.polyline ?? [shopLatLng, customerLatLng];
  // "LIVE" when the rider's GPS socket is OPEN and we've received at
  // least one fix; "Reconnecting" when the socket is in back-off;
  // otherwise we fall through to the simulator label.
  const liveBadge =
    live.connection === "open" && live.riderLatLng
      ? "GPS LIVE"
      : live.connection === "reconnecting"
        ? "Reconnecting"
        : live.connection === "open"
          ? "Connected"
          : "Connecting";

  return (
    <View style={styles.tabBody}>
      {/* Rider summary chip */}
      <View style={[styles.summaryChip, { backgroundColor: tone + "1A", borderColor: tone + "55" }]}>
        <View style={[styles.summaryIcon, { backgroundColor: tone + "33" }]}>
          <Ionicons name="bicycle" size={20} color={tone} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>Rider {riderName ?? order.riderName}</Text>
          <Text style={styles.summarySub}>
            To {customerName} · #{order.id.slice(-4).toUpperCase()}
          </Text>
        </View>
        <View style={[styles.livePill, { backgroundColor: tone + "22" }]}>
          <View style={[styles.liveDot, { backgroundColor: tone }]} />
          <Text style={[styles.liveText, { color: tone }]}>
            {liveBadge}
          </Text>
        </View>
      </View>

      {/* Map */}
      <LiveTrackingMap
        origin={shopLatLng}
        live={riderLatLng}
        destination={customerLatLng}
        route={polylineForMap}
        liveLabel="Rider"
        originLabel="Your Shop"
        destinationLabel="Customer"
        routeColor={Colors.primary}
        height={260}
        style={styles.mapShadow}
      />

      {/* Live metrics row */}
      <View style={styles.metricsRow}>
        <StatTile
          icon="navigate-outline"
          value={formatRiderDistance(distanceM)}
          label="Distance"
          color={Colors.primary}
        />
        <StatTile
          icon="time-outline"
          value={formatRiderEta(etaSeconds)}
          label="ETA"
          color={Colors.accent}
        />
        <StatTile
          icon="speedometer-outline"
          value={`${Math.round(progress * 100)}%`}
          label="Trip progress"
          color={Colors.info}
        />
      </View>

      <View style={styles.progressBarWrap}>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: tone },
            ]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: tone }]}>
          {riderStatusLabel(status as RiderStatus)} · {Math.round(progress * 100)}% complete
        </Text>
      </View>

      {/* Rider info card */}
      <Card style={styles.riderCard}>
        <View style={styles.riderHeader}>
          <View style={[styles.riderAvatar, { backgroundColor: Colors.primary + "22" }]}>
            <Ionicons name="person" size={22} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.riderName}>{riderName ?? order.riderName}</Text>
            <Text style={styles.riderSub}>
              {riderPhone ?? `Order #${order.id.slice(-4).toUpperCase()}`}
            </Text>
          </View>
          <View style={[styles.riderBadge, { backgroundColor: tone + "22" }]}>
            <Text style={[styles.riderBadgeText, { color: tone }]}>
              {riderStatusLabel(status as RiderStatus)}
            </Text>
          </View>
        </View>
        <View style={styles.riderMeta}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.riderMetaText} numberOfLines={2}>
            Delivering to {customerName} · {customerAddress}
          </Text>
        </View>
      </Card>

      {/* Timeline */}
      <Card style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>Delivery Progress</Text>
        <StatusTimelineRow
          steps={RIDER_STEPS as any}
          currentKey={status as RiderStatus}
          colorFor={riderStatusColor as any}
          indexOf={riderStepIndex as any}
        />
      </Card>

      {/* Recent events */}
      <Card style={styles.eventsCard}>
        <Text style={styles.sectionTitle}>Recent rider events</Text>
        {events.length === 0 ? (
          <View style={styles.eventEmpty}>
            <Ionicons name="notifications-off-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.eventEmptyText}>No events yet — rider is heading to the shop.</Text>
          </View>
        ) : (
          events.map((e, i) => (
            <View key={`${e.at}-${i}`} style={styles.eventRow}>
              <View
                style={[
                  styles.eventBullet,
                  { backgroundColor: riderStatusColor(e.status as RiderStatus) },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.eventText}>{e.message}</Text>
                <Text style={styles.eventTime}>
                  {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          ))
        )}
        <Text
          style={[
            styles.footerHint,
            { color: active ? riderStatusColor(status as RiderStatus) : Colors.success },
          ]}
        >
          {active
            ? "You'll be notified on pickup, near-customer, and delivery."
            : "This order has been delivered."}
        </Text>
      </Card>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Main screen                                                               */
/* -------------------------------------------------------------------------- */

export default function SellerLiveTracking() {
  const { refresh } = useStore();
  const [tab, setTab] = useState<TabKey>("supplier");
  const [refreshing, setRefreshing] = useState(false);

  // Real pull-to-refresh — the local tracking hooks derive from the store,
  // so re-hydrating the store brings in any rider/supplier updates that
  // happened in another session. The previous setTimeout(700) was a UX lie.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Live Tracking" />

      {/* Tab bar (segmented) */}
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={t.icon}
                size={18}
                color={isActive ? Colors.textInverse : Colors.textSecondary}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {tab === "supplier" ? <SupplierTab /> : <RiderTab />}
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                    */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Tabs
  tabBar: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabLabel: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textSecondary,
  },
  tabLabelActive: { color: Colors.textInverse },

  // Body
  tabBody: { gap: Spacing.md },

  // Summary chip
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  summarySub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    letterSpacing: 1,
  },

  // Map
  mapShadow: {
    ...Shadow.card,
    marginVertical: Spacing.sm,
  },

  // Metrics row
  metricsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  statTile: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    gap: 2,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Progress
  progressBarWrap: { gap: 6 },
  progressBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.surfaceMuted,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },

  // Timeline
  timelineCard: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  timeline: { paddingVertical: Spacing.xs },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  timelineDotCol: {
    alignItems: "center",
    width: 30,
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.border,
    minHeight: 20,
    marginTop: 2,
  },
  timelineLabel: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontWeight: "700",
  },
  timelineHint: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginTop: 2,
  },

  // Supplier stop card
  stopCard: { gap: 4 },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.xs,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  stopName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  stopAddress: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginLeft: 22,
    marginTop: 2,
  },

  // Rider card
  riderCard: { gap: Spacing.sm },
  riderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  riderName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  riderSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    marginTop: 2,
  },
  riderBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  riderBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: "800",
  },
  riderMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.xs,
  },
  riderMetaText: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },

  // Events
  eventsCard: { gap: Spacing.sm },
  eventEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  eventEmptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontWeight: "600",
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  eventBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  eventText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
  },
  eventTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  footerHint: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginTop: Spacing.sm,
    fontStyle: "italic",
  },
});
