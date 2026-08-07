package com.project.gas_delivery.rider.dto;

import java.util.List;

/**
 * Wire shape for {@code GET /api/riders/me/team} — the rider's seller
 * assignment plus every other approved rider sharing that seller.
 *
 * <p>The {@code seller} field is {@code null} when the rider has not yet
 * been assigned to any seller; in that case {@code riders} is empty.
 * The client uses the {@code isMe} flag on each
 * {@link RiderTeamMemberDto} to highlight the signed-in rider — the
 * rider themselves is always returned as the first member with
 * {@code isMe = true} so the page can be rendered as a single list.</p>
 *
 * @param seller the seller this rider is assigned to (or null)
 * @param riders every approved rider assigned to that seller (excluding
 *               the caller; the caller is implied and surfaced by the
 *               client via {@link RiderTeamMemberDto#isMe})
 */
public record RiderTeamDto(
        AssignedSellerDto seller,
        List<RiderTeamMemberDto> riders
) {
}