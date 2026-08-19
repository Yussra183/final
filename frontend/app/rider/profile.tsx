/**
 * Rider → Profile screen
 *
 * Professional self-service view of the signed-in rider. All data is
 * fetched live from the backend through {@link RidersApi} and
 * {@link RiderPermitsApi} — no mock data, no hardcoded names, no
 * hardcoded seller. The screen has four sections:
 *
 *   1. Account card   — Avatar, full name, `@username · Rider`,
 *                       status pill (Active / Inactive).
 *   2. Personal info   — Email, Phone, Region, District, Physical
 *                       Address, National ID.
 *   3. Vehicle details — Vehicle Type, Plate Number, Vehicle Model,
 *                       Driving Licence Number.
 *   4. Assigned seller — Read-only card with the seller's name,
 *                       business, phone and location. When the rider
 *                       has not yet been assigned, shows the brief's
 *                       verbatim waiting message.
 *   5. Permit cert     — "View Permit" + "Download Permit (PDF)" when
 *                       an approved permit exists; otherwise the
 *                       brief's verbatim "not yet issued" message.
 *
 * Refresh is wired via {@link useFocusEffect} so the screen re-fetches
 * when the rider returns from elsewhere (e.g. an admin assigned a
 * seller while the rider was in another tab).
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { File, Directory, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useStore } from "../../src/store/StoreContext";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { Card } from "../../src/components/Card";
import { Avatar } from "../../src/components/Avatar";
import { AppButton } from "../../src/components/AppButton";
import { StatusPill } from "../../src/components/StatusPill";
import { ScreenHeader } from "../../src/components/ScreenHeader";
import { DrawerMenuButton } from "../../src/components/DrawerMenuButton";
import { LogoutButton } from "../../src/components/LogoutButton";
import { ApiError } from "../../src/api/errors";
import { API_CONFIG } from "../../src/api/config";
import {
  RidersApi,
  RiderPermitsApi,
} from "../../src/api/endpoints";
import {
  Rider,
  RiderAssignedSeller,
  RiderPermitSummary,
  User,
} from "../../constants/types";
import { useRiderVerificationStatus } from "../../src/hooks/useRiderVerificationStatus";

// ============================================================================
// Helpers
// ============================================================================

function renderField(
  icon: keyof typeof Ionicons.glyphMap,
  label: string,
  value: string | null | undefined,
  tint?: string,
) {
  const display = value && value.trim().length > 0 ? value : "—";
  return (
    <View style={styles.field}>
      <View
        style={[
          styles.fieldIcon,
          { backgroundColor: (tint ?? Colors.primary) + "22" },
        ]}
      >
        <Ionicons
          name={icon}
          size={18}
          color={tint ?? Colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{display}</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function permitStatusLabel(status: RiderPermitSummary["status"]): string {
  if (!status) return "Pending";
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "under_review":
      return "Under Review";
    case "pending":
    case "draft":
    default:
      return "Pending Review";
  }
}

function permitStatusTone(
  status: RiderPermitSummary["status"],
): "primary" | "success" | "warning" | "danger" | "info" | "muted" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

// ============================================================================
// Screen
// ============================================================================

export default function RiderProfile() {
  const router = useRouter();
  const { session, logout } = useStore();
  // `session!` is safe at this point — the rider layout guards the
  // route — but use a defensive fallback so a stray undefined never
  // throws during the first render of a newly-registered rider.
  const user = session?.user ?? ({
    id: "",
    fullName: "",
    username: "",
    email: "",
    phone: "",
    role: "rider" as const,
    createdAt: new Date().toISOString(),
  } as User);

  // ---- Live data --------------------------------------------------------
  const [rider, setRider] = useState<Rider | null>(null);
  const [assignedSeller, setAssignedSeller] =
    useState<RiderAssignedSeller | null>(null);
  const [permit, setPermit] = useState<RiderPermitSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Edit contact modal ---------------------------------------------
  // Approved riders can update their personal contact / location
  // information. The brief explicitly forbids editing application
  // number, national ID, driving licence, approval status, assigned
  // seller and rider certificate — so the modal only mounts the
  // mutable fields and the PATCH payload omits everything else.
  const [editOpen, setEditOpen] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editRegion, setEditRegion] = useState("");
  const [editDistrict, setEditDistrict] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ---- Permit download state -------------------------------------------
  const [downloadingPermit, setDownloadingPermit] = useState(false);
  const [permitSavedUri, setPermitSavedUri] = useState<string | null>(null);
  const [permitDownloadMessage, setPermitDownloadMessage] = useState<
    string | null
  >(null);

  // ---- Verification status (Pending / Approved / Rejected) ------------
  // Drives the verification pill on the account card and the
  // "not yet approved" empty state on the Permit Certificate section.
  // The hook re-fetches when the screen re-focuses (via `refreshKey`)
  // so admin actions land without a manual reload.
  const verification = useRiderVerificationStatus();

  // ---- Fetch helpers ----------------------------------------------------
  const fetchAll = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      setError(null);
      try {
        const [me, seller, permitRow] = await Promise.all([
          RidersApi.me(),
          RidersApi.assignedSellerOrNull(),
          RiderPermitsApi.myPermitOrNull(),
        ]);
        setRider(me);
        setAssignedSeller(seller);
        setPermit(permitRow);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : (err as Error)?.message ?? "Could not load rider profile.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchAll("initial");
  }, [fetchAll]);

  useFocusEffect(
    useCallback(() => {
      // Re-fetch every time the rider re-enters the screen so admin
      // changes (new seller assignment, approved permit, etc.) surface
      // immediately. Silent on failure.
      fetchAll("refresh").catch(() => {
        /* surfaced via the next full fetch */
      });
    }, [fetchAll]),
  );

  // ---- Permit download (mirrors LicenseApplicationSection) -------------
  const downloadPermit = useCallback(async () => {
    if (!permit || permit.status !== "approved") return;
    // Defense-in-depth: even if a future refactor accidentally surfaces
    // the Download button on a non-approved rider, the backend will
    // refuse the request with a 409. Bail early here too so the UI
    // never attempts an unauthorised download.
    if (!verification.isApproved) return;
    setPermitDownloadMessage(null);
    setPermitSavedUri(null);

    const permitUrl = RiderPermitsApi.certificateUrl();
    const filename = `Rider_Permit_Certificate-${user.id}.pdf`;
    let viewableUri: string | null = null;

    setDownloadingPermit(true);
    try {
      // 1. Stream the PDF into a temp file via the legacy download API
      //    — keeps the bearer token out of the URL.
      const tempDir = new Directory(Paths.cache, "rider-permits");
      if (!tempDir.exists) tempDir.create();
      const tempTarget = new File(tempDir, filename);
      if (tempTarget.exists) tempTarget.delete();

      const result = await FileSystemLegacy.downloadAsync(
        `${API_CONFIG.BASE_URL}${permitUrl}`,
        tempTarget.uri,
        {
          headers: {
            Accept: "application/pdf",
            "X-Api-Version": API_CONFIG.API_VERSION,
            ...(session?.token
              ? { Authorization: `Bearer ${session.token}` }
              : {}),
          },
        },
      );
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Server returned ${result.status}`);
      }
      if (!tempTarget.exists || (tempTarget.size ?? 0) <= 0) {
        throw new Error("Saved permit is empty. Please try again.");
      }

      // 2. Sanity-check the PDF magic header so we don't surface a
      //    server error page as a "successful download".
      const tempBytes = tempTarget.bytesSync();
      const head = tempBytes.slice(0, 5);
      const header = String.fromCharCode(...head);
      if (header !== "%PDF-") {
        throw new Error(
          "Downloaded certificate is not a valid PDF. Please try again.",
        );
      }

      // 3. Persist under the app's Documents folder so expo-sharing can
      //    hand a `file://` URI to the system PDF viewer.
      const docDir = new Directory(Paths.document, "rider-permits");
      if (!docDir.exists) docDir.create();
      const docTarget = new File(docDir, filename);
      if (docTarget.exists) docTarget.delete();
      docTarget.write(tempBytes);
      if (!docTarget.exists || (docTarget.size ?? 0) <= 0) {
        throw new Error("Saved permit is empty. Please try again.");
      }
      viewableUri = docTarget.uri;

      setPermitSavedUri(viewableUri);
      setPermitDownloadMessage(
        Platform.OS === "android"
          ? "✅ Rider Permit Certificate saved. Tap View Permit to open it."
          : "✅ Rider Permit Certificate saved to the app's Documents folder.",
      );
    } catch (err) {
      const failure = err instanceof Error ? err : new Error(String(err));
      console.error(
        "[RiderProfile] permit download failed",
        failure.name,
        failure.message,
      );
      setPermitSavedUri(null);
      Alert.alert(
        "Download failed",
        failure.message ||
          "Could not save the Rider Permit Certificate. Please try again.",
      );
    } finally {
      setDownloadingPermit(false);
    }
  }, [permit, session?.token, user.id]);

  const viewPermit = useCallback(async () => {
    if (!permitSavedUri) return;
    try {
      await Sharing.shareAsync(permitSavedUri, {
        mimeType: "application/pdf",
        dialogTitle: "Rider Permit Certificate",
        UTI: "com.adobe.pdf",
      });
    } catch (err) {
      Alert.alert(
        "Could not open permit",
        (err as Error)?.message ??
          "No PDF viewer was found on this device.",
      );
    }
  }, [permitSavedUri]);

  // ---- Render helpers --------------------------------------------------
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAll("refresh");
  }, [fetchAll]);

  // ---- Edit contact modal helpers --------------------------------------
  const openEditContact = useCallback(() => {
    if (!rider) return;
    setEditPhone(rider.phone ?? "");
    setEditRegion(rider.region ?? "");
    setEditDistrict(rider.district ?? "");
    setEditAddress(rider.address ?? "");
    setEditLat(
      rider.lat != null && Number.isFinite(rider.lat)
        ? String(rider.lat)
        : "",
    );
    setEditLng(
      rider.lng != null && Number.isFinite(rider.lng)
        ? String(rider.lng)
        : "",
    );
    setEditError(null);
    setEditOpen(true);
  }, [rider]);

  const saveEditContact = useCallback(async () => {
    setEditError(null);
    // Minimal validation — the backend accepts any string and trims /
    // nulls empty values. Phone is the only field most riders care
    // about, so we surface a hint when it's blank.
    if (!editPhone.trim()) {
      setEditError("Phone number is required.");
      return;
    }
    const parseCoord = (raw: string): number | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const value = Number(trimmed);
      if (!Number.isFinite(value)) return null;
      return value;
    };
    setEditSaving(true);
    try {
      const updated = await RidersApi.updateMyContact({
        phone: editPhone,
        region: editRegion,
        district: editDistrict,
        address: editAddress,
        lat: parseCoord(editLat),
        lng: parseCoord(editLng),
      });
      setRider(updated);
      setEditOpen(false);
      Alert.alert(
        "Profile updated",
        "Your contact information has been saved. The administrator will see the latest details.",
      );
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message ??
            "Could not save your contact information.";
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  }, [
    editPhone,
    editRegion,
    editDistrict,
    editAddress,
    editLat,
    editLng,
  ]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      <ScreenHeader
        title="Profile"
        left={<DrawerMenuButton />}
        right={<LogoutButton />}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: Spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.rider}
          />
        }
      >
        <View style={{ paddingHorizontal: Spacing.lg }}>
          {loading && !rider ? (
            <Card>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.rider} />
                <Text style={styles.loadingText}>Loading your profile…</Text>
              </View>
            </Card>
          ) : null}

          {error && !loading ? (
            <Card>
              <Text style={styles.errorTitle}>Profile is taking a moment</Text>
              <Text style={styles.errorBody}>
                We couldn't refresh your profile just now ({error}). The
                sections below are still safe to browse — tap Retry once
                your connection is back.
              </Text>
              <AppButton
                title="Retry"
                variant="outline"
                onPress={() => fetchAll("initial")}
                style={{ marginTop: Spacing.md }}
              />
            </Card>
          ) : null}

          {rider ? (
            <>
              {/* ============== Account card ============== */}
              <Card style={styles.hero}>
                <View style={styles.heroRow}>
                  <Avatar
                    name={rider.fullName || user.fullName || "Rider"}
                    size={72}
                    color={Colors.rider}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                      {rider.fullName || user.fullName || "Rider"}
                    </Text>
                    <Text style={styles.username}>
                      @{rider.username ?? user.username} · Rider
                    </Text>
                    <View style={styles.heroPillRow}>
                      <StatusPill
                        label={rider.active ? "Active" : "Inactive"}
                        tone={rider.active ? "success" : "muted"}
                      />
                      <View style={{ marginLeft: Spacing.sm }} />
                      <StatusPill
                        label={`Verification: ${verification.status
                          .charAt(0)
                          .toUpperCase()}${verification.status.slice(1)}`}
                        tone={
                          verification.isApproved
                            ? "success"
                            : verification.isRejected
                              ? "danger"
                              : "warning"
                        }
                      />
                    </View>
                  </View>
                </View>
              </Card>

              {/* ============== Personal information ============== */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Personal Information</Text>
                {verification.isApproved ? (
                  <AppButton
                    title="Edit"
                    variant="outline"
                    leftIcon={
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={Colors.primary}
                      />
                    }
                    onPress={openEditContact}
                    style={styles.editBtn}
                  />
                ) : null}
              </View>
              <Card>
                {renderField(
                  "mail-outline",
                  "Email Address",
                  rider.email,
                  Colors.accent,
                )}
                <Divider />
                {renderField(
                  "call-outline",
                  "Phone Number",
                  rider.phone,
                  Colors.secondary,
                )}
                <Divider />
                {renderField(
                  "map-outline",
                  "Region",
                  rider.region,
                  Colors.info,
                )}
                <Divider />
                {renderField(
                  "navigate-outline",
                  "District",
                  rider.district,
                  Colors.info,
                )}
                <Divider />
                {renderField(
                  "location-outline",
                  "Physical Address",
                  rider.address,
                  Colors.accent,
                )}
                <Divider />
                {renderField(
                  "card-outline",
                  "National ID Number",
                  rider.nationalId,
                  Colors.warning,
                )}
                {!verification.isApproved ? (
                  <View style={styles.readOnlyNote}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={14}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.readOnlyNoteText}>
                      Contact information can be updated once the
                      administrator approves your Rider Application.
                    </Text>
                  </View>
                ) : null}
              </Card>

              {/* ============== Vehicle details ============== */}
              <Text style={styles.sectionTitle}>Vehicle Details</Text>
              <Card>
                {renderField(
                  "bicycle-outline",
                  "Vehicle Type",
                  rider.vehicleType,
                  Colors.primary,
                )}
                <Divider />
                {renderField(
                  "pricetag-outline",
                  "Vehicle Plate Number",
                  rider.vehiclePlate,
                  Colors.primary,
                )}
                <Divider />
                {renderField(
                  "speedometer-outline",
                  "Vehicle Model",
                  rider.vehicleModel,
                  Colors.info,
                )}
                <Divider />
                {renderField(
                  "id-card-outline",
                  "Driving Licence Number",
                  rider.licenseNo,
                  Colors.warning,
                )}
              </Card>

              <Text style={styles.sectionTitle}>Delivery Coverage</Text>
              <Card>
                <Text style={styles.waitingTitle}>Mobile Rider Workflow</Text>
                <Text style={styles.waitingBody}>
                  Riders are not permanently attached to one seller. Open the
                  rider dashboard to see all approved sellers and choose any
                  ready-for-pickup order.
                </Text>
                {assignedSeller ? (
                  <Text style={styles.waitingSub}>
                    Legacy seller assignment data still exists on this account,
                    but it no longer controls which deliveries you can accept.
                  </Text>
                ) : null}
              </Card>

              {/* ============== Rider Verification (compact entry-point) ============== */}
              <Text style={styles.sectionTitle}>Rider Verification</Text>
              <Card>
                <View style={styles.verifHeaderRow}>
                  <View style={styles.verifIconWrap}>
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={22}
                      color={Colors.rider}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.verifTitle}>Rider Verification Application</Text>
                    <Text style={styles.verifSub}>
                      {verification.isApproved
                        ? "Your application is approved and your account is active for deliveries."
                        : verification.isRejected
                          ? "Your application was rejected. Review the reason and re-submit."
                          : verification.application?.submittedAt
                            ? "Your application has been submitted and is awaiting administrator verification."
                            : "Upload the required documents and submit for administrator verification."}
                    </Text>
                  </View>
                  <StatusPill
                    label={
                      verification.isApproved
                        ? "Approved"
                        : verification.isRejected
                          ? "Rejected"
                          : verification.application?.submittedAt
                            ? "Under Review"
                            : "Pending"
                    }
                    tone={
                      verification.isApproved
                        ? "success"
                        : verification.isRejected
                          ? "danger"
                          : "warning"
                    }
                  />
                </View>

                <AppButton
                  title={
                    verification.isApproved
                      ? "View Application"
                      : verification.isRejected
                        ? "Re-submit Application"
                        : verification.application?.submittedAt
                          ? "View Application Status"
                          : "Continue Application"
                  }
                  variant={verification.isApproved ? "outline" : "primary"}
                  leftIcon={
                    <Ionicons
                      name={
                        verification.isApproved
                          ? "eye-outline"
                          : "arrow-forward-outline"
                      }
                      size={16}
                      color={verification.isApproved ? Colors.primary : "#FFF"}
                    />
                  }
                  onPress={() => router.push("/rider/licences")}
                  style={{ marginTop: Spacing.md }}
                  fullWidth
                />
              </Card>

              {/* ============== Permit Certificate ============== */}
              <Text style={styles.sectionTitle}>Permit Certificate</Text>
              <Card>
                {permit ? (
                  <>
                    <View style={styles.permitHeaderRow}>
                      <View style={styles.permitIconWrap}>
                        <Ionicons
                          name="ribbon-outline"
                          size={22}
                          color={Colors.success}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.permitTitle}>
                          Rider Permit Certificate
                        </Text>
                        <Text style={styles.permitSub}>
                          {permit.certificateNumber ?? `#${permit.id}`}
                        </Text>
                      </View>
                      <StatusPill
                        label={permitStatusLabel(permit.status)}
                        tone={permitStatusTone(permit.status)}
                      />
                    </View>

                    {permit.validUntil ? (
                      <Text style={styles.permitValidUntil}>
                        Valid until {permit.validUntil}
                      </Text>
                    ) : null}

                    {permit.status === "approved" ? (
                      <>
                        <View style={styles.permitActions}>
                          <AppButton
                            title={
                              permitSavedUri ? "Open Permit" : "View Permit"
                            }
                            variant="outline"
                            leftIcon={
                              <Ionicons
                                name="eye-outline"
                                size={18}
                                color={Colors.primary}
                              />
                            }
                            style={{ flex: 1 }}
                            onPress={viewPermit}
                            disabled={!permitSavedUri || downloadingPermit}
                          />
                          <AppButton
                            title={
                              downloadingPermit
                                ? "Downloading…"
                                : permitSavedUri
                                  ? "Re-download"
                                  : "Download Permit"
                            }
                            variant="primary"
                            leftIcon={
                              <Ionicons
                                name="download-outline"
                                size={18}
                                color="#FFF"
                              />
                            }
                            style={{ flex: 1 }}
                            onPress={downloadPermit}
                            disabled={downloadingPermit}
                          />
                        </View>
                        {permitDownloadMessage ? (
                          <Text style={styles.permitSuccess}>
                            {permitDownloadMessage}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.permitPending}>
                        Your permit is currently {permitStatusLabel(permit.status).toLowerCase()}.
                        The download will be available once the
                        administrator approves it.
                      </Text>
                    )}
                  </>
                ) : (
                  <View style={styles.permitEmpty}>
                    <Ionicons
                      name="document-text-outline"
                      size={36}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.permitEmptyTitle}>
                      Permit Not Yet Issued
                    </Text>
                    <Text style={styles.permitEmptyBody}>
                      Your permit certificate has not yet been issued.
                    </Text>
                  </View>
                )}
              </Card>

              {/* ============== Logout ============== */}
              <AppButton
                title="Logout"
                variant="outline"
                fullWidth
                style={{ marginTop: Spacing.xl }}
                onPress={() =>
                  Alert.alert("Logout", "Sign out of your account?", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Logout",
                      style: "destructive",
                      onPress: () => {
                        logout();
                      },
                    },
                  ])
                }
              />
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* ============== Edit Contact Modal ============== */}
      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!editSaving) setEditOpen(false);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (!editSaving) setEditOpen(false);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%" }}
          >
            <Pressable
              style={styles.modalCard}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Edit Contact Information
                </Text>
                <Pressable
                  onPress={() => {
                    if (!editSaving) setEditOpen(false);
                  }}
                  style={styles.modalClose}
                >
                  <Ionicons
                    name="close-outline"
                    size={22}
                    color={Colors.text}
                  />
                </Pressable>
              </View>
              <Text style={styles.modalSub}>
                Update your personal contact and location. These fields are
                visible to your assigned seller and the administrator.
              </Text>

              <ScrollView
                style={{ maxHeight: 420 }}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalLabel}>Phone Number *</Text>
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="e.g. +255 700 000 000"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  style={styles.modalInput}
                />
                <Text style={styles.modalLabel}>Region</Text>
                <TextInput
                  value={editRegion}
                  onChangeText={setEditRegion}
                  placeholder="e.g. Dar es Salaam"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.modalInput}
                />
                <Text style={styles.modalLabel}>District / Ward</Text>
                <TextInput
                  value={editDistrict}
                  onChangeText={setEditDistrict}
                  placeholder="e.g. Kinondoni"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.modalInput}
                />
                <Text style={styles.modalLabel}>Street / Address</Text>
                <TextInput
                  value={editAddress}
                  onChangeText={setEditAddress}
                  placeholder="e.g. 24 Bagamoyo Road"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  style={[styles.modalInput, { minHeight: 72 }]}
                />
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>GPS Latitude</Text>
                    <TextInput
                      value={editLat}
                      onChangeText={setEditLat}
                      placeholder="optional"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      style={styles.modalInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalLabel}>GPS Longitude</Text>
                    <TextInput
                      value={editLng}
                      onChangeText={setEditLng}
                      placeholder="optional"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="numeric"
                      style={styles.modalInput}
                    />
                  </View>
                </View>

                {editError ? (
                  <Text style={styles.modalError}>{editError}</Text>
                ) : null}
              </ScrollView>

              <View style={styles.modalFooter}>
                <AppButton
                  title="Cancel"
                  variant="outline"
                  style={{ flex: 1 }}
                  onPress={() => setEditOpen(false)}
                  disabled={editSaving}
                />
                <AppButton
                  title={editSaving ? "Saving…" : "Save changes"}
                  variant="primary"
                  style={{ flex: 1 }}
                  onPress={saveEditContact}
                  disabled={editSaving}
                />
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  errorTitle: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  errorBody: {
    color: Colors.textSecondary,
    marginTop: 4,
  },
  // Hero
  hero: {
    marginTop: Spacing.sm,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  heroPillRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: Spacing.sm,
  },
  name: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  username: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  // Sections
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
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
  // Assigned seller
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
  },
  regionText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: "600",
  },
  readOnlyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  readOnlyNoteText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    flex: 1,
  },
  waitingRow: {
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  waitingTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "center",
  },
  waitingBody: {
    color: Colors.text,
    fontSize: FontSize.sm,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  waitingSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 16,
  },
  // Permit
  permitHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  permitIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  permitTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  permitSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  permitValidUntil: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    marginTop: Spacing.md,
  },
  permitActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  permitSuccess: {
    color: Colors.success,
    fontSize: FontSize.sm,
    marginTop: Spacing.sm,
    fontWeight: "700",
  },
  permitPending: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: Spacing.md,
    lineHeight: 18,
  },
  permitEmpty: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  permitEmptyTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  permitEmptyBody: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    textAlign: "center",
    marginTop: 4,
  },
  // Verification compact card
  verifHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  verifIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.rider + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  verifTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  verifSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
    flexShrink: 1,
  },
  // Edit Contact Modal
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  editBtn: {
    paddingHorizontal: Spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  modalSub: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  modalClose: {
    padding: 4,
  },
  modalLabel: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  modalError: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    marginTop: Spacing.sm,
    fontWeight: "700",
  },
  modalFooter: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
