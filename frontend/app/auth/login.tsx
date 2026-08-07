/**
 * Login Screen — premium redesign
 *
 * Visual language:
 *   • Deep-teal hero band at the top (~40% of screen height)
 *   • Floating white card that overlaps the hero band
 *   • Icon-adorned input fields
 *   • Eye-toggle for the password field using Ionicons
 *
 * Logic is unchanged from the previous version: delegates to
 * `useStore().login()` and routes to `roleHome(user.role)` on success.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../../src/store/StoreContext";
import { roleHome } from "../../src/utils/format";

const LOGO = require("../../assets/images/icon.png");

export default function LoginScreen() {
  const router = useRouter();
  const {
    login,
    error: storeError,
    errorCode: storeErrorCode,
    loading: storeLoading,
  } = useStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  // Surface store-level errors
  useEffect(() => {
    if (storeLoading || !storeError) return;
    if (storeErrorCode === "NETWORK" || storeErrorCode === "TIMEOUT") {
      Alert.alert(
        "Cannot reach the server",
        `${storeError}\n\nMost likely cause: the URL in .env.local is a LAN IP that no longer matches your Wi-Fi.\n\nFix — run:\n  npm run dev:lan`,
      );
    } else {
      Alert.alert("Login failed", storeError);
    }
  }, [storeLoading, storeError, storeErrorCode]);

  const handleLogin = async () => {
    const next: typeof errors = {};
    if (!username.trim()) next.username = "Username is required";
    if (!password) next.password = "Password is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    const user = await login(username.trim(), password);
    setLoading(false);
    if (!user) return;
    router.replace(roleHome(user.role) as any);
  };

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
        {/* ── Hero band ────────────────────────────────────────── */}
        <View style={styles.hero}>
          {/* Decorative circles */}
          <View style={styles.circle1} />
          <View style={styles.circle2} />

          <Animated.View
            style={[
              styles.logoWrap,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.logoRing}>
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
            </View>
            <Text style={styles.heroTitle}>Gas Delivery & Supplying</Text>
            <Text style={styles.heroSub}>
              Zanzibar's fastest gas delivery platform
            </Text>
          </Animated.View>
        </View>

        {/* ── Floating card ─────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.card,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSub}>Sign in to continue</Text>

          {/* Username / Email */}
          <View style={styles.inputWrap}>
            <View style={styles.inputIcon}>
              <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
            </View>
            <View style={styles.inputInner}>
              <AppInput
                label="Username or Email"
                placeholder="e.g. asha"
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
                error={errors.username}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputWrap}>
            <View style={styles.inputIcon}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
            </View>
            <View style={styles.inputInner}>
              <AppInput
                label="Password"
                placeholder="Enter your password"
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
            </View>
          </View>

          {/* Forgot password */}
          <Link href="/auth/forgot-password" style={styles.forgotLink}>
            Forgot password?
          </Link>

          {/* Login button */}
          <AppButton
            title="Sign In"
            fullWidth
            loading={loading}
            onPress={handleLogin}
          />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Don't have an account?</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Register link */}
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => router.push("/auth/register")}
            activeOpacity={0.85}
          >
            <Text style={styles.registerBtnText}>Create Account</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primaryDark },
  scroll: { flexGrow: 1 },

  // Hero band
  hero: {
    backgroundColor: Colors.primaryDark,
    paddingTop: 64,
    paddingBottom: 60,
    alignItems: "center",
    overflow: "hidden",
  },
  circle1: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.05)",
    top: -60,
    right: -60,
  },
  circle2: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -20,
    left: -40,
  },
  logoWrap: { alignItems: "center", zIndex: 1 },
  logoRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  logo: { width: 96, height: 96 },
  heroTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: "#FFF",
    textAlign: "center",
  },
  heroSub: {
    fontSize: FontSize.sm,
    color: "rgba(255,255,255,0.7)",
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
    minHeight: 480,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  cardTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },

  // Input rows with icon
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  inputIcon: {
    marginTop: 32, // aligns with the input field (accounts for the label)
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  inputInner: { flex: 1 },

  // Forgot link
  forgotLink: {
    textAlign: "right",
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "700",
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },

  // Register button (outline style)
  registerBtn: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  registerBtnText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: "700",
  },
});
