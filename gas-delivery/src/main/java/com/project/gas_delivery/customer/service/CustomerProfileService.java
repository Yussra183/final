package com.project.gas_delivery.customer.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.customer.dto.CustomerLocationDto;
import com.project.gas_delivery.customer.dto.CustomerProfilePatchDto;
import com.project.gas_delivery.customer.entity.CustomerProfileEntity;
import com.project.gas_delivery.customer.repository.CustomerProfileRepository;
import com.project.gas_delivery.seller.service.GeocodingService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Read / write access to the customer's saved location.
 *
 * <p>This is the <strong>official</strong> customer location for the
 * platform: it is loaded once after login, cached on the client for the
 * session, and used as the reference point by the "Nearby Sellers"
 * pipeline ({@code GET /api/sellers?lat&lng&radiusKm}) so the customer
 * never has to type an address twice.</p>
 *
 * <p><strong>Geocoding:</strong> the Profile screen collects a textual
 * address only — it has no coordinate inputs. Rather than change that
 * UI, {@link #upsertMe} resolves the address to coordinates through the
 * same {@link GeocodingService} the seller profile upsert already uses.
 * Every saved row therefore carries non-null {@code lat}/{@code lng},
 * which is precisely what makes the Haversine sort in
 * {@code SellerProfileService.listAllNear} possible.</p>
 */
@Service
public class CustomerProfileService {

    private final CustomerProfileRepository customerProfileRepository;
    private final UserRepository userRepository;

    /**
     * Resolves the free-form address into lat/lng whenever the client
     * doesn't supply coordinates. Reused from the seller module rather
     * than duplicated so both roles geocode identically — a customer and
     * a seller who type the same address land on the same point, which
     * keeps the distance between them honest.
     */
    private final GeocodingService geocodingService;

    public CustomerProfileService(CustomerProfileRepository customerProfileRepository,
                                  UserRepository userRepository,
                                  GeocodingService geocodingService) {
        this.customerProfileRepository = customerProfileRepository;
        this.userRepository = userRepository;
        this.geocodingService = geocodingService;
    }

    /**
     * The signed-in customer's saved location.
     *
     * <p>Deliberately does <strong>not</strong> 404 when no row exists.
     * The Profile screen calls this on every mount, including for a
     * customer who has just registered and never saved — an all-null
     * payload lets it render empty inputs with no special-casing.</p>
     */
    @Transactional(readOnly = true)
    public CustomerLocationDto me(Long actorId) {
        return customerProfileRepository.findById(actorId)
                .map(CustomerLocationDto::from)
                .orElseGet(CustomerLocationDto::empty);
    }

    /**
     * Create or update the signed-in customer's location.
     *
     * <p>The row is created lazily on the first save — customers get no
     * {@code customer_profiles} row at registration, mirroring how
     * seller profiles are created lazily by the seller dashboard.</p>
     *
     * <p>Validation rejects empty / invalid locations before anything is
     * written, so a partially-filled form can never silently persist a
     * location the nearby-seller pipeline would then sort against.</p>
     */
    @Transactional
    public CustomerLocationDto upsertMe(Long actorId, CustomerLocationDto patch) {
        if (patch == null) {
            throw new BadRequestException("Location payload is required.");
        }

        // ---- 1. Required text fields ------------------------------------
        String region = trimToNull(patch.region());
        String district = trimToNull(patch.district());
        String street = trimToNull(patch.street());
        String ward = trimToNull(patch.ward());

        List<String> missing = new ArrayList<>();
        if (region == null) missing.add("region");
        if (district == null) missing.add("district");
        if (street == null) missing.add("street");
        if (!missing.isEmpty()) {
            throw new BadRequestException(
                    "Missing required location field(s): " + String.join(", ", missing) + ".");
        }

        // ---- 2. Full address --------------------------------------------
        // When the customer leaves "Full Address" blank we compose one
        // from the granular parts — the same rule the Profile screen
        // previews as "Will be saved as: …", kept server-side so the
        // stored value is identical however the client behaves.
        String address = trimToNull(patch.address());
        if (address == null) {
            address = composeAddress(street, ward, district, region);
        }
        if (address == null) {
            throw new BadRequestException("Full address is required.");
        }

        // ---- 3. Coordinates ---------------------------------------------
        Double lat = patch.lat();
        Double lng = patch.lng();
        boolean hasLat = lat != null;
        boolean hasLng = lng != null;

        if (hasLat != hasLng) {
            throw new BadRequestException(
                    "Latitude and longitude must be supplied together.");
        }

        if (hasLat) {
            // The client claimed coordinates — validate them rather than
            // trusting the wire. An out-of-range or null-island value
            // would silently corrupt every distance calculation.
            validateCoordinates(lat, lng);
        } else {
            // No coordinates supplied (the normal path — the Profile UI
            // has no coordinate inputs). Derive them from the address.
            GeocodingService.Coordinates resolved = geocodingService.resolve(address)
                    .orElseThrow(() -> new BadRequestException(
                            "Could not resolve the address to coordinates. "
                                    + "Please check the address and try again."));
            lat = resolved.lat();
            lng = resolved.lng();
        }

        // ---- 4. Persist ---------------------------------------------------
        CustomerProfileEntity entity = customerProfileRepository.findById(actorId)
                .orElseGet(() -> new CustomerProfileEntity(actorId));

        entity.setRegion(region);
        entity.setDistrict(district);
        entity.setWard(ward);
        entity.setStreet(street);
        entity.setAddress(address);
        entity.setLat(lat);
        entity.setLng(lng);

        return CustomerLocationDto.from(customerProfileRepository.save(entity));
    }

    /**
     * Update the signed-in customer's editable personal fields on the
     * {@code users} row (full name, username, email, phone).
     *
     * <p>This is the destination of the Profile screen's
     * {@code Save Profile} button for personal information — pairing
     * with the location persistence handled by
     * {@link #upsertMe(Long, CustomerLocationDto)} so a single save
     * round-trip persists both halves of the form.</p>
     *
     * <p>Each supplied field is validated and applied independently.
     * {@code null} values are treated as "field not sent on this
     * patch" and leave the stored value untouched — only the
     * presence of a non-null entry triggers a write. Username/email
     * collisions are rejected with {@code 400} (same rule the
     * registration endpoint enforces) so the patch can never produce
     * a row that the registration flow would also have rejected.</p>
     *
     * <p>The {@code users} schema is unchanged — only existing
     * columns are touched.</p>
     */
    @Transactional
    public CustomerProfilePatchDto patchPersonal(Long actorId, CustomerProfilePatchDto patch) {
        if (patch == null) {
            throw new BadRequestException("Profile payload is required.");
        }
        User user = userRepository.findById(actorId)
                .orElseThrow(() -> new BadRequestException(
                        "Customer " + actorId + " not found."));

        // ---- full name ----------------------------------------------------
        String fullName = trimToNull(patch.fullName());
        if (patch.fullName() != null && fullName == null) {
            throw new BadRequestException("Full name cannot be blank.");
        }
        if (fullName != null) user.setFullName(fullName);

        // ---- username -----------------------------------------------------
        String username = trimToNull(patch.username());
        if (patch.username() != null && username == null) {
            throw new BadRequestException("Username cannot be blank.");
        }
        if (username != null && !username.equals(user.getUsername())) {
            if (userRepository.existsByUsername(username)) {
                throw new BadRequestException("Username is already taken.");
            }
            user.setUsername(username);
        }

        // ---- email --------------------------------------------------------
        String email = trimToNull(patch.email());
        if (patch.email() != null && email == null) {
            throw new BadRequestException("Email cannot be blank.");
        }
        if (email != null && !email.equals(user.getEmail())) {
            if (userRepository.existsByEmail(email)) {
                throw new BadRequestException("Email is already registered.");
            }
            user.setEmail(email);
        }

        // ---- phone --------------------------------------------------------
        String phone = trimToNull(patch.phone());
        // Phone is allowed to be cleared — the existing schema treats
        // `phone` as nullable, so an empty input maps to null.
        if (patch.phone() != null) user.setPhone(phone);

        User saved = userRepository.save(user);
        return new CustomerProfilePatchDto(
                saved.getFullName(), saved.getUsername(), saved.getEmail(), saved.getPhone());
    }

    // --- helpers ---------------------------------------------------------

    /**
     * Guard against coordinates that are structurally valid JSON numbers
     * but meaningless as a location: out-of-range values, and Null Island
     * (0,0) — the classic "uninitialised variable" coordinate, which is
     * ~600 km off the coast of Ghana and would make every seller appear
     * thousands of kilometres away.
     */
    private static void validateCoordinates(Double lat, Double lng) {
        if (lat.isNaN() || lng.isNaN() || lat.isInfinite() || lng.isInfinite()) {
            throw new BadRequestException("Latitude and longitude must be valid numbers.");
        }
        if (lat < -90.0 || lat > 90.0) {
            throw new BadRequestException("Latitude must be between -90 and 90.");
        }
        if (lng < -180.0 || lng > 180.0) {
            throw new BadRequestException("Longitude must be between -180 and 180.");
        }
        if (lat == 0.0 && lng == 0.0) {
            throw new BadRequestException("Coordinates (0, 0) are not a valid location.");
        }
    }

    /**
     * Join the granular parts into a single human-readable address,
     * skipping blanks. Returns {@code null} when every part is blank.
     */
    private static String composeAddress(String... parts) {
        List<String> present = new ArrayList<>();
        for (String p : parts) {
            String t = trimToNull(p);
            if (t != null) present.add(t);
        }
        return present.isEmpty() ? null : String.join(", ", present);
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
