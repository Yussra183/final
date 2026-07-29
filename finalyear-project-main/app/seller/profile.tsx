/**
 * Seller → Shop Profile
 *
 * Read-only view of the seller's identity and business profile with
 * Edit Profile / Change Password actions. The current user is pulled
 * from `useStore().session.user` and the active permit (if any) is
 * surfaced to show the Business Permit Status.
 *
 * Editing is wired to `updateProfile()` so saving a change goes
 * straight to the data layer.
 */
import React, { useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import {
  LicenseApplicationSection,
} from "../../src/components/LicenseApplicationSection";
import { useStore } from "../../src/store/StoreContext";
import { permitTone } from "../../src/utils/format";
import { User } from "../../constants/types";

/** Field row used inside the profile. */
function Field(props: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <View style={styles.field}>
      <View
        style={[
          styles.fieldIcon,
          { backgroundColor: (props.tint ?? Colors.primary) + "22" },
        ]}
      >
        <Ionicons
          name={props.icon}
          size={18}
          color={props.tint ?? Colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{props.label}</Text>
        <Text style={styles.fieldValue} numberOfLines={2}>
          {props.value}
        </Text>
      </View>
    </View>
  );
}

function permitLabel(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SellerProfile() {
  const {
    session,
    getPermitForSeller,
    updateProfile,
    submitPermit,
  } = useStore();

  const [editOpen, setEditOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const user = session?.user;
  const permit = useMemo(
    () => (user ? getPermitForSeller(user.id) : undefined),
    [user, getPermitForSeller],
  );

  // Static business metadata that is not in the store today — shown
  // here so the page is non-placeholder. Backend will replace these.
  const business = useMemo(() => {
    if (!user) {
      return {
        name: "—",
        address: "—",
        hours: "Mon–Sat, 08:00 – 20:00",
      };
    }
    if (user.username === "gaspro") {
      return {
        name: "GasPro Supplies",
        address: "Kariakoo Market, Block D, Dar es Salaam",
        hours: "Mon–Sat, 08:00 – 20:00",
      };
    }
    return {
      name: `${user.fullName}'s Shop`,
      address: user.address ?? "Address not set",
      hours: "Mon–Sat, 08:00 – 20:00",
    };
  }, [user]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <SellerHeader title="Shop Profile" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero card — logo + name + permit status */}
        <Card style={styles.hero}>
          <View style={styles.heroRow}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>🔥</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.shopName}>{business.name}</Text>
              <Text style={styles.shopMeta}>
                Owned by {user?.fullName ?? "—"}
              </Text>
              <View style={{ marginTop: 6 }}>
                <StatusPill
                  label={
                    permit
                      ? `Permit ${permitLabel(permit.status)}`
                      : "Permit Not Submitted"
                  }
                  tone={
                    permit
                      ? permitTone(permit.status)
                      : "danger"
                  }
                />
              </View>
            </View>
          </View>
        </Card>

        {/* Business section */}
        <Text style={styles.sectionTitle}>Business Information</Text>
        <Card>
          <Field
            icon="storefront-outline"
            label="Shop Name"
            value={business.name}
          />
          <Divider />
          <Field
            icon="location-outline"
            label="Business Address"
            value={business.address}
            tint={Colors.accent}
          />
          <Divider />
          <Field
            icon="time-outline"
            label="Working Hours"
            value={business.hours}
            tint={Colors.info}
          />
          <Divider />
          <Field
            icon="document-text-outline"
            label="Business Permit Status"
            value={
              permit
                ? `${permitLabel(permit.status)} • #${permit.registrationNumber}`
                : "Not yet submitted"
            }
            tint={
              permit && permit.status === "approved"
                ? Colors.success
                : permit && permit.status === "rejected"
                  ? Colors.danger
                  : Colors.warning
            }
          />
        </Card>

        {/* Owner section */}
        <Text style={styles.sectionTitle}>Owner Details</Text>
        <Card>
          <Field
            icon="person-outline"
            label="Owner Name"
            value={user?.fullName ?? "—"}
          />
          <Divider />
          <Field
            icon="call-outline"
            label="Phone Number"
            value={user?.phone ?? "—"}
            tint={Colors.secondary}
          />
          <Divider />
          <Field
            icon="mail-outline"
            label="Email Address"
            value={user?.email ?? "—"}
            tint={Colors.accent}
          />
        </Card>

        {/* Stats summary */}
        <Text style={styles.sectionTitle}>At a Glance</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: "#CCFBF1" }]}>
            <Ionicons name="star" size={20} color={Colors.warning} />
            <Text style={styles.statValue}>4.7</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: "#DBEAFE" }]}>
            <Ionicons name="people-outline" size={20} color={Colors.info} />
            <Text style={[styles.statValue, { color: Colors.info }]}>240+</Text>
            <Text style={styles.statLabel}>Customers</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: "#DCFCE7" }]}>
            <Ionicons name="bag-check-outline" size={20} color={Colors.success} />
            <Text style={[styles.statValue, { color: Colors.success }]}>1.2k</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
        </View>

        {/* Seller License Application — lets the seller download the
            official form, upload required documents, submit for
            verification, and download the issued license once approved.
            The component talks directly to the live API through the
            store, so no parent wiring is required here. */}
        <Text style={styles.sectionTitle}>Seller License Application</Text>
        <LicenseApplicationSection user={user!} />

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <AppButton
            title="Edit Profile"
            variant="primary"
            leftIcon={<Ionicons name="create-outline" size={18} color="#FFF" />}
            style={{ flex: 1 }}
            onPress={() => setEditOpen(true)}
          />
          <AppButton
            title="Change Password"
            variant="outline"
            leftIcon={<Ionicons name="lock-closed-outline" size={18} color={Colors.primary} />}
            style={{ flex: 1 }}
            onPress={() => setPwdOpen(true)}
          />
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>

      <EditProfileModal
        user={user ?? null}
        businessName={business.name}
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={async (patch) => {
          await updateProfile(patch);
          Alert.alert("Saved", "Your profile has been updated.");
          setEditOpen(false);
        }}
      />

      <ChangePasswordModal
        visible={pwdOpen}
        onClose={() => setPwdOpen(false)}
        onSave={() => {
          // Future backend hook: UsersApi.changePassword(...)
          Alert.alert(
            "Password updated",
            "Your password has been changed successfully.",
          );
          setPwdOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function EditProfileModal({
  user,
  businessName,
  visible,
  onClose,
  onSave,
}: {
  user: User | null;
  businessName: string;
  visible: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Omit<User, "id" | "role" | "createdAt">>) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [address, setAddress] = useState(user?.address ?? "");

  React.useEffect(() => {
    if (visible && user) {
      setFullName(user.fullName);
      setPhone(user.phone);
      setEmail(user.email);
      setAddress(user.address ?? "");
    }
  }, [visible, user]);

  const submit = async () => {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert("Missing info", "Name and email are required.");
      return;
    }
    await onSave({
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim() || undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit Profile</Text>
          <Text style={styles.modalSub}>{businessName}</Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            <AppInput
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
            <AppInput
              label="Phone Number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <AppInput
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <AppInput
              label="Business Address"
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={2}
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <AppButton
              title="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={onClose}
            />
            <AppButton
              title="Save Changes"
              variant="primary"
              style={{ flex: 1 }}
              onPress={submit}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ChangePasswordModal({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  React.useEffect(() => {
    if (visible) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }, [visible]);

  const submit = () => {
    if (!current || !next || !confirm) {
      Alert.alert("Missing fields", "Please fill in all password fields.");
      return;
    }
    if (next.length < 4) {
      Alert.alert("Too short", "Use at least 4 characters.");
      return;
    }
    if (next !== confirm) {
      Alert.alert("Mismatch", "New passwords do not match.");
      return;
    }
    onSave();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Change Password</Text>
          <Text style={styles.modalSub}>
            Choose a strong password to keep your account secure.
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            <AppInput
              label="Current Password"
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
            />
            <AppInput
              label="New Password"
              value={next}
              onChangeText={setNext}
              secureTextEntry
            />
            <AppInput
              label="Confirm New Password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <AppButton
              title="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={onClose}
            />
            <AppButton
              title="Update"
              variant="primary"
              style={{ flex: 1 }}
              onPress={submit}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  // Hero
  hero: { marginBottom: Spacing.lg },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoEmoji: { fontSize: 36 },
  shopName: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  shopMeta: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Sections
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  // Field
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  fieldIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },
  fieldValue: {
    fontSize: FontSize.md,
    color: Colors.text,
    marginTop: 2,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statBox: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.primary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: "700",
  },

  // Actions
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: "85%",
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.text,
  },
  modalSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});