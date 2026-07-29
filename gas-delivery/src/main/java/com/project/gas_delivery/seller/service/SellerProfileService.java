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

    public SellerProfileService(SellerProfileRepository sellerProfileRepository,
                                UserRepository userRepository,
                                ProductRepository productRepository,
                                PermitService permitService) {
        this.sellerProfileRepository = sellerProfileRepository;
        this.userRepository = userRepository;
        this.productRepository = productRepository;
        this.permitService = permitService;
    }

    @Transactional(readOnly = true)
    public List<SellerProfileDto> listAll() {
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
                    // Distance is computed client-side from the customer's
                    // location; we ship a 0 default so the wire shape is
                    // stable. The frontend's `useNearbySellers` filter
                    // overwrites this with the actual Haversine value.
                    return SellerProfileDto.from(p, u.getFullName(), 0.0, sizes);
                })
                .toList();
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
     */
    @Transactional
    public SellerProfileDto upsertMe(Long actorId, SellerProfileDto patch) {
        if (patch.businessName() == null || patch.businessName().isBlank()
                || patch.location() == null || patch.location().isBlank()) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "businessName and location are required.");
        }
        SellerProfileEntity entity = sellerProfileRepository.findById(actorId)
                .orElseGet(() -> {
                    SellerProfileEntity created = new SellerProfileEntity(
                            actorId,
                            patch.businessName().trim(),
                            patch.location().trim(),
                            patch.distanceKm() == null ? null : null,
                            patch.distanceKm() == null ? null : null,
                            patch.lat(),
                            patch.lng(),
                            patch.phone(),
                            java.math.BigDecimal.ZERO,
                            true
                    );
                    return sellerProfileRepository.save(created);
                });
        entity.setBusinessName(patch.businessName().trim());
        entity.setAddress(patch.location().trim());
        entity.setPhone(patch.phone());
        if (patch.lat() != null) entity.setLat(patch.lat());
        if (patch.lng() != null) entity.setLng(patch.lng());
        SellerProfileEntity saved = sellerProfileRepository.save(entity);
        User user = userRepository.findById(actorId)
                .orElseThrow(() -> new NotAuthorizedException("Seller " + actorId + " not found."));
        return SellerProfileDto.from(saved, user.getFullName(), 0.0, new String[0]);
    }
}