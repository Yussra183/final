/**
 * Admin Icon — single icon vocabulary for the System Admin UI.
 *
 * The project ships with `@expo/vector-icons`, so we use Ionicons to
 * match what every other module already consumes. This component is a
 * tiny typed wrapper that:
 *
 *   • enforces ONE icon family (Ionicons) — no ad-hoc imports of
 *     Material/Lucide/Paper in admin screens;
 *   • defaults to a consistent outline/line style, matching the
 *     recommended SaaS/ERP visual vocabulary;
 *   • defaults to the same size everywhere (16 px in nav rows,
 *     14 px in tabs and chips, 18 px in toplevel buttons, configurable
 *     via the `size` prop);
 *   • tints to `Colors.text` by default and to the surrounding accent
 *     when the parent asks for a coloured modal/CTAs (auto-handling
 *     the `color` prop);
 *   • maps every semantic action we care about to a single icon name
 *     through the {@link AdminIconName} union so names stay consistent
 *     across pages.
 *
 * Use {@link AdminIconName} for the editorial vocab; pass any other
 * Ionicons name through the `name` prop when a screen-specific icon
 * is needed (e.g. document subtype labels).
 */
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";

export type AdminIconName =
  // Navigation
  | "dashboard"
  | "suppliers"
  | "riders"
  | "sellers"
  | "customers"
  | "products"
  | "orders"
  | "reports"
  | "settings"
  | "profile"
  | "notifications"
  // Actions
  | "search"
  | "filter"
  | "add"
  | "edit"
  | "delete"
  | "view"
  | "approve"
  | "reject"
  | "active"
  | "inactive"
  | "pending"
  | "back"
  | "next"
  | "more"
  | "logout"
  | "menu"
  | "close"
  | "refresh"
  | "download"
  | "upload"
  | "star"
  | "store"
  | "certificate"
  | "documents"
  | "package"
  | "bicycle"
  | "lock"
  | "shield";

/**
 * Map of the editorial icon names supported by the admin UI to the
 * actual Ionicons glyph used. All entries are outline style — chosen
 * to match a clean, modern SaaS dashboard.
 */
const ICON_MAP: Record<AdminIconName, keyof typeof Ionicons.glyphMap> = {
  // Navigation
  dashboard: "grid-outline",
  suppliers: "business-outline",
  riders: "bicycle-outline",
  sellers: "storefront-outline",
  customers: "people-outline",
  products: "cube-outline",
  orders: "bag-handle-outline",
  reports: "bar-chart-outline",
  settings: "settings-outline",
  profile: "person-circle-outline",
  notifications: "notifications-outline",
  // Actions
  search: "search-outline",
  filter: "options-outline",
  add: "add-circle-outline",
  edit: "create-outline",
  delete: "trash-outline",
  view: "eye-outline",
  approve: "checkmark-circle-outline",
  reject: "close-circle-outline",
  active: "checkmark-circle-outline",
  inactive: "remove-circle-outline",
  pending: "time-outline",
  back: "arrow-back-outline",
  next: "arrow-forward-outline",
  more: "ellipsis-horizontal-outline",
  logout: "log-out-outline",
  menu: "menu-outline",
  close: "close-outline",
  refresh: "refresh-outline",
  download: "download-outline",
  upload: "cloud-upload-outline",
  star: "star-outline",
  store: "storefront-outline",
  certificate: "ribbon-outline",
  documents: "document-text-outline",
  package: "cube-outline",
  bicycle: "bicycle-outline",
  lock: "lock-closed-outline",
  shield: "shield-checkmark-outline",
};

interface Props {
  /** Semantic icon name from the Admin vocabulary. */
  name: AdminIconName;
  /** Arbitrary Ionicon name (overrides `name`). Use sparingly. */
  glyph?: keyof typeof Ionicons.glyphMap;
  /** Pixel size. Defaults to 16. */
  size?: number;
  /** Tint. Defaults to Colors.text. */
  color?: string;
}

export function AdminIcon({
  name,
  glyph,
  size = 16,
  color = Colors.text,
}: Props) {
  const resolved = glyph ?? ICON_MAP[name];
  return <Ionicons name={resolved} size={size} color={color} />;
}

/** Direct access to the glyph map for places that need only the name. */
export const adminIconGlyph = (
  name: AdminIconName,
): keyof typeof Ionicons.glyphMap => ICON_MAP[name];
