package com.project.gas_delivery.product;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Canonical gas-brand catalogue used by both product-facing screens and
 * order validation. The DB schema still calls the field "name"/"gasType",
 * but the allowed values are the actual customer-facing brands.
 */
public final class GasCatalog {

    public record CatalogEntry(
            String brand,
            String size,
            BigDecimal defaultPrice,
            int defaultStock,
            String description
    ) {
    }

    public static final String ORYX = "Oryx Gas";
    public static final String TAIFA = "Taifa Gas";
    public static final String LAKE = "Lake Gas";
    public static final String MANJIS = "Manjis Gas";
    public static final String MIHAN = "Mihan Gas";

    private static final Map<String, List<String>> SIZES_BY_BRAND = Map.of(
            ORYX, List.of("3 kg", "6 kg", "12.5 kg", "38 kg"),
            TAIFA, List.of("6 kg", "15 kg", "38 kg"),
            LAKE, List.of("6 kg", "15 kg", "38 kg"),
            MANJIS, List.of("6 kg", "15 kg", "38 kg"),
            MIHAN, List.of("6 kg", "15 kg", "38 kg")
    );

    private static final List<CatalogEntry> ENTRIES = List.of(
            new CatalogEntry(ORYX, "3 kg", new BigDecimal("10000.00"), 24, "Oryx Gas refill — 3 kg cylinder."),
            new CatalogEntry(ORYX, "6 kg", new BigDecimal("18000.00"), 24, "Oryx Gas refill — 6 kg cylinder."),
            new CatalogEntry(ORYX, "12.5 kg", new BigDecimal("32000.00"), 18, "Oryx Gas refill — 12.5 kg cylinder."),
            new CatalogEntry(ORYX, "38 kg", new BigDecimal("92000.00"), 10, "Oryx Gas refill — 38 kg cylinder."),
            new CatalogEntry(TAIFA, "6 kg", new BigDecimal("18500.00"), 24, "Taifa Gas refill — 6 kg cylinder."),
            new CatalogEntry(TAIFA, "15 kg", new BigDecimal("35500.00"), 18, "Taifa Gas refill — 15 kg cylinder."),
            new CatalogEntry(TAIFA, "38 kg", new BigDecimal("93000.00"), 10, "Taifa Gas refill — 38 kg cylinder."),
            new CatalogEntry(LAKE, "6 kg", new BigDecimal("18500.00"), 24, "Lake Gas refill — 6 kg cylinder."),
            new CatalogEntry(LAKE, "15 kg", new BigDecimal("35500.00"), 18, "Lake Gas refill — 15 kg cylinder."),
            new CatalogEntry(LAKE, "38 kg", new BigDecimal("93000.00"), 10, "Lake Gas refill — 38 kg cylinder."),
            new CatalogEntry(MANJIS, "6 kg", new BigDecimal("18500.00"), 24, "Manjis Gas refill — 6 kg cylinder."),
            new CatalogEntry(MANJIS, "15 kg", new BigDecimal("35500.00"), 18, "Manjis Gas refill — 15 kg cylinder."),
            new CatalogEntry(MANJIS, "38 kg", new BigDecimal("93000.00"), 10, "Manjis Gas refill — 38 kg cylinder."),
            new CatalogEntry(MIHAN, "6 kg", new BigDecimal("18500.00"), 24, "Mihan Gas refill — 6 kg cylinder."),
            new CatalogEntry(MIHAN, "15 kg", new BigDecimal("35500.00"), 18, "Mihan Gas refill — 15 kg cylinder."),
            new CatalogEntry(MIHAN, "38 kg", new BigDecimal("93000.00"), 10, "Mihan Gas refill — 38 kg cylinder.")
    );

    private GasCatalog() {
    }

    public static boolean isSupportedBrand(String brand) {
        return brand != null && SIZES_BY_BRAND.containsKey(brand.trim());
    }

    public static boolean isSupportedSize(String brand, String size) {
        if (brand == null || size == null) return false;
        List<String> allowed = SIZES_BY_BRAND.get(brand.trim());
        return allowed != null && allowed.contains(size.trim());
    }

    public static List<String> supportedSizes(String brand) {
        List<String> allowed = brand == null ? null : SIZES_BY_BRAND.get(brand.trim());
        return allowed == null ? List.of() : allowed;
    }

    public static List<CatalogEntry> entries() {
        return ENTRIES;
    }
}
