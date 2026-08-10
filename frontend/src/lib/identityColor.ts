/**
 * src/lib/identityColor.ts
 *
 * Stable, deterministic per-entity accent colour — used wherever the
 * app wants to give a *specific* entity (a seller, a customer, a chat
 * thread) a unique visual identity that stays the same across
 * screens, sessions, and teammates.
 *
 * The contract is simple: `identityColor(seed)` returns one of
 * {@link IDENTITY_COLORS}, picked by hashing the seed string. Same
 * seed always returns the same colour; two different seeds almost
 * always return different colours (7 buckets × 32-bit hash space).
 *
 * This is the same 7-colour palette and DJB-style rolling hash that
 * the legacy `Avatar` helper used (see components/Avatar.tsx). It is
 * promoted here so the palette is shared between avatars, map pins,
 * and any future identity surface (notification dots, order
 * thumbnails, etc.) — one source of truth.
 */
export const IDENTITY_COLORS = [
  "#0F766E", // teal-700
  "#F97316", // orange-500
  "#6366F1", // indigo-500
  "#10B981", // emerald-500
  "#3B82F6", // blue-500
  "#EC4899", // pink-500
  "#8B5CF6", // violet-500
] as const;

export type IdentityColor = (typeof IDENTITY_COLORS)[number];

/**
 * Resolve an entity's accent colour from a stable seed (id, name,
 * thread key, etc.). Returns a hex string suitable for
 * `style.backgroundColor` / `color` props.
 */
export function identityColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % IDENTITY_COLORS.length;
  return IDENTITY_COLORS[idx];
}