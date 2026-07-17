import React, { useEffect, useState } from "react";
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
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    const user = await register({
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim(),
      phone: phone.trim(),
      password,
      role,
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
  link: {
    textAlign: "center",
    marginTop: Spacing.lg,
    color: Colors.secondary,
    fontWeight: "600",
  },
});
