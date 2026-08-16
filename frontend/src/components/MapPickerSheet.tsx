/**
 * MapPickerSheet — full-screen native picker for the seller Shop
 * Profile. Replaces the previous Leaflet-in-WebView picker so the
 * seller gets the same native Bolt-lite experience as the customer
 * Home.
 *
 * Three ways to set the pin:
 *
 *   1. "Tap on the map" — the seller taps anywhere inside Unguja
 *      and the pin drops to that coordinate. Long-press does the
 *      same on native.
 *   2. "Use current location" — the recentre FAB re-runs the
 *      device-GPS resolver and animates the camera + pin to the
 *      new fix.
 *   3. "Type coordinates" — a single FAB opens an inline panel with
 *      two compact `AppInput`s (lat / lng) with range guards.
 *
 * The map is the shared `<NearbySellersMap>` component:
 *   - Native renderer uses real Google tiles + native gestures.
 *   - Web fallback uses the canvas-grid + projected pins helper.
 *
 * The picker is purely presentational. The parent owns the chosen
 * coordinates until the modal "Save" is tapped; the picker itself
 * never persists anything.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";
import { Card } from "./Card";
import { NearbySellersMap } from "./NearbySellersMap";
import { PressableScale } from "./MicroAnimations";
import { useDeviceLocation } from "../hooks/useDeviceLocation";
import { identityColor } from "../lib/identityColor";
import { useStore } from "../store/StoreContext";

/** True when `v` is a real (non-NaN, non-infinite) number. */
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export interface PickedCoords {
  lat: number;
  lng: number;
}

interface MapPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  initialLat?: number | null;
  initialLng?: number | null;
  /**
   * Called when the seller confirms a coordinate pair. The parent
   * owns the chosen coordinates until the modal "Save" is tapped;
   * the picker itself never persists anything.
   */
  onConfirm: (coords: PickedCoords) => void;
}

type Mode = "pick" | "type";

