/**
 * Supplier → Delivery Operations
 *
 * ONE main page containing THREE internal tabs:
 *
 *   [ Route Planning ] [ Route Details ] [ Start Delivery ]
 *
 * The supplier stays on this page while switching between tabs. The
 * selected route is held in shared state so picking a route in Tab 1
 * makes it visible in Tabs 2 and 3 without re-selection.
 *
 * Day picker + route list live in Tab 1. The supplier can pre-select
 * a route either by tapping it in Tab 1 (route id is shared across
 * tabs) or by deep-linking with `?routeId=...` in the URL. The
 * existing `/routes/[id]` and `/live` routes still work — they
 * redirect here with the right tab + route id in the query string.
 *
 * Route creation lives entirely inside Tab 1 (the "+ Add Route"
 * button on the Route Planning screen). It is wired to the backend
 * through the store's server-backed `createRoute`, which performs
 * {@code POST /api/routes} and (when sellers are picked)
 * {@code PUT /api/routes/{id}/stops} before the route appears in the
 * day list. The route map, the day counter, and the route details
 * tab all reflect the new route immediately.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { SidebarLayout } from "../../src/components/SidebarLayout";
import { EmptyState } from "../../src/components/EmptyState";
import { AppButton } from "../../src/components/AppButton";
import { SupplierApprovalGate } from "../../src/components/SupplierApprovalGate";
import { SegmentedTabs } from "../../src/components/SegmentedTabs";
import { LogisticsMap } from "../../src/components/LogisticsMap";
import { Sheet } from "../../src/components/Sheet";
import { RouteDetailInline } from "../../src/components/supplier/RouteDetailInline";
import { EditRouteSheet } from "../../src/components/supplier/EditRouteSheet";
import {
  DeliveryDay,
  DeliveryRoute,
  DeliveryTrip,
  SellerProfile,
} from "../../constants/types";

const DAYS: DeliveryDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type TabKey = "plan" | "details" | "start";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "plan", label: "Route Planning", icon: "map-outline" },
  { key: "details", label: "Route Details", icon: "clipboard-outline" },
  { key: "start", label: "Start Delivery", icon: "play-circle-outline" },
];

export default function SupplierOperations() {
  return (
    <SupplierApprovalGate title="Operations">
      <OperationsContent />
    </SupplierApprovalGate>
  );
}

function OperationsContent() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; routeId?: string }>();
  const { routes, getActiveTripForSupplier, session, trips } = useStore();

  // ----- Tab / route selection (shared across all three tabs) -----
  const initialTab: TabKey =
    params.tab === "details" || params.tab === "start" ? params.tab : "plan";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const initialRouteId =
    typeof params.routeId === "string" ? params.routeId : undefined;
  const [selectedRouteId, setSelectedRouteId] = useState<
    string | undefined
  >(initialRouteId);

  const selectRoute = useCallback((id: string) => {
    setSelectedRouteId(id);
  }, []);

  // ----- Day picker -----
  const [selectedDay, setSelectedDay] = useState<DeliveryDay>(
    () => initialSelectedDay(routes)
  );

  const supplierId = session?.user?.id;
  const liveTrip = supplierId ? getActiveTripForSupplier(supplierId) : undefined;
  const tripByRouteId = useMemo(() => {
    const map: Record<string, DeliveryTrip> = {};
    trips.forEach((t) => {
      if (t.status !== "completed") map[t.routeId] = t;
    });
    return map;
  }, [trips]);

  const selectedRoute = selectedRouteId
    ? routes.find((r) => r.id === selectedRouteId)
    : undefined;
  const selectedTrip = selectedRoute
    ? tripByRouteId[selectedRoute.id]
    : undefined;

  return (
    <SidebarLayout>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: Colors.background }}
        edges={["top"]}
      >
        <View style={styles.header}>
          <DrawerMenuButton />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Delivery Operations</Text>
            <Text style={styles.subtitle}>
              Plan a route, review the details, then start the delivery
            </Text>
          </View>
        </View>

        <SegmentedTabs
          tabs={TABS}
          active={activeTab}
          onChange={(k) => setActiveTab(k as TabKey)}
          accent={Colors.supplier}
          compact
        />

        {activeTab === "plan" ? (
          <RoutePlanningTab
            routes={routes}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onSelectRoute={(id) => {
              selectRoute(id);
              setActiveTab("details");
            }}
            tripByRouteId={tripByRouteId}
            onOpenLive={() => {
              setActiveTab("start");
            }}
          />
        ) : null}

        {activeTab === "details" ? (
          <RouteDetailsTab
            route={selectedRoute}
            trip={selectedTrip}
            onBackToPlan={() => setActiveTab("plan")}
          />
        ) : null}

        {activeTab === "start" ? (
          <StartDeliveryTab
            route={selectedRoute}
            trip={selectedTrip}
            onBackToPlan={() => setActiveTab("plan")}
          />
        ) : null}
      </SafeAreaView>
    </SidebarLayout>
  );
}

/* ---------------- Tab 1 — Route Planning ---------------- */

