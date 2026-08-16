/**
 * Hook used to render the brief's lock UI inline INSIDE an existing
 * Rider page. Returns:
 *
 *   • `Banner` — a status banner card component that the page renders
 *     at the top of its existing layout (no wrapper, no overlay).
 *   • `Modal` — the modal that pops up when a locked action is tapped.
 *   • `onLockedAction` — pass to disabled controls so the rider gets
 *     feedback when they try to interact with a locked feature.
 *   • `isApproved` — convenience flag for the page's existing logic.
 *
 * The page DOES NOT wrap its content in this hook. It renders the
 * banner inside its existing JSX so the page layout, cards, spacing,
 * and design are identical to an approved rider's view. Only the
 * status banner, lock icons, and modal behaviour are added.
 *
 * Usage:
 *
 *   const { Banner, Modal, onLockedAction, isApproved } = useRiderLock();
 *   return (
 *     <SafeAreaView>
 *       <ScreenHeader title="..." />
 *       <ScrollView>
 *         <Banner />
 *         <Card>...</Card>
 *         <AppButton
 *           disabled={!isApproved}
 *           onPress={() => { if (!isApproved) onLockedAction(); else ... }}
 *         />
 *       </ScrollView>
 *       <Modal />
 *     </SafeAreaView>
 *   );
 */
import React, { useCallback, useState } from "react";
import { Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Card } from "../components/Card";
import { AppButton } from "../components/AppButton";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";
import { useRiderVerificationStatus } from "./useRiderVerificationStatus";

interface BannerContent {
  icon: keyof typeof Ionicons.glyphMap;
  iconTint: string;
  iconBg: string;
  title: string;
  body: string;
}

function pickBanner(info: ReturnType<typeof useRiderVerificationStatus>):
  | BannerContent
  | null {
  if (info.isApproved) return null;
  if (info.isRejected) {
    return {
      icon: "close-circle",
      iconTint: Colors.danger,
      iconBg: "#FEE2E2",
      title: "Your application was rejected",
      body:
        "Your Rider Application was rejected. Update your information and re-submit.",
    };
  }
  // Pending — distinguish "still drafting" from "submitted, awaiting admin".
  if (info.application?.submittedAt) {
    return {
      icon: "time-outline",
      iconTint: Colors.warning,
      iconBg: "#FEF3C7",
      title: "Awaiting Admin Approval",
      body:
        "Your Rider Application has been submitted and is awaiting Admin approval.",
    };
  }
  return {
    icon: "shield-checkmark-outline",
    iconTint: Colors.rider,
    iconBg: Colors.rider + "22",
    title: "Complete your Rider Application",
    body:
      "Complete your Rider Application to unlock deliveries.",
  };
}

export function useRiderLock() {
  const verification = useRiderVerificationStatus();
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);

  const onLockedAction = useCallback(() => {
    setModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const openProfile = useCallback(() => {
    router.push("/rider/licences");
  }, [router]);

  const banner = pickBanner(verification);

  const Banner = banner ? (
    <View style={styles.bannerWrap}>
      <Card
        style={[
          styles.bannerCard,
          { borderColor: banner.iconBg },
        ]}
      >
        <View style={styles.bannerRow}>
          <View
            style={[styles.bannerIcon, { backgroundColor: banner.iconBg }]}
          >
            <Ionicons
              name={banner.icon}
              size={20}
              color={banner.iconTint}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerBody}>{banner.body}</Text>
          </View>
        </View>
        <AppButton
          title="Go to Verification"
          variant="primary"
          leftIcon={
            <Ionicons
              name="shield-checkmark-outline"
              size={16}
              color="#FFF"
            />
          }
          onPress={openProfile}
          style={styles.bannerCta}
        />
      </Card>
    </View>
  ) : null;

  const Modal = (
    <RNModal
      visible={modalVisible && !verification.isApproved}
      transparent
      animationType="fade"
      onRequestClose={closeModal}
    >
      <Pressable style={styles.modalBackdrop} onPress={closeModal}>
        <Pressable style={styles.modalCard} onPress={() => undefined}>
          <View
            style={[
              styles.modalIconBadge,
              {
                backgroundColor:
                  verification.isRejected ? "#FEE2E2" : Colors.rider + "22",
              },
            ]}
          >
            <Ionicons
              name={
                verification.isRejected
                  ? "close-circle"
                  : "shield-checkmark-outline"
              }
              size={28}
              color={
                verification.isRejected ? Colors.danger : Colors.rider
              }
            />
          </View>
          <Text style={styles.modalTitle}>
            {verification.isRejected
              ? "Application Rejected"
              : verification.application?.submittedAt
                ? "Awaiting Admin Approval"
                : "Rider Account Not Verified"}
          </Text>
          <Text style={styles.modalBody}>
            {verification.isRejected
              ? "Your Rider Application was rejected.\n\nPlease review the administrator's comments, update your application, and submit it again."
              : verification.application?.submittedAt
                ? "Your Rider Application has been submitted and is awaiting Admin approval.\n\nYou will gain access once your application is approved."
                : "Your Rider account has not yet been verified.\n\nComplete and submit your Rider Application to unlock this feature."}
          </Text>
          {verification.isRejected && verification.application?.rejectionReason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonLabel}>Administrator's Comment</Text>
              <Text style={styles.reasonText}>
                {verification.application.rejectionReason}
              </Text>
            </View>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              onPress={closeModal}
              style={[styles.modalButton, styles.modalButtonGhost]}
            >
              <Text style={styles.modalButtonGhostText}>Close</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                closeModal();
                openProfile();
              }}
              style={[styles.modalButton, { backgroundColor: Colors.rider }]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color="#FFF"
              />
              <Text style={styles.modalButtonText}>Go to Verification</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );

  return {
    isApproved: verification.isApproved,
    onLockedAction,
    Banner,
    Modal,
  };
}

const styles = StyleSheet.create({
  bannerWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  bannerCard: {
    borderWidth: 1,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    fontSize: FontSize.sm,
    fontWeight: "800",
    color: Colors.text,
  },
  bannerBody: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  bannerCta: {
    marginTop: Spacing.sm,
    alignSelf: "flex-start",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: "center",
  },
  modalIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  modalBody: {
    fontSize: FontSize.sm,
    color: Colors.text,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  reasonBox: {
    width: "100%",
    backgroundColor: "#FEE2E2",
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  reasonLabel: {
    fontSize: FontSize.xs,
    fontWeight: "800",
    color: Colors.danger,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    width: "100%",
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  modalButtonGhost: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalButtonGhostText: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
  modalButtonText: {
    color: "#FFF",
    fontSize: FontSize.sm,
    fontWeight: "800",
  },
});