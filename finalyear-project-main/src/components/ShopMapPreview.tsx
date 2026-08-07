/**
 * ShopMapPreview — a small read-only OpenStreetMap preview used inline
 * in the seller Shop Profile "Business Information" card.
 *
 * Pure presentational. Renders a single Leaflet WebView in read-only
 * mode (no marker drag, no taps). Loads the same `map-picker.html`
 * page as `MapPickerSheet`, but flips `window.__setReadOnly(true)`
 * before the marker is created so the tile gestures are inert.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

const HTML_ASSET = require("../../assets/map-picker.html");
const MAP_HTML_URI = Asset.fromModule(HTML_ASSET).uri;

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

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      if (parsed?.type === "READY") setReady(true);
    } catch {
      // ignore
    }
  }, []);

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
      {!ready ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.primary} />
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
        mixedContentMode="always"
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onMessage={handleMessage}
        // Read-only — disable user gestures. The page itself also flips
        // read-only on boot, but doing it from RN too closes the race
        // window where a tap could land before the JS state catches up.
        // (Currently Leaflet's `dragging.disable()` only runs after the
        // page's own __setReadOnly — RN just adds a CSS pointer-events
        // guard for the very first frame.)
        pointerEvents="none"
        textZoom={100}
      />
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
});
