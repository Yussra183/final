import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../../src/store/StoreContext";
import { roleHome } from "../../src/utils/format";

const LOGO = require("../../assets/images/icon.png");

export default function LoginScreen() {
  const router = useRouter();
  const { login, error: storeError, errorCode: storeErrorCode, loading: storeLoading } = useStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  // Surface store-level errors as soon as the loading spinner stops.
  // We can't read `storeError` synchronously after `await login(...)`
  // because React state updates are async — by the time the alert fires
  // the screen would still see the previous render's value.
  //
  // For network failures (`storeErrorCode === "NETWORK"` — the
  // classic "Could not reach backend at http://10.x.x.x:8080" alert)
  // we surface a one-tap fix: re-running `npm run dev:lan` redetects
  // the laptop's current LAN IP, rewrites `.env.local`, and starts
  // Expo against the new value — no manual edits required.
  //
  // Pending and rejected sellers are allowed to log in — the seller
  // portal surfaces their permit status via the dashboard banner and
  // drawer gating, so we no longer intercept those error codes here.
  useEffect(() => {
    if (storeLoading || !storeError) return;
    if (storeErrorCode === "NETWORK" || storeErrorCode === "TIMEOUT") {
      Alert.alert(
        "Cannot reach the server",
        `${storeError}\n\n` +
          "Most likely cause: the URL in .env.local is a LAN IP that no longer matches your Wi-Fi.\n\n" +
          "Fix — run this in the project folder:\n" +
          "  npm run dev:lan\n\n" +
          "It redetects the laptop's current LAN IP, rewrites .env.local and launches Expo for you. Make sure the Spring Boot backend is running first (`cd gas-delivery && mvn spring-boot:run`).",
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
    if (!user) {
      // The actual server message arrives in `storeError` on the next
      // render; the effect above will show the alert with it.
      return;
    }
    router.replace(roleHome(user.role) as any);
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

            <Text style={styles.title}>Gas Delivery & Supplying</Text>
            <Text style={styles.subtitle}>Welcome back, sign in to continue</Text>

            <AppInput
              label="Username or Email"
              placeholder="e.g. asha"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              error={errors.username}
            />

            <AppInput
              label="Password"
              placeholder="Enter your password"
              secureTextEntry={!showPwd}
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              rightAdornment={
                <TouchableOpacity onPress={() => setShowPwd((s) => !s)}>
                  <Text style={{ color: Colors.primary, fontWeight: "700" }}>
                    {showPwd ? "Hide" : "Show"}
                  </Text>
                </TouchableOpacity>
              }
            />

            <AppButton
              title="Login"
              fullWidth
              loading={loading}
              onPress={handleLogin}
            />

            <Link href="/auth/forgot-password" style={styles.link}>
              Forgot Password?
            </Link>

            <Link href="/auth/register" style={styles.link}>
              Don&apos;t have an account? Register
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
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#CCFBF1",
    alignSelf: "center",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
    borderWidth: 3,
    borderColor: Colors.secondary,
    overflow: "hidden",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  logoEmoji: { fontSize: 44 },
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
    marginTop: Spacing.md,
    color: Colors.secondary,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  helperText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  demoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  demoChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  demoChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
});
