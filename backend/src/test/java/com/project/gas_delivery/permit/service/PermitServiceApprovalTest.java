package com.project.gas_delivery.permit.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.permit.entity.PermitDocumentEntity;
import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitDocumentType;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.PermitDocumentRepository;
import com.project.gas_delivery.permit.repository.SellerPermitRepository;
import com.project.gas_delivery.product.service.GasCatalogProvisioningService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PermitServiceApprovalTest {

    @Mock private SellerPermitRepository permitRepository;
    @Mock private PermitDocumentRepository documentRepository;
    @Mock private PermitDocumentStorageService storageService;
    @Mock private UserRepository userRepository;
    @Mock private NotificationService notificationService;
    @Mock private GasCatalogProvisioningService gasCatalogProvisioningService;

    private PermitService service;

    @BeforeEach
    void setUp() {
        service = new PermitService(
                permitRepository,
                documentRepository,
                storageService,
                userRepository,
                notificationService,
                gasCatalogProvisioningService
        );
    }

    @Test
    void approve_activatesSeller_andProvisionsCatalog_beforeNotification() {
        SellerPermitEntity permit = new SellerPermitEntity(7L, "Shop");
        setField(permit, "id", 55L);
        permit.setStatus(PermitStatus.PENDING);

        User seller = new User("Seller", "seller", "seller@test.local", "pw", "255700000000", Role.SELLER);
        setField(seller, "id", 7L);
        seller.setActive(false);

        when(permitRepository.findById(55L)).thenReturn(Optional.of(permit));
        when(documentRepository.findByPermitId(55L)).thenReturn(List.of(
                doc(55L, PermitDocumentType.APPLICATION_FORM),
                doc(55L, PermitDocumentType.NATIONAL_ID),
                doc(55L, PermitDocumentType.BUSINESS_LICENSE),
                doc(55L, PermitDocumentType.PASSPORT_PHOTO)
        ));
        when(userRepository.findById(7L)).thenReturn(Optional.of(seller));

        service.approve(55L, 1L, null);

        verify(userRepository).save(seller);
        verify(gasCatalogProvisioningService).provisionForSeller(7L);
        verify(notificationService).notify(eq(7L), eq("permit"), anyString(), anyString(), anyString());
    }

    @Test
    void approve_doesNotNotifyOrProvisionWhenRequiredDocumentsMissing() {
        SellerPermitEntity permit = new SellerPermitEntity(7L, "Shop");
        setField(permit, "id", 55L);
        permit.setStatus(PermitStatus.PENDING);

        when(permitRepository.findById(55L)).thenReturn(Optional.of(permit));
        when(documentRepository.findByPermitId(55L)).thenReturn(List.of(
                doc(55L, PermitDocumentType.APPLICATION_FORM)
        ));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.approve(55L, 1L, null))
                .isInstanceOf(com.project.gas_delivery.permit.exception.PermitStateException.class);

        verify(gasCatalogProvisioningService, never()).provisionForSeller(7L);
        verify(notificationService, never()).notify(eq(7L), eq("permit"), anyString(), anyString(), anyString());
    }

    private static PermitDocumentEntity doc(Long permitId, PermitDocumentType type) {
        return new PermitDocumentEntity(
                permitId,
                type,
                type.name().toLowerCase(),
                type.name().toLowerCase() + ".pdf",
                100L,
                "application/pdf"
        );
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
