export const GAS_BRANDS = [
  "Oryx Gas",
  "Taifa Gas",
  "Lake Gas",
  "Manjis Gas",
  "Mihan Gas",
] as const;

export type GasBrand = (typeof GAS_BRANDS)[number];

export const GAS_SIZES_BY_BRAND: Record<GasBrand, string[]> = {
  "Oryx Gas": ["3 kg", "6 kg", "12.5 kg", "38 kg"],
  "Taifa Gas": ["6 kg", "15 kg", "38 kg"],
  "Lake Gas": ["6 kg", "15 kg", "38 kg"],
  "Manjis Gas": ["6 kg", "15 kg", "38 kg"],
  "Mihan Gas": ["6 kg", "15 kg", "38 kg"],
};

export const ALL_GAS_SIZES = Array.from(
  new Set(Object.values(GAS_SIZES_BY_BRAND).flat()),
);

export function isGasBrand(value: string): value is GasBrand {
  return GAS_BRANDS.includes(value as GasBrand);
}

export function getSizesForBrand(brand: string | null | undefined): string[] {
  return isGasBrand(brand ?? "") ? GAS_SIZES_BY_BRAND[brand] : [];
}
