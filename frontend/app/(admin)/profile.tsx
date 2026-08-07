/**
 * Admin Dashboard – Profile page.
 *
 * The signed-in admin's identity and form values are read from
 * `useStore().session.user`, which the auth module populated from the
 * backend at login. The Profile and Change Password forms are local UI
 * state only — the backend exposes no admin profile-update endpoint, so
 * the "Save" buttons render a notice rather than calling a write API.
 *
 * The previous "Account Activity" list (MacBook, iPhone, Windows with
 * invented locations) was fabricated. There is no activity endpoint in
 * the backend, so that section is gone.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AdminLayout } from "../../src/components/admin/AdminLayout";
import {
  AdminAvatar,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminFormField,
  AdminFormGrid,
  AdminInput,
} from "../../src/components/admin";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useStore } from "../../src/store/StoreContext";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
};

const AVATAR_COLORS = [
  "#0F766E",
  "#F97316",
  "#6366F1",
  "#10B981",
  "#EF4444",
  "#3B82F6",
  "#A855F7",
  "#1E293B",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

export default function AdminProfilePage() {
  const { session } = useStore();
  const user = session?.user;

  const initialName = user?.fullName ?? "Admin";
  const initialEmail = user?.email ?? "";
  const initialUsername = user?.username ?? "";
  const initialPhone = user?.phone ?? "";

  const [fullName, setFullName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [username, setUsername] = useState(initialUsername);
  const [phone, setPhone] = useState(initialPhone);
  const [colorIdx, setColorIdx] = useState(0);
  const [infoSavedAt, setInfoSavedAt] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSavedAt, setPwSavedAt] = useState<string | null>(null);

  const roleLabel = useMemo(
    () => ROLE_LABEL[user?.role ?? "admin"] ?? "Administrator",
    [user?.role],
  );

  const handleSaveProfile = () => {
    Alert.alert(
      "Saved locally",
      "The backend does not currently expose a profile-update endpoint, so this change stays in this browser session only.",
    );
    setInfoSavedAt(new Date().toLocaleTimeString());
  };

  const handleChangePw = () => {
    Alert.alert(
      "Saved locally",
      "The backend does not currently expose a change-password endpoint for admin users. The form above is for reference only.",
    );
    setPwSavedAt(new Date().toLocaleTimeString());
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
  };

  const pwValid =
    currentPw.length >= 6 && newPw.length >= 8 && newPw === confirmPw;

  return (
    <AdminLayout
      title="Profile"
      subtitle="Account details for the signed-in administrator"
    >
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 360 }}>
          <AdminCard>
            <Text style={styles.cardTitle}>Admin Information</Text>
            <Text style={styles.cardSub}>
              Sourced from the signed-in session. Profile updates are not
              yet wired to the backend.
            </Text>

            <View style={styles.profileHeader}>
              <View
                style={[
                  styles.avatarWrap,
                  { backgroundColor: AVATAR_COLORS[colorIdx] },
                ]}
              >
                <Text style={styles.avatarInitials}>
                  {initials(fullName) || "A"}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.lg }}>
                <Text style={styles.profileName}>{fullName}</Text>
                <Text style={styles.profileMeta}>@{username}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                  <AdminBadge label={roleLabel} tone="primary" />
                  <AdminBadge label="Active" tone="success" />
                </View>
              </View>
            </View>

            <View style={{ marginTop: Spacing.lg }}>
              <Text style={styles.label}>Profile Photo Color</Text>
              <View style={styles.colorRow}>
                {AVATAR_COLORS.map((c, i) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setColorIdx(i)}
                    activeOpacity={0.85}
                    style={[
                      styles.colorChip,
                      { backgroundColor: c },
                      colorIdx === i && styles.colorChipActive,
                    ]}
                  >
                    {colorIdx === i ? (
                      <Text style={styles.colorCheck}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={{ marginTop: Spacing.lg }}>
              <AdminFormGrid columns={2}>
                <AdminFormField label="Full Name" required>
                  <AdminInput value={fullName} onChangeText={setFullName} />
                </AdminFormField>
                <AdminFormField label="Username" required>
                  <AdminInput value={username} onChangeText={setUsername} />
                </AdminFormField>
                <AdminFormField label="Email" required>
                  <AdminInput
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </AdminFormField>
                <AdminFormField label="Phone">
                  <AdminInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </AdminFormField>
              </AdminFormGrid>
              <View style={styles.footerRow}>
                <AdminButton
                  label="Save Profile"
                  icon="💾"
                  onPress={handleSaveProfile}
                />
              </View>
              {infoSavedAt ? (
                <Text style={styles.savedNote}>
                  ✓ Saved locally at {infoSavedAt}
                </Text>
              ) : null}
            </View>
          </AdminCard>
        </View>

        <View style={{ flex: 1, minWidth: 360 }}>
          <AdminCard>
            <Text style={styles.cardTitle}>Change Password</Text>
            <Text style={styles.cardSub}>
              The backend does not yet expose a change-password endpoint
              for administrators. This form is a local reference.
            </Text>

            <View style={{ marginTop: Spacing.lg, gap: Spacing.md }}>
              <AdminFormField label="Current Password" required>
                <AdminInput
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  secureTextEntry
                  placeholder="Enter your current password"
                />
              </AdminFormField>
              <AdminFormField
                label="New Password"
                required
                hint="Minimum 8 characters"
              >
                <AdminInput
                  value={newPw}
                  onChangeText={setNewPw}
                  secureTextEntry
                  placeholder="Enter a new password"
                />
              </AdminFormField>
              <AdminFormField label="Confirm New Password" required>
                <AdminInput
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  secureTextEntry
                  placeholder="Re-enter the new password"
                />
              </AdminFormField>

              <View style={styles.pwStrength}>
                <View
                  style={[
                    styles.pwBar,
                    {
                      backgroundColor:
                        newPw.length === 0
                          ? Colors.surfaceMuted
                          : newPw.length < 6
                          ? Colors.danger
                          : newPw.length < 10
                          ? Colors.warning
                          : Colors.success,
                    },
                  ]}
                />
                <Text style={styles.pwStrengthText}>
                  {newPw.length === 0
                    ? "—"
                    : newPw.length < 6
                    ? "Weak"
                    : newPw.length < 10
                    ? "Good"
                    : "Strong"}
                </Text>
              </View>

              <View style={styles.footerRow}>
                <AdminButton
                  label="Update Password"
                  icon="🔒"
                  onPress={handleChangePw}
                  disabled={!pwValid}
                />
              </View>
              {pwSavedAt ? (
                <Text style={styles.savedNote}>
                  ✓ Saved locally at {pwSavedAt}
                </Text>
              ) : null}
            </View>
          </AdminCard>

          <AdminCard style={{ marginTop: Spacing.lg }}>
            <Text style={styles.cardTitle}>Session Details</Text>
            <Text style={styles.cardSub}>
              The information the backend knows about your sign-in
            </Text>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              {user?.id ? (
                <DetailRow label="User id" value={String(user.id)} />
              ) : null}
              <DetailRow
                label="Role"
                value={user?.role ?? "Unknown"}
              />
              <DetailRow
                label="Active"
                value={user?.isActive ? "Yes" : "No"}
              />
              <DetailRow
                label="Email"
                value={user?.email ?? "—"}
              />
              {user?.createdAt ? (
                <DetailRow
                  label="Account created"
                  value={new Date(user.createdAt).toLocaleDateString()}
                />
              ) : null}
            </View>
            {!user ? (
              <View style={{ marginTop: Spacing.md }}>
                <AdminEmptyState
                  icon="🔐"
                  title="Not signed in"
                  message="The session has expired. Sign in again to see your account details."
                />
              </View>
            ) : null}
          </AdminCard>
        </View>
      </View>
    </AdminLayout>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  cardSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
    fontWeight: "600",
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: FontSize.lg,
  },
  profileName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  profileMeta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
    fontWeight: "600",
  },
  label: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
    marginBottom: 6,
  },
  colorRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  colorChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  colorChipActive: {
    borderWidth: 2,
    borderColor: Colors.text,
  },
  colorCheck: {
    color: "#FFF",
    fontWeight: "800",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: Spacing.md,
  },
  savedNote: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: "700",
    textAlign: "right",
    marginTop: 4,
  },
  pwStrength: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pwBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  pwStrengthText: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.textSecondary,
    width: 64,
    textAlign: "right",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  detailValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: "800",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: Spacing.md,
  },
});
