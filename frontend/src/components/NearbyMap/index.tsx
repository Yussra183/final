/**
 * NearbyMap — multi-pin OpenStreetMap viewer for the customer Home
 * screen. Renders an array of "sellers near you" pins and surfaces
 * tap events to the parent via `onMarkerTap`. Reuses the same
 * WebView + Leaflet infrastructure as `ShopMapPreview` and
 * `MapPickerSheet` (see `assets/map-picker.html` for the page side).
 *
 * Differences vs. the existing maps:
 *   - Accepts an array of arbitrary `markers`, not fixed origin/live
 *     destination points.
 *   - Tapping a marker calls `onMarkerTap(id)` (no drag, no
 *     `injectJavaScript` from the user).
 *   - `pointerEvents` is `auto` (not `"none"`) — taps MUST reach
 *     Leaflet for `MARKER_TAP` to fire. `pointerEvents="none"` is the
 *     single-pin preview's trick to swallow taps.
 *   - Selection state is driven by the `selectedId` prop; the wrapper
 *     calls `window.__selectMarker(id)` so we don't have to re-emit
 *     the whole markers list when only the selection changed.
 *
 * Why one component folder (NearbyMap/{index.tsx, bridge.ts})
 * ------------------------------------------------------------
 * `ShopMapPreview` and `MapPickerSheet` already use a folder pattern
 * for split concerns, and this component carries its own typed
 * bridge (`bridge.ts`) so it doesn't pollute the single-pin bridge
 * module. README.md inside the folder documents the regeneration
 * step.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../../constants/colors";
import { getMaterialisedPicker } from "../mapPickerHtml";
import {
  ERROR_MESSAGES,
  isFiniteNumber,
  parseNearbyMapMessage,
  type ErrorCode,
} from "./bridge";

/** A single pin in the NearbyMap viewer. */
export interface NearbyMarker {
  id: string;
  lat: number;
  lng: number;
  /** Short label rendered inside the pin pill (e.g. "2.1 km"). */
  label?: string;
  /** When true the pin paints in the "selected" colour. Usually driven by `selectedId`. */
  selected?: boolean;
}

/** Props for `<NearbyMap>`. */
export interface NearbyMapProps {
  markers: NearbyMarker[];
  /** Initial centre. Ignored once markers are present (fit-bounds wins). */
  center: { lat: number; lng: number };
  /** Initial zoom. Defaults to 12. */
  zoom?: number;
  /**
   * Fixed height in px. Defaults to 320.
   *
   * If you want the map to fill its parent (e.g. a flex: 1 wrapper on
   * a tab/page), pass `style={{ flex: 1 }}` instead of `height` —
   * `style` wins when provided.
   */
  height?: number;
  /**
   * Wrapper style. Pass `{ flex: 1 }` to make the map fill its parent.
   * Overrides the `height` prop when present.
   */
  style?: StyleProp<ViewStyle>;
  /** When set, paints that marker in the selected colour (single-select). */
  selectedId?: string;
  /** Fired when the user taps a marker. */
  onMarkerTap?: (id: string) => void;
  /**
   * "auto" — fit-bounds when 2+ markers exist, otherwise centre
   * on `center`. "fixed" — always centre on `center`, no auto
   * recentre. Default "auto".
   */
  fitMode?: "auto" | "fixed";
}

/**
 * Debounce window for `MARKER_TAP` events. The page-side handler is
 * not idempotent (Leaflet fires `click` once per `marker.on("click")`,
 * not on every gesture frame), but a double-tap inside ~200 ms could
 * still cross a `router.push` boundary. Cheap insurance.
 */
const TAP_DEBOUNCE_MS = 200;

