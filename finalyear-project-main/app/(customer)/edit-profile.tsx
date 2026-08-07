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
import { useStore } from "../../src/store/StoreContext";
import {
  Colors,
  FontSize,
  Spacing,
} from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Avatar } from "../../src/components/Avatar";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { isEmail, isPhone } from "../../src/utils/validators";

export default function EditProfileScreen() {
  const router = useRouter();
  const { session } = useStore();
  const user = session?.user!;
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(user.address ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Full name is required";
    if (!isEmail(email)) next.email = "Valid email is required";
    if (!isPhone(phone)) next.phone = "Valid phone is required";
    if (!address.trim()) next.address = "Address is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    // In production this would call UsersApi.update. For the demo we
    // surface success immediately.
    setTimeout(() => {
      setSaving(false);
      Alert.alert("Profile updated", "Your changes have been saved.", [
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
          <Text style={styles.title}>Edit Profile</Text>
          <Text style={styles.subtitle}>
            Update your personal information.
          </Text>

          <Card style={{ alignItems: "center" }}>
            <Avatar name={fullName || user.fullName} size={80} />
            <AppButton
              title="Change photo"
              variant="ghost"
              style={{ marginTop: Spacing.sm }}
            />
          </Card>

          <Card style={{ marginTop: Spacing.md }}>
            <AppInput
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              error={errors.fullName}
            />
            <AppInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />
            <AppInput
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
            />
            <AppInput
              label="Address"
              value={address}
              onChangeText={setAddress}
              multiline
              error={errors.address}
            />
          </Card>
        </ScrollView>
        <View style={styles.footer}>
          <AppButton
            title="Save changes"
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
