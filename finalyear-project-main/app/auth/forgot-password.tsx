import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const handleReset = () => {
    if (!emailOrUsername.trim()) {
      setError("Please enter your email or username");
      return;
    }
    setError(undefined);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        "Reset link sent",
        "If an account matches, a password reset link has been sent.",
        [{ text: "OK", onPress: () => router.replace("/auth/login") }],
      );
    }, 500);
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
              <Text style={styles.logoEmoji}>🔑</Text>
            </View>

            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>
              Enter your email or username and we&apos;ll send you a reset link.
            </Text>

            <AppInput
              label="Email or Username"
              placeholder="you@example.com"
              autoCapitalize="none"
              value={emailOrUsername}
              onChangeText={setEmailOrUsername}
              error={error}
            />

            <AppButton
              title="Send Reset Link"
              fullWidth
              loading={loading}
              onPress={handleReset}
            />

            <Link href="/auth/login" style={styles.link}>
              Back to Login
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
  link: {
    textAlign: "center",
    marginTop: Spacing.lg,
    color: Colors.secondary,
    fontWeight: "600",
  },
});
