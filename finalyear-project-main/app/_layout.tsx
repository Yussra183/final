import React, { useEffect } from "react";
import { LogBox } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider } from "../src/store/StoreContext";
import { Colors } from "../constants/colors";
import { API_CONFIG, resolveBaseUrl, buildWsUrl } from "../src/api/config";

/**
 * Expo's `withDevTools` HOC (dev-only) calls
 * `useKeepAwake(ExpoKeepAwakeTag)` during the JS bootstrap. On Android,
 * if the root Activity hasn't been bound yet by the time the hook runs,
 * the native module throws "Unable to activate keep awake" as an
 * unhandled promise rejection — which surfaces as a red box before
 * any of our screens have a chance to render.
 *
 * The error is cosmetic (the flag controls only the dev-menu screen
 * brightness) and is harmless, so we silence it via LogBox. Real errors
 * are unaffected.
 */
LogBox.ignoreLogs(["Unable to activate keep awake"]);

export default function RootLayout() {
  // Probe candidate hosts on first mount so `API_CONFIG.BASE_URL` reflects
  // the first reachable backend. Errors are intentionally swallowed —
  // the configured URL stays in place and the next API call surfaces a
  // clear "Could not reach backend at …" message in the UI.
  useEffect(() => {
    resolveBaseUrl()
      .then((resolved) => {
        if (__DEV__) {
          console.info(
            "[API][RESOLVED_BASE_URL]",
            JSON.stringify({
              resolved,
              wsUrl: buildWsUrl(resolved),
              platform: require("react-native").Platform.OS,
            }),
          );
        }
      })
      .catch(() => {
        // Probe failure is non-fatal — the login screen will surface
        // the real error on the first POST.
      });
    // Reference API_CONFIG to keep the import alive (avoids an
    // unused-import warning if no other file uses it directly).
    void API_CONFIG.CANDIDATE_HOSTS;
  }, []);

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
      </StoreProvider>
    </SafeAreaProvider>
  );
}