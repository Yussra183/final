package com.project.gas_delivery.permit.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.permit.dto.SupplierApplicationDocumentDto;
import com.project.gas_delivery.permit.dto.SupplierApplicationDto;
import com.project.gas_delivery.permit.entity.SupplierApplicationDocumentEntity;
import com.project.gas_delivery.permit.entity.SupplierApplicationEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.enums.SupplierApplicationDocumentType;
import com.project.gas_delivery.permit.exception.PermitNotFoundException;
import com.project.gas_delivery.permit.exception.PermitStateException;
import com.project.gas_delivery.permit.repository.SupplierApplicationDocumentRepository;
import com.project.gas_delivery.permit.repository.SupplierApplicationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Heart of the supplier verification + certificate surface.
 *
 * <p>Persists on the {@code supplier_applications} +
 * {@code supplier_application_documents} tables (V8). Covers the
 * lazy-created draft, upload / replace / view / remove documents,
 * submission, admin review, and approval + rejection with in-app
 * notifications.</p>
 *
 * <p>The lifecycle is intentionally identical to the seller
 * ({@link PermitService}) and rider ({@link RiderPermitService})
 * modules so the approval UX is consistent across every role:</p>
 *
 * <pre>
 *   PENDING (draft)
 *     → PENDING + submittedAt   (supplier submits; editing locks)
 *     → APPROVED                (admin approves; certificate unlocks)
 *     → REJECTED                (admin rejects; editing re-opens)
 * </pre>
 *
 * <p>Business gating: a supplier may only supply gas to sellers once
 * {@link #isApproved(Long)} returns true. Callers use
 * {@link #approvedSupplierIds()} for bulk checks.</p>
 */
@Service
public class SupplierApplicationService {

    /** Required supplier-facing slots before the application can be submitted.
 *  Suppliers are registered companies, not individuals, so the required
 *  documents are: signed application form, Company Registration ID,
 *  Business Registration Certificate, TIN, and Business Licence.
 *  National ID (an individual identifier) and Passport Size Photo are
 *  intentionally NOT required. */
    private static final Set<SupplierApplicationDocumentType> REQUIRED_SUPPLIER_SLOTS =
            EnumSet.of(
                    SupplierApplicationDocumentType.SUPPLIER_APPLICATION_FORM,
                    SupplierApplicationDocumentType.SUPPLIER_NATIONAL_ID,
                    SupplierApplicationDocumentType.SUPPLIER_BUSINESS_REGISTRATION,
                    SupplierApplicationDocumentType.SUPPLIER_TIN_CERTIFICATE,
                    SupplierApplicationDocumentType.SUPPLIER_BUSINESS_LICENCE);

    private final SupplierApplicationRepository applicationRepository;
    private final SupplierApplicationDocumentRepository documentRepository;
    private final SupplierApplicationDocumentStorageService storageService;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final SupplierApplicationPdfService pdfService;

    public SupplierApplicationService(
            SupplierApplicationRepository applicationRepository,
            SupplierApplicationDocumentRepository documentRepository,
            SupplierApplicationDocumentStorageService storageService,
            UserRepository userRepository,
            NotificationService notificationService,
            SupplierApplicationPdfService pdfService
    ) {
        this.applicationRepository = applicationRepository;
        this.documentRepository = documentRepository;
        this.storageService = storageService;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.pdfService = pdfService;
    }

    // =====================================================================
    // Supplier self-service
    // =====================================================================

    /**
     * Return the signed-in supplier's full application DTO, lazy-creating
     * a draft {@code PENDING} row on first call so the supplier-facing UI
     * always has something to render.
     */
    @Transactional
    public SupplierApplicationDto getOrCreateForSupplier(Long supplierId) {
        SupplierApplicationEntity entity = applicationRepository.findBySupplierId(supplierId)
                .orElseGet(() -> applicationRepository.save(
                        new SupplierApplicationEntity(supplierId)));
        return toDto(entity);
    }

    /**
     * Upload a single document. Replaces any prior row for the same slot
     * (the {@code (supplier_application_id, document_type)} UNIQUE index
     * guarantees only one row per slot). Allowed for suppliers whose
     * application status is {@code PENDING} (not yet submitted) or
     * {@code REJECTED} — submitted / under-review / approved applications
     * are locked.
     */
    @Transactional
    public SupplierApplicationDocumentDto uploadDocument(
            Long supplierId, SupplierApplicationDocumentType type, MultipartFile file
    ) {
        if (!type.isSupplierProvided()) {
            throw new PermitStateException(
                    "This slot is managed by the administrator.");
        }
        SupplierApplicationEntity application = applicationRepository
                .findBySupplierId(supplierId)
                .orElseGet(() -> applicationRepository.save(
                        new SupplierApplicationEntity(supplierId)));
        assertEditable(application);

        SupplierApplicationDocumentEntity saved =
                storageService.store(application, type, file);
        // Once rejected, the supplier can re-upload fresh documents; this
        // also flips them back to PENDING so the admin sees activity.
        if (application.getStatus() == PermitStatus.REJECTED) {
            application.setStatus(PermitStatus.PENDING);
            application.setRejectionReason(null);
            application.setSubmittedAt(null);
            applicationRepository.save(application);
        }
        return SupplierApplicationDocumentDto.from(saved, buildDocumentUrl(saved.getId()));
    }

    /**
     * Remove a document the supplier uploaded. Refuses to operate once
     * the application has been submitted ({@code PENDING} with
     * {@code submittedAt} set, {@code UNDER_REVIEW}, or {@code APPROVED}).
     */
    @Transactional
    public void deleteDocument(Long supplierId, Long documentId) {
        SupplierApplicationDocumentEntity document = documentRepository.findById(documentId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Document " + documentId + " not found."));
        SupplierApplicationEntity application = applicationRepository
                .findById(document.getSupplierApplicationId())
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application for document " + documentId + " not found."));
        if (!application.getSupplierId().equals(supplierId)) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You can only remove your own documents.");
        }
        assertEditable(application);
        storageService.delete(document);
    }

    /**
     * Submit the supplier's application. Verifies every required slot is
     * filled, sets status {@code PENDING} + {@code submittedAt}, and
     * notifies the supplier that the application is awaiting review.
     */
    @Transactional
    public SupplierApplicationDto submit(Long supplierId) {
        SupplierApplicationEntity application = applicationRepository
                .findBySupplierId(supplierId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Start a supplier application first by uploading your documents."));
        PermitStatus status = application.getStatus();
        if (status == PermitStatus.APPROVED) {
            throw new PermitStateException("Application is already approved.");
        }
        if (status == PermitStatus.UNDER_REVIEW) {
            throw new PermitStateException(
                    "Your application is already under review with the administrator.");
        }
        if (status == PermitStatus.PENDING && application.getSubmittedAt() != null) {
            throw new PermitStateException("Your application has already been submitted.");
        }

        assertAllRequiredPresent(application,
                "Missing required documents: ",
                ". Please upload all required documents before submitting.");

        application.setStatus(PermitStatus.PENDING);
        application.setSubmittedAt(Instant.now());
        application.setRejectionReason(null);
        SupplierApplicationEntity saved = applicationRepository.save(application);

        notificationService.notify(
                supplierId,
                "permit",
                "Supplier Application Submitted",
                "Your application has been submitted successfully. "
                        + "Please wait for administrator approval.",
                json(Map.of(
                        "supplierId", String.valueOf(supplierId),
                        "applicationId", String.valueOf(saved.getId()),
                        "status", "pending"
                ))
        );
        return toDto(saved);
    }

    // =====================================================================
    // Admin surface
    // =====================================================================

    @Transactional(readOnly = true)
    public List<SupplierApplicationDto> listForAdmin(PermitStatus statusFilter) {
        return applicationRepository.findForReview(statusFilter).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public SupplierApplicationDto getForAdmin(Long applicationId) {
        return toDto(requireApplication(applicationId));
    }

    @Transactional(readOnly = true)
    public List<SupplierApplicationDocumentDto> listDocumentsForAdmin(Long applicationId) {
        if (!applicationRepository.existsById(applicationId)) {
            throw new PermitNotFoundException("Application " + applicationId + " not found.");
        }
        return documentRepository.findBySupplierApplicationId(applicationId).stream()
                .map(d -> SupplierApplicationDocumentDto.from(d, buildDocumentUrl(d.getId())))
                .toList();
    }

    /**
     * Approve the application: transition to {@code APPROVED}, stamp the
     * reviewer + timestamp, re-activate the supplier account, and notify
     * the supplier. The certificate PDF is generated on demand so the
     * admin never has to attach a file.
     */
    @Transactional
    public SupplierApplicationDto approve(Long applicationId, Long adminId) {
        SupplierApplicationEntity application = requireApplication(applicationId);
        if (application.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException("Application is already approved.");
        }

        // Make sure every required slot still has a document — guards
        // against approving an empty / partially re-uploaded application.
        assertAllRequiredPresent(application,
                "Cannot approve — missing required documents: ", ".");

        application.setStatus(PermitStatus.APPROVED);
        application.setReviewedAt(Instant.now());
        application.setReviewedBy(adminId);
        application.setRejectionReason(null);
        SupplierApplicationEntity saved = applicationRepository.save(application);

        // Mirror the seller module: an approved supplier is an active user.
        userRepository.findById(saved.getSupplierId()).ifPresent(supplier -> {
            if (!supplier.isActive()) {
                supplier.setActive(true);
                userRepository.save(supplier);
            }
        });

        notificationService.notify(
                saved.getSupplierId(),
                "permit",
                "Supplier Application Approved",
                "Congratulations! Your Supplier Application has been approved. "
                        + "You can now supply gas to sellers and receive supply requests. "
                        + "Your official Gas Supplier Certificate is available from your Profile.",
                json(Map.of(
                        "supplierId", String.valueOf(saved.getSupplierId()),
                        "applicationId", String.valueOf(saved.getId()),
                        "status", "approved",
                        "certificateUrl", "/api/supplier-applications/me/certificate"
                ))
        );
        return toDto(saved);
    }

    @Transactional
    public SupplierApplicationDto reject(Long applicationId, Long adminId, String reason) {
        SupplierApplicationEntity application = requireApplication(applicationId);
        if (application.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException("Application is already approved.");
        }
        String trimmed = reason == null ? "" : reason.trim();
        if (trimmed.length() < 5) {
            throw new com.project.gas_delivery.auth.exception.BadRequestException(
                    "Rejection reason must be at least 5 characters.");
        }
        application.setStatus(PermitStatus.REJECTED);
        application.setReviewedAt(Instant.now());
        application.setReviewedBy(adminId);
        application.setRejectionReason(trimmed);
        SupplierApplicationEntity saved = applicationRepository.save(application);

        notificationService.notify(
                saved.getSupplierId(),
                "permit",
                "Supplier Application Rejected",
                "Your supplier application has been rejected. Reason: " + trimmed
                        + ". You may upload corrected documents and submit a new application.",
                json(Map.of(
                        "supplierId", String.valueOf(saved.getSupplierId()),
                        "applicationId", String.valueOf(saved.getId()),
                        "status", "rejected",
                        "reason", trimmed
                ))
        );
        return toDto(saved);
    }

    // =====================================================================
    // Gating helpers
    // =====================================================================

    /**
     * True when the supplier's application has been APPROVED by an admin.
     * This is the single gate for every supplier business feature —
     * supplying gas to sellers, receiving supply requests, inventory.
     */
    @Transactional(readOnly = true)
    public boolean isApproved(Long supplierId) {
        return applicationRepository.findBySupplierId(supplierId)
                .map(a -> a.getStatus() == PermitStatus.APPROVED)
                .orElse(false);
    }

    /** Bulk variant of {@link #isApproved(Long)}. */
    @Transactional(readOnly = true)
    public Set<Long> approvedSupplierIds() {
        return new HashSet<>(
                applicationRepository.findSupplierIdsByStatus(PermitStatus.APPROVED));
    }

    /**
     * FR-06: every approved supplier's {@link SupplierApplicationEntity},
     * newest approval first. Joined to the {@code users} table by the
     * caller so it can render display names. The admin approval stamp
     * (reviewedAt / reviewedBy) is preserved on the entity so the
     * frontend can show "Approved by … on …".
     */
    @Transactional(readOnly = true)
    public List<SupplierApplicationEntity> findApprovedApplications() {
        return applicationRepository.findApprovedApplications(PermitStatus.APPROVED);
    }

    // =====================================================================
    // Document streaming (admin or owning supplier)
    // =====================================================================

    /**
     * Stream a stored document's bytes. Admins may read any document;
     * a supplier may only read their own.
     */
    @Transactional(readOnly = true)
    public DocumentStream loadDocument(Long documentId, Role actorRole, Long actorId) {
        SupplierApplicationDocumentEntity document = documentRepository.findById(documentId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Document " + documentId + " not found."));
        SupplierApplicationEntity application = applicationRepository
                .findById(document.getSupplierApplicationId())
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application for document " + documentId + " not found."));

        boolean isAdmin = actorRole == Role.ADMIN;
        boolean isOwningSupplier = actorRole == Role.SUPPLIER
                && application.getSupplierId().equals(actorId);
        if (!isAdmin && !isOwningSupplier) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You are not allowed to view this document.");
        }
        Path path = storageService.resolve(document.getStorageKey());
        return new DocumentStream(
                path, document.getContentType(),
                document.getOriginalName(), document.getSizeBytes());
    }

    // =====================================================================
    // Certificate PDF
    // =====================================================================

    /** Render the certificate for the signed-in supplier. */
    @Transactional(readOnly = true)
    public byte[] renderCertificate(Long supplierId) {
        SupplierApplicationEntity application = applicationRepository
                .findBySupplierId(supplierId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "No supplier application has been submitted yet."));
        return renderCertificateFor(application);
    }

    /** Render the certificate for an application the admin is reviewing. */
    @Transactional(readOnly = true)
    public byte[] renderCertificateForApplication(Long applicationId) {
        return renderCertificateFor(requireApplication(applicationId));
    }

    private byte[] renderCertificateFor(SupplierApplicationEntity application) {
        if (application.getStatus() != PermitStatus.APPROVED) {
            throw new PermitStateException(
                    "Supplier certificate is only available for approved applications.");
        }
        return pdfService.renderIssuedCertificate(buildIssuedCertificateData(application));
    }

    private SupplierApplicationPdfService.IssuedSupplierCertificateData
    buildIssuedCertificateData(SupplierApplicationEntity application) {
        Long supplierId = application.getSupplierId();
        User supplier = userRepository.findById(supplierId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Supplier " + supplierId + " no longer exists."));
        String reviewerName = resolveReviewerName(application.getReviewedBy());
        Instant reviewedAt = application.getReviewedAt() == null
                ? Instant.now()
                : application.getReviewedAt();
        LocalDate validFrom = reviewedAt.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate validUntil = validFrom.plusYears(1);
        // The "Company Registration ID" displayed on the certificate is
        // sourced from the supplier's uploaded Company Registration ID
        // document. Suppliers name the file with their registration
        // number (e.g. "CRN-123456.pdf"), and we fall back to the
        // formatted supplier reference when no document has been
        // uploaded yet.
        String companyRegistrationId = documentRepository
                .findBySupplierApplicationIdAndDocumentType(
                        application.getId(),
                        SupplierApplicationDocumentType.SUPPLIER_NATIONAL_ID)
                .map(doc -> doc.getOriginalName())
                .map(name -> name == null ? "" : name.replaceAll("\\.[^.]+$", ""))
                .orElse("SUPPLIER-" + String.format("%06d", supplierId));
        return new SupplierApplicationPdfService.IssuedSupplierCertificateData(
                certificateNumber(application),
                "SUPPLIER-" + String.format("%06d", supplierId),
                supplier.getFullName(),
                companyRegistrationId,
                nullSafe(supplier.getEmail()),
                nullSafe(supplier.getPhone()),
                reviewerName == null ? "" : reviewerName,
                reviewedAt,
                validFrom,
                validUntil
        );
    }

    // =====================================================================
    // helpers
    // =====================================================================

    private SupplierApplicationEntity requireApplication(Long applicationId) {
        return applicationRepository.findById(applicationId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application " + applicationId + " not found."));
    }

    /**
     * Shared editability rule for uploads and deletes: an application is
     * only editable while it is a PENDING draft (never submitted) or has
     * been REJECTED.
     */
    private static void assertEditable(SupplierApplicationEntity application) {
        PermitStatus status = application.getStatus();
        if (status == PermitStatus.APPROVED) {
            throw new PermitStateException(
                    "Application is approved; documents are locked.");
        }
        if (status == PermitStatus.UNDER_REVIEW) {
            throw new PermitStateException(
                    "Application is under review with the administrator; documents are locked.");
        }
        if (status == PermitStatus.PENDING && application.getSubmittedAt() != null) {
            throw new PermitStateException(
                    "Application has been submitted; documents are locked until reviewed.");
        }
    }

    private void assertAllRequiredPresent(
            SupplierApplicationEntity application, String prefix, String suffix
    ) {
        Set<SupplierApplicationDocumentType> present = documentRepository
                .findBySupplierApplicationId(application.getId())
                .stream()
                .map(SupplierApplicationDocumentEntity::getDocumentType)
                .collect(Collectors.toCollection(
                        () -> EnumSet.noneOf(SupplierApplicationDocumentType.class)));
        Set<SupplierApplicationDocumentType> missing = EnumSet.copyOf(REQUIRED_SUPPLIER_SLOTS);
        missing.removeAll(present);
        if (!missing.isEmpty()) {
            throw new PermitStateException(prefix + missing + suffix);
        }
    }

    private SupplierApplicationDto toDto(SupplierApplicationEntity entity) {
        User supplier = userRepository.findById(entity.getSupplierId()).orElse(null);
        return SupplierApplicationDto.from(
                entity,
                certificateNumber(entity),
                supplier == null ? null : supplier.getFullName(),
                supplier == null ? null : supplier.getUsername(),
                supplier == null ? null : supplier.getEmail(),
                supplier == null ? null : supplier.getPhone(),
                resolveReviewerName(entity.getReviewedBy()),
                listDocuments(entity)
        );
    }

    private List<SupplierApplicationDocumentDto> listDocuments(
            SupplierApplicationEntity application
    ) {
        List<SupplierApplicationDocumentEntity> docs = documentRepository
                .findBySupplierApplicationId(application.getId());
        if (docs == null || docs.isEmpty()) return List.of();
        List<SupplierApplicationDocumentDto> out = new ArrayList<>(docs.size());
        for (SupplierApplicationDocumentEntity d : docs) {
            out.add(SupplierApplicationDocumentDto.from(d, buildDocumentUrl(d.getId())));
        }
        return out;
    }

    private String resolveReviewerName(Long reviewedBy) {
        if (reviewedBy == null) return null;
        return userRepository.findById(reviewedBy).map(User::getFullName).orElse(null);
    }

    private static String certificateNumber(SupplierApplicationEntity entity) {
        return "SUP-" + String.format("%06d", entity.getId());
    }

    private static String buildDocumentUrl(Long documentId) {
        return "/api/supplier-applications/documents/" + documentId;
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }

    /**
     * Hand-rolled JSON object literal for the notification's {@code data}
     * column. Mirrors the seller + rider permit modules' {@code json}
     * helpers so all three stay consistent.
     */
    private static String json(Map<String, String> payload) {
        if (payload == null || payload.isEmpty()) return "{}";
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, String> entry : payload.entrySet()) {
            if (!first) sb.append(',');
            sb.append('"').append(escapeJson(entry.getKey())).append("\":\"");
            sb.append(escapeJson(entry.getValue())).append('"');
            first = false;
        }
        sb.append('}');
        return sb.toString();
    }

    private static String escapeJson(String raw) {
        if (raw == null) return "";
        StringBuilder sb = new StringBuilder(raw.length() + 8);
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '\\':
                case '"':
                    sb.append('\\').append(c);
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                default:
                    sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Bundle of resolved file metadata returned to the streaming controller. */
    public record DocumentStream(
            Path path,
            String contentType,
            String originalName,
            long sizeBytes
    ) {
    }
}
