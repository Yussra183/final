package com.project.gas_delivery.tracking.dto;

import java.time.Instant;

/**
 * Canonical envelope used both ways on the {@code /ws/tracking} socket and
 * the REST bootstrap endpoint {@code /api/orders/{id}/tracking/latest}.
 *
 * <p>Wire shape:</p>
 * <pre>
 * {
 *   "orderId":      42,
 *   "riderId":      7,
 *   "tripId":       null,      // optional — set on supplier/rider route-trip frames, null for order-tracking frames
 *   "lat":          -6.7629,
 *   "lng":          39.2026,
 *   "headingDeg":   145.0,    // optional, degrees clockwise from north
 *   "speedMps":     6.5,      // optional, meters/second
 *   "accuracyM":    12.0,     // optional, GPS accuracy in meters
 *   "status":       "in_transit",
 *   "ts":           "2026-07-24T10:14:21.000Z",
 *   "type":         "LOCATION_UPDATE"
 * }
 * </pre>
 *
 * <p>The {@code type} discriminator lets the same socket multiplex other
 * future events (status transitions, rider arrived, etc.) without breaking
 * existing clients. {@code tripId} is the additive key used by the
 * supplier's delivery-operation tracking channel; it is null on the
 * customer/rider order-tracking channel.</p>
 */
public record LocationUpdateMessage(
        String type,
        Long orderId,
        Long riderId,
        Long tripId,
        double lat,
        double lng,
        Double headingDeg,
        Double speedMps,
        Double accuracyM,
        String status,
        Instant ts
) {

    /** Convenience factory for outbound order-scoped broadcasts. */
    public static LocationUpdateMessage location(
            Long orderId,
            Long riderId,
            double lat,
            double lng,
            Double headingDeg,
            Double speedMps,
            Double accuracyM,
            String status,
            Instant ts
    ) {
        return new LocationUpdateMessage(
                "LOCATION_UPDATE",
                orderId,
                riderId,
                null,
                lat,
                lng,
                headingDeg,
                speedMps,
                accuracyM,
                status,
                ts == null ? Instant.now() : ts
        );
    }

    /** Convenience factory for outbound trip-scoped broadcasts. */
    public static LocationUpdateMessage tripLocation(
            Long tripId,
            Long riderId,
            double lat,
            double lng,
            Double headingDeg,
            Double speedMps,
            Double accuracyM,
            String status,
            Instant ts
    ) {
        return new LocationUpdateMessage(
                "LOCATION_UPDATE",
                null,
                riderId,
                tripId,
                lat,
                lng,
                headingDeg,
                speedMps,
                accuracyM,
                status,
                ts == null ? Instant.now() : ts
        );
    }

    /** A snapshot placeholder used when the order exists but the rider has not sent any location yet. */
    public static LocationUpdateMessage empty(Long orderId) {
        return new LocationUpdateMessage(
                "LOCATION_UPDATE",
                orderId,
                null,
                null,
                Double.NaN,
                Double.NaN,
                null,
                null,
                null,
                null,
                Instant.EPOCH
        );
    }
}