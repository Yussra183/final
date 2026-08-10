import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../../constants/colors";
import { Card } from "../../../src/components/Card";
import { Avatar } from "../../../src/components/Avatar";
import { AppInput } from "../../../src/components/AppInput";
import { AppButton } from "../../../src/components/AppButton";
import { StatusPill } from "../../../src/components/StatusPill";
import { PulseDot } from "../../../src/components/MicroAnimations";
import { useStore } from "../../../src/store/StoreContext";
import { isEmail, isPhone } from "../../../src/utils/validators";
import { formatDate } from "../../../src/utils/format";

/**
 * Customer Profile — tab destination inside the bottom-tab navigator.
 *
 * A complete, inline-editable profile:
 *   • Personal: fullName, username, phone, email
 *   • Address: region, district, ward, street, fullAddress
 *   • Account: registration date / status / id
 *   • Security: change-password link
 *   • Session: Log out (with confirmation)
 *
 * Edits persist through `updateProfile` (personal) and
 * `saveCustomerLocation` (address, backend geocodes) — same calls the
 * page used before the bottom-tab restructure.
 *
 * The Log out button replaces the in-app-bar logout that lived on
 * the drawer-era Home screen. Tapping it clears the session via the
 * store's `logout()` action and routes back to `/auth/login`.
 */