function RoutePlanningTab({
  routes,
  selectedDay,
  onSelectDay,
  onSelectRoute,
  tripByRouteId,
  onOpenLive,
}: {
  routes: DeliveryRoute[];
  selectedDay: DeliveryDay;
  onSelectDay: (d: DeliveryDay) => void;
  onSelectRoute: (id: string) => void;
  tripByRouteId: Record<string, DeliveryTrip>;
  onOpenLive: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const dayRoutes = useMemo(
    () => routes.filter((r) => r.scheduleDay === selectedDay),
    [routes, selectedDay]
  );

  const handleSaved = useCallback((newRoute: DeliveryRoute) => {
    onSelectRoute(newRoute.id);
  }, [onSelectRoute]);

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        <DayPicker
          value={selectedDay}
          onChange={onSelectDay}
          allRoutes={routes}
        />
        <View style={styles.tab1AddRow}>
          <AppButton
            title="+ Add Route"
            variant="primary"
            leftIcon={<Ionicons name="add" size={14} color="#FFF" />}
            onPress={() => setAddOpen(true)}
          />
        </View>
        <DayRouteList
          day={selectedDay}
          dayRoutes={dayRoutes}
          tripByRouteId={tripByRouteId}
          onSelectRoute={onSelectRoute}
          onOpenLive={onOpenLive}
          onAddRoute={() => setAddOpen(true)}
        />
      </ScrollView>
      <AddRouteSheet
        visible={addOpen}
        defaultDay={selectedDay}
        onClose={() => setAddOpen(false)}
        onSaved={handleSaved}
      />
    </>
  );
}