export function MapPickerSheet({
  visible,
  onClose,
  initialLat,
  initialLng,
  onConfirm,
}: MapPickerSheetProps) {
  const { session } = useStore();
  const me = session?.user;
  const myColor = identityColor(me?.id ?? "self");

  // Live device location — drives the "You" pin and the
  // recentre-on-my-location FAB.
  const {
    coords: deviceCoords,
    refresh: refreshDevice,
    loading: deviceLoading,
  } = useDeviceLocation();

  // The current pin — the source of truth on the RN side. Initial
  // seed comes from `initialLat/Lng`; thereafter the seller drives
  // it via map taps, GPS, or typed coords.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    isFiniteNumber(initialLat) && isFiniteNumber(initialLng)
      ? { lat: initialLat!, lng: initialLng! }
      : null,
  );
  // True once the seller has explicitly chosen a pin (tap, GPS,
  // typed), or once the parent supplied an `initialLat/Lng` they're
  // editing. Prevents a seller from "confirming" the default seed
  // without ever touching the map.
  const [userInteracted, setUserInteracted] = useState(
    isFiniteNumber(initialLat) && isFiniteNumber(initialLng),
  );
  // Privacy toggle for the live "You" pin + blue dot — same as the
  // customer Home. Default ON so the seller sees themselves.
  const [showUserPin, setShowUserPin] = useState(true);
  // Tap-signal to drive the camera recentre from the FAB.
  const [recenterToken, setRecenterToken] = useState(0);
  // True while `refreshDevice()` is mid-flight (the recentre FAB
  // shows a spinner instead of the icon).
  const [refreshing, setRefreshing] = useState(false);
  // Active mode for the picker — "pick" (map) or "type" (input panel).
  const [mode, setMode] = useState<Mode>("pick");
  // Typed-coordinate inputs (mode === "type").
  const [latText, setLatText] = useState(
    isFiniteNumber(initialLat) ? String(initialLat) : "",
  );
  const [lngText, setLngText] = useState(
    isFiniteNumber(initialLng) ? String(initialLng) : "",
  );

  // Re-seed local state when the modal opens with new initial coords.
  // We deliberately drop any pending edits — the parent re-opens
  // the modal when the underlying value changes.
  useEffect(() => {
    if (!visible) return;
    if (isFiniteNumber(initialLat) && isFiniteNumber(initialLng)) {
      setPin({ lat: initialLat!, lng: initialLng! });
      setLatText(String(initialLat));
      setLngText(String(initialLng));
      // An existing pin means the seller is editing a saved shop
      // location — that's already an intentional choice, so they
      // shouldn't need to tap the map again before Confirm enables.
      setUserInteracted(true);
    } else {
      setPin(null);
      setLatText("");
      setLngText("");
      setUserInteracted(false);
    }
    setMode("pick");
  }, [visible, initialLat, initialLng]);

  // Effective map centre. Device coords win when we have a live
  // fix; otherwise the existing pin (editing an existing shop) or
  // the Zanzibar default (set inside useDeviceLocation's fallback).
  const mapCenter = useMemo(() => {
    if (isFiniteNumber(deviceCoords.lat) && isFiniteNumber(deviceCoords.lng)) {
      return { lat: deviceCoords.lat, lng: deviceCoords.lng };
    }
    if (pin) return pin;
    return { lat: deviceCoords.lat, lng: deviceCoords.lng };
  }, [deviceCoords, pin]);

  const onMapTap = useCallback(
    (coords: { lat: number; lng: number }) => {
      setPin(coords);
      setLatText(String(coords.lat));
      setLngText(String(coords.lng));
      setUserInteracted(true);
    },
    [],
  );

  const onUseCurrentLocation = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshDevice();
    } finally {
      setRefreshing(false);
    }
    // Bump the recentre token so the camera animates onto the new
    // device fix even if the watch subscription didn't fire.
    setRecenterToken((t) => t + 1);
  }, [refreshDevice]);

  const onChangeLatText = useCallback((text: string) => {
    setLatText(text);
    const lat = Number(text);
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90) {
      setPin((prev) => (prev ? { ...prev, lat } : { lat, lng: 0 }));
      setUserInteracted(true);
    }
  }, []);

  const onChangeLngText = useCallback((text: string) => {
    setLngText(text);
    const lng = Number(text);
    if (Number.isFinite(lng) && lng >= -180 && lng <= 180) {
      setPin((prev) => (prev ? { ...prev, lng } : { lat: 0, lng }));
      setUserInteracted(true);
    }
  }, []);

  const typedLat = Number(latText);
  const typedLng = Number(lngText);
  const typedValid =
    Number.isFinite(typedLat) &&
    Number.isFinite(typedLng) &&
    typedLat >= -90 &&
    typedLat <= 90 &&
    typedLng >= -180 &&
    typedLng <= 180 &&
    !(typedLat === 0 && typedLng === 0);

  const confirmEnabled = useMemo(() => {
    if (mode === "type") return typedValid;
    // Pick mode: Confirm is enabled only when the seller has moved
    // the pin through a real gesture (tap / GPS / typed) or the
    // parent seeded an initial location.
    return !!pin && userInteracted;
  }, [mode, pin, typedValid, userInteracted]);

  const handleConfirm = useCallback(() => {
    let finalPin: PickedCoords | null = null;
    if (mode === "type") {
      if (!typedValid) {
        Alert.alert(
          "Invalid coordinates",
          "Latitude must be between -90 and 90; longitude between -180 and 180. (0, 0) is not a valid shop location.",
        );
        return;
      }
      finalPin = { lat: typedLat, lng: typedLng };
    } else if (pin) {
      finalPin = pin;
    }
    if (!finalPin) return;
    // Last-mile sanity check: reject (0, 0) so a seller can never pin
    // themselves to the Gulf of Guinea even via the tap-to-drop map.
    if (finalPin.lat === 0 && finalPin.lng === 0) {
      Alert.alert(
        "Invalid pin",
        "(0, 0) is not a valid shop location. Please pick a point on land.",
      );
      return;
    }
    onConfirm(finalPin);
  }, [mode, pin, typedValid, typedLat, typedLng, onConfirm]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.root} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            onPress={onClose}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={26} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Shop Location</Text>
          <View style={styles.iconBtn} />
        </View>

        {/* Map surface */}
        <View style={styles.mapContainer}>
          <NearbySellersMap
            markers={
              pin
                ? [
                    {
                      id: "self",
                      lat: pin.lat,
                      lng: pin.lng,
                      name: "Your shop",
                      color: myColor,
                      selected: true,
                    },
                  ]
                : []
            }
            center={mapCenter}
            recenterToken={recenterToken}
            fitMode="fixed"
            includeCenterInFit={false}
            showUserPin={showUserPin}
            onMapTap={onMapTap}
            style={StyleSheet.absoluteFill}
          />

          {/* Hint overlay while device GPS is still resolving. */}
          {deviceLoading ? (
            <View style={styles.gpsHint} pointerEvents="none">
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.gpsHintText}>Locating…</Text>
            </View>
          ) : null}

          {/* FAB cluster — mirrors the customer Home pattern. */}
          <View style={styles.fabCluster}>
            <PressableScale
              onPress={() => setShowUserPin((v) => !v)}
              style={StyleSheet.flatten([
                styles.fab,
                styles.fabGhost,
                showUserPin && styles.fabGhostActive,
              ])}
              accessibilityRole="switch"
              accessibilityState={{ checked: showUserPin }}
              accessibilityLabel={
                showUserPin ? "Hide my live location" : "Show my live location"
              }
            >
              <Ionicons
                name={showUserPin ? "eye-outline" : "eye-off-outline"}
                size={20}
                color={showUserPin ? Colors.accent : Colors.primary}
              />
            </PressableScale>
            <PressableScale
              onPress={onUseCurrentLocation}
              style={StyleSheet.flatten([styles.fab, styles.fabGhost])}
              accessibilityLabel="Recentre on my location"
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="locate" size={20} color={Colors.primary} />
              )}
            </PressableScale>
            <PressableScale
              onPress={() => setMode((m) => (m === "type" ? "pick" : "type"))}
              style={StyleSheet.flatten([
                styles.fab,
                styles.fabGhost,
                mode === "type" && styles.fabGhostActive,
              ])}
              accessibilityRole="switch"
              accessibilityState={{ checked: mode === "type" }}
              accessibilityLabel={
                mode === "type" ? "Hide typed coordinates" : "Type coordinates"
              }
            >
              <Ionicons
                name="keypad-outline"
                size={20}
                color={mode === "type" ? Colors.accent : Colors.primary}
              />
            </PressableScale>
          </View>

          {/* Type-coords panel — slides over the map bottom, above
              the FAB cluster. */}
          {mode === "type" ? (
            <View style={styles.typePanel}>
              <Card>
                <Text style={styles.typeIntro}>
                  Enter the latitude and longitude of your shop. We&apos;ll
                  drop the pin at those exact coordinates.
                </Text>
                <AppInput
                  label="Latitude (-90 to 90)"
                  value={latText}
                  onChangeText={onChangeLatText}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <AppInput
                  label="Longitude (-180 to 180)"
                  value={lngText}
                  onChangeText={onChangeLngText}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {pin ? (
                  <Text style={styles.typePinPreview}>
                    📍 {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                  </Text>
                ) : null}
              </Card>
            </View>
          ) : null}
        </View>

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          {pin ? (
            <Text style={styles.bottomPin} numberOfLines={1}>
              📍 {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
            </Text>
          ) : (
            <Text style={styles.bottomPinEmpty} numberOfLines={1}>
              Tap the map to drop a pin
            </Text>
          )}
          <AppButton
            title="Confirm"
            variant="primary"
            disabled={!confirmEnabled}
            onPress={handleConfirm}
            style={styles.confirmBtn}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: Colors.surfaceMuted,
    position: "relative",
  },
  gpsHint: {
    position: "absolute",
    top: Spacing.md,
    left: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gpsHintText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: "700",
  },
  fabCluster: {
    position: "absolute",
    right: Spacing.md,
    bottom: Spacing.md,
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 10px rgba(15,118,110,0.35)",
  },
  fabGhost: {
    backgroundColor: Colors.surface,
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  },
  fabGhostActive: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  typePanel: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    // Sit above the FAB cluster: bottom padding (md) + three 52-px
    // FABs + two `sm` gaps between them + a smidge of breathing room.
    bottom: Spacing.md + 52 * 3 + Spacing.sm * 2 + Spacing.sm,
  },
  typeIntro: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },
  typePinPreview: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: "800",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  bottomPin: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "700",
  },
  bottomPinEmpty: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  confirmBtn: {
    paddingHorizontal: Spacing.lg,
  },
});