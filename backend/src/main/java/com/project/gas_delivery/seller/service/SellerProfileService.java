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

    private final SellerProfileRepository sellerProfileRepository;
    private final UserRepository userRepository;
    private final ProductRepository productRepository;
    private final PermitService permitService;
    /**
     * Resolves a free-form Business Address into lat/lng whenever the
     * seller doesn't supply coordinates on the upsert payload. Wired in
     * so every saved seller profile carries real, non-null coordinates
     * that the customer "Nearby Sellers" pipeline can sort against.
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
        return base.stream()
                // A seller with no coordinates cannot have a real distance
                // computed, so it cannot be shown to be inside the service
                // radius. Previously such rows kept the placeholder
                // distance of 0.0 and therefore sorted to the very top —
                // the least-located seller appeared to be the nearest.
                // Drop them from the GPS path instead; they still appear
                // on the unfiltered listAll() path used by admin screens.
                .filter(dto -> dto.lat() != null && dto.lng() != null)
                .map(dto -> {
                    double km = haversineKm(customerLat, customerLng, dto.lat(), dto.lng());
                    return new SellerProfileDto(
                            dto.sellerId(),
                            dto.sellerName(),
                            dto.businessName(),
                            dto.location(),
                            round1(km),
                            dto.phone(),
                            dto.rating(),
                            dto.availableSizes(),
                            dto.openNow(),
                            dto.lat(),
                            dto.lng(),
                            dto.region(),
                            dto.district()
                    );
                })
                .filter(dto -> dto.distanceKm() <= radius)
                .sorted(java.util.Comparator.comparingDouble(SellerProfileDto::distanceKm))
                .toList();
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

    /** Return the seller's own profile (or 404). */
    @Transactional(readOnly = true)
    public SellerProfileDto me(Long actorId) {
        SellerProfileEntity entity = sellerProfileRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Seller profile not yet created — complete your permit application first."));
        User user = userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("Seller " + actorId + " not found."));
        return SellerProfileDto.from(entity, user.getFullName(), 0.0, new String[0]);
    }

    /**
     * Create or update the seller's own profile. New SELLER accounts don't
     * get a profile row at registration — the row is created lazily the
     * first time the seller fills in their business info (which happens
     * alongside, but separately from, the permit application).
     *
     * <p><strong>Geocoding:</strong> when the patch omits lat/lng (or
     * supplies them as null) we delegate to {@link GeocodingService} so
     * every saved profile carries real, non-null coordinates. When the
     * patch supplies explicit coordinates we trust them — the seller is
     * the authority on their own location.</p>
     */
    @Transactional
    public SellerProfileDto upsertMe(Long actorId, SellerProfileDto patch) {
        if (patch.businessName() == null || patch.businessName().isBlank()
                || patch.location() == null || patch.location().isBlank()) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "businessName and location are required.");
        }
        String newAddress = patch.location().trim();

        // 1. Resolve coordinates. The patch wins when it supplies both;
        // otherwise we always geocode (re-geocoding on every save is
        // intentional so an updated address gets fresh coordinates).
        Double newLat;
        Double newLng;
        if (patch.lat() != null && patch.lng() != null) {
            newLat = patch.lat();
            newLng = patch.lng();
        } else {
            GeocodingService.Coordinates c = geocodingService.resolve(newAddress)
                    .orElseThrow(() -> new com.project.gas_delivery.auth.exception.BadRequestException(
                            "Could not resolve business address to coordinates."));
            newLat = c.lat();
            newLng = c.lng();
        }

        // Optional admin-level fields — trimmed like the rest. Stored on
        // the existing columns; null in → null out, so a partial save
        // never silently overwrites a previously-set value.
        String newRegion = patch.region() == null ? null : patch.region().trim();
        String newDistrict = patch.district() == null ? null : patch.district().trim();

        SellerProfileEntity entity = sellerProfileRepository.findById(actorId)
                .orElseGet(() -> {
                    SellerProfileEntity created = new SellerProfileEntity(
                            actorId,
                            patch.businessName().trim(),
                            newAddress,
                            newDistrict,
                            newRegion,
                            newLat,
                            newLng,
                            patch.phone(),
                            java.math.BigDecimal.ZERO,
                            true
                    );
                    return sellerProfileRepository.save(created);
                });
        entity.setBusinessName(patch.businessName().trim());
        entity.setAddress(newAddress);
        entity.setPhone(patch.phone());
        entity.setLat(newLat);
        entity.setLng(newLng);
        // Region / district are optional inputs; only apply when the
        // patch supplied a value (otherwise leave the stored value
        // untouched — saves that only updated the full address should
        // not blank the seller's region/district).
        if (newRegion != null) entity.setRegion(newRegion);
        if (newDistrict != null) entity.setDistrict(newDistrict);
        SellerProfileEntity saved = sellerProfileRepository.save(entity);
        User user = userRepository.findById(actorId)
                .orElseThrow(() -> new NotAuthorizedException("Seller " + actorId + " not found."));
        return SellerProfileDto.from(saved, user.getFullName(), 0.0, new String[0]);
    }
}