package com.project.gas_delivery.permit.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.permit.dto.RiderPermitDocumentDto;
import com.project.gas_delivery.permit.dto.RiderPermitDto;
import com.project.gas_delivery.permit.entity.RiderApplicationEntity;
import com.project.gas_delivery.permit.entity.RiderPermitDocumentEntity;
import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.enums.RiderPermitDocumentType;
import com.project.gas_delivery.permit.exception.PermitNotFoundException;
import com.project.gas_delivery.permit.exception.PermitStateException;
import com.project.gas_delivery.permit.repository.RiderApplicationRepository;
import com.project.gas_delivery.permit.repository.RiderPermitDocumentRepository;
import com.project.gas_delivery.permit.repository.SellerPermitRepository;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Heart of the rider verification + permit surface.
 *
 * <p>The class carries two complementary responsibilities:</p>
 *
 * <ul>
 *   <li><b>Rider self-service + admin workflow</b> (added with the
 *       Rider Verification & Certification feature). Persists on the new
 *       {@code rider_applications} + {@code rider_permit_documents}
 *       tables (V7). Covers lazy-create draft, upload / replace / view /
 *       remove documents, submission, admin review, and approval +
 *       rejection with notifications.</li>
 *   <li><b>Legacy certificate projection</b> (added with the Rider
 *       Profile module, part 1). The rider-facing Profile screen reads
 *       the certificate status from the existing {@code seller_permits}
 *       table. To keep that surface unchanged, this service still
 *       queries {@code seller_permits} for the certificate projection;
 *       the seller permit module itself is untouched.</li>
 * </ul>
 *
 * <p>The two halves share the certificate PDF renderer
 * ({@link RiderApplicationPdfService}). The dispatch queue gating
 * (riders without an APPROVED {@code rider_applications} row are
 * excluded from {@code GET /api/riders}) is wired through
 * {@code RiderApplicationRepository.findRiderIdsByStatus} and applied
 * by {@code RiderProfileService}.</p>
 */
@Service
public class RiderPermitService {

    /** Required rider-facing slots before the application can be submitted. */
    private static final Set<RiderPermitDocumentType> REQUIRED_RIDER_SLOTS =
            EnumSet.of(
                    RiderPermitDocumentType.RIDER_APPLICATION_FORM,
                    RiderPermitDocumentType.RIDER_NATIONAL_ID,
                    RiderPermitDocumentType.RIDER_DRIVING_LICENCE,
                    RiderPermitDocumentType.RIDER_PASSPORT_PHOTO,
                    RiderPermitDocumentType.RIDER_VEHICLE_REGISTRATION);

    private final SellerPermitRepository sellerPermitRepository;
    private final RiderApplicationRepository riderApplicationRepository;
    private final RiderPermitDocumentRepository riderDocumentRepository;
    private final RiderPermitDocumentStorageService storageService;
    private final RiderProfileRepository riderProfileRepository;
    private final SellerRiderRepository sellerRiderRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final RiderApplicationPdfService pdfService;

    public RiderPermitService(SellerPermitRepository sellerPermitRepository,
                              RiderApplicationRepository riderApplicationRepository,
                              RiderPermitDocumentRepository riderDocumentRepository,
                              RiderPermitDocumentStorageService storageService,
                              RiderProfileRepository riderProfileRepository,
                              SellerRiderRepository sellerRiderRepository,
                              UserRepository userRepository,
                              NotificationService notificationService,
                              RiderApplicationPdfService pdfService) {
        this.sellerPermitRepository = sellerPermitRepository;
        this.riderApplicationRepository = riderApplicationRepository;
        this.riderDocumentRepository = riderDocumentRepository;
        this.storageService = storageService;
        this.riderProfileRepository = riderProfileRepository;
        this.sellerRiderRepository = sellerRiderRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.pdfService = pdfService;
    }

    // =====================================================================
    // Rider self-service (rider_applications table)
    // =====================================================================

