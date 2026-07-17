/**
 * Admin Dashboard – Profile page.
 *
 * Shows the admin's information, allows editing the profile, updating
 * the profile photo (avatar color picker), and changing the password.
 */
import React, { useState } from "react";
import {
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
  AdminFormField,
  AdminFormGrid,
  AdminInput,
} from "../../src/components/admin";
import {
  Colors,
  FontSize,
  Radius,
  Shadow,
  Spacing,
} from "../../constants/colors";
import { ADMIN_USER, AdminRole } from "../../src/store/adminData";

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  operations: "Operations",
  support: "Support",
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

export default function AdminProfilePage() {
  const [fullName, setFullName] = useState(ADMIN_USER.fullName);
  const [email, setEmail] = useState(ADMIN_USER.email);
  const [username, setUsername] = useState(ADMIN_USER.username);
  const [phone, setPhone] = useState("+254 712 000 000");
  const [bio, setBio] = useState(
    "Operations lead focused on supplier growth and platform reliability.",
  );
  const [colorIdx, setColorIdx] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSavedAt, setPwSavedAt] = useState<string | null>(null);

  const handleSaveProfile = () => {
    setSavedAt(new Date().toLocaleTimeString());
  };

  const handleChangePw = () => {
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
      subtitle="Manage your admin account and security"
    >
      <View style={styles.row}>
        {/* Profile card */}
        <View style={{ flex: 1, minWidth: 360 }}>
          <AdminCard>
            <Text style={styles.cardTitle}>Admin Information</Text>
            <Text style={styles.cardSub}>
              Update your personal information and profile photo
            </Text>

            <View style={styles.profileHeader}>
              <View
                style={[
                  styles.avatarWrap,
                  { backgroundColor: AVATAR_COLORS[colorIdx] },
                ]}
              >
                <Text style={styles.avatarInitials}>
                  {fullName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join("")
                    .toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.lg }}>
                <Text style={styles.profileName}>{fullName}</Text>
                <Text style={styles.profileMeta}>@{username}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                  <AdminBadge
                    label={ROLE_LABEL[ADMIN_USER.role]}
                    tone="primary"
                  />
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
              <AdminFormField label="Bio">
                <AdminInput
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  style={{ minHeight: 80 }}
                />
              </AdminFormField>
              <View style={styles.footerRow}>
                <AdminButton
                  label="Save Profile"
                  icon="💾"
                  onPress={handleSaveProfile}
                />
              </View>
              {savedAt ? (
                <Text style={styles.savedNote}>
                  ✓ Profile updated at {savedAt}
                </Text>
              ) : null}
            </View>
          </AdminCard>
        </View>

        {/* Security card */}
        <View style={{ flex: 1, minWidth: 360 }}>
          <AdminCard>
            <Text style={styles.cardTitle}>Change Password</Text>
            <Text style={styles.cardSub}>
              Use a strong password with at least 8 characters
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
                  ✓ Password changed at {pwSavedAt}
                </Text>
              ) : null}

              <View style={styles.tipBox}>
                <Text style={styles.tipTitle}>Password Tips</Text>
                <Text style={styles.tipText}>
                  • Use a mix of upper, lower, numbers and symbols{"\n"}• Don't
                  reuse passwords from other accounts{"\n"}• Change your
                  password every 90 days
                </Text>
              </View>
            </View>
          </AdminCard>

          <AdminCard style={{ marginTop: Spacing.lg }}>
            <Text style={styles.cardTitle}>Account Activity</Text>
            <Text style={styles.cardSub}>
              Recent logins and security events
            </Text>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <ActivityRow
                device="MacBook Pro · Chrome"
                location="Nairobi, Kenya"
                time="Active now"
                current
              />
              <ActivityRow
                device="iPhone 15 · Safari"
                location="Nairobi, Kenya"
                time="2 hours ago"
              />
              <ActivityRow
                device="Windows · Edge"
                location="Mombasa, Kenya"
                time="Yesterday · 14:22"
              />
            </View>
          </AdminCard>
        </View>
      </View>
    </AdminLayout>
  );
}

function ActivityRow({
  device,
  location,
  time,
  current,
}: {
  device: string;
  location: string;
  time: string;
  current?: boolean;
}) {
  return (
    <View style={styles.activityRow}>
      <View
        style={[
          styles.activityDot,
          { backgroundColor: current ? Colors.success : Colors.textMuted },
        ]}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.activityDevice}>{device}</Text>
        <Text style={styles.activityMeta}>
          {location} • {time}
        </Text>
      </View>
      {current ? (
        <AdminBadge label="This device" tone="success" />
      ) : (
        <TouchableOpacity>
          <Text style={styles.revokeText}>Revoke</Text>
        </TouchableOpacity>
      )}
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
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.card,
  },
  avatarInitials: {
    color: "#FFF",
    fontSize: 32,
    fontWeight: "900",
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
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
  },
  colorRow: {
    flexDirection: "row",
    gap: 8,
  },
  colorChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorChipActive: {
    borderColor: Colors.text,
  },
  colorCheck: {
    color: "#FFF",
    fontWeight: "900",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: Spacing.md,
  },
  savedNote: {
    color: Colors.success,
    fontWeight: "800",
    marginTop: 8,
    textAlign: "right",
    fontSize: FontSize.sm,
  },
  pwStrength: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.sm,
  },
  pwBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  pwStrengthText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  tipBox: {
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  tipTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceMuted,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  activityDevice: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  activityMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  revokeText: {
    fontSize: FontSize.sm,
    color: Colors.danger,
    fontWeight: "800",
  },
});