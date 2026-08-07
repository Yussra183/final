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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import {
  AUTH_ACTIVE_OPACITY,
  authStyles,
  heroPaddingTop,
} from "../../src/styles/authStyles";
import { useStore } from "../../src/store/StoreContext";
import { roleHome } from "../../src/utils/format";

const LOGO = require("../../assets/images/icon.png");

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
      style={authStyles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={authStyles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Keeps the iOS over-scroll area above the hero teal, not white */}
        <View style={authStyles.heroOverscroll} />

        {/* ── Hero band ────────────────────────────────────────── */}
        <View style={[authStyles.hero, { paddingTop: heroPaddingTop(insets.top) }]}>
          {/* Decorative circles */}
          <View style={authStyles.circle1} />
          <View style={authStyles.circle2} />

          <Animated.View
            style={[
              styles.logoWrap,
              { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={authStyles.ring}>
              <Image source={LOGO} style={authStyles.logo} resizeMode="contain" />
            </View>
            <Text style={authStyles.heroTitle}>Gas Delivery & Supplying</Text>
            <Text style={authStyles.heroSub}>
              Zanzibar&apos;s fastest gas delivery platform
            </Text>
          </Animated.View>
        </View>

        {/* ── Floating card ─────────────────────────────────────── */}
        <Animated.View
          style={[
            authStyles.card,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Text style={authStyles.cardTitle}>Welcome back</Text>
          <Text style={authStyles.cardSub}>Sign in to continue</Text>

          {/* Username / Email */}
          <View style={authStyles.inputWrap}>
            <View style={authStyles.inputIcon}>
              <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
            </View>
            <View style={authStyles.inputInner}>
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
          <View style={authStyles.inputWrap}>
            <View style={authStyles.inputIcon}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} />
            </View>
            <View style={authStyles.inputInner}>
              <AppInput
                label="Password"
                placeholder="Enter your password"
                secureTextEntry={!showPwd}
                value={password}
                onChangeText={setPassword}
                error={errors.password}
                rightAdornment={
                  <TouchableOpacity
                    onPress={() => setShowPwd((s) => !s)}
                    activeOpacity={AUTH_ACTIVE_OPACITY}
                  >
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
          <View style={authStyles.divider}>
            <View style={authStyles.dividerLine} />
            <Text style={authStyles.dividerText}>Don&apos;t have an account?</Text>
            <View style={authStyles.dividerLine} />
          </View>

          {/* Register link */}
          <TouchableOpacity
            style={authStyles.outlineBtn}
            onPress={() => router.push("/auth/register")}
            activeOpacity={AUTH_ACTIVE_OPACITY}
          >
            <Text style={authStyles.outlineBtnText}>Create Account</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logoWrap: { alignItems: "center", zIndex: 1 },

  // Forgot link
  forgotLink: {
    textAlign: "right",
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: "700",
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
});