export function NearbyMap({
  markers,
  center,
  zoom = 12,
  height = 320,
  style,
  selectedId,
  onMarkerTap,
  fitMode = "auto",
}: NearbyMapProps) {
  const webViewRef = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);
  const [picker, setPicker] = useState<{
    html: string;
    baseUrl: string;
  } | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  // Bumping `loadToken` re-runs the materialiser + remounts the
  // WebView. Used by the "Try again" pressable.
  const [loadToken, setLoadToken] = useState(0);

  // Last `MARKER_TAP` timestamp — for the 200 ms debounce.
  const lastTapRef = useRef<number>(0);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const parsed = parseNearbyMapMessage(event.nativeEvent.data);
      if (!parsed) return;
      if (parsed.type === "READY") {
        setReady(true);
        return;
      }
      if (parsed.type === "MARKER_TAP") {
        const now = Date.now();
        if (now - lastTapRef.current < TAP_DEBOUNCE_MS) return;
        lastTapRef.current = now;
        onMarkerTap?.(parsed.id);
        return;
      }
      if (parsed.type === "ERROR") {
        const code = parsed.code as ErrorCode | undefined;
        const message =
          code && ERROR_MESSAGES[code] ? "Map unavailable" : parsed.message;
        setPickerError(message);
      }
    },
    [onMarkerTap],
  );

  /**
   * Materialise the picker assets on mount and on retry. The
   * materialiser is idempotent — re-running reuses the cached
   * directory and gives us a clean recovery path.
   */
  useEffect(() => {
    setPickerError(null);
    try {
      const result = getMaterialisedPicker();
      if (result) {
        setPicker({ html: result.html, baseUrl: result.baseUrl });
      } else {
        setPickerError("Could not prepare the map.");
      }
    } catch (err: unknown) {
      console.warn("[NearbyMap] materialise failed:", err);
      setPickerError("Could not prepare the map.");
    }
  }, [loadToken]);

  /**
   * Send the latest markers payload to the page. The page stashes the
   * payload in `window.__MARKERS__` if `boot()` hasn't run yet and
   * replays it once `__MAP__` exists — the READY gate is therefore
   * implicit on the page side and we don't need a `pendingMarkersRef`
   * here.
   */
  useEffect(() => {
    if (!ready || !picker || pickerError) return;
    const filtered = markers.filter(
      (m) => isFiniteNumber(m.lat) && isFiniteNumber(m.lng),
    );
    const json = JSON.stringify({
      markers: filtered.map((m) => ({
        id: m.id,
        lat: m.lat,
        lng: m.lng,
        label: m.label,
      })),
    });
    webViewRef.current?.injectJavaScript(
      `window.__setMarkers && window.__setMarkers(${JSON.stringify(json)}); true;`,
    );
    if (fitMode === "fixed") {
      const z = isFiniteNumber(center.lat) ? zoom : 12;
      webViewRef.current?.injectJavaScript(
        `window.__setView && window.__setView(${center.lat}, ${center.lng}, ${z}); true;`,
      );
    }
  }, [ready, picker, pickerError, markers, fitMode, center, zoom]);

  /**
   * Selection is driven entirely by `selectedId` — re-emitting the
   * whole marker list to highlight one pin would be wasteful. This
   * effect runs after `ready` flips true and whenever `selectedId`
   * changes; the page updates the CSS on each call.
   */
  useEffect(() => {
    if (!ready || !picker || pickerError) return;
    webViewRef.current?.injectJavaScript(
      `window.__selectMarker && window.__selectMarker(${
        selectedId ? JSON.stringify(selectedId) : "null"
      }); true;`,
    );
  }, [ready, picker, pickerError, selectedId]);

  return (
    <View
      style={[
        styles.wrap,
        style ? style : { height },
      ]}
    >
      {pickerError ? (
        <Pressable
          style={styles.errorState}
          onPress={() => setLoadToken((t) => t + 1)}
          accessibilityRole="button"
          accessibilityLabel="Retry loading map"
        >
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={Colors.danger}
          />
          <Text style={styles.errorText}>{pickerError}</Text>
          <Text style={styles.retry}>Tap to retry</Text>
        </Pressable>
      ) : !picker || !ready ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      ) : null}
      {picker ? (
        <WebView
          key={`webview-${loadToken}`}
          ref={webViewRef}
          source={{
            html: picker.html,
            baseUrl: picker.baseUrl || undefined,
          }}
          style={styles.webview}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          onMessage={handleMessage}
          onError={(e: unknown) => {
            console.warn(
              "[NearbyMap] WebView error:",
              (e as { nativeEvent?: unknown })?.nativeEvent,
            );
            setPickerError("Map failed to load.");
          }}
          onHttpError={(e) => {
            console.warn("[NearbyMap] HTTP error:", e.nativeEvent);
            setPickerError("Map failed to load.");
          }}
          // Taps MUST reach Leaflet to fire MARKER_TAP — do NOT set
          // pointerEvents="none" (that's the single-pin preview trick).
          textZoom={100}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loading: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.sm,
    zIndex: 5,
  },
  loadingText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  errorState: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    zIndex: 6,
    backgroundColor: Colors.surfaceMuted,
  },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: "600",
    flexShrink: 1,
  },
  retry: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: "800",
    marginLeft: Spacing.xs,
  },
});