function DayPicker({
  value,
  onChange,
  allRoutes,
}: {
  value: DeliveryDay;
  onChange: (d: DeliveryDay) => void;
  allRoutes: DeliveryRoute[];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dayPicker}
    >
      {DAYS.map((d) => {
        const count = allRoutes.filter(
          (r) => r.scheduleDay === d && r.active
        ).length;
        const active = d === value;
        return (
          <TouchableOpacity
            key={d}
            activeOpacity={0.85}
            onPress={() => onChange(d)}
            style={
              [styles.dayChip, active ? styles.dayChipActive : null] as any
            }
          >
            <Text
              style={[
                styles.dayChipText,
                active ? styles.dayChipTextActive : null,
              ]}
            >
              {d}
            </Text>
            <View
              style={[
                styles.dayChipCount,
                active && styles.dayChipCountActive,
              ]}
            >
              <Text
                style={[
                  styles.dayChipCountText,
                  active && styles.dayChipCountTextActive,
                ]}
              >
                {count}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function DayRouteList({
  day,
  dayRoutes,
  tripByRouteId,
  onSelectRoute,
  onOpenLive,
  onAddRoute,
}: {
  day: DeliveryDay;
  dayRoutes: DeliveryRoute[];
  tripByRouteId: Record<string, DeliveryTrip>;
  onSelectRoute: (id: string) => void;
  onOpenLive: () => void;
  onAddRoute: () => void;
}) {
  if (dayRoutes.length === 0) {
    return (
      <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
        <EmptyState
          iconName="calendar-outline"
          title={`No routes for ${day} yet`}
          message="Use the Add Route button to plan a new route for this day."
          action={
            <AppButton
              title="+ Add Route"
              variant="primary"
              style={{ marginTop: Spacing.md }}
              leftIcon={<Ionicons name="add" size={14} color="#FFF" />}
              onPress={onAddRoute}
            />
          }
        />
      </ScrollView>
    );
  }
  return (
    <ScrollView
      contentContainerStyle={{
        padding: Spacing.lg,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.xxl,
      }}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderRow}>
          <Ionicons name="calendar" size={16} color={Colors.supplier} />
          <Text style={styles.sectionTitle}>{day}</Text>
        </View>
        <View style={styles.sectionCount}>
          <Text style={styles.sectionCountText}>
            {dayRoutes.length} route{dayRoutes.length === 1 ? "" : "s"} planned
          </Text>
        </View>
      </View>
      {dayRoutes.map((r) => {
        const liveTrip = tripByRouteId[r.id];
        return (
          <RoutePlanCard
            key={r.id}
            route={r}
            liveTrip={liveTrip}
            onPress={() => onSelectRoute(r.id)}
            onOpenLive={onOpenLive}
          />
        );
      })}
    </ScrollView>
  );
}

function RoutePlanCard({
  route,
  liveTrip,
  onPress,
  onOpenLive,
}: {
  route: DeliveryRoute;
  liveTrip?: DeliveryTrip;
  onPress: () => void;
  onOpenLive: () => void;
}) {
  return (
    <Card style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          style={styles.routeHeaderTouch}
        >
          <View style={styles.routeIconBox}>
            <Ionicons name="map-outline" size={20} color={Colors.supplier} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.routeName}>{route.name} Route</Text>
            <View style={styles.routeMetaRow}>
              <Ionicons
                name="time-outline"
                size={12}
                color={Colors.textSecondary}
              />
              <Text style={styles.routeMeta}>{route.scheduleTime}</Text>
              <View style={styles.routeMetaDivider} />
              <Ionicons
                name="location-outline"
                size={12}
                color={Colors.textSecondary}
              />
              <Text style={styles.routeMeta}>
                {route.stops.length} stops
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
      {route.stops.length > 0 ? (
        <View style={styles.stopsPreview}>
          {route.stops.slice(0, 3).map((s) => (
            <View key={s.sellerId} style={styles.stopPreviewRow}>
              <View style={styles.stopPreviewSeq}>
                <Text style={styles.stopPreviewSeqText}>{s.sequence}</Text>
              </View>
              <Text style={styles.stopPreviewName} numberOfLines={1}>
                {s.sellerName}
              </Text>
            </View>
          ))}
          {route.stops.length > 3 ? (
            <Text style={styles.stopPreviewMore}>
              +{route.stops.length - 3} more stop
              {route.stops.length - 3 === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.routeFooter}>
        <AppButton
          title="View"
          variant="outline"
          onPress={onPress}
          style={styles.cardBtn}
        />
        {liveTrip ? (
          <AppButton
            title="Resume"
            variant="primary"
            leftIcon={<Ionicons name="navigate" size={14} color="#FFF" />}
            onPress={() => {
              onPress();
              onOpenLive();
            }}
            style={styles.cardBtn}
          />
        ) : null}
      </View>
    </Card>
  );
}

/* ---------------- Add Route sheet ---------------- */

type AddRouteErrors = {
  name?: string;
  time?: string;
  sellers?: string;
  supervisorName?: string;
  supervisorPhone?: string;
  rider?: string;
  vehicle?: string;
  submit?: string;
};

// Mirrors the backend's
// `SupplierLogisticsService.validateSupervisor` regex so the supplier
// gets the same message client-side and server-side.
const PHONE_RE = /^[+]?[0-9 ()\-]{6,30}$/;

/**
 * Modal sheet that lets the supplier create a route from the Route
 * Planning tab. The save button is wired to the store's server-backed
 * `createRoute`, which calls {@code POST /api/routes} and (when
 * sellers are picked) {@code PUT /api/routes/{id}/stops}. The
 * resulting route is appended to the local routes list, so the day
 * counter and the map on the next tab reflect it immediately.
 *
 * Sellers are loaded from the store's `sellers` slice (which is
 * populated from {@code GET /api/sellers} on app start and refreshed
 * whenever the supplier edits their own seller). Only sellers with
 * valid coordinates (`lat` + `lng` set, `locationStatus === "OK"`)
 * are eligible — anything else is filtered out so the backend can't
 * reject the route on save.
 */
function AddRouteSheet({
  visible,
  defaultDay,
  onClose,
  onSaved,
}: {
  visible: boolean;
  defaultDay: DeliveryDay;
  onClose: () => void;
  onSaved: (route: DeliveryRoute) => void;
}) {
  const { sellers, vehicles, supplierRiders, createRoute } = useStore();

  const [name, setName] = useState("");
  const [day, setDay] = useState<DeliveryDay>(defaultDay);
  const [time, setTime] = useState("08:00");
  // V19 — captured crew. The supplier must pick a rider and a vehicle
  // from their own roster / fleet; supervisor is free text. All three
  // fields are forwarded to `createRoute`, which persists them on the
  // route row so the same crew is reused across weekly recurrences.
  const [supervisorName, setSupervisorName] = useState("");
  const [supervisorPhone, setSupervisorPhone] = useState("");
  const [pickedRiderId, setPickedRiderId] = useState<string | null>(null);
  const [pickedVehicleId, setPickedVehicleId] = useState<string | null>(null);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<AddRouteErrors>({});

  // Reset state every time the sheet opens so the next open starts
  // clean (and the day defaults to whatever the supplier is looking
  // at when they tap "+ Add Route").
  React.useEffect(() => {
    if (visible) {
      setName("");
      setDay(defaultDay);
      setTime("08:00");
      setSupervisorName("");
      setSupervisorPhone("");
      setPickedRiderId(null);
      setPickedVehicleId(null);
      setPickedIds([]);
      setErrors({});
      setSubmitting(false);
    }
  }, [visible, defaultDay]);

  const eligible: SellerProfile[] = useMemo(
    () =>
      sellers.filter(
        (s) =>
          typeof s.lat === "number" &&
          typeof s.lng === "number" &&
          (s.locationStatus ?? "OK") === "OK",
      ),
    [sellers],
  );

  const pickedSet = useMemo(() => new Set(pickedIds), [pickedIds]);
  const pickedDetails = useMemo(() => {
    return pickedIds
      .map((id) => eligible.find((s) => s.sellerId === id))
      .filter(Boolean) as SellerProfile[];
  }, [pickedIds, eligible]);

  const toggleSeller = useCallback((id: string) => {
    setPickedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const moveSeller = useCallback((idx: number, dir: -1 | 1) => {
    setPickedIds((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  }, []);

  const removeSeller = useCallback((id: string) => {
    setPickedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const handleSave = useCallback(async () => {
    const nextErrors: AddRouteErrors = {};
    if (!name.trim()) nextErrors.name = "Give the route a name.";
    if (!/^\d{2}:\d{2}$/.test(time)) nextErrors.time = "Time must be HH:MM.";
    if (pickedIds.length === 0)
      nextErrors.sellers = "Pick at least one seller to deliver to.";
    // V19 — captured crew must be filled in. The backend's
    // `SupplierLogisticsService.validateSupervisor` rejects an empty
    // name or an invalid phone, so we mirror that here so the supplier
    // gets the message before the round-trip.
    if (!supervisorName.trim()) {
      nextErrors.supervisorName = "Supervisor name is required.";
    }
    if (!supervisorPhone.trim()) {
      nextErrors.supervisorPhone = "Supervisor phone is required.";
    } else if (!PHONE_RE.test(supervisorPhone.trim())) {
      nextErrors.supervisorPhone = "Enter a valid phone number.";
    }
    if (!pickedRiderId) {
      nextErrors.rider = "Pick a rider from your company.";
    }
    if (!pickedVehicleId) {
      nextErrors.vehicle = "Pick a vehicle from your fleet.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      // Build the stops locally so the store's createRoute can forward
      // them. We carry lat/lng through so the in-memory polyline is
      // populated before the server response returns; the server
      // resolves its own copy from the seller profile.
      const stops = pickedDetails.map((s, i) => ({
        sellerId: s.sellerId,
        sellerName: s.businessName || s.sellerName,
        address: s.location,
        lat: s.lat as number,
        lng: s.lng as number,
        sequence: i + 1,
        status: "scheduled" as const,
      }));
      const created = await createRoute({
        name: name.trim(),
        scheduleDay: day,
        scheduleTime: time,
        active: true,
        stops,
        // V19 — forward the captured crew. The backend re-validates
        // ownership (`requireOwnRider` / `requireOwnActiveVehicle`) so
        // a foreign id typed into the picker would be rejected with 400
        // before any row is written.
        supervisorName: supervisorName.trim(),
        supervisorPhone: supervisorPhone.trim(),
        riderId: pickedRiderId,
        vehicleId: pickedVehicleId,
      });
      onSaved(created);
      onClose();
    } catch (err) {
      setErrors({
        submit:
          (err as Error)?.message ??
          "Could not save the route. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    day,
    time,
    pickedIds,
    pickedDetails,
    supervisorName,
    supervisorPhone,
    pickedRiderId,
    pickedVehicleId,
    createRoute,
    onSaved,
    onClose,
  ]);

  return (
    <Sheet
      visible={visible}
      onClose={submitting ? () => undefined : onClose}
      title="Add Route"
      titleRight={
        submitting ? <ActivityIndicator size="small" color={Colors.supplier} /> : null
      }
      snapPoints={[0.55, 0.92]}
      initialSnap={1}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
      >
        <Text style={styles.fieldLabel}>Route name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Tunguu Route"
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, errors.name ? styles.inputError : null]}
        />
        {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}

        <Text style={styles.fieldLabel}>Day</Text>
        <View style={styles.dayRow}>
          {DAYS.map((d) => {
            const active = d === day;
            return (
              <TouchableOpacity
                key={d}
                activeOpacity={0.85}
                onPress={() => setDay(d)}
                style={[
                  styles.dayPill,
                  active ? styles.dayPillActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.dayPillText,
                    active ? styles.dayPillTextActive : null,
                  ]}
                >
                  {d}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Time</Text>
        <TextInput
          value={time}
          onChangeText={setTime}
          placeholder="HH:MM"
          placeholderTextColor={Colors.textMuted}
          style={[styles.input, errors.time ? styles.inputError : null]}
        />
        {errors.time ? <Text style={styles.errorText}>{errors.time}</Text> : null}

        {/* V19 — Supervisor (free text) + Rider + Vehicle pickers.
            Persisted with the route so the same crew is reused for
            every weekly recurrence. */}

        <Text style={styles.fieldLabel}>Supervisor name</Text>
        <TextInput
          value={supervisorName}
          onChangeText={setSupervisorName}
          placeholder="e.g. Ahmed Salum"
          placeholderTextColor={Colors.textMuted}
          style={[
            styles.input,
            errors.supervisorName ? styles.inputError : null,
          ]}
        />
        {errors.supervisorName ? (
          <Text style={styles.errorText}>{errors.supervisorName}</Text>
        ) : null}

        <Text style={styles.fieldLabel}>Supervisor phone</Text>
        <TextInput
          value={supervisorPhone}
          onChangeText={setSupervisorPhone}
          placeholder="+255 7XX XXX XXX"
          placeholderTextColor={Colors.textMuted}
          keyboardType="phone-pad"
          style={[
            styles.input,
            errors.supervisorPhone ? styles.inputError : null,
          ]}
        />
        {errors.supervisorPhone ? (
          <Text style={styles.errorText}>{errors.supervisorPhone}</Text>
        ) : null}

        <Text style={styles.fieldLabel}>
          Rider ({supplierRiders.length} in your company)
        </Text>
        {supplierRiders.length === 0 ? (
          <Text style={styles.pickedHint}>
            No riders are assigned to your company yet. Open Fleet → Riders
            and turn on "Assign to my company" before continuing.
          </Text>
        ) : (
          <View style={styles.candidateList}>
            {supplierRiders.map((r) => {
              const picked = pickedRiderId === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.85}
                  onPress={() => setPickedRiderId(picked ? null : r.id)}
                  style={[
                    styles.candidateRow,
                    picked ? styles.candidateRowPicked : null,
                  ]}
                >
                  <Ionicons
                    name={picked ? "checkmark-circle" : "person-circle-outline"}
                    size={18}
                    color={picked ? Colors.success : Colors.supplier}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {r.fullName || "Unnamed rider"}
                    </Text>
                    <Text style={styles.candidateAddress} numberOfLines={1}>
                      {r.phone || r.licenseNo || "—"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {errors.rider ? <Text style={styles.errorText}>{errors.rider}</Text> : null}

        <Text style={styles.fieldLabel}>
          Vehicle ({vehicles.filter((v) => v.active).length} active)
        </Text>
        {vehicles.filter((v) => v.active).length === 0 ? (
          <Text style={styles.pickedHint}>
            No active vehicles. Add one from Fleet → Vehicles before
            continuing.
          </Text>
        ) : (
          <View style={styles.candidateList}>
            {vehicles
              .filter((v) => v.active)
              .map((v) => {
                const picked = pickedVehicleId === v.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    activeOpacity={0.85}
                    onPress={() => setPickedVehicleId(picked ? null : v.id)}
                    style={[
                      styles.candidateRow,
                      picked ? styles.candidateRowPicked : null,
                    ]}
                  >
                    <Ionicons
                      name={picked ? "checkmark-circle" : "car-outline"}
                      size={18}
                      color={picked ? Colors.success : Colors.supplier}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateName} numberOfLines={1}>
                        {v.plate}
                      </Text>
                      <Text style={styles.candidateAddress} numberOfLines={1}>
                        {[v.model, v.capacityKg ? `${v.capacityKg} kg` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>
        )}
        {errors.vehicle ? (
          <Text style={styles.errorText}>{errors.vehicle}</Text>
        ) : null}

        <Text style={styles.fieldLabel}>
          Sellers ({pickedIds.length} picked)
        </Text>
        {pickedDetails.length > 0 ? (
          <View style={styles.pickedWrap}>
            {pickedDetails.map((s, idx) => (
              <View key={s.sellerId} style={styles.pickedRow}>
                <View style={styles.pickedSeq}>
                  <Text style={styles.pickedSeqText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickedName} numberOfLines={1}>
                    {s.businessName || s.sellerName}
                  </Text>
                  <Text style={styles.pickedAddress} numberOfLines={1}>
                    {s.location}
                  </Text>
                </View>
                <View style={styles.pickedActions}>
                  <TouchableOpacity
                    onPress={() => moveSeller(idx, -1)}
                    disabled={idx === 0}
                    style={[
                      styles.iconBtn,
                      idx === 0 ? styles.iconBtnDisabled : null,
                    ]}
                  >
                    <Ionicons
                      name="arrow-up"
                      size={14}
                      color={idx === 0 ? Colors.textMuted : Colors.supplier}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveSeller(idx, 1)}
                    disabled={idx === pickedDetails.length - 1}
                    style={[
                      styles.iconBtn,
                      idx === pickedDetails.length - 1
                        ? styles.iconBtnDisabled
                        : null,
                    ]}
                  >
                    <Ionicons
                      name="arrow-down"
                      size={14}
                      color={
                        idx === pickedDetails.length - 1
                          ? Colors.textMuted
                          : Colors.supplier
                      }
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => removeSeller(s.sellerId)}
                    style={styles.iconBtn}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={14}
                      color={Colors.danger}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.pickedHint}>
            Pick sellers below to set the stop order.
          </Text>
        )}
        {errors.sellers ? (
          <Text style={styles.errorText}>{errors.sellers}</Text>
        ) : null}

        <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
          Available sellers ({eligible.length})
        </Text>
        {eligible.length === 0 ? (
          <Text style={styles.pickedHint}>
            No sellers with saved coordinates are available right now.
            Ask your sellers to set their shop location first.
          </Text>
        ) : (
          <View style={styles.candidateList}>
            {eligible.map((s) => {
              const picked = pickedSet.has(s.sellerId);
              return (
                <TouchableOpacity
                  key={s.sellerId}
                  activeOpacity={0.85}
                  onPress={() => toggleSeller(s.sellerId)}
                  style={[
                    styles.candidateRow,
                    picked ? styles.candidateRowPicked : null,
                  ]}
                >
                  <Ionicons
                    name={picked ? "checkmark-circle" : "add-circle-outline"}
                    size={18}
                    color={picked ? Colors.success : Colors.supplier}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.candidateName} numberOfLines={1}>
                      {s.businessName || s.sellerName}
                    </Text>
                    <Text style={styles.candidateAddress} numberOfLines={1}>
                      {s.location}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {errors.submit ? (
          <Text style={[styles.errorText, { marginTop: Spacing.sm }]}>
            {errors.submit}
          </Text>
        ) : null}

        <AppButton
          title={submitting ? "Saving…" : "Save Route"}
          variant="primary"
          fullWidth
          disabled={submitting}
          leftIcon={
            submitting ? null : (
              <Ionicons name="save-outline" size={14} color="#FFF" />
            )
          }
          onPress={handleSave}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </Sheet>
  );
}

/* ---------------- Tab 2 — Route Details ---------------- */

function RouteDetailsTab({
  route,
  trip,
  onBackToPlan,
}: {
  route?: DeliveryRoute;
  trip?: DeliveryTrip;
  onBackToPlan: () => void;
}) {
  // V19 — local "edit" affordance. Mounts the EditRouteSheet at the
  // bottom of the screen so the supplier can change the crew or stop
  // order without leaving Route Details.
  const [editOpen, setEditOpen] = useState(false);

  if (!route) {
    return (
      <View style={styles.selectRouteFirst}>
        <EmptyState
          iconName="navigate-circle-outline"
          title="Select a route first"
          message="Pick a route from Route Planning to view its details."
          action={
            <AppButton
              title="Open Route Planning"
              variant="outline"
              style={{ marginTop: Spacing.md }}
              onPress={onBackToPlan}
              leftIcon={
                <Ionicons name="map-outline" size={14} color={Colors.supplier} />
              }
            />
          }
        />
      </View>
    );
  }

  const supplierPos =
    route.polyline.length > 0
      ? route.polyline[Math.floor(route.polyline.length / 2)]
      : { lat: route.stops[0]?.lat ?? 0, lng: route.stops[0]?.lng ?? 0 };

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.sm }}>
          <LogisticsMap
            stops={route.stops}
            polyline={route.polyline}
            supplier={supplierPos}
            height={200}
          />
        </View>
        <RouteDetailInline route={route} trip={trip} />
        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
          <AppButton
            title="Edit route"
            variant="outline"
            fullWidth
            leftIcon={
              <Ionicons name="create-outline" size={14} color={Colors.supplier} />
            }
            onPress={() => setEditOpen(true)}
          />
        </View>
      </ScrollView>
      <EditRouteSheet
        visible={editOpen}
        route={route}
        onClose={() => setEditOpen(false)}
        onSaved={() => setEditOpen(false)}
      />
    </>
  );
}

/* ---------------- Tab 3 — Start Delivery ---------------- */

function StartDeliveryTab({
  route,
  trip,
  onBackToPlan,
}: {
  route?: DeliveryRoute;
  trip?: DeliveryTrip;
  onBackToPlan: () => void;
}) {
  const router = useRouter();
  const { createServerTrip, startServerTrip } = useStore();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!route) {
    return (
      <View style={styles.selectRouteFirst}>
        <EmptyState
          iconName="play-circle-outline"
          title="Select a route first"
          message="Pick a route from Route Planning to start a delivery."
          action={
            <AppButton
              title="Open Route Planning"
              variant="outline"
              style={{ marginTop: Spacing.md }}
              onPress={onBackToPlan}
              leftIcon={
                <Ionicons name="map-outline" size={14} color={Colors.supplier} />
              }
            />
          }
        />
      </View>
    );
  }

  // V19 — a trip is "live" once the supplier has tapped Confirm &
  // Start. The store mirrors the server's `DeliveryTrip` onto `trip`,
  // so `status === "started"` is the source of truth.
  const tripLive = trip != null && trip.status !== "draft";

  // V19 — every row of the read-only summary prefers the live trip
  // (per-instance execution), then falls back to the route row
  // (durable crew captured at Add / Edit Route), then to a
  // placeholder. The supplier doesn't re-enter anything.
  // Supervisor always lives on the route row — the in-memory
  // `DeliveryTrip` shape carries only rider/vehicle, so supervisor
  // cannot have a per-instance override.
  const supervisorName = route.supervisorName ?? "—";
  const supervisorPhone = route.supervisorPhone ?? "";
  const riderName = trip?.riderName ?? route.riderName ?? "Not assigned";
  const vehiclePlate = trip?.vehiclePlate ?? route.vehiclePlate ?? "Not assigned";

  const handleStart = useCallback(async () => {
    if (!route.supervisorName || !route.supervisorPhone) {
      setStartError(
        "Add a supervisor name and phone on the route before starting.",
      );
      return;
    }
    if (!route.riderId || !route.vehicleId) {
      setStartError(
        "Pick a rider and a vehicle for the route before starting.",
      );
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      // Pull defaults from the route row — the durable source. The
      // backend's `SupplierTripService.createTrip` already falls back
      // to the route values too, but forwarding them explicitly keeps
      // the wire contract symmetric with the Add Route form.
      const created = await createServerTrip({
        routeId: route.id,
        riderId: route.riderId,
        vehicleId: route.vehicleId,
        supervisorName: route.supervisorName,
        supervisorPhone: route.supervisorPhone,
      });
      await startServerTrip(created.id);
    } catch (err) {
      setStartError(
        (err as Error)?.message ??
          "Could not start the trip. Please try again.",
      );
    } finally {
      setStarting(false);
    }
  }, [route, createServerTrip, startServerTrip]);

  return (
    <View style={styles.startTab}>
      <Card style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Operation summary</Text>
        <Text style={styles.summaryRow}>
          Route: <Text style={styles.summaryValue}>{route.name}</Text>
        </Text>
        <Text style={styles.summaryRow}>
          Day: <Text style={styles.summaryValue}>{route.scheduleDay}</Text>
        </Text>
        <Text style={styles.summaryRow}>
          Time: <Text style={styles.summaryValue}>{route.scheduleTime}</Text>
        </Text>
        <Text style={styles.summaryRow}>
          Stops: <Text style={styles.summaryValue}>{route.stops.length}</Text>
        </Text>

        <View style={styles.divider} />

        <Text style={styles.summaryRow}>
          Supervisor:{" "}
          <Text style={styles.summaryValue}>{supervisorName}</Text>
          {supervisorPhone ? (
            <Text style={styles.summaryMeta}> · {supervisorPhone}</Text>
          ) : null}
        </Text>
        <Text style={styles.summaryRow}>
          Rider: <Text style={styles.summaryValue}>{riderName}</Text>
        </Text>
        <Text style={styles.summaryRow}>
          Vehicle: <Text style={styles.summaryValue}>{vehiclePlate}</Text>
        </Text>

        {tripLive ? (
          <Text style={styles.startHint}>
            Trip is live. Sellers on this route can now see your real-time
            position; open Live Delivery to broadcast GPS.
          </Text>
        ) : (
          <Text style={styles.startHint}>
            Tap “Confirm & Start Delivery” to snapshot the route stops into
            a trip and switch the seller-side tracking channel on.
          </Text>
        )}
      </Card>

      {startError ? (
        <Text style={styles.startError}>{startError}</Text>
      ) : null}

      {tripLive ? (
        <AppButton
          title="Open Live Delivery"
          variant="primary"
          fullWidth
          leftIcon={<Ionicons name="navigate" size={14} color="#FFF" />}
          onPress={() => router.push("/(supplier)/live" as any)}
          style={{ marginTop: Spacing.md }}
        />
      ) : (
        <AppButton
          title={starting ? "Starting…" : "Confirm & Start Delivery"}
          variant="primary"
          fullWidth
          disabled={starting}
          leftIcon={
            starting ? null : (
              <Ionicons name="play-circle" size={14} color="#FFF" />
            )
          }
          onPress={handleStart}
          style={{ marginTop: Spacing.md }}
        />
      )}
    </View>
  );
}

/* ---------------- helpers ---------------- */

function initialSelectedDay(routes: DeliveryRoute[]): DeliveryDay {
  const plannedDays = new Set(
    routes.filter((r) => r.active).map((r) => r.scheduleDay)
  );
  const today = todayDeliveryDay();
  if (plannedDays.has(today)) return today;
  return DAYS.find((d) => plannedDays.has(d)) ?? today;
}

function todayDeliveryDay(): DeliveryDay {
  const map: DeliveryDay[] = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
  ];
  return map[new Date().getDay()];
}

/* ---------------- styles ---------------- */

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
  dayPicker: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 6,
  },
  dayChip: {
    width: 56,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayChipActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
  },
  dayChipText: {
    fontWeight: "800",
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  dayChipTextActive: { color: "#FFF" },
  dayChipCount: {
    marginTop: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  dayChipCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  dayChipCountText: {
    fontSize: 9,
    fontWeight: "800",
    color: Colors.supplier,
  },
  dayChipCountTextActive: { color: "#FFF" },
  tab1AddRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  sectionCount: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: "#EEF2FF",
  },
  sectionCountText: {
    fontSize: 10,
    fontWeight: "800",
    color: Colors.supplier,
    letterSpacing: 0.4,
  },
  routeCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  routeHeaderTouch: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  routeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  routeName: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  routeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  routeMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  routeMetaDivider: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textSecondary,
    marginHorizontal: 4,
  },
  stopsPreview: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 6,
  },
  stopPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stopPreviewSeq: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
  },
  stopPreviewSeqText: {
    color: Colors.supplier,
    fontWeight: "800",
    fontSize: 10,
  },
  stopPreviewName: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  stopPreviewMore: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginLeft: 30,
    marginTop: 2,
  },
  routeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cardBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  selectRouteFirst: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: "center",
  },
  startTab: {
    padding: Spacing.lg,
  },
  summaryCard: {
    padding: Spacing.md,
  },
  summaryTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  summaryRow: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
    marginTop: 2,
  },
  summaryValue: {
    color: Colors.text,
    fontWeight: "800",
  },
  startHint: {
    marginTop: Spacing.md,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  // V19 — visual divider between the route metadata and the captured
  // crew block on the Start Delivery summary card.
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  // V19 — phone shown right after the supervisor name on the same
  // row (lighter weight so the name still dominates).
  summaryMeta: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  startError: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
  },

  /* Add Route sheet styles */
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    backgroundColor: Colors.surface,
    fontSize: FontSize.sm,
    fontWeight: "700",
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    fontWeight: "700",
    marginTop: 4,
  },
  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dayPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dayPillActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
  },
  dayPillText: {
    color: Colors.text,
    fontWeight: "800",
    fontSize: FontSize.xs,
  },
  dayPillTextActive: { color: "#FFF" },
  pickedWrap: {
    gap: Spacing.xs,
  },
  pickedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: "#EEF2FF",
  },
  pickedSeq: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.supplier,
    alignItems: "center",
    justifyContent: "center",
  },
  pickedSeqText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 11,
  },
  pickedName: {
    color: Colors.text,
    fontWeight: "800",
    fontSize: FontSize.sm,
  },
  pickedAddress: {
    color: Colors.textSecondary,
    fontWeight: "600",
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  pickedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconBtnDisabled: {
    opacity: 0.4,
  },
  pickedHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  candidateList: {
    gap: 4,
  },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  candidateRowPicked: {
    borderColor: Colors.success,
    backgroundColor: "#ECFDF5",
  },
  candidateName: {
    color: Colors.text,
    fontWeight: "800",
    fontSize: FontSize.sm,
  },
  candidateAddress: {
    color: Colors.textSecondary,
    fontWeight: "600",
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
