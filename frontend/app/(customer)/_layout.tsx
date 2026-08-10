import React from "react";
import { Stack } from "expo-router";
import { Redirect } from "expo-router";
import { useStore } from "../../src/store/StoreContext";
import { roleHome } from "../../src/utils/format";

/**
 * Customer section navigator — Stack wrapping a nested Tabs group.
 *
 * Layout shape
 * ------------
 *   <Stack>
 *     <Stack.Screen name="(tabs)" />           ← Tabs: Home / My Orders / Profile
 *     <Stack.Screen name="notifications" />    ← pushes full-screen, hides tab bar
 *     <Stack.Screen name="tracking" />
 *     <Stack.Screen name="seller/[id]" />
 *     <Stack.Screen name="place-order" />
 *     <Stack.Screen name="products" />
 *     <Stack.Screen name="product-detail" />
 *     <Stack.Screen name="change-password" />
 *     <Stack.Screen name="safety" />
 *   </Stack>
 *
 * Why Stack around Tabs (and not just `<Tabs>` at the root)
 * ---------------------------------------------------------
 * The customer tree has many secondary routes that should push full-
 * screen AND hide the tab bar (`tracking`, `seller/[id]`, …). With a
 * pure Tabs root, every route is a tab sibling and you have to opt
 * each one out with `tabBarStyle: { display: 'none' }` — fragile and
 * easy to forget when adding a new route. The Stack-wraps-Tabs pattern
 * handles this automatically: secondary routes are Stack siblings of
 * `(tabs)`, so when they push the tab bar is naturally hidden.
 *
 * Each Stack.Screen leaves `headerShown: false` — every screen
 * renders its own app bar within the stable shell, same convention
 * the drawer used previously.
 */
export default function CustomerLayout() {
  const { session } = useStore();

  // Role guard — same redirect logic the drawer used.
  if (!session) return <Redirect href="/auth/login" />;
  if (session.user.role !== "customer")
    return <Redirect href={roleHome(session.user.role) as any} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Nested Tabs: the three top-level customer destinations. */}
      <Stack.Screen name="(tabs)" />

      {/* Secondary routes — each pushes full-screen, tab bar hidden. */}
      <Stack.Screen name="notifications" />
      <Stack.Screen name="tracking" />
      <Stack.Screen name="seller/[id]" />
      <Stack.Screen name="place-order" />
      <Stack.Screen name="products" />
      <Stack.Screen name="product-detail" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="safety" />
    </Stack>
  );
}
