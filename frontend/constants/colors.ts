/**
 * Gas Delivery and Supplying System – Brand Colors
 * Centralized color tokens for the entire application.
 */

export const Colors = {
  // Brand
  primary: "#0F766E", // teal-700
  primaryDark: "#0B5C56",
  primaryLight: "#14B8A6", // teal-500
  secondary: "#14B8A6",
  accent: "#F97316", // orange-500

  // Surfaces
  background: "#F8FAFC", // slate-50
  surface: "#FFFFFF",
  surfaceMuted: "#F1F5F9", // slate-100
  border: "#E2E8F0", // slate-200

  // Text
  text: "#1E293B", // slate-800
  textSecondary: "#64748B", // slate-500
  textMuted: "#94A3B8", // slate-400
  textInverse: "#FFFFFF",

  // Status
  success: "#10B981", // emerald-500
  warning: "#F59E0B", // amber-500
  danger: "#EF4444", // red-500
  info: "#3B82F6", // blue-500

  // Roles — all roles use the main brand color (teal) so the whole app
  // shares one consistent visual identity. The legacy per-role tints
  // (admin = slate, supplier = indigo) are kept here only as fallbacks
  // for any code that still reads them; new code should reference
  // `primary` directly.
  customer: "#0F766E",
  seller: "#0F766E",
  supplier: "#0F766E",
  rider: "#0F766E",
  admin: "#0F766E",

  // Soft surface tints — used for badge / pill / banner backgrounds where a
  // pale wash of a brand color is wanted without hand-rolling a hex literal
  // in every screen.
  primarySoft: "#CCFBF1",   // primary teal @ ~20%
  supplierSoft: "#CCFBF1",  // alias of primarySoft — keeps call sites
                             // that still reference supplierSoft on-brand
  successSoft: "#DCFCE7",   // emerald-100
  warningSoft: "#FEF3C7",   // amber-100
  dangerSoft: "#FEE2E2",    // red-100
  accentSoft: "#FFF7ED",    // orange-50
  infoSoft: "#DBEAFE",      // blue-100

  // Foreground tokens for use over those soft surfaces, where the standard
  // `text`/`textSecondary` would be too pale.
  successText: "#047857",   // emerald-700
  warningText: "#92400E",   // amber-800
  dangerText: "#B91C1C",    // red-700
  supplierText: "#0B5C56",  // primaryDark — supplier brand foreground

  // Modal scrim — applied to the dim layer behind full-screen modals. Centralised
  // so every screen's modal matches without re-typing the rgba literal.
  scrim: "rgba(15,23,42,0.55)",
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const FontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  hero: 32,
};

export const Shadow = {
  // `boxShadow` is the modern cross-platform style (RN 0.76+ and
  // react-native-web). It supersedes the legacy `shadow*` + `elevation`
  // props, which still work but emit a deprecation warning on web.
  card: {
    boxShadow: "0 4px 8px rgba(0,0,0,0.08)",
  },
  raised: {
    boxShadow: "0 6px 12px rgba(0,0,0,0.12)",
  },
};
