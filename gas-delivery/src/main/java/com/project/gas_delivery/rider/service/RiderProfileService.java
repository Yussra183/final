package com.project.gas_delivery.rider.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.rider.dto.RiderProfileDto;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import com.project.gas_delivery.rider.entity.SellerRiderEntity;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Read &amp; write access to rider profiles and seller↔rider assignments.
 *
 * <p>For MVP:
 * <ul>
 *   <li>Any caller can list riders and see who's available.</li>
 *   <li>Sellers can see their assigned team via
 *       {@link #listAssignedToSeller(Long)}.</li>
 *   <li>Riders can flip their own availability flag via
 *       {@link #setAvailability(Long, Long, boolean)}.</li>
 * </ul>
 * </p>
 */
@Service
public class RiderProfileService {

    private final RiderProfileRepository riderProfileRepository;
    private final SellerRiderRepository sellerRiderRepository;
    private final UserRepository userRepository;

    public RiderProfileService(RiderProfileRepository riderProfileRepository,
                               SellerRiderRepository sellerRiderRepository,
                               UserRepository userRepository) {
        this.riderProfileRepository = riderProfileRepository;
        this.sellerRiderRepository = sellerRiderRepository;
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<RiderProfileDto> listAll(Boolean availableOnly) {
        List<RiderProfileEntity> profiles = availableOnly != null && availableOnly
                ? riderProfileRepository.findByAvailable(true)
                : riderProfileRepository.findAll();
        return map(profiles);
    }

    @Transactional(readOnly = true)
    public List<RiderProfileDto> listAssignedToSeller(Long sellerId) {
        List<Long> riderIds = sellerRiderRepository.findBySellerId(sellerId).stream()
                .map(SellerRiderEntity::getRiderId)
                .toList();
        if (riderIds.isEmpty()) return List.of();
        List<RiderProfileEntity> profiles = riderProfileRepository.findAllById(riderIds);
        return map(profiles);
    }

    @Transactional
    public RiderProfileDto setAvailability(Long riderId, Long actorId, boolean available) {
        if (!riderId.equals(actorId)) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You can only update your own availability.");
        }
        RiderProfileEntity profile = riderProfileRepository.findById(riderId)
                .orElseThrow(() -> new com.project.gas_delivery.auth.exception.ResourceNotFoundException(
                        "Rider profile " + riderId + " not found."));
        profile.setAvailable(available);
        RiderProfileEntity saved = riderProfileRepository.save(profile);
        String fullName = userRepository.findById(saved.getUserId())
                .map(User::getFullName)
                .orElse(null);
        boolean active = userRepository.findById(saved.getUserId())
                .map(User::isActive)
                .orElse(false);
        return RiderProfileDto.from(saved, fullName, active);
    }

    private List<RiderProfileDto> map(List<RiderProfileEntity> profiles) {
        if (profiles.isEmpty()) return List.of();

        List<Long> userIds = profiles.stream().map(RiderProfileEntity::getUserId).toList();
        Map<Long, User> users = new HashMap<>();
        for (User u : userRepository.findAllById(userIds)) {
            if (u.getRole() == Role.RIDER) users.put(u.getId(), u);
        }

        return profiles.stream()
                .filter(p -> users.containsKey(p.getUserId()))
                .map(p -> {
                    User u = users.get(p.getUserId());
                    return RiderProfileDto.from(p, u.getFullName(), u.isActive());
                })
                .toList();
    }
}