    /**
     * Return the signed-in rider's full application DTO, lazy-creating a
     * draft {@code PENDING} row on first call so the rider-facing UI
     * always has something to render.
     */
    @Transactional
    public RiderPermitDto getOrCreateForRider(Long riderId) {
        RiderApplicationEntity entity = riderApplicationRepository.findByRiderId(riderId)
                .orElseGet(() -> riderApplicationRepository.save(new RiderApplicationEntity(riderId)));
        String certificateNumber = "RDR-" + String.format("%06d", entity.getId());
        String reviewedByName = resolveReviewerName(entity.getReviewedBy());
        String applicantName = resolveApplicantName(riderId);
        List<RiderPermitDocumentDto> docs = listDocumentsForRider(entity);
        return RiderPermitDto.from(entity, certificateNumber, reviewedByName, applicantName, docs);
    }

    /**
     * Upload a single document. Replaces any prior row for the same slot
     * (the {@code (rider_application_id, document_type)} UNIQUE index
     * guarantees only one row per slot). Allowed for riders whose
     * application status is {@code PENDING} or {@code REJECTED} —
     * submitted-but-under-review applications are locked.
     */
    @Transactional
    public RiderPermitDocumentDto uploadDocument(
            Long riderId, RiderPermitDocumentType type, MultipartFile file
    ) {
        if (!type.isRiderProvided()) {
            throw new PermitStateException(
                    "This slot is managed by the administrator.");
        }
        RiderApplicationEntity application = riderApplicationRepository.findByRiderId(riderId)
                .orElseGet(() -> riderApplicationRepository.save(new RiderApplicationEntity(riderId)));
        PermitStatus status = application.getStatus();
        if (status == PermitStatus.APPROVED) {
            throw new PermitStateException(
                    "Application is approved; documents are locked.");
        }
        if (status == PermitStatus.UNDER_REVIEW) {
            throw new PermitStateException(
                    "Application is under review with the administrator; documents are locked.");
        }
        // Once rejected, the rider can re-upload fresh documents; this
        // also flips them back to PENDING so the admin sees activity.
        RiderPermitDocumentEntity saved = storageService.store(application, type, file);
        if (application.getStatus() == PermitStatus.REJECTED) {
            application.setStatus(PermitStatus.PENDING);
            application.setRejectionReason(null);
            riderApplicationRepository.save(application);
        }
        return RiderPermitDocumentDto.from(saved, buildDocumentUrl(saved.getId()));
    }

    /**
     * Remove a document the rider uploaded. Refuses to operate once the
     * application has been submitted ({@code PENDING} with
     * {@code submittedAt} set, {@code UNDER_REVIEW}, or {@code APPROVED}).
     */
    @Transactional
    public void deleteDocument(Long riderId, Long documentId) {
        RiderPermitDocumentEntity document = riderDocumentRepository.findById(documentId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Document " + documentId + " not found."));
        RiderApplicationEntity application = riderApplicationRepository
                .findById(document.getRiderApplicationId())
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application for document " + documentId + " not found."));
        if (!application.getRiderId().equals(riderId)) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You can only remove your own documents.");
        }
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
        storageService.delete(document);
    }

    /**
     * Submit the rider's application. Verifies every required slot is
     * filled, sets status {@code PENDING} + {@code submittedAt}, and
     * notifies the rider that the application is awaiting review.
     */
    @Transactional
    public RiderPermitDto submit(Long riderId) {
        RiderApplicationEntity application = riderApplicationRepository.findByRiderId(riderId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Submit a rider application first by uploading your documents."));
        PermitStatus status = application.getStatus();
        if (status == PermitStatus.APPROVED) {
            throw new PermitStateException("Application is already approved.");
        }
        if (status == PermitStatus.UNDER_REVIEW) {
            throw new PermitStateException(
                    "Your application is already under review with the administrator.");
        }
        if (status == PermitStatus.PENDING && application.getSubmittedAt() != null) {
            throw new PermitStateException(
                    "Your application has already been submitted.");
        }

        Set<RiderPermitDocumentType> present = riderDocumentRepository
                .findByRiderApplicationId(application.getId())
                .stream()
                .map(RiderPermitDocumentEntity::getDocumentType)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(RiderPermitDocumentType.class)));
        Set<RiderPermitDocumentType> missing = EnumSet.copyOf(REQUIRED_RIDER_SLOTS);
        missing.removeAll(present);
        if (!missing.isEmpty()) {
            throw new PermitStateException(
                    "Missing required documents: " + missing
                            + ". Please upload all required documents before submitting.");
        }

