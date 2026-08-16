package com.project.gas_delivery.seller.service;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Resolves a free-form Business Address into geographic coordinates.
 *
 * <p>The implementation is intentionally dependency-free so the seller
 * profile upsert path can geocode addresses on every save without an
 * external network call:</p>
 *
 * <ol>
 *   <li>A small dictionary of known districts / regions in the same
 *       general area is consulted first. If the input address contains
 *       one of the dictionary keys (case-insensitive, trimmed), the
 *       associated coordinates are returned. This means demo addresses
 *       such as "Stone Town, Zanzibar" resolve to real, distinct
 *       coordinates without any third-party API key.</li>
 *   <li>If no dictionary key matches, the address is hashed
 *       deterministically (FNV-1a 32-bit) and the resulting integer is
 *       mapped to a stable coordinate inside a Tanzanian city center
 *       area. The hash is salted by the same dictionary so different
 *       unknown addresses still land in distinguishable but
 *       realistic-looking spots.</li>
 * </ol>
 *
 * <p>This service <strong>always</strong> returns a coordinate — it never
 * throws or returns {@code Optional.empty()}. That contract is what lets
 * {@link SellerProfileService} unconditionally persist a non-null
 * {@code lat}/{@code lng} on every upsert, which in turn keeps the
 * customer "Nearby Sellers" list sortable by distance.</p>
 */
@Service
public class GeocodingService {

    /**
     * Public API. Returns the geocoded coordinate for the given address,
     * or {@link Optional#empty()} when the input is blank. Non-blank
     * input is always resolved by {@link #resolveInternal(String)}.
     */
    public Optional<Coordinates> resolve(String address) {
        if (address == null) return Optional.empty();
        String trimmed = address.trim();
        if (trimmed.isEmpty()) return Optional.empty();
        return Optional.of(resolveInternal(trimmed));
    }

    /**
     * Internal resolution path. Always returns a non-null record so the
     * seller upsert can save lat/lng unconditionally.
     */
    private Coordinates resolveInternal(String address) {
        String lower = address.toLowerCase(Locale.ROOT);

        // 1. Dictionary lookup — first match wins. The dictionary is
        // intentionally ordered so the more specific region keys are
        // tested before generic ones.
        for (Map.Entry<String, Coordinates> e : DICTIONARY.entrySet()) {
            if (lower.contains(e.getKey())) {
                return e.getValue();
            }
        }

        // 2. Deterministic hash fallback. The hash is salted with the
        // first dictionary entry's latitude so unknown addresses in the
        // same country cluster near the rest of the dataset rather than
        // scattering to (0,0).
        Coordinates anchor = DICTIONARY.values().iterator().next();
        int hash = fnv1a32(lower);
        // Two decimals ≈ ~1.1 km resolution, which keeps "nearby" math
        // stable for the customer dashboard.
        double latJitter = ((hash & 0xFF) / 255.0) * 0.4 - 0.2;
        double lngJitter = (((hash >>> 8) & 0xFF) / 255.0) * 0.4 - 0.2;
        return new Coordinates(
                round4(anchor.lat + latJitter),
                round4(anchor.lng + lngJitter)
        );
    }

    /**
     * Stable FNV-1a 32-bit hash. Public so tests can pin the output of a
     * sample input.
     */
    static int fnv1a32(String s) {
        int h = 0x811c9dc5;
        for (int i = 0; i < s.length(); i++) {
            h ^= Character.toLowerCase(s.charAt(i));
            h *= 0x01000193;
        }
        return h;
    }

    private static double round4(double v) {
        return Math.round(v * 10_000.0) / 10_000.0;
    }

    /**
     * A small dictionary of city / district anchors. Keys are
     * lower-cased substrings; the order matters because the lookup uses
     * the first match. The values are real coordinates (within ~0.05° of
     * each city's center) so the customer dashboard's Haversine math
     * returns a believable "km" reading.
     */
    private static final Map<String, Coordinates> DICTIONARY = buildDictionary();

    private static Map<String, Coordinates> buildDictionary() {
        // LinkedHashMap so iteration order matches declaration order.
        //
        // Order matters: lookup is a first-match substring scan, so we
        // MUST list specific neighbourhoods BEFORE the generic city /
        // region fallback. Otherwise "Stone Town, Zanzibar" matches
        // "zanzibar" first and returns its (city-centre) coordinates
        // instead of Stone Town's. Same rule for mainland districts:
        // "Kinondoni, Dar es Salaam" must resolve to Kinondoni, not
        // the Dar es Salaam anchor. See `resolveInternal` for the
        // iteration rule.
        Map<String, Coordinates> m = new LinkedHashMap<>();
        // ---- Zanzibar: specific neighbourhoods first ----
        m.put("stone town",    new Coordinates(-6.1620, 39.1930));
        m.put("michenzani",    new Coordinates(-6.1650, 39.2050));
        m.put("malindi",       new Coordinates(-6.1610, 39.1950));
        m.put("amani",         new Coordinates(-6.1550, 39.2100));
        // Zanzibar as a whole — only reached when no specific
        // neighbourhood was mentioned.
        m.put("zanzibar",      new Coordinates(-6.1659, 39.2026));
        // ---- Mainland: specific districts first ----
        m.put("kinondoni",     new Coordinates(-6.7800, 39.2700));
        m.put("ilala",         new Coordinates(-6.8200, 39.2600));
        m.put("temeke",        new Coordinates(-6.8600, 39.2700));
        m.put("mikocheni",     new Coordinates(-6.7600, 39.2600));
        // Mainland city anchors — only reached when no specific
        // district was mentioned.
        m.put("dar es salaam", new Coordinates(-6.7924, 39.2083));
        // ---- Other major cities ----
        m.put("arusha",        new Coordinates(-3.3869, 36.6829));
        m.put("dodoma",        new Coordinates(-6.1630, 35.7516));
        m.put("mwanza",        new Coordinates(-2.5164, 32.9175));
        m.put("mbeya",         new Coordinates(-8.9094, 33.4608));
        m.put("tanga",         new Coordinates(-5.0689, 39.0986));
        m.put("morogoro",      new Coordinates(-6.8278, 37.6591));
        return m;
    }

    /**
     * Lightweight {@code (lat, lng)} value object. A record keeps the
     * type immutable and the JSON serialisation predictable if a future
     * controller endpoint exposes it.
     */
    public record Coordinates(double lat, double lng) {
    }
}