export default function CustomerProfileScreen() {
  const router = useRouter();
  const {
    session,
    updateProfile,
    saveCustomerLocation,
    logout,
    getNotificationsForUser,
  } = useStore();
  const user = session?.user;
  const unreadCount = user
    ? getNotificationsForUser(user.id).filter((n) => !n.read).length
    : 0;

  // ---- Form state -------------------------------------------------------
  // Seed from the signed-in user so the screen survives profile edits
  // that mount after a navigation.
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // Location fields. These are the keys the nearby-seller pipeline
  // reads, so saving here refreshes the Home screen's list.
  const [region, setRegion] = useState(user?.region ?? "");
  const [district, setDistrict] = useState(user?.district ?? "");
  const [ward, setWard] = useState(user?.ward ?? "");
  const [street, setStreet] = useState(user?.street ?? "");
  const [fullAddress, setFullAddress] = useState(user?.address ?? "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // ---- Load saved data --------------------------------------------------
  /**
   * Re-seed the form whenever the signed-in user changes.
   *
   * `useState` initializers run only on the FIRST render. The saved
   * location arrives asynchronously — the store fetches it from
   * `GET /api/customers/me` just after login — and the drawer navigator
   * keeps this screen mounted across navigations. Without this effect
   * the inputs keep their initial empty values and the saved location
   * appears not to have persisted at all, even though it loaded fine.
   *
   * Keyed on the individual fields rather than the `user` object so a
   * new object identity with identical values doesn't clobber
   * in-progress edits.
   */
  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName ?? "");
    setUsername(user.username ?? "");
    setPhone(user.phone ?? "");
    setEmail(user.email ?? "");
    setRegion(user.region ?? "");
    setDistrict(user.district ?? "");
    setWard(user.ward ?? "");
    setStreet(user.street ?? "");
    setFullAddress(user.address ?? "");
  }, [
    user?.id,
    user?.fullName,
    user?.username,
    user?.phone,
    user?.email,
    user?.region,
    user?.district,
    user?.ward,
    user?.street,
    user?.address,
  ]);

  // ---- Derived data -----------------------------------------------------
  /**
   * Composed `fullAddress` fallback. If the user leaves the explicit
   * "Full Address" blank we synthesize one from the granular fields so
   * the home-screen filter has something to match on.
   */
  const composedAddress = useMemo(() => {
    const tail = [street, ward, district, region]
      .map((p) => (p ?? "").trim())
      .filter(Boolean);
    return tail.join(", ");
  }, [street, ward, district, region]);

  const effectiveFullAddress = fullAddress.trim() || composedAddress;

  const accountStatus: "Active" | "Suspended" = (user as any)?.active
    ? "Active"
    : (user as any)?.active === false
      ? "Suspended"
      : "Active";

  // ---- Handlers ---------------------------------------------------------
  const handleChangePassword = () =>
    router.push("/(customer)/change-password" as any);

  const handleChangePhoto = () => {
    // Photo picker is intentionally stubbed today; the backend will
    // hand back a CDN URL once uploads are wired up.
    Alert.alert(
      "Change Photo",
      "Photo upload will be available once the storage service is connected.",
    );
  };

  /**
   * Log out with confirmation. Same destructive Alert pattern the Home
   * screen used under the drawer; just relocated here because the
   * app bar no longer hosts a logout button.
   */
  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: () => {
          logout();
          router.replace("/auth/login" as any);
        },
      },
    ]);
  };

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Full name is required";
    if (!username.trim()) next.username = "Username is required";
    if (!isEmail(email)) next.email = "Valid email is required";
    if (!isPhone(phone)) next.phone = "Valid phone number is required";
    if (!region.trim()) next.region = "Region is required";
    if (!district.trim()) next.district = "District is required";
    if (!street.trim()) next.street = "Street / area is required";
    if (!effectiveFullAddress)
      next.fullAddress = "Full address is required";
    return next;
  };

  const handleSave = async () => {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      Alert.alert(
        "Check your details",
        "Please fix the highlighted fields and try again.",
      );
      return;
    }

    setSaving(true);
    try {
      // 1. Personal information (name / username / phone / email).
      //    Unchanged path — still goes through `updateProfile`.
      await updateProfile({
        fullName: fullName.trim(),
        username: username.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });

      // 2. Location. Persisted to `customer_profiles` via
      //    `PUT /api/customers/me`. We deliberately send no lat/lng —
      //    the backend geocodes the address and returns the resolved
      //    coordinates, which the store merges into the session so the
      //    Home screen's nearby list refreshes on the next render.
      await saveCustomerLocation({
        region: region.trim(),
        district: district.trim(),
        ward: ward.trim(),
        street: street.trim(),
        address: effectiveFullAddress,
      });

      Alert.alert(
        "Profile updated",
        "Your changes have been saved. Nearby sellers on the home screen will refresh automatically.",
      );
    } catch (err) {
      Alert.alert(
        "Save failed",
        (err as Error)?.message ?? "Please try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  // ---- Render -----------------------------------------------------------
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      {/* ---------------- Header ---------------- */}
      {/* Minimal app bar: title left-aligned, notification bell on the
          right — same pattern as the Home tab. The drawer and its
          hamburger are gone; logout lives at the bottom of the screen. */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>

        <TouchableOpacity
          accessibilityLabel="View notifications"
          style={[styles.iconBtn, styles.notifBtn]}
          onPress={() => router.push("/(customer)/notifications" as any)}
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={Colors.primary}
          />
          {unreadCount > 0 ? (
            <View style={styles.notifDotWrap}>
              <PulseDot size={10} color={Colors.danger} />
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ---------------- Profile Photo ---------------- */}
          <Card style={styles.photoCard}>
            <View style={styles.avatarWrap}>
              <Avatar name={fullName || user?.fullName || "Customer"} size={96} />
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>📷</Text>
              </View>
            </View>
            <Text style={styles.photoName}>
              {fullName || user?.fullName || "Customer"}
            </Text>
            <Text style={styles.photoMeta}>@{username || user?.username}</Text>
            <AppButton
              title="Change Photo"
              variant="outline"
              leftIcon={<Text style={styles.btnEmoji}>📷</Text>}
              onPress={handleChangePhoto}
              style={styles.changePhotoBtn}
            />
          </Card>

          {/* ---------------- Personal Information ---------------- */}
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <Card>
            <AppInput
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              placeholder="e.g. Asha Juma"
              error={errors.fullName}
            />
            <AppInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="e.g. ashaj"
              error={errors.username}
            />
            <AppInput
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+255 7XX XXX XXX"
              error={errors.phone}
            />
            <AppInput
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="you@example.com"
              error={errors.email}
            />
          </Card>

          {/* ---------------- Location Information ---------------- */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Location Information</Text>
            <StatusPill label="Used for nearby sellers" tone="info" />
          </View>
          <Card>
            <Text style={styles.helperText}>
              Your address determines which gas sellers appear on your Home
              screen. Update any field to refresh the nearby list.
            </Text>
            <AppInput
              label="Region"
              value={region}
              onChangeText={setRegion}
              placeholder="e.g. Zanzibar Urban West"
              error={errors.region}
            />
            <AppInput
              label="District"
              value={district}
              onChangeText={setDistrict}
              placeholder="e.g. Urban"
              error={errors.district}
            />
            <AppInput
              label="Ward"
              value={ward}
              onChangeText={setWard}
              placeholder="e.g. Malindi"
            />
            <AppInput
              label="Street / Area"
              value={street}
              onChangeText={setStreet}
              placeholder="e.g. Stone Town"
              error={errors.street}
            />
            <AppInput
              label="Full Address"
              value={fullAddress}
              onChangeText={setFullAddress}
              placeholder="e.g. Stone Town, Zanzibar"
              multiline
              numberOfLines={2}
              error={errors.fullAddress}
              helperText={
                composedAddress
                  ? `Will be saved as: ${composedAddress}`
                  : undefined
              }
            />
          </Card>

          {/* ---------------- Account Information ---------------- */}
          <Text style={styles.sectionTitle}>Account Information</Text>
          <Card>
            <InfoRow
              icon="📅"
              label="Registration Date"
              value={
                user?.createdAt ? formatDate(user.createdAt) : "—"
              }
            />
            <InfoRow
              icon="🟢"
              label="Account Status"
              value={accountStatus}
              valueBadge={
                <StatusPill
                  label={accountStatus}
                  tone={accountStatus === "Active" ? "success" : "danger"}
                />
              }
            />
            <InfoRow
              icon="🆔"
              label="Customer ID"
              value={user?.id ?? "—"}
              copyable
            />
          </Card>

          {/* ---------------- Security ---------------- */}
          <Text style={styles.sectionTitle}>Security</Text>
          <Card style={styles.securityCard}>
            <AppButton
              title="Change Password"
              variant="outline"
              leftIcon={<Text style={styles.btnEmoji}>🔒</Text>}
              onPress={handleChangePassword}
            />
          </Card>

          {/* ---------------- Log out ---------------- */}
          <Text style={styles.sectionTitle}>Session</Text>
          <Card style={styles.logoutCard}>
            <Text style={styles.logoutHelper}>
              Sign out of this device. You can sign back in any time
              with your username and password.
            </Text>
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.logoutBtn,
                pressed && styles.logoutBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={20} color="#FFF" />
              <Text style={styles.logoutBtnText}>Log out</Text>
            </Pressable>
          </Card>

          {/* Spacer above the save button so content isn't covered. */}
          <View style={{ height: Spacing.lg }} />
        </ScrollView>

        {/* ---------------- Save Button ---------------- */}
        <View style={styles.footer}>
          <AppButton
            title="SAVE PROFILE"
            variant="primary"
            fullWidth
            loading={saving}
            leftIcon={<Text style={styles.saveIcon}>💾</Text>}
            onPress={handleSave}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Local helpers ----------------------------------------------------

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  copyable?: boolean;
  valueBadge?: React.ReactNode;
}

function InfoRow({ icon, label, value, copyable, valueBadge }: InfoRowProps) {
  const handleCopy = () => {
    if (!copyable) return;
    Alert.alert("Copied", `${label}: ${value}`);
  };
  return (
    <TouchableOpacity
      activeOpacity={copyable ? 0.6 : 1}
      onPress={handleCopy}
      style={infoStyles.row}
    >
      <View style={infoStyles.iconWrap}>
        <Text style={infoStyles.icon}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={infoStyles.label}>{label}</Text>
        {valueBadge ? (
          <View style={{ marginTop: 4 }}>{valueBadge}</View>
        ) : (
          <Text style={infoStyles.value}>{value}</Text>
        )}
      </View>
      {copyable ? <Text style={infoStyles.copy}>📋</Text> : null}
    </TouchableOpacity>
  );
}

// ---- Styles -----------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  /* ----- Header ----- */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBtn: {
    backgroundColor: "#CCFBF1",
    marginLeft: Spacing.xs,
  },
  notifDotWrap: {
    position: "absolute",
    top: -3,
    right: -3,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },

  /* ----- Section titles ----- */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  /* ----- Photo card ----- */
  photoCard: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  avatarWrap: {
    position: "relative",
  },
  photoBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  photoBadgeText: {
    fontSize: 14,
  },
  photoName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.md,
  },
  photoMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  changePhotoBtn: {
    marginTop: Spacing.md,
    alignSelf: "stretch",
  },
  btnEmoji: {
    fontSize: 16,
  },

  /* ----- Helpers ----- */
  helperText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },

  /* ----- Security card ----- */
  securityCard: {
    paddingVertical: Spacing.md,
  },

  /* ----- Log out card ----- */
  logoutCard: {
    paddingVertical: Spacing.md,
  },
  logoutHelper: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: "#B91C1C",
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  logoutBtnPressed: {
    opacity: 0.85,
  },
  logoutBtnText: {
    color: "#FFF",
    fontSize: FontSize.md,
    fontWeight: "800",
  },

  /* ----- Footer / save ----- */
  footer: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveIcon: {
    fontSize: 16,
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 18,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    fontSize: FontSize.md,
    color: Colors.text,
    fontWeight: "600",
    marginTop: 2,
  },
  copy: {
    fontSize: 16,
    color: Colors.textSecondary,
    paddingLeft: Spacing.sm,
  },
});