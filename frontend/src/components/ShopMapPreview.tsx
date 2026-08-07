/**
 * ShopMapPreview — a small read-only OpenStreetMap preview used inline
 * in the seller Shop Profile "Business Information" card.
 *
 * Pure presentational. Renders a single Leaflet WebView in read-only
 * mode (no marker drag, no taps). Loads the same `map-picker.html`
 * page as `MapPickerSheet`, but flips `window.__setReadOnly(true)`
 * before the marker is created so the tile gestures are inert.
 *
 * The Leaflet HTML is built in-memory by `getMaterialisedPicker()`
 * (see `mapPickerHtml.ts`) and supplied to the WebView via
 * `source={{ html, baseUrl }}`. This is the same approach used by
 * `MapPickerSheet` — the WebView creates an about:blank document,
 * sets the HTTPS baseUrl, and runs inline scripts in a normal
 * same-origin context. If materialisation fails the preview
 * degrades to a tap-to-retry placeholder rather than hanging on a
 * spinner.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { getMaterialisedPicker } from "./mapPickerHtml";

interface BridgeMessage {
  type: "READY" | "PIN" | "ERROR";
  lat?: number;
  lng?: number;
}

interface ShopMapPreviewProps {
  lat: number;
  lng: number;
  height?: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function ShopMapPreview({
  lat,
  lng,
  height = 120,
}: ShopMapPreviewProps) {
  const webViewRef = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);
  const [picker, setPicker] = useState<{
    html: string;
    baseUrl: string;
  } | null>(null);
  // A previous version of this component hung silently on a spinner
  // when materialisation failed (the SDK 54 file-system bug). Track
  // the failure so we can render a tap-to-retry affordance instead
  // of a blank surface.
  const [pickerError, setPickerError] = useState<string | null>(null);
  // Bumping `loadToken` re-runs the materialiser + remounts the
  // WebView. Used by the "Try again" pressable.
  const [loadToken, setLoadToken] = useState(0);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      if (parsed?.type === "READY") setReady(true);
    } catch {
      // ignore
    }
  }, []);

  // Materialise the picker assets on mount (and whenever the seller
  // taps the "Try again" retry button). The loader is idempotent —
  // repeated calls reuse the existing directory — so re-running is
  // safe and gives us a clean recovery path when the previous
  // attempt failed.
  useEffect(() => {
    setPickerError(null);
    try {
      const result = getMaterialisedPicker();
      if (result) {
        setPicker({ html: result.html, baseUrl: result.baseUrl });
      } else {
        setPickerError("Could not prepare the map preview.");
      }
    } catch (err: unknown) {
      console.warn("[ShopMapPreview] materialise failed:", err);
      setPickerError("Could not prepare the map preview.");
    }
  }, [loadToken]);

  // Once READY, flip into read-only and seed the pin. We dispatch both
  // calls inside a single `injectJavaScript` so the page state is
  // consistent by the time the user can interact.
  useEffect(() => {
    if (!ready) return;
    const js = `
      window.__setReadOnly && window.__setReadOnly(true);
      window.__setView && window.__setView(${lat}, ${lng}, 14);
      true;
    `;
    webViewRef.current?.injectJavaScript(js);
  }, [ready, lat, lng]);

  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    return null;
  }

  return (
    <View style={[styles.wrap, { height }]}>
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
            baseUrl: picker.baseUrl,
          }}
          style={styles.webview}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          onMessage={handleMessage}
          onError={(e: unknown) => {
            console.warn(
              "[ShopMapPreview] WebView error:",
              (e as { nativeEvent?: unknown })?.nativeEvent,
            );
            setPickerError("Map preview failed to load.");
          }}
          // Diagnostic handlers — surface failures that the previous
          // Asset.fromModule setup silently swallowed.
          onHttpError={(e) => {
            console.warn("[ShopMapPreview] HTTP error:", e.nativeEvent);
            setPickerError("Map preview failed to load.");
          }}
          onLoadEnd={(e) =>
            console.log("[ShopMapPreview] loadEnd:", e.nativeEvent.url)
          }
          // Read-only — disable user gestures. The page itself also flips
          // read-only on boot, but doing it from RN too closes the race
          // window where a tap could land before the JS state catches up.
          // (Currently Leaflet's `dragging.disable()` only runs after the
          // page's own __setReadOnly — RN just adds a CSS pointer-events
          // guard for the very first frame.)
          pointerEvents="none"
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
    marginTop: Spacing.sm,
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
