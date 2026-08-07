package com.project.gas_delivery.rider.dto;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;

/**
 * Wire shape for one row in the Rider "My Team" list.
 *
 * <p>Returned by {@code GET /api/riders/me/team}. The signed-in rider is
 * always the first row with {@link #isMe}{@code  = true}; teammates
 * follow with {@code isMe = false}. Riders belonging to other sellers
 * are never surfaced.</p>
 *
 * @param id            the rider's user id (stringified for wire parity
 *                      with the rest of the API)
 * @param fullName      rider's full name from {@code users.full_name}
 * @param phone         rider's contact phone (or null)
 * @param vehicleType   vehicle type (or null)
 * @param vehiclePlate  vehicle plate (or null)
 * @param available     whether the rider has toggled themselves online
 * @param active        whether the underlying {@code users} row is active
 * @param isMe          true when this row is the signed-in rider
 */
public record RiderTeamMemberDto(
        String id,
        String fullName,
        String phone,
        String vehicleType,
        String vehiclePlate,
        boolean available,
        boolean active,
        boolean isMe
) {

    public static RiderTeamMemberDto from(RiderProfileEntity profile, User user, boolean isMe) {
        return new RiderTeamMemberDto(
                String.valueOf(profile.getUserId()),
                user == null ? null : user.getFullName(),
                profile.getPhone(),
                profile.getVehicleType(),
                profile.getVehiclePlate(),
                profile.isAvailable(),
                user != null && user.isActive(),
                isMe
        );
    }
}