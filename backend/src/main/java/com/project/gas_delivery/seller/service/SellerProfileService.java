package com.project.gas_delivery.seller.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.ResourceNotFoundException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.service.PermitService;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import com.project.gas_delivery.seller.dto.SellerProfileDto;
import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.seller.repository.SellerProfileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Read access to seller profiles for the customer home screen, plus the
 * seller-facing profile upsert used by the dashboard.
 *
 * <p>Each {@link SellerProfileDto} is enriched with the seller's full
 * name (from {@code users}) and the set of cylinder sizes they currently
 * stock (computed from {@code products}).</p>
 *
 * <p><strong>Permit gating (added with the seller permit workflow):</strong>
 * {@link #listAll()} only returns sellers whose {@code users.is_active}
 * is {@code true}. Newly self-registered sellers start inactive and are
 * flipped to active when an admin approves their permit. Legacy V3 seed
 * sellers were never given permit rows; for those, "no permit row" plus
 * {@code is_active=true} is the rule — so the seed list remains visible
 * without a separate backfill migration.</p>
 */
@Service
public class SellerProfileService {

    /**
     * Diagnostic logger. One INFO line per dropped row per request —
     * support can grep `dropped-for-null-coords` / `out-of-radius` to
     * confirm which gate is biting without a SQL query.
     */
    private static final Logger log = LoggerFactory.getLogger(SellerProfileService.class);

    private final SellerProfileRepository sellerProfileRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final PermitService permitService;
    /**
     * Resolves a free-form Business Address into lat/lng whenever the
     * seller doesn't supply coordinates on the upsert payload. Unknown
     * addresses are rejected rather than silently mapped to a fake pin.
     */
    private final GeocodingService geocodingService;

    /**
     * Service radius (km) applied to the customer "Nearby Sellers" list
     * when the caller doesn't request an explicit one. Read from
     * {@code app.nearby.radius-km} so it can be tuned per environment
     * without a code change; the default preserves the previous
     * hardcoded 25 km behaviour.
     */
    private final double defaultNearbyRadiusKm;

    public SellerProfileService(SellerProfileRepository sellerProfileRepository,
                                UserRepository userRepository,
                                ProductRepository productRepository,
                                PermitService permitService,
                                GeocodingService geocodingService,
                                @org.springframework.beans.factory.annotation.Value(
                                        "${app.nearby.radius-km:25}") double defaultNearbyRadiusKm) {
        this.sellerProfileRepository = sellerProfileRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.permitService = permitService;
        this.geocodingService = geocodingService;
        this.defaultNearbyRadiusKm = defaultNearbyRadiusKm;
    }

    /**
     * Treat blank strings as "no change" for optional text fields. The
     * patch DTO carries a separate {@code null} vs {@code ""} signal:
     * a missing field stays {@code null} (so we know not to touch the
     * stored value), but a field the seller explicitly cleared comes
     * through as {@code ""}. Previously the service interpreted
     * {@code ""} as "set to blank", which silently blanked stored
     * Ward / Street / Region values on every save. Returns
     * {@code null} for blank, the trimmed value otherwise.
     */
    private static String blankToNull(String v) {
        if (v == null) return null;
        String trimmed = v.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Validate a lat/lng pair from the patch. Reject anything outside
     * the WGS-84 range or the suspicious {@code (0, 0)} "null island"
     * — a seller can never pin themselves to the Gulf of Guinea, and
     * a never-configured row should stay {@code null}, not
     * auto-default to {@code (0, 0)}. Throws {@link BadRequestException}
     * with a message safe to surface to the seller.
     */
    private static void validateLatLng(Double lat, Double lng) {
        if (lat == null || lng == null) return;
        if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "Coordinates are out of range. Latitude must be between -90 and 90; longitude between -180 and 180.");
        }
        if (lat == 0.0 && lng == 0.0) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "(0, 0) is not a valid shop location. Please pick a point on land.");
        }
    }

    @Transactional(readOnly = true)
    public List<SellerProfileDto> listAll() {
        // No customer coordinates → no radius / sort, but the wire shape
        // stays identical so legacy callers (admin screens, debug pages)
        // keep working unchanged.
        return projectApprovedActive().stream()
                .sorted((a, b) -> a.businessName().compareToIgnoreCase(b.businessName()))
                .toList();
    }

    /**
     * Customer-facing "Nearby Sellers" pipeline. When {@code customerLat}
     * / {@code customerLng} are supplied, results are filtered to the
     * supplied radius (default 25 km) and sorted nearest-first. Without
     * coordinates this method behaves identically to {@link #listAll()}.
     *
     * <p>The distance is computed server-side via Haversine so the wire
     * payload already carries an accurate {@code distanceKm} — the
     * client only needs to display it.</p>
     */
    @Transactional(readOnly = true)
    public List<SellerProfileDto> listAllNear(Double customerLat,
                                              Double customerLng,
                                              Double radiusKm) {
        boolean hasCustomerGps = customerLat != null && customerLng != null;
        double radius = (radiusKm == null || radiusKm <= 0) ? defaultNearbyRadiusKm : radiusKm;
        List<SellerProfileDto> base = projectApprovedActive();
        if (!hasCustomerGps) {
            return base;
        }
        List<SellerProfileDto> inRange = base.stream()
                .filter(dto -> {
                    if (dto.lat() == null || dto.lng() == null) {
                        log.info(
                                "[SELLER_MAP_DEBUG] sellerId={} sellerName={} sellerLat={} sellerLng={} customerLat={} customerLng={} radiusKm={} result=DROPPED reason=NULL_COORDS",
                                dto.sellerId(),
                                dto.businessName(),
                                dto.lat(),
                                dto.lng(),
                                customerLat,
                                customerLng,
                                radius
                        );
                        return false;
                    }
                    double distanceKm = round1(haversineKm(customerLat, customerLng, dto.lat(), dto.lng()));
                    boolean included = distanceKm <= radius;
                    log.info(
                            "[SELLER_MAP_DEBUG] sellerId={} sellerName={} sellerLat={} sellerLng={} customerLat={} customerLng={} distanceKm={} radiusKm={} result={} reason={}",
                            dto.sellerId(),
                            dto.businessName(),
                            dto.lat(),
                            dto.lng(),
                            customerLat,
                            customerLng,
                            distanceKm,
                            radius,
                            included ? "INCLUDED" : "DROPPED",
                            included ? "IN_RADIUS" : "OUTSIDE_RADIUS"
                    );
                    return included;
                })
                .map(dto -> withComputedDistance(dto, customerLat, customerLng))
                .sorted((a, b) -> {
                    if (a.distanceKm() == null && b.distanceKm() == null) return 0;
                    if (a.distanceKm() == null) return 1;
                    if (b.distanceKm() == null) return -1;
                    return Double.compare(a.distanceKm(), b.distanceKm());
                })
                .toList();

        log.info(
                "[SELLER_MAP_DEBUG] customerLat={} customerLng={} radiusKm={} approvedCandidates={} returned={}",
                customerLat,
                customerLng,
                radius,
                base.size(),
                inRange.size()
        );
        return inRange;
    }

    /**
     * Produce a copy of {@code dto} with {@code distanceKm} populated
     * from the Haversine formula (or {@code null} when either side
     * lacks coords). Extracted from {@link #listAllNear} so both the
     * GPS path and any future fallback path can share the math.
     */
    private static SellerProfileDto withComputedDistance(SellerProfileDto dto,
                                                         Double customerLat,
                                                         Double customerLng) {
        if (dto.lat() == null || dto.lng() == null
                || customerLat == null || customerLng == null) {
            return dto.withDistanceKm(null);
        }
        double km = haversineKm(customerLat, customerLng, dto.lat(), dto.lng());
        return dto.withDistanceKm(round1(km));
    }

    /**
     * Project the persisted seller profiles into the wire DTO after
     * applying the (active + permit-approved) visibility filter. Pulled
     * out of {@link #listAll()} so both list endpoints share one
     * implementation.
     */
    private List<SellerProfileDto> projectApprovedActive() {
        List<SellerProfileEntity> profiles = sellerProfileRepository.findAll();

        // Resolve user (full name) for each seller — single batch lookup.
        List<Long> userIds = profiles.stream().map(SellerProfileEntity::getUserId).toList();
        Map<Long, User> users = new HashMap<>();
        userRepository.findAllById(userIds).forEach(u -> users.put(u.getId(), u));

        // Resolve the set of cylinder sizes per seller from active products.
        Map<Long, Set<String>> sizesBySeller = new HashMap<>();
        for (ProductEntity p : productRepository.findBySellerIdInAndActiveTrue(userIds)) {
            sizesBySeller
                    .computeIfAbsent(p.getSellerId(), k -> new LinkedHashSet<>())
                    .add(p.getSize());
        }

        // Sellers whose permit is APPROVED. Sellers with no permit row at
        // all (the V3 seed users) bypass this check — handled below.
        Set<Long> approvedSellerIds = permitService.approvedSellerIds();

        return profiles.stream()
                .filter(p -> {
                    User u = users.get(p.getUserId());
                    if (u == null || u.getRole() != Role.SELLER || !u.isActive()) {
                        return false;
                    }
                    // Active sellers with NO permit row are treated as
                    // legacy / approved (the V3 seed users). Any seller
                    // with a permit row must be APPROVED to appear here.
                    boolean hasPermitRow = permitService.hasPermitRow(p.getUserId());
                    if (!hasPermitRow) {
                        return true;
                    }
                    return approvedSellerIds.contains(p.getUserId());
                })
                .map(p -> {
                    User u = users.get(p.getUserId());
                    String[] sizes = sizesBySeller
                            .getOrDefault(p.getUserId(), Set.of())
                            .toArray(new String[0]);
                    // Distance is filled in by the caller (see
                    // {@link #listAllNear} for the GPS path; the legacy
                    // {@link #listAll()} path ships 0.0 to keep the wire
                    // shape stable for non-customer screens).
                    return SellerProfileDto.from(p, u.getFullName(), 0.0, sizes);
                })
                .toList();
    }

    /**
     * Haversine — great-circle distance between two lat/lng pairs in
     * kilometres. Inline rather than reusing the frontend's lib so the
     * backend remains the source of truth for the customer-facing
     * distance value.
     */
    private static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        final double R = 6371.0; // Earth radius in km
        double toRad = Math.PI / 180.0;
        double dLat = (lat2 - lat1) * toRad;
        double dLng = (lng2 - lng1) * toRad;
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad)
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    /** Return the seller's own profile, lazily creating it if not present. */
    @Transactional
    public SellerProfileDto me(Long actorId) {
        User user = userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("Seller " + actorId + " not found."));
        SellerProfileEntity entity = sellerProfileRepository.findById(actorId)
                .orElseGet(() -> {
                    SellerProfileEntity created = new SellerProfileEntity(
                            actorId,
                            user.getFullName() + "'s Shop",
                            "Address not set",
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            user.getPhone(),
                            java.math.BigDecimal.ZERO,
                            true
                    );
                    return sellerProfileRepository.save(created);
                });
        return SellerProfileDto.from(entity, user.getFullName(), 0.0, new String[0]);
    }

    /**
     * Create or update the seller's own profile. New SELLER accounts don't
     * get a profile row at registration — the row is created lazily the
     * first time the seller fills in their business info (which happens
     * alongside, but separately from, the permit application).
     *
     * <p><strong>Geocoding:</strong> when the patch omits lat/lng (or
     * supplies them as null) we delegate to {@link GeocodingService}.
     * When the patch supplies explicit coordinates we trust them — the
     * seller is the authority on their own location.</p>
     *
     * <p><strong>Optional fields:</strong> Region / District / Ward / Street
     * use {@code null} as "no change" and {@code ""} as "clear". A save
     * that only updates the full address therefore leaves the previously
     * typed Ward and Street alone, which is what the seller expects from
     * the Edit modal.</p>
     *
     * <p><strong>Phone:</strong> the seller doesn't always pass it (the
     * "Save location" path strips it from the payload). When the patch
     * omits the phone we MUST NOT blank the stored value — we only
     * overwrite when the patch supplied a non-null one.</p>
     */
    @Transactional
    public SellerProfileDto upsertMe(Long actorId, SellerProfileDto patch) {
        // Resolve the actor once at the top — the create-branch lambda
        // below needs the user's phone for the initial seed, and the
        // return path needs their full name.
        User user = userRepository.findById(actorId)
                .orElseThrow(() -> new NotAuthorizedException("Seller " + actorId + " not found."));
        if (patch.businessName() == null || patch.businessName().isBlank()
                || patch.location() == null || patch.location().isBlank()) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "businessName and location are required.");
        }
        String newAddress = patch.location().trim();

        // Optional admin-level fields. `blankToNull` distinguishes
        // "field not in patch" (leave stored value alone) from "field
        // explicitly cleared" (write null). The previous code only
        // skipped null inputs, so a save that included the field as
        // `""` would silently blank the stored Ward / Street / Region.
        String newRegion = blankToNull(patch.region());
        String newDistrict = blankToNull(patch.district());
        String newWard = blankToNull(patch.ward());
        String newStreet = blankToNull(patch.street());

        SellerProfileEntity entity = sellerProfileRepository.findById(actorId)
                .orElseGet(() -> {
                    // First-time create — the seller has no saved
                    // coordinates yet. Resolve them now from the typed
                    // address (or the patch's explicit pin) so the row
                    // is born with real coordinates, never `null` and
                    // never a hardcoded fallback.
                    Double createLat;
                    Double createLng;
                    if (patch.lat() != null && patch.lng() != null) {
                        validateLatLng(patch.lat(), patch.lng());
                        createLat = patch.lat();
                        createLng = patch.lng();
                    } else {
                        GeocodingService.Coordinates c = geocodingService.resolve(newAddress)
                                .orElseThrow(() -> new com.project.gas_delivery.auth.exception.BadRequestException(
                                        "Could not resolve business address to coordinates."));
                        createLat = c.lat();
                        createLng = c.lng();
                    }
                    // First-time create. Carry the user's phone
                    // (already on `User`) — the patch payload
                    // typically strips it on the Save-location path,
                    // so we have to seed it from the user record,
                    // otherwise the seller profile is born without a
                    // phone and the previous unconditional
                    // `setPhone(patch.phone())` below would null it.
                    SellerProfileEntity created = new SellerProfileEntity(
                            actorId,
                            patch.businessName().trim(),
                            newAddress,
                            newDistrict,
                            newRegion,
                            newWard,
                            newStreet,
                            createLat,
                            createLng,
                            user.getPhone(),
                            java.math.BigDecimal.ZERO,
                            true
                    );
                    return sellerProfileRepository.save(created);
                });
        entity.setBusinessName(patch.businessName().trim());
        entity.setAddress(newAddress);
        // Only overwrite the stored phone when the patch supplied one.
        // The patch is null on the Save-location path; an unconditional
        // set would clear the stored phone on every address save.
        if (patch.phone() != null) entity.setPhone(patch.phone());
        // 1. Resolve coordinates. Explicit lat/lng wins; otherwise we
        // geocode the submitted business address for this save. That
        // keeps address-only updates and seller GPS/address edits in
        // sync instead of leaving stale coordinates behind.
        Double newLat;
        Double newLng;
        if (patch.lat() != null && patch.lng() != null) {
            validateLatLng(patch.lat(), patch.lng());
            newLat = patch.lat();
            newLng = patch.lng();
        } else {
            GeocodingService.Coordinates c = geocodingService.resolve(newAddress)
                    .orElseThrow(() -> new com.project.gas_delivery.auth.exception.BadRequestException(
                            "Could not resolve business address to coordinates."));
            newLat = c.lat();
            newLng = c.lng();
        }
        entity.setLat(newLat);
        entity.setLng(newLng);
        // Apply the optional admin fields only when the patch carried a
        // value (null = "don't touch"). See the blankToNull helper
        // above for the distinction between missing and cleared.
        if (newRegion != null) entity.setRegion(newRegion);
        if (newDistrict != null) entity.setDistrict(newDistrict);
        if (newWard != null) entity.setWard(newWard);
        if (newStreet != null) entity.setStreet(newStreet);
        SellerProfileEntity saved = sellerProfileRepository.save(entity);
        return SellerProfileDto.from(saved, user.getFullName(), 0.0, new String[0]);
    }
}
