package com.project.gas_delivery.permit.service;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.service.NotificationService;
import com.project.gas_delivery.order.exception.NotAuthorizedException;
import com.project.gas_delivery.permit.dto.PermitDocumentDto;
import com.project.gas_delivery.permit.dto.RejectPermitRequest;
import com.project.gas_delivery.permit.dto.SellerPermitDto;
import com.project.gas_delivery.permit.dto.SubmitPermitRequest;
import com.project.gas_delivery.permit.entity.PermitDocumentEntity;
import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitDocumentType;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.exception.PermitNotFoundException;
import com.project.gas_delivery.permit.exception.PermitStateException;
import com.project.gas_delivery.permit.repository.PermitDocumentRepository;
import com.project.gas_delivery.permit.repository.SellerPermitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Heart of the seller permit workflow.
 *
 * <p>All seller-facing and admin-facing permit actions funnel through here so
 * that:</p>
 *
 * <ul>
 *   <li>The {@code seller_permits} row is created lazily on first access for
 *       a SELLER-role user — there's no separate "create permit" endpoint.</li>
 *   <li>Status transitions are validated centrally
 *       ({@code PENDING → UNDER_REVIEW → APPROVED|REJECTED}, plus re-submit
 *       from {@code REJECTED} back to {@code PENDING}).</li>
 *   <li>Side-effects (flipping {@code users.is_active}, persisting the
 *       admin-uploaded licence PDF, fanning out notifications) all happen
 *       in this service so controllers stay thin.</li>
 * </ul>
 */
@Service
public class PermitService {

    /** Document slots that a seller must upload before submission. */
    private static final Set<PermitDocumentType> REQUIRED_SLOTS =
            EnumSet.of(
                    PermitDocumentType.APPLICATION_FORM,
                    PermitDocumentType.BIRTH_CERTIFICATE,
                    PermitDocumentType.NATIONAL_ID);

    private final SellerPermitRepository permitRepository;
    private final PermitDocumentRepository documentRepository;
    private final PermitDocumentStorageService storageService;
    private final UserRepository userRepository;
    private final NotificationService notificationService;

    public PermitService(SellerPermitRepository permitRepository,
                         PermitDocumentRepository documentRepository,
                         PermitDocumentStorageService storageService,
                         UserRepository userRepository,
                         NotificationService notificationService) {
        this.permitRepository = permitRepository;
        this.documentRepository = documentRepository;
        this.storageService = storageService;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
    }

    // ---- seller-side: lazy permit + read --------------------------------

    /**
     * Return the seller's permit, creating a draft {@code PENDING} row if
     * none exists yet. Existing approved sellers (the V3 seed users) have
     * no row — this method creates one in {@code PENDING} so the seller UI
     * has something to display, but does NOT auto-approve them.
     */
    @Transactional
    public SellerPermitDto getOrCreateForSeller(Long sellerId) {
        SellerPermitEntity entity = permitRepository.findBySellerId(sellerId)
                .orElseGet(() -> permitRepository.save(new SellerPermitEntity(
                        sellerId, defaultBusinessName(sellerId))));
        return toDto(entity);
    }

