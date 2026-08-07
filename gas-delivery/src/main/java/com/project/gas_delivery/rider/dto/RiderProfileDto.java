package com.project.gas_delivery.rider.dto;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;

/**
 * Wire form of a rider profile.
 *
 * <p>Mirrors the frontend's {@code Rider} interface in
 * {@code constants/types.ts} — fullName, phone, licenseNo, vehicle info,
 * availability flag. The four trailing fields ({@code region},
 * {@code district}, {@code address}, {@code nationalId}) were added with
 * the Rider Profile module (V6 migration) and are additive on the wire;
 * older clients ignore them.</p>
 */
public record RiderProfileDto(
        String id,
        String fullName,
        String email,
        String username,
        String phone,
        String region,
        String district,
        String address,
        String nationalId,
        String licenseNo,
        String vehicleType,
        String vehiclePlate,
        String vehicleModel,
        boolean active,
        boolean available,
        Double lat,
        Double lng
) {

    public static RiderProfileDto from(RiderProfileEntity e, User user) {
        return new RiderProfileDto(
                String.valueOf(e.getUserId()),
                user == null ? null : user.getFullName(),
                user == null ? null : user.getEmail(),
                user == null ? null : user.getUsername(),
                e.getPhone(),
                e.getRegion(),
                e.getDistrict(),
                e.getAddress(),
                e.getNationalId(),
                e.getLicenseNo(),
                e.getVehicleType(),
                e.getVehiclePlate(),
                e.getVehicleModel(),
                user != null && user.isActive(),
                e.isAvailable(),
                e.getLat(),
                e.getLng()
        );
    }

    /**
     * Legacy factory used by the existing list endpoints — kept so
     * {@code RiderProfileService#map} continues to compile while we
     * expand the DTO with the new fields.
     */
    public static RiderProfileDto from(RiderProfileEntity e, String fullName, boolean active) {
        return new RiderProfileDto(
                String.valueOf(e.getUserId()),
                fullName,
                null,
                null,
                e.getPhone(),
                e.getRegion(),
                e.getDistrict(),
                e.getAddress(),
                e.getNationalId(),
                e.getLicenseNo(),
                e.getVehicleType(),
                e.getVehiclePlate(),
                e.getVehicleModel(),
                active,
                e.isAvailable(),
                e.getLat(),
                e.getLng()
        );
    }
}