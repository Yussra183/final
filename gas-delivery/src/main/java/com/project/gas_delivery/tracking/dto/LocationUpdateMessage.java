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
 * existing clients.</p>
 */
public record LocationUpdateMessage(
        String type,
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

    /** Convenience factory for outbound broadcasts. */
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