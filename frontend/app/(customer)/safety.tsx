import React, { useCallback, useEffect, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../../constants/colors";
import { Card } from "../../src/components/Card";
import {
  FadeIn,
  PressableScale,
  PulseDot,
} from "../../src/components/MicroAnimations";

/**
 * Safety Guidance & Alerts — Customer screen.
 *
 * Educates customers about safe gas cylinder usage, leak prevention,
 * fire prevention, and emergency response procedures. Provides
 * one-tap calling for fire, gas, and ambulance services via the
 * React Native `Linking` API.
 *
 * Sections:
 *   1. Header (menu + title only — emergency call button was
 *      historically here but has been moved to the page bottom)
 *   2. Hero banner with quick action chips
 *   3. Safety Tips — five image-illustrated cards
 *   4. Safety Alerts — three warning cards
 *   5. Emergency Instructions — numbered step list
 *   6. Emergency Call — large red emergency card with service buttons
 *   7. Bottom action bar — fixed "Call for Emergency" CTA (always
 *      visible above the tab bar / safe area)
 *
 * All emoji placeholders have been replaced with `@expo/vector-icons`
 * so the safety screen reads as one consistent design system.
 */

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type SafetyTip = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string; // background tint for the placeholder
  emojiBg: string; // deeper tint behind the emoji
};

/**
 * Five safety tips — now driven by Ionicons rather than emoji so the
 * icons match the rest of the app.
 */
const SAFETY_TIPS: SafetyTip[] = [
  {
    id: "position",
    title: "Safe Gas Cylinder Position",
    description:
      "Always keep the gas cylinder standing upright. Never place it horizontally because it may cause gas leakage and safety risks.",
    icon: "cube-outline",
    accent: "#CCFBF1", // teal-100
    emojiBg: "#0F766E",
  },
  {
    id: "leak-check",
    title: "Check Gas Leaks Regularly",
    description:
      "Use soap water to check for gas leaks around the regulator and pipe connections. Never use fire to test leaks.",
    icon: "water-outline",
    accent: "#E0F2FE", // sky-100
    emojiBg: "#0369A1",
  },
  {
    id: "fire-distance",
    title: "Keep Away from Fire",
    description:
      "Keep gas cylinders away from stoves, candles, electrical sparks, and other heat sources.",
    icon: "flame-outline",
    accent: "#FEE2E2", // red-100
    emojiBg: "#DC2626",
  },
  {
    id: "ventilation",
    title: "Ensure Proper Ventilation",
    description:
      "Always use gas in a well-ventilated area to prevent gas accumulation.",
    icon: "cloud-outline",
    accent: "#DCFCE7", // green-100
    emojiBg: "#15803D",
  },
  {
    id: "regulator-off",
    title: "Turn Off the Regulator",
    description:
      "Always turn off the regulator after cooking or when the cylinder is not in use.",
    icon: "settings-outline",
    accent: "#FEF3C7", // amber-100
    emojiBg: "#B45309",
  },
];

type AlertItem = {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  tone: "warning" | "danger" | "info";
};

const ALERTS: AlertItem[] = [
  {
    id: "leak-alert",
    icon: "warning-outline",
    title: "Gas Leak Alert",
    description:
      "Gas smell detected. Check the regulator and open all windows immediately.",
    tone: "warning",
  },
  {
    id: "fire-alert",
    icon: "flame-outline",
    title: "Fire Hazard Alert",
    description:
      "Flammable materials are too close to the gas cylinder.",
    tone: "danger",
  },
  {
    id: "damage-alert",
    icon: "skull-outline",
    title: "Damaged Cylinder Alert",
    description:
      "Do not use damaged, rusty, or expired cylinders.",
    tone: "danger",
  },
];

