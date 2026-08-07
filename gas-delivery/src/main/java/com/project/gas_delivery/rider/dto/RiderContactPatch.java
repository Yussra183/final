package com.project.gas_delivery.rider.dto;

/**
 * Wire shape for {@code PATCH /api/riders/me} — the rider's editable
 * contact / location information.
 *
 * <p>Every field is nullable so a partial patch is supported (the rider
 * may update only their phone, only their address, etc.). A {@code null}
 * for any field means "leave this column untouched"; an empty string
 * clears the column. The backend distinguishes the two by treating
 * {@code null} as a no-op and an empty string as a clear.</p>
 *
 * <p>The brief explicitly forbids editing the application number, national
 * ID, driving licence number, approval status, assigned seller and rider
 * certificate, so none of those fields are surfaced here. Attempting to
 * smuggle them through other endpoints will be rejected by the role and
 * status guards in {@code RiderProfileService}.</p>
 *
 * @param phone    personal contact phone number
 * @param region   administrative region (e.g. Dar es Salaam)
 * @param district district / ward within the region
 * @param address  full physical address line
 * @param lat      optional GPS latitude
 * @param lng      optional GPS longitude
 */
public record RiderContactPatch(
        String phone,
        String region,
        String district,
        String address,
        Double lat,
        Double lng
) {
}