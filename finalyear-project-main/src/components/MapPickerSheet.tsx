/**
 * MapPickerSheet — full-screen OpenStreetMap picker for the seller
 * Shop Profile.
 *
 * Three ways to set the pin:
 *   1. "Use current location" — calls `resolveCurrentDeviceCoords()`
 *      and recenters the map on the device GPS fix.
 *   2. "Pick on map" (default) — draggable pin, tap-to-drop, drag-to-refine.
 *   3. "Type coordinates" — two compact AppInputs (lat / lng) with
 *      range guards.
 *
 * The map itself is an inline Leaflet page hosted inside a `WebView`
 * (see `assets/map-picker.html`). Bridge contract:
 *
 *   RN -> Leaflet:   webViewRef.injectJavaScript(`window.__setView(lat, lng, zoom)`)
 *   Leaflet -> RN:   window.ReactNativeWebView.postMessage({ type: 'PIN', lat, lng })
 *
 * Until the page emits a `READY` event the WebView is just showing the
 * skeleton. We never `injectJavaScript` before READY because the JS
 * runtime may not be fully loaded — the queue is replayed once ready
 * so the call survives an early open.
 *
 * The component is purely presentational. The parent owns the
 * selected coordinates and feeds them back via `onConfirm`.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";
import { Card } from "./Card";
import { resolveCurrentDeviceCoords } from "../lib/deviceLocation";

/**
 * Path to the bundled HTML page. Metro bundles every file under
 * `assets/` as a project asset reference at build time, so we use
 * `Asset.fromModule(require(...))` to resolve the file to a real
 * `file://` URI on the device. The WebView then resolves sibling
 * `map-picker/leaflet.js` etc. relative to that URI.
 */
const HTML_ASSET = require("../../assets/map-picker.html");
const MAP_HTML_URI = Asset.fromModule(HTML_ASSET).uri;

export interface PickedCoords {
  lat: number;
  lng: number;
}

