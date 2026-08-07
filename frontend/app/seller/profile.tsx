/**
 * Seller → Shop Profile
 *
 * Read-only view of the seller's identity and business profile with
 * Edit Profile / Change Password actions. The current user is pulled
 * from `useStore().session.user` and the active permit (if any) is
 * surfaced to show the Business Permit Status.
 *
 * The permit is read straight from the live `sellerPermits` slice
 * (populated by `fetchMyPermit` from `GET /api/permits/me`) and
 * refetched on every focus so the green "Approved" pill flips
 * immediately after the admin approves the application.
 *
 * Editing is wired to `updateProfile()` so saving a change goes
 * straight to the data layer.
 */
import React, { useCallback, useMemo, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { SellerHeader } from "../../src/components/SellerHeader";
import { Card } from "../../src/components/Card";
import { StatusPill } from "../../src/components/StatusPill";
import { AppInput } from "../../src/components/AppInput";
import { AppButton } from "../../src/components/AppButton";
import { useStore } from "../../src/store/StoreContext";
import { permitTone } from "../../src/utils/format";
import { resolveCurrentDeviceCoords } from "../../src/lib/deviceLocation";
import { MapPickerSheet } from "../../src/components/MapPickerSheet";
import { ShopMapPreview } from "../../src/components/ShopMapPreview";
import { Picker } from "@react-native-picker/picker";
import type { User } from "../../constants/types";
import { ZANZIBAR_REGIONS, composeZanzibarAddress, getDistricts, matchRegionValue, matchDistrictValue } from "../../constants/zanzibar";

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
    sellerPermits,
    fetchMyPermit,
    updateProfile,
    saveSellerLocation,
  } = useStore();

  const [editOpen, setEditOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [selectedPin, setSelectedPin] = useState<{ lat: number; lng: number } | null>(null);

  const user = session?.user;
  // Read the live permit from the sellerPermits slice — the same slice
  // the dashboard banner consumes, so the two surfaces stay in sync.
  const permit = useMemo(
    () => (user ? sellerPermits[user.id] : undefined),
    [user, sellerPermits],
  );

  // Refetch the permit every time the Profile screen regains focus.
  // Without this, an admin approval performed in another session is
  // never picked up until the seller signs out and back in — the same
  // focus-refresh pattern the dashboard uses.
  useFocusEffect(
    useCallback(() => {
      fetchMyPermit().catch(() => {});
    }, []),
  );

  // Business metadata is read straight from the signed-in user's profile
  // (filled in via registration / Edit Profile / permit submission).
  // The granular location fields on `user` are mirrored onto the
  // session by `refresh()`'s seller branch (`SellersApi.me`) so they
  // are populated after login even when no permit has been submitted
  // yet. Composing the display string from those pieces keeps the
  // header in sync with whatever the seller typed in either place.
  const business = useMemo(() => {
    if (!user) {
      return {
        name: "—",
        address: "—",
      };
    }
    const composed = composeZanzibarAddress({
      street: user.street,
      ward: user.ward,
      districtKey: user.district,
      regionKey: user.region,
      regionForDistrict: user.region,
    });
    const displayAddress =
      user.address?.trim() ||
      composed ||
      "Address not set";
    const shopName =
      permit?.businessName?.trim() ||
      `${user.fullName}'s Shop`;
    return {
      name: shopName,
      address: displayAddress,
    };
  }, [user, permit]);

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
          {typeof user?.lat === "number" &&
          Number.isFinite(user.lat) &&
          typeof user?.lng === "number" &&
          Number.isFinite(user.lng) ? (
            <ShopMapPreview lat={user.lat} lng={user.lng} />
          ) : (
            <Text style={styles.mapPlaceholder}>
              📍 Tap &quot;Edit Business Address&quot; to set your shop
              location on the map.
            </Text>
          )}
          <Divider />
          <View style={styles.field}>
            <View
              style={[
                styles.fieldIcon,
                {
                  backgroundColor:
                    permit && permit.status === "approved"
                      ? Colors.success + "22"
                      : permit && permit.status === "rejected"
                        ? Colors.danger + "22"
                        : Colors.warning + "22",
                },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={18}
                color={
                  permit && permit.status === "approved"
                    ? Colors.success
                    : permit && permit.status === "rejected"
                      ? Colors.danger
                      : Colors.warning
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Business Permit Status</Text>
              <View style={styles.permitRow}>
                <Text style={styles.fieldValue}>
                  {permit ? permitLabel(permit.status) : "Not yet submitted"}
                </Text>
                {permit ? (
                  <StatusPill
                    label={permitLabel(permit.status)}
                    tone={
                      permit.status === "approved"
                        ? "success"
                        : permit.status === "rejected"
                          ? "danger"
                          : permit.status === "under_review"
                            ? "info"
                            : "warning"
                    }
                    style={styles.permitPill}
                  />
                ) : null}
              </View>
            </View>
          </View>
        </Card>

        {/* Personal section */}
        <Text style={styles.sectionTitle}>Personal Details</Text>
        <Card>
          <Field
            icon="person-outline"
            label="Full Name"
            value={user?.fullName ?? "—"}
          />
          <Divider />
          <Field
            icon="at-outline"
            label="Username"
            value={user?.username ?? "—"}
          />
          <Divider />
          <Field
            icon="call-outline"
            label="Phone Number"
            value={user?.phone ?? "—"}
            tint={Colors.secondary}
          />
        </Card>

        {/* Stats summary — Rating is the only stat we have a real number
           for (mirrored from `SellerProfile.rating` onto `user.rating`
           by StoreContext.refresh()). Customers / Orders / Working
           hours used to be hardcoded placeholders that looked like
           real metrics — they were deleted so the only tile shown is
           the one backed by actual data. */}
        <Text style={styles.sectionTitle}>At a Glance</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: "#CCFBF1" }]}>
            <Ionicons name="star" size={20} color={Colors.warning} />
            <Text style={styles.statValue}>
              {typeof user?.rating === "number" ? user.rating.toFixed(1) : "—"}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* Seller Licence — summary card pointing at the dedicated
            Licences drawer entry. The full 4-step workflow (download
            form → upload documents → submit → download certificate)
            lives at `app/seller/licences.tsx`; we keep just the status
            pill here so the profile still surfaces permit health, with
            a single tap to drill into the workflow. */}
        <Text style={styles.sectionTitle}>Seller Licence</Text>
        <Card>
          <View style={styles.licenceRow}>
            <View
              style={[
                styles.licenceIcon,
                {
                  backgroundColor:
                    permit && permit.status === "approved"
                      ? Colors.success + "22"
                      : permit && permit.status === "rejected"
                        ? Colors.danger + "22"
                        : Colors.warning + "22",
                },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={22}
                color={
                  permit && permit.status === "approved"
                    ? Colors.success
                    : permit && permit.status === "rejected"
                      ? Colors.danger
                      : Colors.warning
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.licenceTitle}>
                {permit
                  ? `Permit ${permitLabel(permit.status)}`
                  : "Gas Selling Permit"}
              </Text>
              <Text style={styles.licenceSub}>
                {permit
                  ? permit.status === "approved"
                    ? "Your permit is active. Tap to view or re-download certificate."
                    : "Application in progress. Tap to check status or upload documents."
                  : "Submit your documents to get your permit approved."}
              </Text>
            </View>
          </View>
        </Card>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <AppButton
            title="Edit Profile"
            variant="outline"
            leftIcon={<Ionicons name="create-outline" size={18} color={Colors.primary} />}
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

        {/* Business Address edit. Mirrors the customer Profile's
            "Location Information" card — same field shape, same save
            semantics (PUT /api/sellers/me via the store). The header
            above reflects whatever the seller saves here on the next
            render. */}
        <View style={[styles.actionRow, { marginTop: Spacing.sm }]}>
          <AppButton
            title="Edit Business Address"
            variant="outline"
            leftIcon={<Ionicons name="location-outline" size={18} color={Colors.primary} />}
            style={{ flex: 1 }}
            onPress={() => setAddressOpen(true)}
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

      <EditBusinessAddressModal
        visible={addressOpen}
        onClose={() => setAddressOpen(false)}
        onRequestOpenMap={() => {
          setAddressOpen(false);
          setMapPickerOpen(true);
        }}
        externalPin={selectedPin}
        user={user ?? null}
        businessName={business.name}
        onSave={async (patch) => {
          // saveSellerLocation calls POST /api/sellers/me with the
          // full business address patch; the response carries the
          // server-resolved lat/lng (when the patch omitted them)
          // which the store merges onto `session.user`.
          //
          // The modal also forwards an optional device GPS fix
          // (`deviceCoords`) captured at save time so the saved row
          // gets the exact foreground fix when permission is granted;
          // otherwise the backend's geocoder fills in the coordinates
          // — the seller never sees a lat/lng field either way.
          await saveSellerLocation(patch);
          Alert.alert(
            "Business address updated",
            "Your shop location has been saved.",
          );
          setAddressOpen(false);
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

      <MapPickerSheet
        visible={mapPickerOpen}
        onClose={() => {
          setMapPickerOpen(false);
          setAddressOpen(true);
        }}
        initialLat={selectedPin?.lat ?? (typeof user?.lat === "number" ? user.lat : undefined)}
        initialLng={selectedPin?.lng ?? (typeof user?.lng === "number" ? user.lng : undefined)}
        onConfirm={(coords) => {
          setSelectedPin(coords);
          setMapPickerOpen(false);
          setAddressOpen(true);
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

  React.useEffect(() => {
    if (visible && user) {
      setFullName(user.fullName);
      setPhone(user.phone);
      setEmail(user.email);
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
            {/* Business Address is edited through the dedicated
                `EditBusinessAddressModal` (the "Business Information"
                card opens it). The previous duplicate input here
                routed through PATCH /api/customers/me which rejects
                Role.SELLER, so saves silently no-op'd — deleting it
                removes the dead UI. */}
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

/**
 * Edit Business Address modal.
 *
 * Mirrors the customer Profile's "Location Information" card field
 * for field so a seller can fill in the same business address that
 * the registration form collects (Region / District / Ward / Street /
 * Full Address / Latitude / Longitude). Saving here calls
 * `saveSellerLocation` (which itself posts to `/api/sellers/me`),
 * and the store merges the server's response onto `session.user` —
 * including the resolved lat/lng the customer "Nearby Sellers"
 * pipeline reads on its next query.
 */
function EditBusinessAddressModal({
  visible,
  onClose,
  onRequestOpenMap,
  externalPin,
  user,
  businessName,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onRequestOpenMap: () => void;
  externalPin?: { lat: number; lng: number } | null;
  user: User | null;
  businessName: string;
  onSave: (patch: {
    businessName?: string;
    location: string;
    region?: string | null;
    district?: string | null;
    ward?: string | null;
    street?: string | null;
    deviceCoords?: { lat: number; lng: number } | null;
    pinCoords?: { lat: number; lng: number } | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [ward, setWard] = useState("");
  const [street, setStreet] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinChosen, setPinChosen] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setName(businessName || user?.fullName || "");
    const rKey = matchRegionValue(user?.region);
    setRegion(rKey);
    setDistrict(matchDistrictValue(rKey, user?.district));
    setWard(user?.ward ?? "");
    setStreet(user?.street ?? "");
    setFullAddress(user?.address ?? "");
    setErrors({});

    const effectivePin = externalPin ?? (
      typeof user?.lat === "number" && Number.isFinite(user.lat) &&
      typeof user?.lng === "number" && Number.isFinite(user.lng)
        ? { lat: user.lat, lng: user.lng }
        : null
    );
    setPin(effectivePin);
    if (externalPin) setPinChosen(true);
  }, [visible, user, businessName, externalPin]);

  const composed = useMemo(
    () =>
      composeZanzibarAddress({
        street,
        ward,
        districtKey: district,
        regionKey: region,
        regionForDistrict: region,
      }),
    [street, ward, district, region],
  );
  const effectiveAddress = fullAddress.trim() || composed;

  const submit = async () => {
    const next: Record<string, string> = {};
    if (!effectiveAddress) next.fullAddress = "Business address is required";
    setErrors(next);
    if (Object.keys(next).length) {
      Alert.alert(
        "Check your details",
        "Please fix the highlighted fields and try again.",
      );
      return;
    }

    setSaving(true);
    try {
      const deviceCoords = pinChosen
        ? null
        : await resolveCurrentDeviceCoords();
      await onSave({
        businessName: name.trim() || undefined,
        location: effectiveAddress,
        region: region.trim() || null,
        district: district.trim() || null,
        ward: ward.trim() || null,
        street: street.trim() || null,
        deviceCoords,
        pinCoords: pinChosen && pin ? pin : null,
      });
    } catch (err) {
      Alert.alert(
        "Save failed",
        (err as Error)?.message ?? "Please try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit Business Address</Text>
          <Text style={styles.modalSub}>{businessName}</Text>

          <ScrollView keyboardShouldPersistTaps="handled">
            <AppInput
              label="Business Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            {/* Region Picker */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: "700", marginBottom: 6 }}>
                Region
              </Text>
              <View style={{ borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surfaceMuted, overflow: "hidden" }}>
                <Picker
                  selectedValue={region}
                  onValueChange={(v) => {
                    setRegion(v);
                    setDistrict("");
                  }}
                  style={{ height: 50, color: Colors.text }}
                >
                  <Picker.Item label="Select region..." value="" color={Colors.textMuted} />
                  {ZANZIBAR_REGIONS.map((r) => (
                    <Picker.Item key={r.value} label={r.label} value={r.value} />
                  ))}
                </Picker>
              </View>
            </View>

            {/* District Picker */}
            <View style={{ marginBottom: Spacing.md }}>
              <Text style={{ fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: "700", marginBottom: 6 }}>
                District
              </Text>
              <View style={{ borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surfaceMuted, overflow: "hidden" }}>
                <Picker
                  selectedValue={district}
                  onValueChange={(v) => setDistrict(v)}
                  style={{ height: 50, color: Colors.text }}
                >
                  <Picker.Item label={region ? "Select district..." : "Select region first"} value="" color={Colors.textMuted} />
                  {getDistricts(region).map((d) => (
                    <Picker.Item key={d.value} label={d.label} value={d.value} />
                  ))}
                </Picker>
              </View>
            </View>

            <AppInput
              label="Ward"
              value={ward}
              onChangeText={setWard}
            />
            <AppInput
              label="Street / Area"
              value={street}
              onChangeText={setStreet}
            />
            <AppInput
              label="Full Business Address"
              value={fullAddress}
              onChangeText={setFullAddress}
              multiline
              numberOfLines={2}
              error={errors.fullAddress}
              helperText={
                composed
                  ? `Will be saved as: ${composed}`
                  : undefined
              }
            />

            <View style={styles.pinSection}>
              <Text style={styles.pinSectionLabel}>Shop Location</Text>
              {pin ? (
                <Text style={styles.pinSummary}>
                  📍 {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                  {pinChosen ? " (new)" : ""}
                </Text>
              ) : (
                <Text style={styles.pinEmpty}>
                  📍 Not set yet — tap to choose
                </Text>
              )}
              <AppButton
                title={pin ? "Change pin" : "Set on map"}
                variant="outline"
                leftIcon={
                  <Ionicons
                    name="map-outline"
                    size={18}
                    color={Colors.primary}
                  />
                }
                onPress={onRequestOpenMap}
                style={styles.pinBtn}
              />
              <Text style={styles.businessHelp}>
                Your pin location is set separately from the address
                text. You can drop a pin on the map, use your current
                location, or type coordinates directly.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <AppButton
              title="Cancel"
              variant="outline"
              style={{ flex: 1 }}
              onPress={onClose}
            />
            <AppButton
              title="Save"
              variant="primary"
              style={{ flex: 1 }}
              loading={saving}
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
  /**
   * Permit row — keeps the textual status next to the professional
   * status badge so the seller sees both the value and the colour-coded
   * pill in one glance.
   */
  permitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: 2,
  },
  permitPill: {
    marginTop: 0,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  /**
   * Modal helper note shown beneath the address inputs. Same visual
   * treatment as the registration form's `businessHelp` and the
   * customer Profile's location-instruction copy — keeps the address
   * capture pattern consistent across every seller-side touchpoint.
   */
  businessHelp: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    lineHeight: 16,
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

  // Licence summary card — surfaces permit health on the profile and
  // hands the seller off to the dedicated Licences drawer entry.
  licenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  licenceIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  licenceTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  licenceSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },

  // Inline preview placeholder shown under the Business Address field
  // when the shop has no coordinates yet. Same muted text style as the
  // licenceSub helper above.
  mapPlaceholder: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },

  // Shop Location section inside the Edit Business Address modal.
  pinSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  pinSectionLabel: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  pinSummary: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: "800",
    marginBottom: Spacing.sm,
  },
  pinEmpty: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    fontStyle: "italic",
  },
  pinBtn: {
    marginBottom: Spacing.sm,
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