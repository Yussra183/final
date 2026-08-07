/**
 * Register Screen — 3-step premium redesign
 *
 * Step 1 — Personal Info   (Full Name, Username, Email, Phone)
 * Step 2 — Your Role       (icon cards: Customer / Seller / Rider / Supplier)
 *           └─ Seller only: Business Details section
 *                (Business Name, Region ← Zanzibar picker, District ← filtered picker,
 *                 Ward, Street, Full Address auto-composed)
 * Step 3 — Security        (Password, Confirm Password)
 *
 * Data captured here is forwarded to the backend via `register()` and
 * merged onto `session.user` on success — profile pages read from the
 * store and NEVER ask the user to enter this info again.
 *
 * All business logic is unchanged from the previous version; only the
 * presentation layer is replaced.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
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
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../../src/store/StoreContext";
import { UserRole } from "../../constants/types";
import { isEmail, isPhone } from "../../src/utils/validators";
import { roleHome } from "../../src/utils/format";
import { resolveCurrentDeviceCoords } from "../../src/lib/deviceLocation";
import {
  ZANZIBAR_REGIONS,
  composeZanzibarAddress,
  getDistricts,
} from "../../constants/zanzibar";

const LOGO = require("../../assets/images/icon.png");

// ─── Role definitions ─────────────────────────────────────────────────────────

interface RoleDef {
  value: UserRole;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  tint: string;
}

const ROLES: RoleDef[] = [
  {
    value: "customer",
    label: "Customer",
    icon: "home-outline",
    description: "Order gas to your doorstep",
    tint: Colors.primary,
  },
  {
    value: "seller",
    label: "Seller",
    icon: "storefront-outline",
    description: "Sell gas from your shop",
    tint: Colors.accent,
  },
  {
    value: "rider",
    label: "Rider",
    icon: "bicycle-outline",
    description: "Deliver orders and earn",
    tint: Colors.success,
  },
  {
    value: "supplier",
    label: "Supplier",
    icon: "car-outline",
    description: "Supply gas to sellers",
    tint: Colors.info,
  },
];

const TOTAL_STEPS = 3;

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  return (
    <View style={stepStyles.row}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <React.Fragment key={i}>
            <View
              style={[
                stepStyles.dot,
                done && stepStyles.dotDone,
                active && stepStyles.dotActive,
              ]}
            >
              {done ? (
                <Ionicons name="checkmark" size={12} color="#FFF" />
              ) : (
                <Text style={[stepStyles.dotNum, active && stepStyles.dotNumActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            {i < TOTAL_STEPS - 1 && (
              <View style={[stepStyles.line, done && stepStyles.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dotActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  dotDone: {
    borderColor: Colors.success,
    backgroundColor: Colors.success,
  },
  dotNum: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.textMuted,
  },
  dotNumActive: { color: "#FFF" },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  lineDone: { backgroundColor: Colors.success },
});

// ─── Zanzibar region/district picker ─────────────────────────────────────────

function ZanzibarPicker({
  label,
  selectedValue,
  onValueChange,
  items,
  placeholder,
  error,
}: {
  label: string;
  selectedValue: string;
  onValueChange: (v: string) => void;
  items: { label: string; value: string }[];
  placeholder: string;
  error?: string;
}) {
  return (
    <View style={pickerStyles.wrap}>
      <Text style={pickerStyles.label}>{label}</Text>
      <View style={[pickerStyles.box, !!error && pickerStyles.boxError]}>
        <Picker
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          style={pickerStyles.picker}
          itemStyle={pickerStyles.item}
        >
          <Picker.Item label={placeholder} value="" color={Colors.textMuted} />
          {items.map((it) => (
            <Picker.Item key={it.value} label={it.label} value={it.value} />
          ))}
        </Picker>
      </View>
      {error ? <Text style={pickerStyles.error}>{error}</Text> : null}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
    marginBottom: 6,
  },
  box: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    overflow: "hidden",
  },
  boxError: { borderColor: Colors.danger },
  picker: { height: 50, color: Colors.text },
  item: { fontSize: FontSize.md },
  error: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    marginTop: 4,
    fontWeight: "600",
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function RegisterScreen() {
  const router = useRouter();
  const { register, error: storeError, loading: storeLoading } = useStore();

  const [step, setStep] = useState(0);

  // Step 1 — Personal Info
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2 — Role
  const [role, setRole] = useState<UserRole>("customer");

  // Step 2 (seller) — Business Details
  const [businessName, setBusinessName] = useState("");
  const [businessRegion, setBusinessRegion] = useState("");
  const [businessDistrict, setBusinessDistrict] = useState("");
  const [businessWard, setBusinessWard] = useState("");
  const [businessStreet, setBusinessStreet] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");

  // Step 3 — Security
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // GPS refs — captured silently at submit time for sellers
  const businessLatRef = useRef<number | null>(null);
  const businessLngRef = useRef<number | null>(null);

  // Animation for step transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const heroFade = useRef(new Animated.Value(0)).current;
  const heroSlide = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(heroFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(heroSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  // Surface store-level errors
  useEffect(() => {
    if (!storeLoading && storeError) {
      Alert.alert("Registration failed", storeError);
    }
  }, [storeLoading, storeError]);

  // Reset district when region changes
  useEffect(() => {
    setBusinessDistrict("");
  }, [businessRegion]);

  // Composed address from granular fields. Routed through the shared
  // helper so the form, the seller profile header and the seller
  // profile Edit modal all render the same string for the same input.
  const composedAddress = composeZanzibarAddress({
    street: businessStreet,
    ward: businessWard,
    districtKey: businessDistrict,
    regionKey: businessRegion,
    regionForDistrict: businessRegion,
  });
  const effectiveAddress = businessAddress.trim() || composedAddress;

  // ── Validation per step ────────────────────────────────────────────────────

  const validateStep = (): boolean => {
    const next: Record<string, string> = {};

    if (step === 0) {
      if (!fullName.trim()) next.fullName = "Full name is required";
      if (!username.trim()) next.username = "Username is required";
      if (!isEmail(email)) next.email = "Valid email is required";
      if (!isPhone(phone)) next.phone = "Valid Tanzanian phone number is required";
    }

    if (step === 1 && role === "seller") {
      if (!businessName.trim()) next.businessName = "Business name is required";
      if (!businessRegion) next.businessRegion = "Please select a region";
      if (!businessDistrict) next.businessDistrict = "Please select a district";
      if (!businessStreet.trim()) next.businessStreet = "Street / area is required";
    }

    if (step === 2) {
      if (password.length < 8 || password.length > 100)
        next.password = "Password must be 8–100 characters";
      if (password !== confirmPassword)
        next.confirmPassword = "Passwords do not match";
    }

    setErrors(next);
    if (Object.keys(next).length) {
      Alert.alert("Check your details", "Please fix the highlighted fields.");
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    animateTransition(() => setStep((s) => s + 1));
  };

  const goBack = () => {
    animateTransition(() => setStep((s) => s - 1));
  };

  const animateTransition = (callback: () => void) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleRegister = async () => {
    if (!validateStep()) return;

    setLoading(true);
    if (role === "seller") {
      const fix = await resolveCurrentDeviceCoords();
      businessLatRef.current = fix?.lat ?? null;
      businessLngRef.current = fix?.lng ?? null;
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
            businessRegion,
            businessDistrict,
            businessWard: businessWard.trim(),
            businessStreet: businessStreet.trim(),
            businessAddress: effectiveAddress,
            businessLat: businessLatRef.current,
            businessLng: businessLngRef.current,
          }
        : {}),
    });

    setLoading(false);
    if (!user) return;

    Alert.alert(
      "Welcome aboard! 🎉",
      `Account created for ${user.fullName}.\nYou are signed in as ${role}.`,
      [{ text: "Get started", onPress: () => router.replace(roleHome(user.role) as any) }],
    );
  };

  // ── Step labels ─────────────────────────────────────────────────────────────

  const STEP_TITLES = [
    "Personal Info",
    "Your Role",
    "Secure Account",
  ];

  const STEP_SUBS = [
    "Tell us about yourself",
    "How will you use the app?",
    "Set a strong password",
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ──────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.circle1} />
          <View style={styles.circle2} />
          <Animated.View
            style={{
              alignItems: "center",
              opacity: heroFade,
              transform: [{ translateY: heroSlide }],
            }}
          >
            <View style={styles.logoRing}>
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.heroTitle}>Create Account</Text>
            <Text style={styles.heroSub}>Gas Delivery & Supplying System</Text>
          </Animated.View>
        </View>

        {/* ── Card ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          {/* Step bar */}
          <StepBar step={step} />
          <Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>
          <Text style={styles.stepSub}>{STEP_SUBS[step]}</Text>

          {/* ── Step content ────────────────────────────────────── */}
          <Animated.View style={{ opacity: fadeAnim }}>

            {/* ─── STEP 0 — Personal Info ───────────────────────── */}
            {step === 0 && (
              <View>
                <AppInput
                  label="Full Name"
                  placeholder="e.g. Amina Hassan"
                  value={fullName}
                  onChangeText={setFullName}
                  error={errors.fullName}
                  autoCapitalize="words"
                />
                <AppInput
                  label="Username"
                  placeholder="e.g. amina123"
                  autoCapitalize="none"
                  value={username}
                  onChangeText={setUsername}
                  error={errors.username}
                />
                <AppInput
                  label="Email Address"
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  error={errors.email}
                />
                <AppInput
                  label="Phone Number"
                  placeholder="+255 777 000 000"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  error={errors.phone}
                />
              </View>
            )}

            {/* ─── STEP 1 — Role + Seller Details ──────────────── */}
            {step === 1 && (
              <View>
                {/* Role cards */}
                <View style={styles.roleGrid}>
                  {ROLES.map((r) => {
                    const active = role === r.value;
                    return (
                      <Pressable
                        key={r.value}
                        style={[
                          styles.roleCard,
                          active && { borderColor: r.tint, backgroundColor: r.tint + "10" },
                        ]}
                        onPress={() => setRole(r.value)}
                        android_ripple={{ color: r.tint + "20" }}
                      >
                        <View
                          style={[
                            styles.roleIcon,
                            { backgroundColor: active ? r.tint : r.tint + "22" },
                          ]}
                        >
                          <Ionicons
                            name={r.icon}
                            size={22}
                            color={active ? "#FFF" : r.tint}
                          />
                        </View>
                        <Text
                          style={[
                            styles.roleLabel,
                            active && { color: r.tint },
                          ]}
                        >
                          {r.label}
                        </Text>
                        <Text style={styles.roleDesc} numberOfLines={2}>
                          {r.description}
                        </Text>
                        {active && (
                          <View style={[styles.roleTick, { backgroundColor: r.tint }]}>
                            <Ionicons name="checkmark" size={10} color="#FFF" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Seller-only: Business Details */}
                {role === "seller" && (
                  <View style={styles.businessSection}>
                    <View style={styles.businessHeader}>
                      <Ionicons name="storefront" size={18} color={Colors.accent} />
                      <Text style={styles.businessTitle}>Business Details</Text>
                    </View>
                    <Text style={styles.businessHelp}>
                      Required so customers can find your shop on the Nearby Sellers list.
                      You can update this later from your Profile.
                    </Text>

                    <AppInput
                      label="Business Name"
                      placeholder="e.g. Asha Gas Services"
                      value={businessName}
                      onChangeText={setBusinessName}
                      error={errors.businessName}
                      autoCapitalize="words"
                    />

                    {/* Region picker */}
                    <ZanzibarPicker
                      label="Region"
                      selectedValue={businessRegion}
                      onValueChange={setBusinessRegion}
                      items={ZANZIBAR_REGIONS.map((r) => ({
                        label: r.label,
                        value: r.value,
                      }))}
                      placeholder="Select your region…"
                      error={errors.businessRegion}
                    />

                    {/* District picker — filtered by region */}
                    <ZanzibarPicker
                      label="District"
                      selectedValue={businessDistrict}
                      onValueChange={setBusinessDistrict}
                      items={getDistricts(businessRegion)}
                      placeholder={
                        businessRegion
                          ? "Select your district…"
                          : "Choose a region first"
                      }
                      error={errors.businessDistrict}
                    />

                    <AppInput
                      label="Ward (optional)"
                      placeholder="e.g. Malindi"
                      value={businessWard}
                      onChangeText={setBusinessWard}
                      autoCapitalize="words"
                    />
                    <AppInput
                      label="Street / Area"
                      placeholder="e.g. Stone Town"
                      value={businessStreet}
                      onChangeText={setBusinessStreet}
                      error={errors.businessStreet}
                      autoCapitalize="words"
                    />
                    <AppInput
                      label="Full Business Address"
                      placeholder="e.g. Stone Town, Urban, Mjini Magharibi, Zanzibar"
                      multiline
                      numberOfLines={2}
                      value={businessAddress}
                      onChangeText={setBusinessAddress}
                      helperText={
                        composedAddress
                          ? `Auto-composed: ${composedAddress}`
                          : undefined
                      }
                    />

                    <View style={styles.gpsBadge}>
                      <Ionicons
                        name="location-outline"
                        size={14}
                        color={Colors.primary}
                      />
                      <Text style={styles.gpsText}>
                        Your shop pin is set automatically from your address — no
                        coordinates needed.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ─── STEP 2 — Security ────────────────────────────── */}
            {step === 2 && (
              <View>
                <AppInput
                  label="Password"
                  placeholder="At least 8 characters"
                  secureTextEntry={!showPwd}
                  value={password}
                  onChangeText={setPassword}
                  error={errors.password}
                  rightAdornment={
                    <TouchableOpacity onPress={() => setShowPwd((s) => !s)}>
                      <Ionicons
                        name={showPwd ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Colors.primary}
                      />
                    </TouchableOpacity>
                  }
                />
                <AppInput
                  label="Confirm Password"
                  placeholder="Repeat your password"
                  secureTextEntry={!showConfirmPwd}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  error={errors.confirmPassword}
                  rightAdornment={
                    <TouchableOpacity
                      onPress={() => setShowConfirmPwd((s) => !s)}
                    >
                      <Ionicons
                        name={showConfirmPwd ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={Colors.primary}
                      />
                    </TouchableOpacity>
                  }
                />

                {/* Summary chip */}
                <View style={styles.summaryChip}>
                  <Ionicons
                    name={ROLES.find((r) => r.value === role)?.icon ?? "person-outline"}
                    size={16}
                    color={Colors.primary}
                  />
                  <Text style={styles.summaryText}>
                    Registering as <Text style={{ fontWeight: "800" }}>{role}</Text>
                    {role === "seller" && businessName
                      ? ` · ${businessName}`
                      : ""}
                  </Text>
                </View>

                <Text style={styles.termsText}>
                  By creating an account you agree to our Terms of Service and
                  Privacy Policy.
                </Text>
              </View>
            )}
          </Animated.View>

          {/* ── Navigation buttons ─────────────────────────────────── */}
          <View style={styles.navRow}>
            {step > 0 ? (
              <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}

            {step < TOTAL_STEPS - 1 ? (
              <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                <Text style={styles.nextBtnText}>Next</Text>
                <Ionicons name="chevron-forward" size={18} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <AppButton
                title="Create Account"
                loading={loading}
                onPress={handleRegister}
                style={styles.submitBtn}
              />
            )}
          </View>

          {/* Login link */}
          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.replace("/auth/login")}
          >
            <Text style={styles.loginLinkText}>
              Already have an account?{" "}
              <Text style={{ color: Colors.primary, fontWeight: "700" }}>
                Sign in
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primaryDark },
  scroll: { flexGrow: 1 },

  // Hero
  hero: {
    backgroundColor: Colors.primaryDark,
    paddingTop: 52,
    paddingBottom: 52,
    alignItems: "center",
    overflow: "hidden",
  },
  circle1: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.05)",
    top: -60,
    right: -50,
  },
  circle2: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -20,
    left: -30,
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
    overflow: "hidden",
  },
  logo: { width: 80, height: 80 },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: "#FFF",
    textAlign: "center",
  },
  heroSub: {
    fontSize: FontSize.sm,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginTop: 4,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -24,
    padding: Spacing.xl,
    paddingTop: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  stepTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 4,
  },
  stepSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },

  // Role cards
  roleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  roleCard: {
    width: "47%",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    position: "relative",
    overflow: "hidden",
  },
  roleIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  roleLabel: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 2,
  },
  roleDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  roleTick: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  // Seller business section
  businessSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  businessHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
  },
  businessTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.accent,
  },
  businessHelp: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    lineHeight: 17,
  },
  gpsBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#CCFBF1",
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: 4,
  },
  gpsText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.primaryDark,
    lineHeight: 17,
  },

  // Step 3 — summary chip
  summaryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#CCFBF1",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  summaryText: {
    fontSize: FontSize.sm,
    color: Colors.primaryDark,
    flex: 1,
  },
  termsText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 16,
    marginTop: Spacing.sm,
  },

  // Navigation row
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 13,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  nextBtnText: {
    fontSize: FontSize.md,
    color: "#FFF",
    fontWeight: "700",
  },
  submitBtn: { flex: 1 },

  // Login link
  loginLink: {
    marginTop: Spacing.lg,
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  loginLinkText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
});