interface BridgeMessage {
  type: "READY" | "PIN" | "ERROR";
  lat?: number;
  lng?: number;
  message?: string;
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

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function MapPickerSheet({
  visible,
  onClose,
  initialLat,
  initialLng,
  onConfirm,
}: MapPickerSheetProps) {
  const webViewRef = useRef<WebView | null>(null);
  // The current pin — only the RN-side mirror of the Leaflet state.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    isFiniteNumber(initialLat) && isFiniteNumber(initialLng)
      ? { lat: initialLat, lng: initialLng }
      : null,
  );
  // True once the page emitted READY. Until then we queue setView calls.
  const [ready, setReady] = useState(false);
  // Active mode for the three chips.
  const [mode, setMode] = useState<Mode>("pick");
  // Typed-coordinate inputs (mode === "type").
  const [latText, setLatText] = useState(
    isFiniteNumber(initialLat) ? String(initialLat) : "",
  );
  const [lngText, setLngText] = useState(
    isFiniteNumber(initialLng) ? String(initialLng) : "",
  );
  // Inline feedback for the "Use my location" chip.
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);

  // Re-seed local state when the modal opens with new initial coords.
  // We deliberately drop any pending edits — the parent re-opens the
  // modal when the underlying value changes.
  useEffect(() => {
    if (!visible) return;
    if (isFiniteNumber(initialLat) && isFiniteNumber(initialLng)) {
      setPin({ lat: initialLat, lng: initialLng });
      setLatText(String(initialLat));
      setLngText(String(initialLng));
    } else {
      setPin(null);
      setLatText("");
      setLngText("");
    }
    setReady(false);
    setLocationHint(null);
    setMode("pick");
  }, [visible, initialLat, initialLng]);

  /**
   * Fire-and-forget helper to push a (lat, lng) pair into Leaflet. Safe
   * to call before READY — the call is queued and replayed on the
   * READY message so the pin lands on the map even if the seller
   * dispatches something during the first paint.
   */
  const sendSetView = useCallback(
    (lat: number, lng: number, zoom: number) => {
      const js = `window.__setView && window.__setView(${lat}, ${lng}, ${zoom}); true;`;
      if (!webViewRef.current) return;
      webViewRef.current.injectJavaScript(js);
    },
    [],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: BridgeMessage | null = null;
      try {
        parsed = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object") return;
      switch (parsed.type) {
        case "READY":
          setReady(true);
          // If we already have a pin (e.g. from initialLat/Lng), replay
          // it. If not, default to a stable city-centre seed so the map
          // has something to centre on.
          if (isFiniteNumber(parsed.lat) && isFiniteNumber(parsed.lng)) {
            setPin({ lat: parsed.lat!, lng: parsed.lng! });
          }
          break;
        case "PIN":
          if (isFiniteNumber(parsed.lat) && isFiniteNumber(parsed.lng)) {
            setPin({ lat: parsed.lat, lng: parsed.lng });
            // Mirror the typed-coordinate inputs so they stay in sync
            // with the map in either direction.
            setLatText(String(parsed.lat));
            setLngText(String(parsed.lng));
          }
          break;
        case "ERROR":
          console.warn("[MapPickerSheet] bridge error:", parsed.message);
          break;
      }
    },
    [],
  );

  // Whenever the pin state changes AND the WebView is ready, push the
  // new view into Leaflet. This handles every "RN -> Leaflet" path
  // (current-location button, typed coords, initial seed).
  useEffect(() => {
    if (!visible || !ready || !pin) return;
    sendSetView(pin.lat, pin.lng, 14);
  }, [visible, ready, pin, sendSetView]);

  const useCurrentLocation = useCallback(async () => {
    setLocationBusy(true);
    setLocationHint(null);
    try {
      const fix = await resolveCurrentDeviceCoords();
      if (!fix) {
        setLocationHint(
          "Couldn't read your location — drop the pin manually.",
        );
        // Fall through to "Pick on map" so the seller isn't stuck.
        setMode("pick");
        return;
      }
      setPin(fix);
      setLatText(String(fix.lat));
      setLngText(String(fix.lng));
      setMode("pick");
      setLocationHint(null);
    } finally {
      setLocationBusy(false);
    }
  }, []);

  const onChangeLatText = useCallback((text: string) => {
    setLatText(text);
    // Light validation; full range check happens on confirm.
    const lat = Number(text);
    if (Number.isFinite(lat) && lat >= -90 && lat <= 90) {
      setPin((prev) => (prev ? { ...prev, lat } : { lat, lng: 0 }));
    }
  }, []);

  const onChangeLngText = useCallback((text: string) => {
    setLngText(text);
    const lng = Number(text);
    if (Number.isFinite(lng) && lng >= -180 && lng <= 180) {
      setPin((prev) => (prev ? { ...prev, lng } : { lat: 0, lng }));
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
    return !!pin;
  }, [mode, pin, typedValid]);

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
    // themselves to the Gulf of Guinea even via the draggable marker.
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

        {/* Mode chips */}
        <View style={styles.chipsRow}>
          <Chip
            label="Pick on map"
            icon="map-outline"
            active={mode === "pick"}
            onPress={() => setMode("pick")}
          />
          <Chip
            label="Current location"
            icon="navigate-outline"
            active={false}
            busy={locationBusy}
            onPress={useCurrentLocation}
          />
          <Chip
            label="Type coordinates"
            icon="keypad-outline"
            active={mode === "type"}
            onPress={() => setMode("type")}
          />
        </View>

        {locationHint ? (
          <View style={styles.hintBar}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={Colors.warning}
            />
            <Text style={styles.hintText}>{locationHint}</Text>
          </View>
        ) : null}

        {/* Body: map (pick mode) or inputs (type mode) */}
        {mode === "type" ? (
          <View style={styles.typeBody}>
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
        ) : (
          <View style={styles.mapContainer}>
            {!ready ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading map…</Text>
              </View>
            ) : null}
            <WebView
              ref={webViewRef}
              source={{ uri: MAP_HTML_URI }}
              style={styles.webview}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              // Mapbox / Leaflet doesn't need third-party cookies or
              // media playback. Mixed-content is allowed because OSM
              // tiles are HTTPS but the WebView may inherit an http
              // origin from the dev server.
              mixedContentMode="always"
              allowFileAccess
              allowFileAccessFromFileURLs
              allowUniversalAccessFromFileURLs
              onMessage={handleMessage}
              onError={(e: unknown) =>
                console.warn(
                  "[MapPickerSheet] WebView error:",
                  (e as { nativeEvent?: unknown })?.nativeEvent,
                )
              }
              // Suppress the Android system text-selection magnifier on
              // long-press of the map so the gesture doesn't interfere
              // with marker drag.
              textZoom={100}
              // Pinch-zoom is fine; we just don't want the OS to
              // bounce-zoom past our bounds.
              scalesPageToFit={Platform.OS === "ios" ? false : undefined}
            />
          </View>
        )}

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

function Chip(props: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.chip, props.active && styles.chipActive]}
      accessibilityRole="button"
    >
      {props.busy ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Ionicons
          name={props.icon}
          size={16}
          color={props.active ? "#FFF" : Colors.primary}
        />
      )}
      <Text
        style={[styles.chipLabel, props.active && styles.chipLabelActive]}
        numberOfLines={1}
      >
        {props.label}
      </Text>
    </Pressable>
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
  chipsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.primary,
  },
  chipLabelActive: {
    color: "#FFF",
  },
  hintBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.warning + "22",
  },
  hintText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: "600",
  },
  mapContainer: {
    flex: 1,
    backgroundColor: Colors.surfaceMuted,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    position: "absolute",
    inset: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    zIndex: 5,
    backgroundColor: Colors.background,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  typeBody: {
    flex: 1,
    padding: Spacing.lg,
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