    /** Return the seller's current permit, or 404. Read-only. */
    @Transactional(readOnly = true)
    public SellerPermitDto getForSeller(Long sellerId) {
        SellerPermitEntity entity = permitRepository.findBySellerId(sellerId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "No permit application exists for seller " + sellerId + "."));
        return toDto(entity);
    }

    // ---- seller-side: document management --------------------------------

    @Transactional
    public PermitDocumentDto uploadDocument(Long sellerId,
                                            PermitDocumentType type,
                                            MultipartFile file) {
        if (type == PermitDocumentType.LICENSE) {
            // Sellers cannot upload the licence — only the admin can, on approval.
            throw new PermitStateException("Licence documents are managed by the administrator.");
        }
        SellerPermitEntity permit = permitRepository.findBySellerId(sellerId)
                .orElseGet(() -> permitRepository.save(new SellerPermitEntity(
                        sellerId, defaultBusinessName(sellerId))));

        if (permit.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException(
                    "Permit is already approved; documents are locked.");
        }

        PermitDocumentEntity saved = storageService.store(permit, type, file);
        // Mark under review as soon as the seller starts uploading again
        // after a rejection — gives the admin a visible signal that the
        // application has changed.
        if (permit.getStatus() == PermitStatus.REJECTED) {
            permit.setStatus(PermitStatus.PENDING);
        }
        permitRepository.save(permit);

        return PermitDocumentDto.from(saved, buildDocumentUrl(saved.getId()));
    }

    @Transactional
    public void deleteDocument(Long sellerId, Long documentId) {
        PermitDocumentEntity document = documentRepository.findById(documentId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Document " + documentId + " not found."));
        SellerPermitEntity permit = permitRepository.findById(document.getPermitId())
                .orElseThrow(() -> new PermitNotFoundException(
                        "Permit " + document.getPermitId() + " not found."));
        if (!permit.getSellerId().equals(sellerId)) {
            throw new NotAuthorizedException(
                    "You can only remove documents from your own permit.");
        }
        if (permit.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException(
                    "Permit is already approved; documents are locked.");
        }
        storageService.delete(document);
    }

    // ---- seller-side: submission ----------------------------------------

    @Transactional
    public SellerPermitDto submit(Long sellerId, SubmitPermitRequest request) {
        SellerPermitEntity permit = permitRepository.findBySellerId(sellerId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Submit a permit application first by uploading your documents."));

        if (permit.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException("Permit is already approved.");
        }
        if (permit.getStatus() == PermitStatus.UNDER_REVIEW) {
            throw new PermitStateException(
                    "Your permit is already under review with the administrator.");
        }

        // Verify every required slot has a document row.
        Set<PermitDocumentType> present = documentRepository
                .findByPermitId(permit.getId())
                .stream()
                .map(PermitDocumentEntity::getDocumentType)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(PermitDocumentType.class)));
        Set<PermitDocumentType> missing = EnumSet.copyOf(REQUIRED_SLOTS);
        missing.removeAll(present);
        if (!missing.isEmpty()) {
            throw new PermitStateException(
                    "Missing required documents: " + missing + ". Please upload all three.");
        }

        permit.setBusinessName(request.businessName().trim());
        permit.setStatus(PermitStatus.PENDING);
        permit.setSubmittedAt(Instant.now());
        permit.setRejectionReason(null);
        permitRepository.save(permit);

        notificationService.notify(
                sellerId,
                "permit",
                "Application submitted",
                "Your permit application has been submitted and is awaiting administrator verification.",
                json(Map.of("permitId", String.valueOf(permit.getId()), "status", "pending"))
        );

        return toDto(permit);
    }

    // ---- admin-side: review queue + decisions ----------------------------

    @Transactional(readOnly = true)
    public List<SellerPermitDto> listForAdmin(PermitStatus statusFilter) {
        return permitRepository.findForReview(statusFilter).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public SellerPermitDto getForAdmin(Long permitId) {
        SellerPermitEntity entity = permitRepository.findById(permitId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Permit " + permitId + " not found."));
        return toDto(entity);
    }

    @Transactional(readOnly = true)
    public List<PermitDocumentDto> listDocumentsForAdmin(Long permitId) {
        if (!permitRepository.existsById(permitId)) {
            throw new PermitNotFoundException("Permit " + permitId + " not found.");
        }
        return documentRepository.findByPermitId(permitId).stream()
                .map(d -> PermitDocumentDto.from(d, buildDocumentUrl(d.getId())))
                .toList();
    }

    @Transactional
    public SellerPermitDto approve(Long permitId, Long adminId, MultipartFile licence) {
        SellerPermitEntity permit = permitRepository.findById(permitId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Permit " + permitId + " not found."));
        if (permit.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException("Permit is already approved.");
        }

        // Make sure every required slot still has a document — guards
        // against admin approving a stale or partially re-uploaded permit.
        Set<PermitDocumentType> present = documentRepository
                .findByPermitId(permit.getId())
                .stream()
                .map(PermitDocumentEntity::getDocumentType)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(PermitDocumentType.class)));
        Set<PermitDocumentType> missing = EnumSet.copyOf(REQUIRED_SLOTS);
        missing.removeAll(present);
        if (!missing.isEmpty()) {
            throw new PermitStateException(
                    "Cannot approve — missing required documents: " + missing + ".");
        }

        // Upload the licence PDF (overwrites any prior licence row).
        if (licence != null && !licence.isEmpty()) {
            storageService.store(permit, PermitDocumentType.LICENSE, licence);
        }

        permit.setStatus(PermitStatus.APPROVED);
        permit.setReviewedAt(Instant.now());
        permit.setReviewedBy(adminId);
        permit.setRejectionReason(null);
        permitRepository.save(permit);

        // Flip the seller's user.is_active so customer / rider queries start
        // returning them.
        User seller = userRepository.findById(permit.getSellerId())
                .orElseThrow(() -> new PermitNotFoundException(
                        "Seller " + permit.getSellerId() + " no longer exists."));
        if (!seller.isActive()) {
            seller.setActive(true);
            userRepository.save(seller);
        }

        notificationService.notify(
                permit.getSellerId(),
                "permit",
                "Permit approved",
                "Congratulations! Your permit application has been approved. You may now start selling gas.",
                json(Map.of(
                        "permitId", String.valueOf(permit.getId()),
                        "status", "approved",
                        "licenceUrl", "/api/permits/me/license"
                ))
        );

        return toDto(permit);
    }

    @Transactional
    public SellerPermitDto reject(Long permitId, Long adminId, RejectPermitRequest request) {
        SellerPermitEntity permit = permitRepository.findById(permitId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Permit " + permitId + " not found."));
        if (permit.getStatus() == PermitStatus.APPROVED) {
            throw new PermitStateException("Permit is already approved.");
        }
        permit.setStatus(PermitStatus.REJECTED);
        permit.setReviewedAt(Instant.now());
        permit.setReviewedBy(adminId);
        permit.setRejectionReason(request.reason().trim());
        permitRepository.save(permit);

        notificationService.notify(
                permit.getSellerId(),
                "permit",
                "Permit rejected",
                "Your permit application was rejected. Reason: " + permit.getRejectionReason()
                        + ". You may upload corrected documents and submit a new application.",
                json(Map.of(
                        "permitId", String.valueOf(permit.getId()),
                        "status", "rejected",
                        "reason", permit.getRejectionReason()
                ))
        );

        return toDto(permit);
    }

    // ---- document streaming (admin + owning seller) ----------------------

    @Transactional(readOnly = true)
    public DocumentStream loadDocument(Long documentId, Role actorRole, Long actorId) {
        PermitDocumentEntity document = documentRepository.findById(documentId)
                .orElseThrow(() -> new PermitNotFoundException(
                        "Document " + documentId + " not found."));
        SellerPermitEntity permit = permitRepository.findById(document.getPermitId())
                .orElseThrow(() -> new PermitNotFoundException(
                        "Permit " + document.getPermitId() + " not found."));

        boolean isAdmin = actorRole == Role.ADMIN;
        boolean isOwningSeller = actorRole == Role.SELLER
                && permit.getSellerId().equals(actorId);
        if (!isAdmin && !isOwningSeller) {
            throw new NotAuthorizedException(
                    "You are not allowed to view this document.");
        }

        // Sellers may only download the licence — never the underlying
        // application form, birth certificate, or national ID.
        if (isOwningSeller && document.getDocumentType() != PermitDocumentType.LICENSE) {
            throw new NotAuthorizedException(
                    "Sellers can only download their approved licence.");
        }

        Path path = storageService.resolve(document.getStorageKey());
        return new DocumentStream(path, document.getContentType(),
                document.getOriginalName(), document.getSizeBytes());
    }

    // ---- visibility helper used by SellerProfileService ------------------

    /**
     * Returns the set of seller ids that have an APPROVED permit — used by
     * {@code GET /api/sellers} to short-circuit inactive / pending rows.
     * Falls back to "all ids match" when no permits have been created yet
     * so V3 seed sellers (which were never given permit rows) keep their
     * existing behaviour.
     */
    @Transactional(readOnly = true)
    public Set<Long> approvedSellerIds() {
        List<Long> ids = permitRepository.findSellerIdsByStatus(PermitStatus.APPROVED);
        if (ids.isEmpty()) return Set.of();
        return new java.util.HashSet<>(ids);
    }

    /** True if a permit row exists for the seller — used by the legacy V3 seed exemption. */
    @Transactional(readOnly = true)
    public boolean hasPermitRow(Long sellerId) {
        return permitRepository.findBySellerId(sellerId).isPresent();
    }

    // ---- DTO mapping -----------------------------------------------------

    private SellerPermitDto toDto(SellerPermitEntity entity) {
        List<PermitDocumentDto> docs = documentRepository.findByPermitId(entity.getId())
                .stream()
                .map(d -> PermitDocumentDto.from(d, buildDocumentUrl(d.getId())))
                .toList();
        String sellerName = userRepository.findById(entity.getSellerId())
                .map(User::getFullName)
                .orElse(null);
        String reviewerName = entity.getReviewedBy() == null
                ? null
                : userRepository.findById(entity.getReviewedBy())
                        .map(User::getFullName)
                        .orElse(null);
        return SellerPermitDto.from(entity, sellerName, docs, reviewerName);
    }

    private static String buildDocumentUrl(Long documentId) {
        return "/api/permits/documents/" + documentId;
    }

    private static String defaultBusinessName(Long sellerId) {
        return "Pending seller #" + sellerId;
    }

    /**
     * Serialise a flat {@code Map<String,String>} to a JSON object literal.
     *
     * <p>Hand-rolled instead of injecting Jackson's {@code ObjectMapper}
     * because the only payloads we attach to notification rows are small,
     * flat key/value objects — the dependency wasn't worth the
     * autowiring cost. The output is escaped for embedded quotes and
     * backslashes so any string value is safe.</p>
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

    /**
     * Bundle of resolved file metadata returned to the streaming
     * controller.
     */
    public record DocumentStream(
            java.nio.file.Path path,
            String contentType,
            String originalName,
            long sizeBytes
    ) {
    }
}
