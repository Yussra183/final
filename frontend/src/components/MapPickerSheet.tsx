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
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { AppButton } from "./AppButton";
import { AppInput } from "./AppInput";
import { Card } from "./Card";
import { resolveCurrentDeviceCoords } from "../lib/deviceLocation";
import { getMaterialisedPicker } from "./mapPickerHtml";
import {
  ERROR_MESSAGES,
  isFiniteNumber,
  parseBridgeMessage,
  type ErrorCode,
} from "./mapPickerBridge";

// `getMaterialisedPicker()` copies the bundled Leaflet picker assets
// (HTML, CSS, JS) from the bundle into `Paths.cache + 'map-picker/'`
// and returns a `file://` URI to the HTML. The WebView loads that URI
// with `baseUrl` set to the same directory so the HTML's relative
// references to `map-picker/leaflet.css` and `map-picker/leaflet.js`
// resolve correctly. We previously tried `Asset.fromModule(...).uri`
// directly, but the URI it returns in dev is a Metro dev-server URL
// with no sibling directory, so Leaflet never loaded and the picker
// hung on its skeleton. See `mapPickerHtml.ts` for the full rationale.

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
  const webViewRef = useRef<WebView | null>(null);
  // The current pin — only the RN-side mirror of the Leaflet state.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    isFiniteNumber(initialLat) && isFiniteNumber(initialLng)
      ? { lat: initialLat, lng: initialLng }
      : null,
  );
  // True once the user has explicitly chosen a pin (tap, drag, GPS,
  // typed), or once the parent supplied an `initialLat`/`initialLng`
  // that they're editing. The picker must NOT auto-enable Confirm on
  // the Leaflet boot-seed postReady: that would let a seller "save"
  // Dar es Salaam by tapping Confirm without ever touching the map.
  const [userInteracted, setUserInteracted] = useState(
    isFiniteNumber(initialLat) && isFiniteNumber(initialLng),
  );
  // True once the page emitted READY. Until then we queue setView calls.
  const [ready, setReady] = useState(false);
  // Mirror of `ready` for use inside deferred callbacks (e.g. the
  // loadEnd grace-period timer below) so the closures don't capture
  // a stale `false` if READY fires while the timer is pending.
  // We keep the ref in lockstep with the state via a single setter
  // helper so callers cannot drift the two apart.
  const readyRef = useRef(false);
  // Handle for the loadEnd grace-period timer that surfaces
  // "The map could not start" after 3.5 s of silence. Held in a ref
  // so we can clear it on READY / unmount / close — the previous
  // version leaked it and called setPickerError on an unmounted
  // component.
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setReadyState = useCallback((v: boolean) => {
    readyRef.current = v;
    if (v && graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    setReady(v);
  }, []);
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
  // Materialised Leaflet HTML. `null` until the in-memory build
  // resolves; the WebView is only mounted once this is populated so
  // we never render an empty WebView.
  const [picker, setPicker] = useState<{
    html: string;
    baseUrl: string;
  } | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // Re-seed local state when the modal opens with new initial coords.
  // We deliberately drop any pending edits — the parent re-opens the
  // modal when the underlying value changes.
  useEffect(() => {
    if (!visible) return;
    if (isFiniteNumber(initialLat) && isFiniteNumber(initialLng)) {
      setPin({ lat: initialLat, lng: initialLng });
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
      // No initial pin — the seller must explicitly pick before
      // Confirm enables. Auto-seed from the Leaflet boot message
      // is intentionally ignored — see `userInteracted` above.
      setUserInteracted(false);
    }
    setReadyState(false);
    setLocationHint(null);
    setMode("pick");
  }, [visible, initialLat, initialLng, setReadyState]);

  // Cancel any pending grace timer on unmount or when the modal
  // closes. Without this, a slow boot that completes after the
  // modal has been dismissed would still call setPickerError on an
  // unmounted component.
  useEffect(() => {
    return () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, []);

  // Build the picker HTML in memory and store it for the WebView.
  // The build is synchronous (CSS + JS are already in the JS bundle
  // as string constants inside `mapPickerInline.ts`) so this is
  // effectively a `useState` reset — there is no async I/O on a
  // happy path. We keep the useEffect shape so the picker mounts
  // the same way every open regardless of the source.html switch.
  useEffect(() => {
    if (!visible) return;
    setPicker(null);
    setPickerError(null);
    try {
      const result = getMaterialisedPicker();
      if (result) {
        setPicker(result);
      } else {
        setPickerError(
          "Could not prepare the map. Please try again in a moment.",
        );
      }
    } catch (err: unknown) {
      console.warn("[MapPickerSheet] materialise failed:", err);
      setPickerError(
        "Could not prepare the map. Please try again in a moment.",
      );
    }
  }, [visible]);

  /**
   * Fire-and-forget helper to push a (lat, lng) pair into Leaflet. Safe
   * to call before READY — the call is queued and replayed on the
   * READY message so the pin lands on the map even if the seller
   * dispatches something during the first paint.
   *
   * Implementation note: the queue lives in component state (a ref)
   * so that subsequent `setPin` calls during the boot window are
   * captured, not silently dropped. The most recent queued call
   * wins on replay — older intermediate coords are not useful to
   * the user, only the latest "where should the pin be" matters.
   * Once the WebView is READY, queued calls drain in a single
   * `injectJavaScript` so the map sees them in order.
   */
  const pendingSetViewRef = useRef<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const sendSetView = useCallback(
    (lat: number, lng: number, zoom: number) => {
      pendingSetViewRef.current = { lat, lng, zoom };
      if (!ready || !webViewRef.current) return;
      const pending = pendingSetViewRef.current;
      pendingSetViewRef.current = null;
      const js = `window.__setView && window.__setView(${pending.lat}, ${pending.lng}, ${pending.zoom}); true;`;
      webViewRef.current.injectJavaScript(js);
    },
    [ready],
  );

  // Drain the queued setView call as soon as the WebView signals READY.
  // Runs after `ready` flips to true and after the HTML's READY message
  // picks up the initial seed, so the most recent user intent wins.
  useEffect(() => {
    if (!ready) return;
    const pending = pendingSetViewRef.current;
    if (!pending) return;
    if (!webViewRef.current) return;
    pendingSetViewRef.current = null;
    const js = `window.__setView && window.__setView(${pending.lat}, ${pending.lng}, ${pending.zoom}); true;`;
    webViewRef.current.injectJavaScript(js);
  }, [ready, pin]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const parsed = parseBridgeMessage(event.nativeEvent.data);
      if (!parsed) return;
      switch (parsed.type) {
        case "READY":
          setReadyState(true);
          // The web page's READY message carries the post-boot pin
          // coordinates (the seed or the initialLat/Lng). We ignore
          // them here because the RN-side `sendSetView` queue already
          // replays the latest user intent — emitting the seed
          // through the state would clobber a "Use my location" result
          // that landed between WebView mount and READY, and it would
          // also let a seller "save" by tapping Confirm without ever
          // touching the map.
          break;
        case "PIN":
          setPin({ lat: parsed.lat, lng: parsed.lng });
          // Mirror the typed-coordinate inputs so they stay in sync
          // with the map in either direction.
          setLatText(String(parsed.lat));
          setLngText(String(parsed.lng));
          // The HTML only emits PIN from user gestures (tap / drag)
          // now that the boot seed no longer auto-posts. Mark the
          // pin as user-intended so Confirm can enable.
          setUserInteracted(true);
          break;
        case "ERROR": {
          // Surface Leaflet load failures to the picker UI rather than
          // silently logging — the previous setup had the picker
          // hanging on its skeleton whenever Leaflet 404'd.
          console.warn("[MapPickerSheet] bridge error:", parsed.message);
          // Replace the loading overlay with an actionable message
          // when we know the failure class. For TILE_ERROR, keep the
          // Current Location and Type Coordinates chips usable —
          // tiles are only one piece of the picker surface, and the
          // user can still pick a coordinate via GPS or by typing.
          const code = parsed.code as ErrorCode | undefined;
          const message =
            code && ERROR_MESSAGES[code]
              ? ERROR_MESSAGES[code]
              : parsed.message;
          setPickerError(message);
          break;
        }
      }
    },
    // `setReadyState` and the local setters are stable React
    // identities; including them would only cause this callback to
    // be torn down on every render without changing behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setUserInteracted(true);
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
    // Pick mode: Confirm is enabled only when the user has moved the
    // pin through a real gesture (tap / drag / GPS / typed). The
    // boot seed is intentionally ignored — see `userInteracted`.
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
            {/* Loading spinner sits at zIndex 5. The error overlay is
                zIndex 10 so it ALWAYS paints above the spinner, even
                when the picker has been failing for several seconds
                — the previous JSX order meant whichever overlay
                mounted later won the paint, which is fragile. */}
            {!ready && !pickerError ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading map…</Text>
              </View>
            ) : null}
            {pickerError ? (
              <View style={styles.errorOverlay}>
                <Ionicons
                  name="alert-circle-outline"
                  size={32}
                  color={Colors.danger}
                />
                <Text style={styles.errorText}>{pickerError}</Text>
                {/*
                  TILE_ERROR keeps the rest of the picker usable —
                  the user can still pick via GPS or by typing
                  coordinates, so we offer a Retry that simply
                  re-mounts the WebView. SCRIPT_ERROR gets no retry
                  because the page is non-functional until reopened.
                */}
                <Pressable
                  style={styles.errorRetry}
                  onPress={() => {
                    setPickerError(null);
                    setReadyState(false);
                    setPicker(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading map"
                >
                  <Ionicons
                    name="refresh-outline"
                    size={14}
                    color={Colors.primary}
                  />
                  <Text style={styles.errorRetryLabel}>Retry</Text>
                </Pressable>
              </View>
            ) : null}
            {picker ? (
              <WebView
                ref={webViewRef}
                // `picker.htmlUri` is a `file://` URL pointing at
                // `map-picker.html` inside `Paths.cache`. `baseUri` is
                // The picker HTML is built in-memory and handed to
                // `source.html` so the WebView renders it directly.
                // `baseUrl` is `https://localhost/` so the inline
                // script block runs in a real same-origin context
                // and OSM tile fetches are not blocked as
                // mixed-content. See `mapPickerHtml.ts` for the
                // full rationale.
                source={{
                  html: picker.html,
                  baseUrl: picker.baseUrl || undefined,
                }}
                style={styles.webview}
                originWhitelist={["*"]}
                javaScriptEnabled
                domStorageEnabled
                // The HTML is in-memory (no file:// origin), so the
                // `allowFileAccess*` flags are unnecessary. The
                // OSM tile layer is HTTPS, matching the
                // `https://localhost/` baseUrl — no mixed-content
                // concerns. `mixedContentMode="always"` is kept so
                // the picker still works if a future baseUrl is
                // switched to `http://`.
                mixedContentMode="always"
                onMessage={handleMessage}
                onError={(e: unknown) => {
                  const ne = (e as { nativeEvent?: unknown })?.nativeEvent;
                  console.warn("[MapPickerSheet] WebView error:", ne);
                  const message =
                    (ne as { description?: string })?.description ??
                    "WebView failed to load the map. Please try again.";
                  setPickerError(message);
                }}
              // Diagnostic handlers — these surface failures that the
              // previous setup silently swallowed (the Leaflet 404 on
              // the dev server only surfaced as a single `console.warn`
              // buried in Metro logs). They stay on in production so
              // any regression is visible in the dev console at the
              // point of failure.
              onHttpError={(e) => {
                console.warn("[MapPickerSheet] HTTP error:", e.nativeEvent);
                const status = e.nativeEvent?.statusCode;
                const url = e.nativeEvent?.url;
                if (typeof status === "number" && status >= 400) {
                  setPickerError(
                    `Map resource failed (HTTP ${status})${
                      url ? `: ${url}` : ""
                    }`,
                  );
                }
              }}
              onLoadEnd={(e) => {
                console.log(
                  "[MapPickerSheet] loadEnd:",
                  e.nativeEvent.url,
                );
                // If `loadEnd` fires with the very same URL we
                // requested but the page never emits READY (or the
                // WebView flags an error), the modal appears to
                // "close itself" — the user is staring at a blank
                // surface and taps the system back gesture to get
                // out. Surface that as a clear error after a
                // short grace period so the picker never appears
                // to vanish silently. The previous version leaked
                // this timer (it never cleared on unmount or
                // READY) and could setState on an unmounted
                // component. We now stash the handle and clear it
                // when READY arrives or the modal closes.
                if (!ready) {
                  graceTimerRef.current = setTimeout(() => {
                    if (!readyRef.current) {
                      setPickerError(ERROR_MESSAGES.SCRIPT_ERROR);
                    }
                  }, 3500);
                }
              }}
              // Suppress the Android system text-selection magnifier on
              // long-press of the map so the gesture doesn't interfere
              // with marker drag.
              textZoom={100}
              // Pinch-zoom is fine; we just don't want the OS to
              // bounce-zoom past our bounds.
              scalesPageToFit={Platform.OS === "ios" ? false : undefined}
              />
            ) : null}
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
  // Error overlay sits at zIndex 10, above the loading overlay
  // (zIndex 5) and the WebView itself. Padded more than the loading
  // overlay so multi-line error copy doesn't crash into the edges.
  errorOverlay: {
    position: "absolute",
    inset: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    zIndex: 10,
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
  },
  errorRetry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginTop: Spacing.xs,
  },
  errorRetryLabel: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: "800",
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
