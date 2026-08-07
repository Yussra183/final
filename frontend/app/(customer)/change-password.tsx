import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, FontSize, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const e: Record<string, string> = {};
    if (!current) e.current = "Enter your current password";
    if (next.length < 4) e.next = "New password must be at least 4 characters";
    if (next !== confirm) e.confirm = "Passwords do not match";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      Alert.alert("Password changed", "Please log in with your new password next time.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }, 500);
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}>
          <Text style={styles.title}>Change Password</Text>
          <Text style={styles.subtitle}>
            Choose a strong password you don&apos;t reuse elsewhere.
          </Text>
          <Card>
            <AppInput
              label="Current password"
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              error={errors.current}
            />
            <AppInput
              label="New password"
              value={next}
              onChangeText={setNext}
              secureTextEntry
              error={errors.next}
            />
            <AppInput
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              error={errors.confirm}
            />
          </Card>
        </ScrollView>
        <View style={styles.footer}>
          <AppButton
            title="Update password"
            fullWidth
            loading={saving}
            onPress={handleSave}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FontSize.xxl, fontWeight: "800", color: Colors.text },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
    marginBottom: Spacing.lg,
  },
  footer: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
