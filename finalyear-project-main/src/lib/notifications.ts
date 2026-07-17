/**
 * src/lib/notifications.ts
 *
 * Thin wrapper around expo-notifications. The supplier dashboard uses
 * this to (a) set up the Android channel once at boot, (b) request
 * permission when needed, and (c) schedule local notifications to mirror
 * what would be push messages in production.
 *
 * Every call here is safe to run on Expo Go and degrades gracefully if
 * expo-notifications is unavailable — we never throw out of a logistics
 * action. We dynamically import the module so apps that don't have it
 * (or where remote notifications have been removed in SDK 53+) still
 * bundle and run cleanly.
 */
import { Platform } from "react-native";

/** Channel id for all delivery-related notifications. */
export const DELIVERY_CHANNEL = "supplier-delivery";

// We avoid a top-level `import * as Notifications` because that throws at
// module-load time in Expo Go SDK 53+ (remote notifications removed).
// Lazy-loading lets us keep the full API surface available in dev builds
// while remaining a no-op in Expo Go.
let Notifications: any = null;
let notificationsLoadFailed = false;

async function getNotifications() {
  if (Notifications) return Notifications;
  if (notificationsLoadFailed) return null;
  try {
    Notifications = await import("expo-notifications");
    return Notifications;
  } catch {
    notificationsLoadFailed = true;
    return null;
  }
}

let initialized = false;

/**
 * Configure the notification handler + Android channel. Safe to call more
 * than once — only the first call does work.
 */
export async function ensureNotificationsReady(): Promise<boolean> {
  if (initialized) return true;
  const N = await getNotifications();
  if (!N) return false;
  try {
    // Set the global handler so scheduled notifications actually display
    // when the app is in the foreground.
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    if (Platform.OS === "android" && N.setNotificationChannelAsync) {
      await N.setNotificationChannelAsync(DELIVERY_CHANNEL, {
        name: "Supplier delivery",
        importance: N.AndroidImportance?.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#0F766E",
        sound: "default",
      });
    }
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * Request permission. Returns `granted` (boolean). Never throws — the
 * caller can keep going even if the OS denies.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const N = await getNotifications();
    if (!N) return false;
    await ensureNotificationsReady();
    const { status } = await N.getPermissionsAsync();
    if (status === "granted") return true;
    const req = await N.requestPermissionsAsync();
    return req.status === "granted";
  } catch {
    return false;
  }
}

/**
 * Schedule a single local notification. `trigger === null` means
 * immediate delivery. Returns the notification id on success or `null`
 * on failure — the caller should never treat failure as fatal.
 */
export async function scheduleLocalNotification(input: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Delay in seconds. Default = 0 (immediate). */
  seconds?: number;
}): Promise<string | null> {
  try {
    const N = await getNotifications();
    if (!N) return null;
    await ensureNotificationsReady();
    const id = await N.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        sound: "default",
        data: input.data ?? {},
      },
      trigger: input.seconds
        ? ({ seconds: input.seconds } as any)
        : null,
    });
    return id;
  } catch {
    return null;
  }
}

/**
 * Schedule one notification per recipient. Used by `startTrip()` to fan
 * out "the supplier is on the way" to every seller on the route.
 */
export async function fanOutLocalNotifications(
  recipients: { title: string; body: string; data?: Record<string, unknown> }[],
): Promise<void> {
  // Run in parallel — scheduleNotificationAsync is cheap and we want all
  // banners to appear in the same OS frame.
  await Promise.all(
    recipients.map((r) => scheduleLocalNotification(r)),
  );
}