        application.setStatus(PermitStatus.PENDING);
        application.setSubmittedAt(Instant.now());
        application.setRejectionReason(null);
        RiderApplicationEntity saved = riderApplicationRepository.save(application);

        notificationService.notify(
                riderId,
                "permit",
                "Rider Application Submitted",
                "Your rider application has been submitted and is awaiting administrator verification.",
                json(Map.of(
                        "riderId", String.valueOf(riderId),
                        "applicationId", String.valueOf(saved.getId()),
                        "status", "pending"
                ))
        );

        String certificateNumber = "RDR-" + String.format("%06d", saved.getId());
        String applicantName = resolveApplicantName(riderId);
        List<RiderPermitDocumentDto> docs = listDocumentsForRider(saved);
        return RiderPermitDto.from(saved, certificateNumber, null, applicantName, docs);
    }

    // =====================================================================
    // Admin surface
    // =====================================================================

    @Transactional(readOnly = true)
    public List<RiderPermitDto> listForAdmin(PermitStatus statusFilter) {
        return riderApplicationRepository.findForReview(statusFilter).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public RiderPermitDto getForAdmin(Long applicationId) {
        RiderApplicationEntity entity = riderApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application " + applicationId + " not found."));
        return toDto(entity);
    }

    @Transactional(readOnly = true)
    public List<RiderPermitDocumentDto> listDocumentsForAdmin(Long applicationId) {
        if (!riderApplicationRepository.existsById(applicationId)) {
            throw new PermitNotFoundException("Application " + applicationId + " not found.");
        }
        return riderDocumentRepository.findByRiderApplicationId(applicationId).stream()
                .map(d -> RiderPermitDocumentDto.from(d, buildDocumentUrl(d.getId())))
                .toList();
    }

    /**
     * Approve the application: transition to {@code APPROVED}, stamp the
     * reviewer + timestamp, and notify the rider. The certificate PDF is
     * generated on demand by {@link RiderPermitController} so the admin
     * never has to attach a file.
     */
    @Transactional
    public RiderPermitDto approve(Long applicationId, Long adminId) {
        RiderApplicationEntity application = riderApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application " + applicationId + " not found."));
        if (application.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException("Application is already approved.");
        }

        // Make sure every required slot still has a document — guards
        // against approving an empty / partially re-uploaded application.
        Set<RiderPermitDocumentType> present = riderDocumentRepository
                .findByRiderApplicationId(application.getId())
                .stream()
                .map(RiderPermitDocumentEntity::getDocumentType)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(RiderPermitDocumentType.class)));
        Set<RiderPermitDocumentType> missing = EnumSet.copyOf(REQUIRED_RIDER_SLOTS);
        missing.removeAll(present);
        if (!missing.isEmpty()) {
            throw new PermitStateException(
                    "Cannot approve — missing required documents: " + missing + ".");
        }

        application.setStatus(PermitStatus.APPROVED);
        application.setReviewedAt(Instant.now());
        application.setReviewedBy(adminId);
        application.setRejectionReason(null);
        RiderApplicationEntity saved = riderApplicationRepository.save(application);

        notificationService.notify(
                saved.getRiderId(),
                "permit",
                "Rider Application Approved",
                "Congratulations! Your Rider Application has been approved. "
                        + "Your account is now active for deliveries. You can now download your official "
                        + "Gas Delivery Rider Certificate from your Profile.",
                json(Map.of(
                        "riderId", String.valueOf(saved.getRiderId()),
                        "applicationId", String.valueOf(saved.getId()),
                        "status", "approved",
                        "certificateUrl", "/api/rider-permits/me/certificate"
                ))
        );
        return toDto(saved);
    }

    @Transactional
    public RiderPermitDto reject(Long applicationId, Long adminId, String reason) {
        RiderApplicationEntity application = riderApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application " + applicationId + " not found."));
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
        RiderApplicationEntity saved = riderApplicationRepository.save(application);

        notificationService.notify(
                saved.getRiderId(),
                "permit",
                "Rider Application Rejected",
                "Your rider application has been rejected. Reason: " + trimmed
                        + ". You may upload corrected documents and submit a new application.",
                json(Map.of(
                        "riderId", String.valueOf(saved.getRiderId()),
                        "applicationId", String.valueOf(saved.getId()),
                        "status", "rejected",
                        "reason", trimmed
                ))
        );
        return toDto(saved);
    }

    // =====================================================================
    // Document streaming (admin or owning rider)
    // =====================================================================

    /**
     * Stream a stored document's bytes. Admins may read any document;
     * a rider may only read their own. The owning application must exist.
     */
    @Transactional(readOnly = true)
    public DocumentStream loadDocument(
            Long documentId, com.project.gas_delivery.auth.enums.Role actorRole, Long actorId
    ) {
        RiderPermitDocumentEntity document = riderDocumentRepository.findById(documentId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Document " + documentId + " not found."));
        RiderApplicationEntity application = riderApplicationRepository
                .findById(document.getRiderApplicationId())
                .orElseThrow(() -> new PermitNotFoundException(
                        "Application for document " + documentId + " not found."));

        boolean isAdmin = actorRole == com.project.gas_delivery.auth.enums.Role.ADMIN;
        boolean isOwningRider = actorRole == com.project.gas_delivery.auth.enums.Role.RIDER
                && application.getRiderId().equals(actorId);
        if (!isAdmin && !isOwningRider) {
            throw new com.project.gas_delivery.order.exception.NotAuthorizedException(
                    "You are not allowed to view this document.");
        }
        Path path = storageService.resolve(document.getStorageKey());
        return new DocumentStream(
                path, document.getContentType(),
                document.getOriginalName(), document.getSizeBytes());
    }

    // =====================================================================
    // Certificate PDF (delegates to RiderApplicationPdfService)
    // =====================================================================

    @Transactional(readOnly = true)
    public byte[] renderCertificate(Long riderId) {
        RiderApplicationEntity application = riderApplicationRepository.findByRiderId(riderId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "No rider application has been submitted yet."));
        if (application.getStatus() != PermitStatus.APPROVED) {
            throw new PermitStateException(
                    "Rider certificate is only available for approved applications.");
        }
        RiderApplicationPdfService.IssuedRiderCertificateData data =
                buildIssuedCertificateData(application);
        return pdfService.renderIssuedCertificate(data);
    }

    @Transactional(readOnly = true)
    public RiderApplicationPdfService.IssuedRiderCertificateData buildIssuedCertificateData(
            RiderApplicationEntity application
    ) {
        Long riderId = application.getRiderId();
        User rider = userRepository.findById(riderId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Rider " + riderId + " no longer exists."));
        RiderProfileEntity profile = riderProfileRepository.findById(riderId).orElse(null);
        String reviewerName = application.getReviewedBy() == null
                ? ""
                : userRepository.findById(application.getReviewedBy())
                        .map(User::getFullName)
                        .orElse("");
        Instant reviewedAt = application.getReviewedAt() == null
                ? Instant.now()
                : application.getReviewedAt();
        LocalDate validFrom = reviewedAt.atZone(ZoneOffset.UTC).toLocalDate();
        LocalDate validUntil = validFrom.plusYears(1);
        String assignedSellerName = resolveAssignedSellerName(riderId);
        return new RiderApplicationPdfService.IssuedRiderCertificateData(
                "RDR-" + String.format("%06d", application.getId()),
                "RIDER-" + String.format("%06d", riderId),
                rider.getFullName(),
                rider.getUsername(),
                rider.getEmail() == null ? "" : rider.getEmail(),
                rider.getPhone() == null ? "" : rider.getPhone(),
                profile == null ? "" : nullSafe(profile.getRegion()),
                profile == null ? "" : nullSafe(profile.getDistrict()),
                profile == null ? "" : nullSafe(profile.getVehicleType()),
                profile == null ? "" : nullSafe(profile.getVehiclePlate()),
                profile == null ? "" : nullSafe(profile.getVehicleModel()),
                profile == null ? "" : nullSafe(profile.getLicenseNo()),
                reviewerName,
                reviewedAt,
                validFrom,
                validUntil,
                assignedSellerName
        );
    }

    /**
     * Resolve the assigned seller's full name from the {@code seller_riders}
     * join table. Returns an empty string when the rider has no seller
     * assignment yet — the renderer falls back to "Not Assigned" in that
     * case so the certificate always renders a value.
     *
     * <p>If the rider is assigned to multiple sellers (V3 supports
     * many-to-many), the first assignment is picked — the certificate is a
     * per-rider document, not a per-assignment one.</p>
     */
    private String resolveAssignedSellerName(Long riderId) {
        if (sellerRiderRepository == null) return "";
        List<Long> sellerIds = sellerRiderRepository.findSellerIdsByRiderId(riderId);
        if (sellerIds == null || sellerIds.isEmpty()) return "";
        Long firstSellerId = sellerIds.get(0);
        return userRepository.findById(firstSellerId)
                .map(User::getFullName)
                .orElse("");
    }

    // =====================================================================
    // Legacy certificate projection (seller_permits, kept from part 1)
    // =====================================================================

    /**
     * Return the rider's permit DTO from the legacy {@code seller_permits}
     * row. Throws {@link PermitNotFoundException} (mapped to HTTP 404)
     * when the rider has no permit row yet — the frontend renders the
     * "not yet issued" message verbatim in that case.
     */
    @Transactional(readOnly = true)
    public RiderPermitDto getForRider(Long riderId) {
        SellerPermitEntity entity = sellerPermitRepository.findBySellerId(riderId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "No rider permit has been issued yet."));
        String certificateNumber = "RDR-" + String.format("%06d", entity.getId());
        return RiderPermitDto.summary(entity, certificateNumber);
    }

    /**
     * Optional accessor — callers that want to react to "no permit yet"
     * without catching {@link PermitNotFoundException} can use this.
     */
    @Transactional(readOnly = true)
    public Optional<RiderPermitDto> findForRider(Long riderId) {
        return sellerPermitRepository.findBySellerId(riderId)
                .map(entity -> {
                    String certificateNumber = "RDR-" + String.format("%06d", entity.getId());
                    return RiderPermitDto.summary(entity, certificateNumber);
                });
    }

    // =====================================================================
    // helpers
    // =====================================================================

    private RiderPermitDto toDto(RiderApplicationEntity entity) {
        String certificateNumber = "RDR-" + String.format("%06d", entity.getId());
        String reviewedByName = resolveReviewerName(entity.getReviewedBy());
        String applicantName = resolveApplicantName(entity.getRiderId());
        List<RiderPermitDocumentDto> docs = listDocumentsForRider(entity);
        return RiderPermitDto.from(entity, certificateNumber, reviewedByName, applicantName, docs);
    }

    private List<RiderPermitDocumentDto> listDocumentsForRider(RiderApplicationEntity application) {
        List<RiderPermitDocumentEntity> docs = riderDocumentRepository
                .findByRiderApplicationId(application.getId());
        if (docs == null || docs.isEmpty()) return List.of();
        List<RiderPermitDocumentDto> out = new ArrayList<>(docs.size());
        for (RiderPermitDocumentEntity d : docs) {
            out.add(RiderPermitDocumentDto.from(d, buildDocumentUrl(d.getId())));
        }
        return out;
    }

    private String resolveReviewerName(Long reviewedBy) {
        if (reviewedBy == null) return null;
        return userRepository.findById(reviewedBy).map(User::getFullName).orElse(null);
    }

    /**
     * Resolve the rider's full name from {@code users} so the Profile
     * screen can show "Applicant Name: …" without a second lookup. May
     * return {@code null} if the rider row has been hard-deleted.
     */
    private String resolveApplicantName(Long riderId) {
        if (riderId == null) return null;
        return userRepository.findById(riderId).map(User::getFullName).orElse(null);
    }

    private static String buildDocumentUrl(Long documentId) {
        return "/api/rider-permits/documents/" + documentId;
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }

    /**
     * Hand-rolled JSON object literal for the notification's {@code data}
     * column. Mirrors the seller permit module's {@code PermitService#json}
     * helper so the two halves stay consistent.
     */
    private static String json(java.util.Map<String, String> payload) {
        if (payload == null || payload.isEmpty()) return "{}";
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (java.util.Map.Entry<String, String> entry : payload.entrySet()) {
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