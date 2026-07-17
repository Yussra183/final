import React from "react";
import { LogBox } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider } from "../src/store/StoreContext";
import { Colors } from "../constants/colors";

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