type EmergencyStep = {
  step: number;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const EMERGENCY_STEPS: EmergencyStep[] = [
  {
    step: 1,
    title: "Turn Off the Gas Regulator",
    description: "Turn off the gas regulator immediately.",
    icon: "settings-outline",
  },
  {
    step: 2,
    title: "Open All Doors and Windows",
    description: "Open all doors and windows to ventilate the area.",
    icon: "enter-outline",
  },
  {
    step: 3,
    title: "Do Not Touch Electrical Switches",
    description: "Do not switch electrical appliances on or off.",
    icon: "flash-outline",
  },
  {
    step: 4,
    title: "Avoid Flames and Sparks",
    description: "Do not use matches, lighters, or open flames.",
    icon: "close-circle-outline",
  },
  {
    step: 5,
    title: "Move to a Safe Location",
    description: "Move to a safe location if the leak continues.",
    icon: "walk-outline",
  },
];

// Configurable emergency contact numbers. Real production deployments
// should source these from app config / environment — keeping them in
// a single object so the source of truth is obvious.
const EMERGENCY_NUMBERS = {
  fire: "114",
  ambulance: "115",
  gas: "0800-GAS-HELP", // configurable gas hotline
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SafetyScreen() {
  const drawer = useNavigation<any>();

  const openDrawer = useCallback(() => {
    drawer.openDrawer?.();
  }, [drawer]);

  /**
   * Open the device dialer for the given phone number. We use
   * `Linking.openURL` with the `tel:` scheme so the OS handles the
   * rest (works on iOS, Android, and web). If the device cannot
   * handle the URL we surface a friendly error so the customer is
   * never left wondering why nothing happened.
   */
  const placeCall = useCallback(async (label: string, number: string) => {
    const url = `tel:${number}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(
          "Calls Not Supported",
          `Your device cannot place phone calls. Please dial ${label} at ${number} manually.`,
        );
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert(
        "Unable To Place Call",
        `Please dial ${label} at ${number} manually.`,
      );
    }
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      {/* ---------------- Header (no emergency button at top) ---------------- */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Open drawer menu"
          style={styles.iconBtn}
          onPress={openDrawer}
        >
          <Ionicons name="menu-outline" size={20} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Safety Guidance &amp; Alerts
          </Text>
        </View>

        {/* A small status pill on the right gives the header a
            professional balance, replacing the previously top-mounted
            emergency call button. */}
        <View style={styles.headerStatus}>
          <PulseDot size={8} color={Colors.success} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------- Hero Banner ---------------- */}
        <FadeIn>
          <Card style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={30} color="#FFF" />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Stay Safe With Gas</Text>
              <Text style={styles.heroSubtitle}>
                Essential tips, alerts, and emergency contacts for every
                household using LPG.
              </Text>
            </View>
          </Card>
        </FadeIn>

        {/* ---------------- Safety Tips ---------------- */}
        <Text style={styles.sectionTitle}>Safety Tips</Text>
        <Text style={styles.sectionSubtitle}>
          Follow these best practices to keep your home safe.
        </Text>

        {SAFETY_TIPS.map((tip, idx) => (
          <FadeIn key={tip.id} delay={idx * 70}>
            <Card style={styles.tipCard}>
              <View style={styles.tipRow}>
                <View
                  style={[
                    styles.tipImageWrap,
                    { backgroundColor: tip.accent },
                  ]}
                >
                  {/* Image placeholder. Real asset path:
                      `require("../../../assets/images/safety/<id>.png")` */}
                  <Image
                    source={undefined}
                    style={styles.tipImage}
                    resizeMode="cover"
                    accessibilityLabel={`${tip.title} illustration`}
                  />
                  <View
                    style={[
                      styles.tipImageFallback,
                      { backgroundColor: tip.emojiBg },
                    ]}
                  >
                    <Ionicons name={tip.icon} size={36} color="#FFF" />
                  </View>
                </View>

                <View style={styles.tipBody}>
                  <View style={styles.tipTitleRow}>
                    <Text style={styles.tipBadge}>Tip</Text>
                    <Text style={styles.tipTitle} numberOfLines={2}>
                      {tip.title}
                    </Text>
                  </View>
                  <Text style={styles.tipDescription}>{tip.description}</Text>
                </View>
              </View>
            </Card>
          </FadeIn>
        ))}

        {/* ---------------- Safety Alerts ---------------- */}
        <Text style={styles.sectionTitle}>Safety Alerts</Text>
        <Text style={styles.sectionSubtitle}>
          Stay alert for these warning signs in your home.
        </Text>

        {ALERTS.map((a, idx) => {
          const tone = ALERT_TONES[a.tone];
          return (
            <FadeIn key={a.id} delay={idx * 80}>
              <Card
                style={[styles.alertCard, { borderLeftColor: tone.border }]}
              >
                <View
                  style={[styles.alertIconWrap, { backgroundColor: tone.bg }]}
                >
                  <Ionicons name={a.icon} size={22} color={tone.text} />
                </View>
                <View style={styles.alertBody}>
                  <Text style={[styles.alertTitle, { color: tone.text }]}>
                    {a.title}
                  </Text>
                  <Text style={styles.alertDescription}>{a.description}</Text>
                </View>
              </Card>
            </FadeIn>
          );
        })}

        {/* ---------------- Emergency Instructions ---------------- */}
        <Text style={styles.sectionTitle}>
          What To Do During a Gas Leak
        </Text>
        <Text style={styles.sectionSubtitle}>
          Follow these five steps in order. Stay calm and act quickly.
        </Text>

        <Card style={styles.stepsCard}>
          {EMERGENCY_STEPS.map((s, idx) => (
            <StepRow key={s.step} step={s} last={idx === EMERGENCY_STEPS.length - 1} />
          ))}
        </Card>

        {/* ---------------- Emergency Call ---------------- */}
        <Card style={styles.emergencyCard}>
          <View style={styles.emergencyHeader}>
            <View style={styles.emergencyBadge}>
              <Text style={styles.emergencyBadgeText}>SOS</Text>
            </View>
            <Text style={styles.emergencyHeading}>Emergency Assistance</Text>
          </View>

          <Text style={styles.emergencyBodyText}>
            If you cannot control the situation, call emergency services
            immediately.
          </Text>

          <View style={styles.emergencyGrid}>
            <PressableScale
              accessibilityLabel="Call fire department"
              style={styles.emergencyServiceBtn}
              onPress={() =>
                placeCall("Fire Department", EMERGENCY_NUMBERS.fire)
              }
            >
              <Ionicons name="flame-outline" size={28} color={Colors.danger} />
              <Text style={styles.emergencyServiceTitle}>
                Fire Department
              </Text>
              <Text style={styles.emergencyServiceNumber}>
                {EMERGENCY_NUMBERS.fire}
              </Text>
            </PressableScale>

            <PressableScale
              accessibilityLabel="Call gas emergency service"
              style={styles.emergencyServiceBtn}
              onPress={() =>
                placeCall("Gas Emergency", EMERGENCY_NUMBERS.gas)
              }
            >
              <Ionicons name="water-outline" size={28} color={Colors.primary} />
              <Text style={styles.emergencyServiceTitle}>
                Gas Emergency
              </Text>
              <Text style={styles.emergencyServiceNumber}>
                {EMERGENCY_NUMBERS.gas}
              </Text>
            </PressableScale>

            <PressableScale
              accessibilityLabel="Call ambulance"
              style={styles.emergencyServiceBtn}
              onPress={() =>
                placeCall("Ambulance", EMERGENCY_NUMBERS.ambulance)
              }
            >
              <Ionicons
                name="medkit-outline"
                size={28}
                color={Colors.info}
              />
              <Text style={styles.emergencyServiceTitle}>Ambulance</Text>
              <Text style={styles.emergencyServiceNumber}>
                {EMERGENCY_NUMBERS.ambulance}
              </Text>
            </PressableScale>
          </View>

          <Text style={styles.emergencyFooter}>
            Fire: 114 • Ambulance: 115 • Gas hotline configurable
          </Text>
        </Card>

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* ---------------- Bottom Emergency CTA ---------------- */}
      <EmergencyBottomBar
        onCall={() => placeCall("Fire Department", EMERGENCY_NUMBERS.fire)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// StepRow — animated emergency step (small staggered entrance)
// ---------------------------------------------------------------------------

interface StepRowProps {
  step: EmergencyStep;
  last: boolean;
}

function StepRow({ step, last }: StepRowProps) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 380,
      delay: step.step * 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, step.step]);

  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [
          {
            translateX: v.interpolate({
              inputRange: [0, 1],
              outputRange: [16, 0],
            }),
          },
        ],
      }}
    >
      <View style={styles.stepRow}>
        <View style={styles.stepNumberWrap}>
          <Text style={styles.stepNumber}>{step.step}</Text>
        </View>
        <View style={styles.stepIllustration}>
          <Ionicons name={step.icon} size={22} color={Colors.primary} />
        </View>
        <View style={styles.stepBody}>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepDescription}>{step.description}</Text>
        </View>
      </View>
      {!last ? <View style={styles.stepDivider} /> : null}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// EmergencyBottomBar — sticky call-for-emergency CTA
// ---------------------------------------------------------------------------

interface EmergencyBottomBarProps {
  onCall: () => void;
}

/**
 * Fixed-bottom "Call for Emergency" bar.
 *
 * This replaces the previously top-mounted emergency-call icon button
 * in the page header. The icon is visible at all times (even while
 * scrolling), giving the customer one-tap access from anywhere on the
 * safety screen without reaching for the top of the page. We render
 * a subtle drop shadow above the bar so it visually separates from
 * the scroll content beneath it.
 */
function EmergencyBottomBar({ onCall }: EmergencyBottomBarProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.05,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.bottomBarSafe}>
      <View style={styles.bottomBar}>
        <Animated.View
          style={[styles.bottomBarBtnShadow, { transform: [{ scale: pulse }] }]}
        >
          <TouchableOpacity
            accessibilityLabel="Call for emergency"
            activeOpacity={0.9}
            onPress={onCall}
            style={styles.bottomBarBtn}
          >
            <View style={styles.bottomBarBtnLeft}>
              <View style={styles.bottomBarIconWrap}>
                <Ionicons name="call-outline" size={20} color="#FFF" />
              </View>
              <View>
                <Text style={styles.bottomBarBtnTitle}>Call for Emergency</Text>
                <Text style={styles.bottomBarBtnSub}>
                  One-tap access to 114 fire services
                </Text>
              </View>
            </View>
            <View style={styles.bottomBarPulseWrap}>
              <PulseDot size={10} color="#FFF" halo={false} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALERT_TONES = {
  warning: {
    border: Colors.warning,
    bg: "#FEF3C7",
    text: "#92400E",
  },
  danger: {
    border: Colors.danger,
    bg: "#FEE2E2",
    text: "#991B1B",
  },
  info: {
    border: Colors.info,
    bg: "#DBEAFE",
    text: "#1E40AF",
  },
} as const;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },

  /* ----- Header ----- */
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    textAlign: "center",
  },
  headerStatus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },

  /* ----- Hero ----- */
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.primary,
  },
  heroIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: "#FFFFFF22",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroSubtitle: {
    fontSize: FontSize.sm,
    color: "#CCFBF1",
    marginTop: 4,
    lineHeight: 20,
  },

  /* ----- Section ----- */
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.xl,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },

  /* ----- Tip card ----- */
  tipCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  tipRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: Spacing.md,
  },
  tipImageWrap: {
    position: "relative",
    width: 88,
    height: 88,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  tipImage: {
    width: "100%",
    height: "100%",
  },
  tipImageFallback: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  tipBody: {
    flex: 1,
    justifyContent: "center",
  },
  tipTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: 4,
    flexWrap: "wrap",
  },
  tipBadge: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: Colors.primary,
    backgroundColor: "#CCFBF1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  tipTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    flexShrink: 1,
  },
  tipDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  /* ----- Alert card ----- */
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderLeftWidth: 4,
  },
  alertIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  alertBody: {
    flex: 1,
  },
  alertTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    marginBottom: 2,
  },
  alertDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  /* ----- Steps ----- */
  stepsCard: {
    padding: Spacing.md,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  stepNumberWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    color: "#FFFFFF",
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  stepIllustration: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBody: {
    flex: 1,
  },
  stepTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  stepDescription: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 19,
  },
  stepDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
    marginLeft: 96, // align past step number + illustration
  },

  /* ----- Emergency ----- */
  emergencyCard: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: Colors.danger,
  },
  emergencyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  emergencyBadge: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  emergencyBadgeText: {
    color: Colors.danger,
    fontSize: FontSize.xs,
    fontWeight: "900",
    letterSpacing: 1,
  },
  emergencyHeading: {
    color: "#FFFFFF",
    fontSize: FontSize.lg,
    fontWeight: "800",
  },
  emergencyBodyText: {
    color: "#FEE2E2",
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  emergencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  emergencyServiceBtn: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
  },
  emergencyServiceTitle: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: "800",
    marginTop: 4,
  },
  emergencyServiceNumber: {
    color: Colors.danger,
    fontSize: FontSize.sm,
    fontWeight: "700",
    marginTop: 2,
  },
  emergencyFooter: {
    color: "#FECACA",
    fontSize: FontSize.xs,
    textAlign: "center",
    marginTop: Spacing.md,
  },

  /* ----- Bottom CTA bar ----- */
  bottomBarSafe: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    boxShadow: "0 -2px 8px rgba(0,0,0,0.06)",
  },
  bottomBarBtnShadow: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.danger,
    boxShadow: "0 4px 12px rgba(239,68,68,0.35)",
  },
  bottomBarBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.danger,
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  bottomBarBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  bottomBarIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: "#FFFFFF22",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomBarBtnTitle: {
    color: "#FFFFFF",
    fontSize: FontSize.md,
    fontWeight: "800",
  },
  bottomBarBtnSub: {
    color: "#FECACA",
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  bottomBarPulseWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF22",
    alignItems: "center",
    justifyContent: "center",
  },
});
