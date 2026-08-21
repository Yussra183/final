/**
 * src/components/supplier/EditRouteSheet.tsx
 *
 * V19 — Edit Route modal. Same five blocks as AddRouteSheet
 * (Route / Supervisor / Rider / Vehicle / Sellers) but pre-populated
 * from the supplied {@link DeliveryRoute}. Saves via the store's
 * server-backed `updateRouteDetails` (PATCH /api/routes/{id}) plus a
 * separate `setRouteStops` call (PUT /api/routes/{id}/stops) so the
 * stop order is editable too.
 *
 * Mounted from `app/(supplier)/operations.tsx` → RouteDetailsTab via
 * an "Edit route" affordance so the supplier can change the crew
 * without re-creating the route.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../../constants/colors";
import { AppButton } from "../AppButton";
import { Card } from "../Card";
import { Sheet } from "../Sheet";
import { useStore } from "../../store/StoreContext";
import {
  DeliveryDay,
  DeliveryRoute,
  SellerProfile,
} from "../../../constants/types";

const DAYS: DeliveryDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Mirrors backend SupplierLogisticsService.validateSupervisor.
const PHONE_RE = /^[+]?[0-9 ()\-]{6,30}$/;

type Errors = {
  name?: string;
  time?: string;
  sellers?: string;
  supervisorName?: string;
  supervisorPhone?: string;
  rider?: string;
  vehicle?: string;
  submit?: string;
};

export function EditRouteSheet({
  visible,
  route,
  onClose,
  onSaved,
}: {
  visible: boolean;
  route: DeliveryRoute;
  onClose: () => void;
  onSaved: (route: DeliveryRoute) => void;
}) {
  const {
    sellers,
    vehicles,
    supplierRiders,
    updateRouteDetails,
    setRouteStops,
  } = useStore();

  const [name, setName] = useState(route.name);
  const [day, setDay] = useState<DeliveryDay>(route.scheduleDay);
  const [time, setTime] = useState(route.scheduleTime);
  const [supervisorName, setSupervisorName] = useState(
    route.supervisorName ?? "",
  );
  const [supervisorPhone, setSupervisorPhone] = useState(
    route.supervisorPhone ?? "",
  );
  const [pickedRiderId, setPickedRiderId] = useState<string | null>(
    route.riderId ?? null,
  );
  const [pickedVehicleId, setPickedVehicleId] = useState<string | null>(
    route.vehicleId ?? null,
  );
  const [pickedIds, setPickedIds] = useState<string[]>(
    route.stops.map((s) => s.sellerId),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  // Re-hydrate every time a different route is opened so editing a
  // second route doesn't carry the first route's stale state.
  useEffect(() => {
    if (!visible) return;
    setName(route.name);
    setDay(route.scheduleDay);
    setTime(route.scheduleTime);
    setSupervisorName(route.supervisorName ?? "");
    setSupervisorPhone(route.supervisorPhone ?? "");
    setPickedRiderId(route.riderId ?? null);
    setPickedVehicleId(route.vehicleId ?? null);
    setPickedIds(route.stops.map((s) => s.sellerId));
    setErrors({});
    setSubmitting(false);
  }, [visible, route]);

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
  const pickedDetails = useMemo(
    () =>
      pickedIds
        .map((id) => eligible.find((s) => s.sellerId === id))
        .filter(Boolean) as SellerProfile[],
    [pickedIds, eligible],
  );

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
    const nextErrors: Errors = {};
    if (!name.trim()) nextErrors.name = "Give the route a name.";
    if (!/^\d{2}:\d{2}$/.test(time)) nextErrors.time = "Time must be HH:MM.";
    if (pickedIds.length === 0)
      nextErrors.sellers = "Pick at least one seller to deliver to.";
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
      // Metadata + crew first, then stops — keeps the wire calls in
      // the same order as the backend's natural write sequence.
      const meta = await updateRouteDetails(route.id, {
        name: name.trim(),
        scheduleDay: day,
        scheduleTime: time,
        supervisorName: supervisorName.trim(),
        supervisorPhone: supervisorPhone.trim(),
        riderId: pickedRiderId,
        vehicleId: pickedVehicleId,
      });
      const withStops = await setRouteStops(route.id, pickedIds);
      onSaved({ ...meta, stops: withStops.stops, polyline: withStops.polyline });
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
    supervisorName,
    supervisorPhone,
    pickedRiderId,
    pickedVehicleId,
    route.id,
    updateRouteDetails,
    setRouteStops,
    onSaved,
    onClose,
  ]);

  return (
    <Sheet
      visible={visible}
      onClose={submitting ? () => undefined : onClose}
      title="Edit Route"
      titleRight={
        submitting ? (
          <ActivityIndicator size="small" color={Colors.supplier} />
        ) : null
      }
      snapPoints={[0.55, 0.95]}
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
                style={[styles.dayPill, active ? styles.dayPillActive : null]}
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
          title={submitting ? "Saving…" : "Save Changes"}
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

const styles = StyleSheet.create({
  fieldLabel: {
    color: Colors.textSecondary,
    fontWeight: "700",
    fontSize: FontSize.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    fontSize: FontSize.md,
  },
  inputError: { borderColor: Colors.danger },
  errorText: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  dayPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  dayPillActive: {
    backgroundColor: Colors.supplier,
    borderColor: Colors.supplier,
  },
  dayPillText: { color: Colors.text, fontWeight: "600", fontSize: FontSize.sm },
  dayPillTextActive: { color: "#FFF" },
  pickedWrap: { marginBottom: Spacing.sm },
  pickedHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  pickedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickedSeq: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.supplier,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.sm,
  },
  pickedSeqText: { color: "#FFF", fontWeight: "700", fontSize: FontSize.xs },
  pickedName: { color: Colors.text, fontWeight: "600" },
  pickedAddress: { color: Colors.textMuted, fontSize: FontSize.xs },
  pickedActions: { flexDirection: "row", gap: Spacing.xs },
  iconBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceMuted,
  },
  iconBtnDisabled: { opacity: 0.5 },
  candidateList: { marginTop: Spacing.xs },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  candidateRowPicked: {
    borderColor: Colors.success,
    backgroundColor: Colors.successSoft,
  },
  candidateName: { color: Colors.text, fontWeight: "600" },
  candidateAddress: { color: Colors.textMuted, fontSize: FontSize.xs },
});