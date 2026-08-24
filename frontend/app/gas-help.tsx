/**
 * Gas Help / Safety Guide — Cross-role screen.
 *
 * Available to every signed-in user EXCEPT admin (the admin header is
 * intentionally untouched). Reachable from a small `help-circle`
 * button added to the top header of every non-admin role.
 *
 * The screen is intentionally informational only — it does not touch
 * the order, delivery, payment, auth, profile, or any other business
 * flow. Tapping the emergency action opens the device dialer via the
 * `tel:` scheme (same approach the existing customer Safety screen
 * uses) so no new dependency is introduced.
 *
 * Layout
 * ------
 *   Header   → "Gas Safety & Help" with a back chevron
 *   List     → All guide topics, tap to drill in
 *   Detail   → "What happened / What to do / What NOT to do /
 *              When to seek emergency help" sections
 *   Footer   → Prominent red Emergency Call action
 *
 * Guide content is local and static. Real production deployments
 * should source this from a content service, but the architecture is
 * intentionally flexible — adding a new topic only requires a new
 * `Guide` entry in the `GUIDES` array below; no other code change is
 * required.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  Radius,
  Spacing,
} from "../constants/colors";
import { Card } from "../src/components/Card";

// ---------------------------------------------------------------------------
// Emergency contact configuration
// ---------------------------------------------------------------------------
/**
 * Single source of truth for the project's emergency contact number.
 *
 * The project does not currently define an official emergency hotline,
 * so the value below is intentionally a placeholder that can be
 * supplied later from app config / environment. The shape mirrors the
 * pattern already used by the customer Safety screen so a future
 * migration to dynamic config is a one-line change.
 */
const EMERGENCY_CONTACT = {
  label: "Emergency Services",
  /**
   * Replace this placeholder with the official emergency number once
   * it is supplied. The string is fed directly into `tel:<number>`,
   * so it must be plain digits (or include the dashes / spaces that
   * the dialer tolerates).
   */
  number: "",
};

// ---------------------------------------------------------------------------
// Data — gas-safety guide topics
// ---------------------------------------------------------------------------

type GuideSection = {
  heading: string;
  body: string;
};

type Guide = {
  id: string;
  title: string;
  summary: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  sections: GuideSection[];
};

