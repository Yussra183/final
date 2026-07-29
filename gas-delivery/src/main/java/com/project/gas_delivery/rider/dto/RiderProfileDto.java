package com.project.gas_delivery.rider.dto;

import com.project.gas_delivery.rider.entity.RiderProfileEntity;

/**
 * Wire form of a rider profile.
 *
 * <p>Mirrors the frontend's {@code Rider} interface in
 * {@code constants/types.ts} — fullName, phone, licenseNo, vehicle info,
 * availability flag.</p>
 */
public record RiderProfileDto(
        String id,
        String fullName,
        String phone,
        String licenseNo,
        String vehicleType,
        String vehiclePlate,
        String vehicleModel,
        boolean active,
        boolean available,
        Double lat,
        Double lng
) {

    public static RiderProfileDto from(RiderProfileEntity e, String fullName, boolean active) {
        return new RiderProfileDto(
                String.valueOf(e.getUserId()),
                fullName,
                e.getPhone(),
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