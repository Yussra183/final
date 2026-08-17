package com.project.gas_delivery.seller.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.permit.service.PermitService;
import com.project.gas_delivery.product.repository.ProductRepository;
import com.project.gas_delivery.seller.dto.SellerProfileDto;
import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.seller.repository.SellerProfileRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SellerProfileServiceTest {

    @Mock
    private SellerProfileRepository sellerProfileRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private ProductRepository productRepository;
    @Mock
    private PermitService permitService;
    @Mock
    private GeocodingService geocodingService;

    private SellerProfileService sellerProfileService;

    @BeforeEach
    void setUp() {
        sellerProfileService = new SellerProfileService(
                sellerProfileRepository,
                userRepository,
                productRepository,
                permitService,
                geocodingService,
                25.0
        );
    }

    @Test
    void upsertMeGeocodesAddressWhenCoordsMissing() {
        Long sellerId = 7L;
        User user = sellerUser(sellerId);
        SellerProfileEntity existing = new SellerProfileEntity(
                sellerId,
                "Old Shop",
                "Old Address",
                "Urban",
                "Mjini Magharibi",
                "Ward A",
                "Street A",
                -6.2,
                39.1,
                "255700000000",
                BigDecimal.ZERO,
                true
        );
        SellerProfileDto patch = new SellerProfileDto(
                String.valueOf(sellerId),
                null,
                "New Shop",
                "Stone Town, Zanzibar",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "Mjini Magharibi",
                "Urban",
                "Ward B",
                "Street B",
                null
        );

        when(userRepository.findById(sellerId)).thenReturn(Optional.of(user));
        when(sellerProfileRepository.findById(sellerId)).thenReturn(Optional.of(existing));
        when(geocodingService.resolve("Stone Town, Zanzibar"))
                .thenReturn(Optional.of(new GeocodingService.Coordinates(-6.1620, 39.1930)));
        when(sellerProfileRepository.save(any(SellerProfileEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        SellerProfileDto saved = sellerProfileService.upsertMe(sellerId, patch);

        assertEquals(-6.1620, saved.lat());
        assertEquals(39.1930, saved.lng());
        assertEquals("255700000000", saved.phone());
    }

    @Test
    void upsertMeRejectsUnresolvableAddressWithoutCoords() {
        Long sellerId = 7L;
        User user = sellerUser(sellerId);
        SellerProfileEntity existing = new SellerProfileEntity(
                sellerId,
                "Old Shop",
                "Old Address",
                null,
                null,
                null,
                null,
                -6.2,
                39.1,
                "255700000000",
                BigDecimal.ZERO,
                true
        );
        SellerProfileDto patch = new SellerProfileDto(
                String.valueOf(sellerId),
                null,
                "New Shop",
                "Unknown Place 123",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );

        when(userRepository.findById(sellerId)).thenReturn(Optional.of(user));
        when(sellerProfileRepository.findById(sellerId)).thenReturn(Optional.of(existing));
        when(geocodingService.resolve("Unknown Place 123")).thenReturn(Optional.empty());

        assertThrows(BadRequestException.class, () -> sellerProfileService.upsertMe(sellerId, patch));
    }

    @Test
    void listAllNearDropsSellersWithoutCoordsFromGpsResults() {
        User sellerWithCoords = sellerUser(1L);
        User sellerWithoutCoords = sellerUser(2L);
        SellerProfileEntity coordsProfile = new SellerProfileEntity(
                1L,
                "Coords Shop",
                "Stone Town",
                null,
                null,
                null,
                null,
                -6.1620,
                39.1930,
                "255700000001",
                BigDecimal.ZERO,
                true
        );
        SellerProfileEntity missingProfile = new SellerProfileEntity(
                2L,
                "Missing Shop",
                "Address not set",
                null,
                null,
                null,
                null,
                null,
                null,
                "255700000002",
                BigDecimal.ZERO,
                true
        );

        when(sellerProfileRepository.findAll()).thenReturn(List.of(coordsProfile, missingProfile));
        when(userRepository.findAllById(List.of(1L, 2L))).thenReturn(List.of(sellerWithCoords, sellerWithoutCoords));
        when(productRepository.findBySellerIdInAndActiveTrue(List.of(1L, 2L))).thenReturn(List.of());
        when(permitService.approvedSellerIds()).thenReturn(Set.of(1L, 2L));
        when(permitService.hasPermitRow(1L)).thenReturn(true);
        when(permitService.hasPermitRow(2L)).thenReturn(true);

        List<SellerProfileDto> results = sellerProfileService.listAllNear(-6.1625, 39.1935, 25.0);

        assertEquals(1, results.size());
        assertEquals("1", results.get(0).sellerId());
    }

    private static User sellerUser(Long id) {
        User user = new User(
                "Seller " + id,
                "seller-" + id,
                "seller" + id + "@test.local",
                "x",
                "255700000000",
                Role.SELLER
        );
        setField(user, "id", id);
        user.setActive(true);
        return user;
    }

    private static void setField(Object target, String name, Object value) {
        try {
            java.lang.reflect.Field f = target.getClass().getDeclaredField(name);
            f.setAccessible(true);
            f.set(target, value);
        } catch (ReflectiveOperationException ex) {
            throw new RuntimeException(ex);
        }
    }
}