const GUIDES: Guide[] = [
  {
    id: "gas-leak",
    title: "Gas Leak",
    summary:
      "You can smell gas, hear hissing, or see bubbles near the cylinder or regulator.",
    icon: "warning-outline",
    accent: "#FEE2E2",
    sections: [
      {
        heading: "What happened?",
        body: "LPG is leaking from the cylinder, regulator, hose, or a fitting. Even a small leak can build up to an explosive concentration in minutes.",
      },
      {
        heading: "What to do immediately",
        body:
          "1. Turn off the cylinder regulator.\n" +
          "2. Open doors and windows to ventilate.\n" +
          "3. Leave the area and keep others away.\n" +
          "4. Call your gas supplier or emergency services once you are at a safe distance.",
      },
      {
        heading: "What NOT to do",
        body:
          "Do not switch electrical appliances on or off.\n" +
          "Do not light matches, lighters, or candles.\n" +
          "Do not use a phone inside the affected area — move outside first.\n" +
          "Do not try to locate the leak with a flame.",
      },
      {
        heading: "When to seek emergency help",
        body:
          "If the smell is strong, you feel unwell, or the leak cannot be stopped by closing the regulator, call emergency services immediately.",
      },
    ],
  },
  {
    id: "smell-of-gas",
    title: "Smell of Gas",
    summary:
      "A faint rotten-egg smell in the kitchen or near appliances.",
    icon: "rose-outline",
    accent: "#FEF3C7",
    sections: [
      {
        heading: "What happened?",
        body: "LPG is odorised so even a small leak is detectable by smell. A faint smell does not mean the situation is safe — act on it.",
      },
      {
        heading: "What to do immediately",
        body:
          "1. Extinguish any open flames and cigarettes nearby.\n" +
          "2. Turn off the cylinder regulator.\n" +
          "3. Open windows and doors.\n" +
          "4. Check the regulator and hose connections for visible damage.",
      },
      {
        heading: "What NOT to do",
        body:
          "Do not ignore the smell and continue cooking.\n" +
          "Do not move the cylinder indoors or outdoors while the leak is active.",
      },
      {
        heading: "When to seek emergency help",
        body:
          "If the smell persists for more than a few minutes, or you cannot identify the source, call your supplier or emergency services.",
      },
    ],
  },
  {
    id: "cylinder-problem",
    title: "Gas Cylinder Problem",
    summary:
      "Damaged valve, rust, dent, expired cylinder, or unstable cylinder.",
    icon: "cube-outline",
    accent: "#DBEAFE",
    sections: [
      {
        heading: "What happened?",
        body:
          "The cylinder body, valve, or stamp area shows physical damage, heavy rust, an expired test date, or the cylinder is unstable.",
      },
      {
        heading: "What to do immediately",
        body:
          "1. Move the cylinder to a well-ventilated outdoor area, upright.\n" +
          "2. Keep it away from heat sources and ignition.\n" +
          "3. Mark it clearly as out of service.\n" +
          "4. Contact your supplier for replacement.",
      },
      {
        heading: "What NOT to do",
        body:
          "Do not attempt to repair the valve or use the cylinder.\n" +
          "Do not store a damaged cylinder indoors or in a vehicle passenger area.",
      },
      {
        heading: "When to seek emergency help",
        body:
          "If the damaged cylinder is leaking, follow the Gas Leak guide and call emergency services.",
      },
    ],
  },
  {
    id: "fire-near-cylinder",
    title: "Fire Near Gas Cylinder",
    summary:
      "An active fire is close to the gas cylinder or appliance.",
    icon: "flame-outline",
    accent: "#FEE2E2",
    sections: [
      {
        heading: "What happened?",
        body:
          "A flame — from cooking, a candle, electrical spark, or external fire — is close enough to heat the cylinder or regulator.",
      },
      {
        heading: "What to do immediately",
        body:
          "1. Evacuate everyone from the room or building.\n" +
          "2. If it is safe to do so, turn off the cylinder regulator.\n" +
          "3. Call the fire service from a safe distance.\n" +
          "4. Do not re-enter until the fire service declares the area safe.",
      },
      {
        heading: "What NOT to do",
        body:
          "Do not try to fight a fire that involves the cylinder directly.\n" +
          "Do not move a heated or burning cylinder.\n" +
          "Do not pour water on a flame near a pressurized cylinder unless trained.",
      },
      {
        heading: "When to seek emergency help",
        body:
          "Always. Any fire near a gas cylinder is an emergency — call the fire service immediately.",
      },
    ],
  },
  {
    id: "suspected-leak",
    title: "Suspected Gas Leak",
    summary:
      "You are not sure — symptoms, behaviour of the flame, or uncertainty.",
    icon: "help-circle-outline",
    accent: "#E0F2FE",
    sections: [
      {
        heading: "What happened?",
        body:
          "Symptoms such as headaches, dizziness, or nausea; an unstable flame; soot at the burner; or just uncertainty about safety.",
      },
      {
        heading: "What to do immediately",
        body:
          "1. Turn off the regulator and the appliance.\n" +
          "2. Ventilate the room.\n" +
          "3. Use the soap-water test on accessible connections.\n" +
          "4. If symptoms continue, move to fresh air.",
      },
      {
        heading: "What NOT to do",
        body:
          "Do not continue cooking or using appliances until the cylinder is confirmed safe.\n" +
          "Do not use a flame to check for leaks.",
      },
      {
        heading: "When to seek emergency help",
        body:
          "If anyone has symptoms, or you cannot rule out a leak, call your supplier or emergency services.",
      },
    ],
  },
  {
    id: "what-to-do",
    title: "What To Do During a Gas Emergency",
    summary:
      "A short, ordered checklist for any gas-related emergency.",
    icon: "list-circle-outline",
    accent: "#DCFCE7",
    sections: [
      {
        heading: "What happened?",
        body: "Anything that could be a gas emergency — leak, smell, fire, or symptoms.",
      },
      {
        heading: "What to do immediately",
        body:
          "1. Stay calm.\n" +
          "2. Turn off the regulator if it is safe to do so.\n" +
          "3. Ventilate.\n" +
          "4. Move people away from the area.\n" +
          "5. Call emergency services once at a safe distance.",
      },
      {
        heading: "What NOT to do",
        body:
          "Do not use flames, switches, or phones inside the affected area.\n" +
          "Do not re-enter until cleared.",
      },
      {
        heading: "When to seek emergency help",
        body:
          "Always when in doubt. The cost of a false alarm is far less than a real incident.",
      },
    ],
  },
  {
    id: "safe-handling",
    title: "Safe Handling of a Gas Cylinder",
    summary:
      "Day-to-day handling, storage, transport and use of an LPG cylinder.",
    icon: "shield-checkmark-outline",
    accent: "#CCFBF1",
    sections: [
      {
        heading: "What happened?",
        body:
          "Routine handling — moving, connecting, or storing a cylinder at home or at a business.",
      },
      {
        heading: "What to do immediately",
        body:
          "1. Always keep the cylinder upright and on a flat, stable surface.\n" +
          "2. Keep the valve cap on when the cylinder is not in use.\n" +
          "3. Store in a ventilated area, away from heat and ignition.\n" +
          "4. Use only approved regulators and replace hoses at the first sign of damage.",
      },
      {
        heading: "What NOT to do",
        body:
          "Do not lay the cylinder on its side.\n" +
          "Do not expose to direct sunlight or heat.\n" +
          "Do not transport a cylinder in an enclosed passenger cabin.",
      },
      {
        heading: "When to seek emergency help",
        body:
          "If during routine handling you smell gas or see damage, follow the relevant guide above.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GasHelpScreen() {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  const openGuide = useCallback((id: string) => setOpenId(id), []);
  const closeGuide = useCallback(() => setOpenId(null), []);

  const detailGuide = useMemo(
    () => GUIDES.find((g) => g.id === openId) ?? null,
    [openId],
  );

  /**
   * Open the device dialer for the configured contact. Mirrors the
   * behaviour of the customer Safety screen — same `tel:` scheme,
   * same friendly fallback when the device cannot place calls.
   */
  const placeEmergencyCall = useCallback(async () => {
    if (!EMERGENCY_CONTACT.number) {
      Alert.alert(
        "Emergency Number Not Configured",
        "The emergency contact number has not been set up yet. Please contact your local emergency services directly.",
      );
      return;
    }
    const url = `tel:${EMERGENCY_CONTACT.number}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(
          "Calls Not Supported",
          `Your device cannot place phone calls. Please dial ${EMERGENCY_CONTACT.label} at ${EMERGENCY_CONTACT.number} manually.`,
        );
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        "Unable To Place Call",
        `Please dial ${EMERGENCY_CONTACT.label} at ${EMERGENCY_CONTACT.number} manually.`,
      );
    }
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: Colors.background }}
      edges={["top"]}
    >
      {/* ---- Header ---- */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel={detailGuide ? "Back to guide list" : "Back"}
          accessibilityRole="button"
          style={styles.backBtn}
          onPress={() => (detailGuide ? closeGuide() : router.back())}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {detailGuide ? detailGuide.title : "Gas Safety & Help"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {detailGuide ? (
        <GuideDetail guide={detailGuide} />
      ) : (
        <GuideList onSelect={openGuide} onCall={placeEmergencyCall} />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Guide list
// ---------------------------------------------------------------------------

interface GuideListProps {
  onSelect: (id: string) => void;
  onCall: () => void;
}

function GuideList({ onSelect, onCall }: GuideListProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <Card style={styles.heroCard}>
        <View style={styles.heroIconWrap}>
          <Ionicons
            name="shield-checkmark"
            size={26}
            color="#FFFFFF"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Stay safe with gas</Text>
          <Text style={styles.heroSubtitle}>
            Quick guides for the most common gas-related situations.
            Tap a topic to read the full guide.
          </Text>
        </View>
      </Card>

      {/* Emergency action */}
      <EmergencyCard onCall={onCall} />

      {/* Guide cards */}
      <Text style={styles.sectionTitle}>Guides</Text>
      <Text style={styles.sectionSubtitle}>
        Open any topic for a short, step-by-step guide.
      </Text>
      {GUIDES.map((g) => (
        <Card key={g.id} style={styles.guideCard}>
          <TouchableOpacity
            accessibilityLabel={`Open guide: ${g.title}`}
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => onSelect(g.id)}
            style={styles.guideRow}
          >
            <View
              style={[
                styles.guideIconWrap,
                { backgroundColor: g.accent },
              ]}
            >
              <Ionicons
                name={g.icon}
                size={22}
                color={Colors.primary}
              />
            </View>
            <View style={styles.guideBody}>
              <Text style={styles.guideTitle} numberOfLines={1}>
                {g.title}
              </Text>
              <Text style={styles.guideSummary} numberOfLines={2}>
                {g.summary}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>
        </Card>
      ))}

      <View style={{ height: Spacing.lg }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Guide detail
// ---------------------------------------------------------------------------

interface GuideDetailProps {
  guide: Guide;
}

function GuideDetail({ guide }: GuideDetailProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Card style={styles.detailHero}>
        <View
          style={[
            styles.detailHeroIcon,
            { backgroundColor: guide.accent },
          ]}
        >
          <Ionicons name={guide.icon} size={28} color={Colors.primary} />
        </View>
        <Text style={styles.detailHeroTitle}>{guide.title}</Text>
        <Text style={styles.detailHeroSummary}>{guide.summary}</Text>
      </Card>

      {guide.sections.map((s) => (
        <Card key={s.heading} style={styles.sectionCard}>
          <Text style={styles.sectionHeading}>{s.heading}</Text>
          <Text style={styles.sectionBody}>{s.body}</Text>
        </Card>
      ))}

      <EmergencyCard onCall={() => undefined} embedded />
      <View style={{ height: Spacing.lg }} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Emergency card (reused in list and detail views)
// ---------------------------------------------------------------------------

interface EmergencyCardProps {
  onCall: () => void;
  embedded?: boolean;
}

function EmergencyCard({ onCall, embedded }: EmergencyCardProps) {
  return (
    <Card style={styles.emergencyCard}>
      <View style={styles.emergencyHeader}>
        <View style={styles.emergencyBadge}>
          <Text style={styles.emergencyBadgeText}>SOS</Text>
        </View>
        <Text style={styles.emergencyHeading}>Emergency Help</Text>
      </View>
      <Text style={styles.emergencyBody}>
        If the situation is dangerous and you need professional
        assistance immediately, call emergency services now.
      </Text>
      <Pressable
        accessibilityLabel="Call emergency services"
        accessibilityRole="button"
        onPress={onCall}
        style={({ pressed }) => [
          styles.callBtn,
          pressed && styles.callBtnPressed,
        ]}
      >
        <Ionicons name="call" size={20} color="#FFFFFF" />
        <Text style={styles.callBtnText}>Call Emergency</Text>
      </Pressable>
      {embedded ? null : (
        <Text style={styles.emergencyFooter}>
          {EMERGENCY_CONTACT.number
            ? `Calls ${EMERGENCY_CONTACT.label} at ${EMERGENCY_CONTACT.number}`
            : "Number to be configured by operations"}
        </Text>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceMuted,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },

  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  /* ----- Hero ----- */
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: "#FFFFFF22",
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: FontSize.lg,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: "#CCFBF1",
    fontSize: FontSize.sm,
    marginTop: 4,
    lineHeight: 20,
  },

  /* ----- Section heading ----- */
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
    marginTop: Spacing.lg,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },

  /* ----- Guide card ----- */
  guideCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: Spacing.sm,
  },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  guideIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  guideBody: {
    flex: 1,
  },
  guideTitle: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
  },
  guideSummary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 19,
  },

  /* ----- Detail ----- */
  detailHero: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    marginTop: Spacing.md,
  },
  detailHeroIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  detailHeroTitle: {
    fontSize: FontSize.lg,
    fontWeight: "800",
    color: Colors.text,
  },
  detailHeroSummary: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 20,
    paddingHorizontal: Spacing.md,
  },

  sectionCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  sectionHeading: {
    fontSize: FontSize.md,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  sectionBody: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  /* ----- Emergency ----- */
  emergencyCard: {
    marginTop: Spacing.md,
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
  emergencyBody: {
    color: "#FEE2E2",
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: Radius.md,
  },
  callBtnPressed: {
    opacity: 0.85,
  },
  callBtnText: {
    color: Colors.danger,
    fontSize: FontSize.md,
    fontWeight: "900",
  },
  emergencyFooter: {
    color: "#FECACA",
    fontSize: FontSize.xs,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
});