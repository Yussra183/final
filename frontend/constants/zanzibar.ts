/**
 * Zanzibar Administrative Regions & Districts
 *
 * Exact official administrative structure for Zanzibar Archipelago:
 *
 *   • Unguja Island (3 Regions, 7 Districts)
 *     1. Mjini Magharibi (Zanzibar Urban/West) → Urban (Mjini), Magharibi A, Magharibi B
 *     2. Unguja Kaskazini (Zanzibar North)     → Kaskazini A, Kaskazini B
 *     3. Unguja Kusini (Zanzibar Central/South)→ Kati (Central), Kusini (South)
 *
 *   • Pemba Island (2 Regions, 4 Districts)
 *     1. Pemba Kaskazini (Pemba North)         → Wete, Micheweni
 *     2. Pemba Kusini (Pemba South)             → Chake Chake, Mkoani
 */

export interface ZanzibarRegion {
  label: string;
  value: string;
  island: "Unguja" | "Pemba";
}

export interface ZanzibarDistrict {
  label: string;
  value: string;
  region: string;
}

// ─── Regions ──────────────────────────────────────────────────────────────────

export const ZANZIBAR_REGIONS: ZanzibarRegion[] = [
  // Unguja Island
  {
    label: "Mjini Magharibi (Urban West)",
    value: "mjini_magharibi",
    island: "Unguja",
  },
  {
    label: "Unguja Kaskazini (North Unguja)",
    value: "unguja_kaskazini",
    island: "Unguja",
  },
  {
    label: "Unguja Kusini (Central/South Unguja)",
    value: "unguja_kusini",
    island: "Unguja",
  },
  // Pemba Island
  {
    label: "Pemba Kaskazini (North Pemba)",
    value: "pemba_kaskazini",
    island: "Pemba",
  },
  {
    label: "Pemba Kusini (South Pemba)",
    value: "pemba_kusini",
    island: "Pemba",
  },
];

// ─── Districts Keyed by Region Value ──────────────────────────────────────────

export const ZANZIBAR_DISTRICTS: Record<string, ZanzibarDistrict[]> = {
  // Mjini Magharibi (Urban West) — Urban, Magharibi A, Magharibi B
  mjini_magharibi: [
    { label: "Urban District (Mjini)", value: "mjini_urban", region: "mjini_magharibi" },
    { label: "Magharibi A District", value: "magharibi_a", region: "mjini_magharibi" },
    { label: "Magharibi B District", value: "magharibi_b", region: "mjini_magharibi" },
  ],

  // Unguja Kaskazini (North Unguja) — Kaskazini A, Kaskazini B
  unguja_kaskazini: [
    { label: "Kaskazini A District", value: "kaskazini_a", region: "unguja_kaskazini" },
    { label: "Kaskazini B District", value: "kaskazini_b", region: "unguja_kaskazini" },
  ],

  // Unguja Kusini (Central/South Unguja) — Kati, Kusini
  unguja_kusini: [
    { label: "Kati District (Central)", value: "kati", region: "unguja_kusini" },
    { label: "Kusini District (South)", value: "kusini", region: "unguja_kusini" },
  ],

  // Pemba Kaskazini (North Pemba) — Wete, Micheweni
  pemba_kaskazini: [
    { label: "Wete District", value: "wete", region: "pemba_kaskazini" },
    { label: "Micheweni District", value: "micheweni", region: "pemba_kaskazini" },
  ],

  // Pemba Kusini (South Pemba) — Chake Chake, Mkoani
  pemba_kusini: [
    { label: "Chake Chake District", value: "chake_chake", region: "pemba_kusini" },
    { label: "Mkoani District", value: "mkoani", region: "pemba_kusini" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns districts for the given region value, or [] if unknown. */
export function getDistricts(regionValue: string): ZanzibarDistrict[] {
  return ZANZIBAR_DISTRICTS[regionValue] ?? [];
}

/** Returns the human-readable label for a region value. */
export function regionLabel(regionValue: string): string {
  return (
    ZANZIBAR_REGIONS.find((r) => r.value === regionValue)?.label ?? regionValue
  );
}

/** Returns the human-readable label for a district value in a given region. */
export function districtLabel(regionValue: string, districtValue: string): string {
  const normRegion = matchRegionValue(regionValue);
  const normDistrict = matchDistrictValue(normRegion, districtValue);
  return (
    getDistricts(normRegion).find((d) => d.value === normDistrict)?.label ??
    districtValue
  );
}

/** Matches a string (key or label) to a valid region value key, or returns the string if unmatched. */
export function matchRegionValue(str?: string | null): string {
  if (!str) return "";
  const s = str.trim().toLowerCase();
  const found = ZANZIBAR_REGIONS.find(
    (r) => r.value.toLowerCase() === s || r.label.toLowerCase().includes(s) || s.includes(r.value.toLowerCase())
  );
  if (found) return found.value;
  if (s.includes("mjini") || s.includes("urban") || s.includes("west") || s.includes("magharibi")) return "mjini_magharibi";
  if (s.includes("kaskazini") && s.includes("unguja")) return "unguja_kaskazini";
  if (s.includes("kusini") && s.includes("unguja")) return "unguja_kusini";
  if (s.includes("kaskazini") && s.includes("pemba")) return "pemba_kaskazini";
  if (s.includes("kusini") && s.includes("pemba")) return "pemba_kusini";
  return str;
}

/** Matches a string (key or label) within a region to a valid district value key. */
export function matchDistrictValue(regionVal?: string | null, str?: string | null): string {
  if (!str) return "";
  const rVal = matchRegionValue(regionVal);
  const s = str.trim().toLowerCase();
  const districts = getDistricts(rVal);
  const found = districts.find(
    (d) => d.value.toLowerCase() === s || d.label.toLowerCase().includes(s) || s.includes(d.value.toLowerCase())
  );
  if (found) return found.value;
  return str;
}
