import React, { useEffect } from "react";
import { LogBox } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider } from "../src/store/StoreContext";
import { Colors } from "../constants/colors";
import {
  API_CONFIG,
  resolveBaseUrl,
  recoverBaseUrl,
  invalidateCachedHost,
  buildWsUrl,
} from "../src/api/config";

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
  //
  // We ALSO subscribe to network-state changes so a Wi-Fi switch or a
  // backend restart on a new LAN IP triggers a fresh probe automatically
  // — the user does not have to edit `.env.local` or rerun
  // `npm run dev:lan`. The `RN.Network` module ships with React Native;
  // we use it through the same dynamic-require guard the API config
  // module uses, so this stays web-safe (the web build silently skips
  // the listener).
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

    // Network-change subscription. Whenever the device's connectivity
    // changes (Wi-Fi switch, VPN tunnel up/down, etc.) we drop the
    // cached last-known-good host and re-probe immediately so the
    // next request hits the new reachable host without surfacing a
    // NETWORK error to the user.
    let unsubscribe: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const RN: {
        NetInfo?: {
          addEventListener?: (
            listener: (state: { isConnected?: boolean | null }) => void,
          ) => () => void;
          isConnected?: {
            fetch?: () => Promise<unknown>;
            addEventListener?: (
              listener: (state: { isConnected?: boolean | null }) => void,
            ) => () => void;
          };
        };
      } = require("react-native");
      const addListener = (listener: (connected: boolean) => void) => {
        if (RN.NetInfo?.addEventListener) {
          return RN.NetInfo.addEventListener((state) =>
            listener(!!state.isConnected),
          );
        }
        // Older RN versions: `NetInfo.isConnected.addEventListener`.
        if (RN.NetInfo?.isConnected?.addEventListener) {
          return RN.NetInfo.isConnected.addEventListener((state) =>
            listener(!!(state as { isConnected?: boolean | null })?.isConnected),
          );
        }
        return undefined;
      };
      unsubscribe = addListener((connected) => {
        if (!connected) return;
        // Connectivity restored — drop the cached host and re-probe so
        // the next API call hits whatever is reachable NOW, not the
        // host we last saw minutes ago on a different network.
        invalidateCachedHost();
        recoverBaseUrl().then((host) => {
          if (__DEV__ && host) {
            console.info("[API][RECOVERED_BASE_URL]", host);
          }
        });
      });
    } catch {
      // RN module not available (e.g. web build) — silently skip.
    }
    return () => {
      unsubscribe?.();
    };
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