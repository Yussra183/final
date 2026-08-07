import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../../src/store/StoreContext";
import { UserRole } from "../../constants/types";
import { isEmail, isPhone } from "../../src/utils/validators";
import { roleHome } from "../../src/utils/format";
import { resolveCurrentDeviceCoords } from "../../src/lib/deviceLocation";

const LOGO = require("../../assets/images/icon.png");

export default function RegisterScreen() {
  const router = useRouter();
  const { register, error: storeError, loading: storeLoading } = useStore();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<UserRole>("customer");

  // ---- Seller Business Address (only required when role === "seller") -
  // The fields captured here feed `POST /api/sellers/me` immediately
  // after registration so the customer "Nearby Sellers" pipeline can
  // rank the new shop by real distance from the moment it goes live.
  // The seller approval workflow is unaffected — these rows still
  // start with `users.is_active = false` and wait for an admin permit
  // decision before becoming visible to customers.
  const [businessName, setBusinessName] = useState("");
  const [businessRegion, setBusinessRegion] = useState("");
  const [businessDistrict, setBusinessDistrict] = useState("");
  const [businessWard, setBusinessWard] = useState("");
  const [businessStreet, setBusinessStreet] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  // Latitude / longitude are intentionally NOT a form field on the
  // seller registration screen — the brief requires automatic capture
  // only, with no manual entry. The values captured at registration
  // time are stored on `businessLatRef` / `businessLngRef` so the
  // `register()` call can forward a device GPS fix (when permission is
  // granted) or omit them so the backend's server-side geocode runs
  // unchanged.
  const businessLatRef = useRef<number | null>(null);
  const businessLngRef = useRef<number | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Surface store-level errors as soon as the loading spinner stops.
  // We can't read `storeError` synchronously after `await register(...)`
  // because React state updates are async — by the time the alert fires
  // the screen would still see the previous render's value.
  useEffect(() => {
    if (!storeLoading && storeError) {
      Alert.alert("Registration failed", storeError);
    }
  }, [storeLoading, storeError]);

  /**
   * Compose the value persisted as `seller_profiles.location` from
   * the granular fields the seller typed. Mirrors the customer
   * profile page so the saved string reads consistently on both
   * sides of the registration / profile split.
   */
  const composedBusinessAddress = [
    businessStreet,
    businessWard,
    businessDistrict,
    businessRegion,
  ]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const effectiveBusinessAddress = businessAddress.trim() || composedBusinessAddress;

  const handleRegister = async () => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Full name is required";
    if (!username.trim()) next.username = "Username is required";
    if (!isEmail(email)) next.email = "Valid email is required";
    if (!isPhone(phone)) next.phone = "Valid phone is required";
    if (password.length < 8 || password.length > 100)
      next.password = "Password must be between 8 and 100 characters";
    if (password !== confirmPassword)
      next.confirmPassword = "Passwords do not match";
    // Seller-only fields: required so the "Nearby Sellers" pipeline
    // has a valid Business Address to geocode on the backend. The
    // latitude / longitude are NEVER typed by the seller — they're
    // resolved automatically either from a foreground GPS read (when
    // permission is granted) or by the backend's
    // `SellerProfileService` geocoding the typed address.
    if (role === "seller") {
      if (!businessName.trim())
        next.businessName = "Business name is required for sellers";
      if (!businessRegion.trim())
        next.businessRegion = "Region is required";
      if (!businessDistrict.trim())
        next.businessDistrict = "District is required";
      if (!businessStreet.trim())
        next.businessStreet = "Street / area is required";
      if (!effectiveBusinessAddress)
        next.businessAddress = "Business address is required";
    }
    setErrors(next);
    if (Object.keys(next).length) {
      Alert.alert(
        "Check your details",
        "Please fix the highlighted fields and try again.",
      );
      return;
    }

    setLoading(true);
    // For SELLER registrations only — capture the device's GPS fix once,
    // just before we send the address to the backend. The helper never
    // throws and never blocks the spinner: a `null` return value lets
    // the backend fall back to its existing geocode of the typed
    // address. The seller never sees or types a coordinate.
    if (role === "seller") {
      const fix = await resolveCurrentDeviceCoords();
      businessLatRef.current = fix?.lat ?? null;
      businessLngRef.current = fix?.lng ?? null;
    } else {
      businessLatRef.current = null;
      businessLngRef.current = null;
    }

    const user = await register({
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
      role,
      ...(role === "seller"
        ? {
            businessName: businessName.trim(),
            businessRegion: businessRegion.trim(),
            businessDistrict: businessDistrict.trim(),
            businessWard: businessWard.trim(),
            businessStreet: businessStreet.trim(),
            businessAddress: effectiveBusinessAddress,
            businessLat: businessLatRef.current,
            businessLng: businessLngRef.current,
          }
        : {}),
    });
    setLoading(false);
    if (!user) {
      // The actual server message arrives in `storeError` on the next
      // render; the effect above will show the alert with it.
      return;
    }
    Alert.alert(
      "Welcome!",
      `Account created for ${user.fullName}. You are logged in as ${role}.`,
      [
        {
          text: "Continue",
          onPress: () => router.replace(roleHome(user.role) as any),
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.logoContainer}>
              <Image
                source={LOGO}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="Gas Delivery and Supply logo"
              />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Gas Delivery & Supplying System
            </Text>

            <AppInput
              label="Full Name"
              placeholder="John Doe"
              value={fullName}
              onChangeText={setFullName}
              error={errors.fullName}
            />
            <AppInput
              label="Username"
              placeholder="johndoe"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              error={errors.username}
            />
            <AppInput
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
            />
            <AppInput
              label="Phone"
              placeholder="+255..."
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              error={errors.phone}
            />

            <View style={styles.pickerWrap}>
              <Text style={styles.pickerLabel}>Register as</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={role}
                  onValueChange={(v) => setRole(v as UserRole)}
                >
                  <Picker.Item label="Customer" value="customer" />
                  <Picker.Item label="Seller" value="seller" />
                  <Picker.Item label="Rider" value="rider" />
                  <Picker.Item label="Supplier" value="supplier" />
                </Picker>
              </View>
            </View>

            {/* Seller-only Business Address section. Hidden for every
                other role so the registration form stays uncluttered
                and matches the previous UI for non-sellers exactly. */}
            {role === "seller" ? (
              <View style={styles.businessSection}>
                <Text style={styles.businessTitle}>
                  Business Address
                </Text>
                <Text style={styles.businessHelp}>
                  Required — used by customers to find your shop on the
                  Nearby Sellers list. You can update this later from
                  your Profile.
                </Text>
                <AppInput
                  label="Business Name"
                  placeholder="e.g. Asha Gas Services"
                  value={businessName}
                  onChangeText={setBusinessName}
                  error={errors.businessName}
                />
                <AppInput
                  label="Region"
                  placeholder="e.g. Zanzibar Urban West"
                  value={businessRegion}
                  onChangeText={setBusinessRegion}
                  error={errors.businessRegion}
                />
                <AppInput
                  label="District"
                  placeholder="e.g. Urban"
                  value={businessDistrict}
                  onChangeText={setBusinessDistrict}
                  error={errors.businessDistrict}
                />
                <AppInput
                  label="Ward (if applicable)"
                  placeholder="e.g. Malindi"
                  value={businessWard}
                  onChangeText={setBusinessWard}
                />
                <AppInput
                  label="Street / Area"
                  placeholder="e.g. Stone Town"
                  value={businessStreet}
                  onChangeText={setBusinessStreet}
                  error={errors.businessStreet}
                />
                <AppInput
                  label="Full Business Address"
                  placeholder="e.g. Stone Town, Zanzibar"
                  multiline
                  numberOfLines={2}
                  value={businessAddress}
                  onChangeText={setBusinessAddress}
                  error={errors.businessAddress}
                  helperText={
                    composedBusinessAddress
                      ? `Will be saved as: ${composedBusinessAddress}`
                      : undefined
                  }
                />
                {/* The seller never types a coordinate. Latitude /
                    longitude are captured automatically — either from
                    the device's GPS (foreground permission) at save
                    time, or by the backend's geocoder as a fallback —
                    so the customer "Nearby Sellers" list has real
                    Haversine distances as soon as the account is
                    approved. */}
                <Text style={styles.businessHelp}>
                  Your shop's map pin is added automatically from your
                  address — no need to type coordinates.
                </Text>
              </View>
            ) : null}

            <AppInput
              label="Password"
              placeholder="••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              error={errors.password}
            />
            <AppInput
              label="Confirm Password"
              placeholder="••••••"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={errors.confirmPassword}
            />

            <AppButton
              title="Register"
              fullWidth
              loading={loading}
              onPress={handleRegister}
            />

            <Link href="/auth/login" style={styles.link}>
              Already have an account? Login
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1 },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#CCFBF1",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  logoEmoji: { fontSize: 36 },
  title: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.primary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  pickerWrap: { marginBottom: Spacing.md },
  pickerLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
  },
  // Seller-only business address section. Visually separated from
  // the base credentials so the form reads as two clearly-scoped
  // blocks even on small phones. Matches the visual hierarchy the
  // customer-profile "Location Information" card already uses.
  businessSection: {
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  businessTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.primary,
    marginBottom: 4,
  },
  businessHelp: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 16,
  },
  fieldError: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  link: {
    textAlign: "center",
    marginTop: Spacing.lg,
    color: Colors.secondary,
    fontWeight: "600",
  },
});
