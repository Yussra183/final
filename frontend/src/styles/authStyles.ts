/**
 * Shared auth-screen design language.
 *
 * Login, Register and Forgot-Password all render the same shell:
 *
 *   ┌──────────────────────────┐
 *   │▓▓▓ teal hero band ▓▓▓▓▓▓▓│  ← brand mark + title, Colors.primaryDark
 *   ├──────────────────────────┤
 *   │  ╭────────────────────╮  │
 *   │  │  white card        │  │  ← Colors.surface, overlaps hero by 24px
 *   │  ╰────────────────────╯  │
 *   │        WHITE             │  ← everything below the card is white
 *   └──────────────────────────┘
 *
 * These values used to be copy-pasted into each screen and had drifted apart
 * (hero paddings 64/56/52, logo rings 96/80/96, hero titles lg/xl/xl, card
 * minHeights 480/300/none, subtitle alpha 0.70/0.65/0.65). Every shared value
 * now lives here exactly once — import it rather than redefining it locally.
 */
import { StyleSheet } from "react-native";
import { Colors, FontSize, Radius, Spacing } from "../../constants/colors";

/** Press feedback for every tappable surface in the auth flow. */
export const AUTH_ACTIVE_OPACITY = 0.85;

/**
 * Hero top padding, derived from the device safe-area inset instead of a
 * hard-coded notch guess. The floor keeps the layout sane on web, where the
 * inset is 0.
 */
export const heroPaddingTop = (insetTop: number) =>
  Math.max(insetTop, Spacing.xl) + Spacing.xl;

export const authStyles = StyleSheet.create({
  /**
   * White — NOT teal. The hero paints its own teal band, so the root only
   * ever shows through *below* the card. Painting it teal was what made the
   * area under short forms render dark.
   */
  root: { flex: 1, backgroundColor: Colors.surface },
  scroll: { flexGrow: 1, backgroundColor: Colors.surface },

  // ── Hero ────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: Colors.primaryDark,
    paddingBottom: 60,
    alignItems: "center",
    // Clips the decorative circles to the band.
    overflow: "hidden",
  },
  /**
   * Fills the iOS rubber-band area above the content with teal. Without it the
   * now-white root shows through when the user over-scrolls upward, flashing a
   * white strip above the brand mark.
   *
   * Rendered as a sibling of the hero (not a child) because the hero clips its
   * own overflow — a child at a negative offset would be cut off.
   */
  heroOverscroll: {
    position: "absolute",
    top: -600,
    left: 0,
    right: 0,
    height: 600,
    backgroundColor: Colors.primaryDark,
  },
  circle1: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.05)",
    top: -60,
    right: -50,
  },
  circle2: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.04)",
    bottom: -20,
    left: -30,
  },
  /** 96px on every screen — the brand mark reads at one scale throughout. */
  ring: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  logo: { width: 96, height: 96 },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: "800",
    color: Colors.textInverse,
    textAlign: "center",
  },
  heroSub: {
    fontSize: FontSize.sm,
    color: "rgba(255,255,255,0.65)",
    textAlign: "center",
    marginTop: 4,
  },
  backBtn: {
    position: "absolute",
    left: Spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  // ── Card ────────────────────────────────────────────────────────────────
  /**
   * `flexGrow: 1` (rather than a per-screen minHeight) is what makes the card
   * stretch to the bottom of the viewport, so the white surface always runs
   * edge to edge no matter how short the form is.
   */
  card: {
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -24,
    padding: Spacing.xl,
    paddingTop: 28,
    paddingBottom: Spacing.xxl,
    // Modern cross-platform shadow — the legacy shadow*/elevation props warn
    // on react-native-web.
    boxShadow: "0 -4px 16px rgba(0,0,0,0.12)",
  },
  cardTitle: {
    fontSize: FontSize.xxl,
    fontWeight: "800",
    color: Colors.text,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },

  // ── Icon-adorned input row ──────────────────────────────────────────────
  inputWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  inputIcon: {
    marginTop: 32, // aligns with the field itself, below the label
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  inputInner: { flex: 1 },

  // ── Divider ─────────────────────────────────────────────────────────────
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: "600",
  },

  // ── Secondary (outline) action ──────────────────────────────────────────
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  outlineBtnText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: "700",
  },
});
