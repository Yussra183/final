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
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
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
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero band ─────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.circle1} />
          <View style={styles.circle2} />

          {/* Back button */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>

          <Animated.View
            style={{
              alignItems: "center",
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <View style={styles.iconRing}>
              <Ionicons name="lock-open-outline" size={40} color="#FFF" />
            </View>
            <Text style={styles.heroTitle}>Forgot Password?</Text>
            <Text style={styles.heroSub}>
              We'll send a reset link to your email
            </Text>
          </Animated.View>
        </View>

        {/* ── Card ──────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.card,
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
              <Text style={styles.cardTitle}>Reset your password</Text>
              <Text style={styles.cardSub}>
                Enter the email or username you registered with.
              </Text>

              <View style={styles.inputWrap}>
                <View style={styles.inputIcon}>
                  <Ionicons
                    name="mail-outline"
                    size={18}
                    color={Colors.textMuted}
                  />
                </View>
                <View style={styles.inputInner}>
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

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>remember it?</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.loginBtn}
                onPress={() => router.replace("/auth/login")}
              >
                <Text style={styles.loginBtnText}>Back to Login</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.primaryDark },
  scroll: { flexGrow: 1 },

  // Hero
  hero: {
    backgroundColor: Colors.primaryDark,
    paddingTop: 56,
    paddingBottom: 60,
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
  backBtn: {
    position: "absolute",
    top: 56,
    left: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
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
    minHeight: 300,
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

  // Input row
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  inputIcon: {
    marginTop: 32,
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  inputInner: { flex: 1 },

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

  // Back-to-login outline button
  loginBtn: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  loginBtnText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: "700",
  },

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
