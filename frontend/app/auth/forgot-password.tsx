/**
 * Forgot Password Screen — visual refresh to match the new auth design language.
 *
 * Shares the dark-teal hero + floating card layout used on Login and Register.
 * Logic is the same as before (placeholder — backend not yet wired).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
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

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleReset = () => {
    if (!emailOrUsername.trim()) {
      setError("Please enter your email or username");
      return;
    }
    setError(undefined);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 800);
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

        {/* ── Hero band ─────────────────────────────────────── */}
        <View style={[authStyles.hero, { paddingTop: heroPaddingTop(insets.top) }]}>
          <View style={authStyles.circle1} />
          <View style={authStyles.circle2} />

          {/* Back button */}
          <TouchableOpacity
            style={[authStyles.backBtn, { top: heroPaddingTop(insets.top) }]}
            onPress={() => router.back()}
            activeOpacity={AUTH_ACTIVE_OPACITY}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textInverse} />
          </TouchableOpacity>

          <Animated.View
            style={{
              alignItems: "center",
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <View style={authStyles.ring}>
              <Ionicons name="lock-open-outline" size={40} color={Colors.textInverse} />
            </View>
            <Text style={authStyles.heroTitle}>Forgot Password?</Text>
            <Text style={authStyles.heroSub}>
              We&apos;ll send a reset link to your email
            </Text>
          </Animated.View>
        </View>

        {/* ── Card ──────────────────────────────────────────── */}
        <Animated.View
          style={[
            authStyles.card,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {sent ? (
            /* ── Success state ── */
            <View style={styles.successWrap}>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
              </View>
              <Text style={styles.successTitle}>Link Sent!</Text>
              <Text style={styles.successBody}>
                If an account matches <Text style={{ fontWeight: "700" }}>{emailOrUsername}</Text>,
                a password reset link has been sent. Check your inbox (and spam folder).
              </Text>
              <AppButton
                title="Back to Login"
                fullWidth
                onPress={() => router.replace("/auth/login")}
                style={{ marginTop: Spacing.lg }}
              />
            </View>
          ) : (
            /* ── Form state ── */
            <>
              <Text style={authStyles.cardTitle}>Reset your password</Text>
              <Text style={authStyles.cardSub}>
                Enter the email or username you registered with.
              </Text>

              <View style={authStyles.inputWrap}>
                <View style={authStyles.inputIcon}>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={Colors.textMuted}
                  />
                </View>
                <View style={authStyles.inputInner}>
                  <AppInput
                    label="Email or Username"
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={emailOrUsername}
                    onChangeText={setEmailOrUsername}
                    error={error}
                  />
                </View>
              </View>

              <AppButton
                title="Send Reset Link"
                fullWidth
                loading={loading}
                onPress={handleReset}
              />

              <View style={authStyles.divider}>
                <View style={authStyles.dividerLine} />
                <Text style={authStyles.dividerText}>Remember it?</Text>
                <View style={authStyles.dividerLine} />
              </View>

              <TouchableOpacity
                style={authStyles.outlineBtn}
                onPress={() => router.replace("/auth/login")}
                activeOpacity={AUTH_ACTIVE_OPACITY}
              >
                <Text style={authStyles.outlineBtnText}>Back to Login</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Success state
  successWrap: { alignItems: "center", paddingVertical: Spacing.lg },
  successIcon: { marginBottom: Spacing.md },
  successTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.success,
    marginBottom: Spacing.sm,
  },
  successBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
