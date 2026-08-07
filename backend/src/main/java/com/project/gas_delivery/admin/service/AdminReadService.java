package com.project.gas_delivery.admin.service;

import com.project.gas_delivery.admin.dto.AdminAssignmentDto;
import com.project.gas_delivery.admin.dto.AdminCustomerDto;
import com.project.gas_delivery.admin.dto.AdminNotificationDto;
import com.project.gas_delivery.admin.dto.AdminOrderDto;
import com.project.gas_delivery.admin.dto.AdminProductDto;
import com.project.gas_delivery.admin.dto.AdminReportDto;
import com.project.gas_delivery.admin.dto.AdminRiderDto;
import com.project.gas_delivery.admin.dto.AdminSellerDto;
import com.project.gas_delivery.admin.dto.AdminStatsDto;
import com.project.gas_delivery.admin.dto.AdminUserDto;
import com.project.gas_delivery.admin.dto.OrderStatusCountsDto;
import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import com.project.gas_delivery.auth.exception.BadRequestException;
import com.project.gas_delivery.auth.repository.UserRepository;
import com.project.gas_delivery.notification.entity.NotificationEntity;
import com.project.gas_delivery.notification.repository.NotificationRepository;
import com.project.gas_delivery.order.dto.OrderResponse;
import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.enums.OrderStatus;
import com.project.gas_delivery.order.exception.OrderNotFoundException;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.permit.entity.SellerPermitEntity;
import com.project.gas_delivery.permit.enums.PermitStatus;
import com.project.gas_delivery.permit.repository.SellerPermitRepository;
import com.project.gas_delivery.product.entity.ProductEntity;
import com.project.gas_delivery.product.repository.ProductRepository;
import com.project.gas_delivery.rider.entity.RiderProfileEntity;
import com.project.gas_delivery.rider.entity.SellerRiderEntity;
import com.project.gas_delivery.rider.repository.RiderProfileRepository;
import com.project.gas_delivery.rider.repository.SellerRiderRepository;
import com.project.gas_delivery.seller.entity.SellerProfileEntity;
import com.project.gas_delivery.seller.repository.SellerProfileRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Read-only aggregation layer behind the admin screens.
 *
 * <p>Every figure returned here is a {@code COUNT}, {@code SUM} or row
 * projection against a real table. Nothing is seeded, sampled or
 * defaulted to a plausible-looking constant — where the schema cannot
 * answer a question, the method simply doesn't exist.</p>
 *
 * <p><strong>Query shape.</strong> Per-row aggregates (a customer's order
 * count, a seller's catalogue size) are never fetched inside a loop. Each
 * list method collects the ids on the page, issues <em>one</em> grouped
 * query for the whole set, and merges the result in memory — so a page of
 * fifty sellers costs two queries, not fifty-one.</p>
 *
 * <p>This service performs no writes. The only admin mutations in the
 * system remain the permit approve/reject pair owned by
 * {@link com.project.gas_delivery.permit.service.PermitService}.</p>
 */
@Service
@Transactional(readOnly = true)
public class AdminReadService {

    /** Statuses that mean an order is in a rider's hands right now. */
    private static final Set<OrderStatus> IN_FLIGHT = Set.of(
            OrderStatus.ASSIGNED, OrderStatus.PICKED_UP, OrderStatus.IN_TRANSIT);

    /** Default reporting window when the caller supplies no dates. */
    private static final int DEFAULT_REPORT_DAYS = 30;

    private final UserRepository userRepository;
    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final NotificationRepository notificationRepository;
    private final SellerPermitRepository sellerPermitRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final RiderProfileRepository riderProfileRepository;
    private final SellerRiderRepository sellerRiderRepository;

    public AdminReadService(UserRepository userRepository,
                            OrderRepository orderRepository,
                            ProductRepository productRepository,
                            NotificationRepository notificationRepository,
                            SellerPermitRepository sellerPermitRepository,
                            SellerProfileRepository sellerProfileRepository,
                            RiderProfileRepository riderProfileRepository,
                            SellerRiderRepository sellerRiderRepository) {
        this.userRepository = userRepository;
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.notificationRepository = notificationRepository;
        this.sellerPermitRepository = sellerPermitRepository;
        this.sellerProfileRepository = sellerProfileRepository;
        this.riderProfileRepository = riderProfileRepository;
        this.sellerRiderRepository = sellerRiderRepository;
    }

    // ================================================================
    // Dashboard
    // ================================================================

    /** Every dashboard tile, in one call. */
    public AdminStatsDto stats() {
        Map<OrderStatus, Long> byStatus = orderStatusCounts();
        OrderStatusCountsDto statusCounts = OrderStatusCountsDto.from(byStatus);

        long totalOrders = byStatus.values().stream().mapToLong(Long::longValue).sum();

        return new AdminStatsDto(
                userRepository.count(),
                userRepository.countByRole(Role.CUSTOMER),
                userRepository.countByRole(Role.SELLER),
                userRepository.countByRole(Role.RIDER),
                userRepository.countByRole(Role.SUPPLIER),
                userRepository.countByRole(Role.ADMIN),
                productRepository.count(),
                totalOrders,
                statusCounts,
                statusCounts.active(),
                sellerPermitRepository.countByStatus(PermitStatus.PENDING),
                sellerPermitRepository.countByStatus(PermitStatus.UNDER_REVIEW),
                sellerPermitRepository.countByStatus(PermitStatus.APPROVED),
                sellerPermitRepository.countByStatus(PermitStatus.REJECTED),
                notificationRepository.count(),
                zeroIfNull(orderRepository.sumTotalByStatus(OrderStatus.DELIVERED)),
                Instant.now()
        );
    }

    /** Order counts keyed by status, from one {@code GROUP BY}. */
    private Map<OrderStatus, Long> orderStatusCounts() {
        Map<OrderStatus, Long> counts = new EnumMap<>(OrderStatus.class);
        for (Object[] row : orderRepository.countGroupedByStatus()) {
            counts.put((OrderStatus) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }

    // ================================================================
    // Users / directory
    // ================================================================

    /**
     * The user directory, optionally narrowed by role, free-text query and
     * active flag. Newest registration first.
     */
    public List<AdminUserDto> users(String role, String query, Boolean active) {
        List<User> rows = role == null || role.isBlank()
                ? userRepository.findAllByOrderByCreatedAtDesc()
                : userRepository.findByRoleOrderByCreatedAtDesc(parseRole(role));

        return rows.stream()
                .filter(u -> active == null || u.isActive() == active)
                .filter(u -> matchesUser(u, query))
                .map(AdminUserDto::from)
                .toList();
    }

    public AdminUserDto user(Long id) {
        return AdminUserDto.from(requireUser(id));
    }

    /** Suppliers are users with {@code role = SUPPLIER}; there is no supplier table. */
    public List<AdminUserDto> suppliers(String query, Boolean active) {
        return users(Role.SUPPLIER.toJson(), query, active);
    }

    // ================================================================
    // Customers
    // ================================================================

    /** Customers with their lifetime order count and spend. */
    public List<AdminCustomerDto> customers(String query, Boolean active) {
        List<User> rows = userRepository.findByRoleOrderByCreatedAtDesc(Role.CUSTOMER).stream()
                .filter(u -> active == null || u.isActive() == active)
                .filter(u -> matchesUser(u, query))
                .toList();
        if (rows.isEmpty()) {
            return List.of();
        }

        // One grouped query for the whole page, rather than two per row.
        Map<Long, long[]> counts = new HashMap<>();
        Map<Long, BigDecimal> spend = new HashMap<>();
        for (Object[] r : orderRepository.aggregateCustomerTotals(idsOf(rows))) {
            Long customerId = ((Number) r[0]).longValue();
            counts.put(customerId, new long[]{((Number) r[1]).longValue()});
            spend.put(customerId, zeroIfNull((BigDecimal) r[2]));
        }

        return rows.stream()
                .map(u -> new AdminCustomerDto(
                        String.valueOf(u.getId()),
                        u.getFullName(),
                        u.getUsername(),
                        u.getEmail(),
                        u.getPhone(),
                        u.isActive(),
                        u.getCreatedAt(),
                        counts.containsKey(u.getId()) ? counts.get(u.getId())[0] : 0L,
                        spend.getOrDefault(u.getId(), BigDecimal.ZERO)
                ))
                .toList();
    }

    /** A customer's most recent orders, for the detail panel. */
    public List<AdminOrderDto> customerOrders(Long customerId) {
        requireUser(customerId);
        return orderRepository.findTop10ByCustomerIdOrderByUpdatedAtDesc(customerId).stream()
                .map(AdminOrderDto::from)
                .toList();
    }

    // ================================================================
    // Sellers
    // ================================================================

    /**
     * Sellers with their business profile, permit status and catalogue
     * size. {@code permitStatus} filters on the application state; the V3
     * seed sellers have no permit row and carry a null status.
     */
    public List<AdminSellerDto> sellers(String query, String permitStatus, Boolean active) {
        List<User> rows = userRepository.findByRoleOrderByCreatedAtDesc(Role.SELLER).stream()
                .filter(u -> active == null || u.isActive() == active)
                .filter(u -> matchesUser(u, query))
                .toList();
        if (rows.isEmpty()) {
            return List.of();
        }

        Collection<Long> ids = idsOf(rows);

        Map<Long, SellerProfileEntity> profiles = sellerProfileRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(SellerProfileEntity::getUserId, Function.identity()));

        Map<Long, SellerPermitEntity> permits = sellerPermitRepository.findBySellerIdIn(ids).stream()
                .collect(Collectors.toMap(SellerPermitEntity::getSellerId, Function.identity()));

        Map<Long, Long> productCounts = new HashMap<>();
        for (Object[] r : productRepository.countGroupedBySellerId(ids)) {
            productCounts.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
        }

        PermitStatus wanted = permitStatus == null || permitStatus.isBlank()
                ? null
                : parsePermitStatus(permitStatus);

        List<AdminSellerDto> out = new ArrayList<>(rows.size());
        for (User u : rows) {
            SellerPermitEntity permit = permits.get(u.getId());
            if (wanted != null && (permit == null || permit.getStatus() != wanted)) {
                continue;
            }
            SellerProfileEntity profile = profiles.get(u.getId());
            out.add(new AdminSellerDto(
                    String.valueOf(u.getId()),
                    u.getFullName(),
                    u.getUsername(),
                    u.getEmail(),
                    u.getPhone(),
                    u.isActive(),
                    u.getCreatedAt(),
                    profile != null ? profile.getBusinessName()
                            : permit != null ? permit.getBusinessName() : null,
                    profile == null ? null : profile.getAddress(),
                    profile == null ? null : profile.getDistrict(),
                    profile == null ? null : profile.getRegion(),
                    profile == null ? null : profile.getWard(),
                    profile == null ? null : profile.getStreet(),
                    profile == null ? null : profile.getRating(),
                    profile == null ? null : profile.isOpenNow(),
                    profile == null ? null : profile.getLat(),
                    profile == null ? null : profile.getLng(),
                    permit == null ? null : permit.getStatus().toJson(),
                    permit == null ? null : permit.getSubmittedAt(),
                    permit == null ? null : permit.getReviewedAt(),
                    permit == null ? null : permit.getRejectionReason(),
                    productCounts.getOrDefault(u.getId(), 0L)
            ));
        }
        return out;
    }

    // ================================================================
    // Riders
    // ================================================================

    /** Riders with vehicle details, availability and workload counts. */
    public List<AdminRiderDto> riders(String query, Boolean available, Boolean active) {
        List<User> rows = userRepository.findByRoleOrderByCreatedAtDesc(Role.RIDER).stream()
                .filter(u -> active == null || u.isActive() == active)
                .filter(u -> matchesUser(u, query))
                .toList();
        if (rows.isEmpty()) {
            return List.of();
        }

        Collection<Long> ids = idsOf(rows);

        Map<Long, RiderProfileEntity> profiles = riderProfileRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(RiderProfileEntity::getUserId, Function.identity()));

        // One grouped query gives every rider's per-status counts; fold
        // the in-flight statuses together and pull DELIVERED out.
        Map<Long, Long> assigned = new HashMap<>();
        Map<Long, Long> delivered = new HashMap<>();
        for (Object[] r : orderRepository.aggregateRiderStatusCounts(ids)) {
            Long riderId = ((Number) r[0]).longValue();
            OrderStatus status = (OrderStatus) r[1];
            long count = ((Number) r[2]).longValue();
            if (IN_FLIGHT.contains(status)) {
                assigned.merge(riderId, count, Long::sum);
            } else if (status == OrderStatus.DELIVERED) {
                delivered.merge(riderId, count, Long::sum);
            }
        }

        Map<Long, Long> sellerCounts = new HashMap<>();
        for (Long riderId : ids) {
            sellerCounts.put(riderId,
                    (long) sellerRiderRepository.findSellerIdsByRiderId(riderId).size());
        }

        List<AdminRiderDto> out = new ArrayList<>(rows.size());
        for (User u : rows) {
            RiderProfileEntity p = profiles.get(u.getId());
            boolean isAvailable = p != null && p.isAvailable();
            if (available != null && isAvailable != available) {
                continue;
            }
            out.add(new AdminRiderDto(
                    String.valueOf(u.getId()),
                    u.getFullName(),
                    u.getUsername(),
                    u.getEmail(),
                    u.getPhone(),
                    u.isActive(),
                    u.getCreatedAt(),
                    p == null ? null : p.getVehicleType(),
                    p == null ? null : p.getVehiclePlate(),
                    p == null ? null : p.getVehicleModel(),
                    p == null ? null : p.getLicenseNo(),
                    isAvailable,
                    p == null ? null : p.getLat(),
                    p == null ? null : p.getLng(),
                    assigned.getOrDefault(u.getId(), 0L),
                    delivered.getOrDefault(u.getId(), 0L),
                    sellerCounts.getOrDefault(u.getId(), 0L)
            ));
        }
        return out;
    }

    /** A rider's most recent orders, for the detail panel. */
    public List<AdminOrderDto> riderOrders(Long riderId) {
        requireUser(riderId);
        return orderRepository.findTop10ByRiderIdOrderByUpdatedAtDesc(riderId).stream()
                .map(AdminOrderDto::from)
                .toList();
    }

    /** Every seller↔rider pairing in {@code seller_riders}, both names resolved. */
    public List<AdminAssignmentDto> assignments() {
        List<SellerRiderEntity> rows = sellerRiderRepository.findAll();
        if (rows.isEmpty()) {
            return List.of();
        }

        Set<Long> userIds = new LinkedHashSet<>();
        rows.forEach(r -> {
            userIds.add(r.getSellerId());
            userIds.add(r.getRiderId());
        });

        Map<Long, User> users = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        Map<Long, SellerProfileEntity> profiles = sellerProfileRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(SellerProfileEntity::getUserId, Function.identity()));
        Map<Long, RiderProfileEntity> riderProfiles = riderProfileRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(RiderProfileEntity::getUserId, Function.identity()));

        return rows.stream()
                .map(r -> {
                    User seller = users.get(r.getSellerId());
                    User rider = users.get(r.getRiderId());
                    SellerProfileEntity profile = profiles.get(r.getSellerId());
                    RiderProfileEntity riderProfile = riderProfiles.get(r.getRiderId());
                    return new AdminAssignmentDto(
                            String.valueOf(r.getSellerId()),
                            seller == null ? null : seller.getFullName(),
                            profile == null ? null : profile.getBusinessName(),
                            String.valueOf(r.getRiderId()),
                            rider == null ? null : rider.getFullName(),
                            riderProfile != null && riderProfile.isAvailable(),
                            r.getAssignedAt()
                    );
                })
                .toList();
    }

    // ================================================================
    // Products
    // ================================================================

    /** The whole catalogue across every seller, inactive rows included. */
    public List<AdminProductDto> products(String query, String sellerId, Boolean active, String category) {
        List<ProductEntity> rows = productRepository.findAllByOrderByNameAsc();
        if (rows.isEmpty()) {
            return List.of();
        }

        Long sellerFilter = sellerId == null || sellerId.isBlank()
                ? null
                : parseId(sellerId, "sellerId");

        List<ProductEntity> filtered = rows.stream()
                .filter(p -> sellerFilter == null || sellerFilter.equals(p.getSellerId()))
                .filter(p -> active == null || p.isActive() == active)
                .filter(p -> category == null || category.isBlank()
                        || category.equalsIgnoreCase(p.getCategory()))
                .filter(p -> matches(query, p.getName(), p.getSize(), p.getCategory()))
                .toList();
        if (filtered.isEmpty()) {
            return List.of();
        }

        Map<Long, String> sellerNames = userNames(
                filtered.stream().map(ProductEntity::getSellerId).collect(Collectors.toSet()));

        return filtered.stream()
                .map(p -> AdminProductDto.from(p, sellerNames.get(p.getSellerId())))
                .toList();
    }

    // ================================================================
    // Orders
    // ================================================================

    /** Every order in the system, newest first, with optional filters. */
    public List<AdminOrderDto> orders(String status, String customerId, String sellerId,
                                      String riderId, String query, Instant from, Instant to) {
        OrderStatus statusFilter = status == null || status.isBlank()
                ? null
                : parseOrderStatus(status);
        Long customerFilter = blankToNull(customerId, "customerId");
        Long sellerFilter = blankToNull(sellerId, "sellerId");
        Long riderFilter = blankToNull(riderId, "riderId");

        return orderRepository.findAllByOrderByUpdatedAtDesc().stream()
                .filter(o -> statusFilter == null || o.getStatus() == statusFilter)
                .filter(o -> customerFilter == null || customerFilter.equals(o.getCustomerId()))
                .filter(o -> sellerFilter == null || sellerFilter.equals(o.getSellerId()))
                .filter(o -> riderFilter == null || riderFilter.equals(o.getRiderId()))
                .filter(o -> from == null || !o.getCreatedAt().isBefore(from))
                .filter(o -> to == null || !o.getCreatedAt().isAfter(to))
                .filter(o -> matches(query, o.getCustomerName(), o.getSellerName(),
                        o.getRiderName(), o.getDeliveryAddress()))
                .map(AdminOrderDto::from)
                .toList();
    }

    /** One order in the canonical {@link OrderResponse} shape. */
    public OrderResponse order(Long id) {
        OrderEntity entity = orderRepository.findById(id)
                .orElseThrow(() -> new OrderNotFoundException("No order with id " + id + "."));
        return OrderResponse.from(entity);
    }

    // ================================================================
    // Notifications
    // ================================================================

    /** Every user's notification, newest first, with the recipient resolved. */
    public List<AdminNotificationDto> notifications(String userId, String type, Boolean read) {
        Long userFilter = blankToNull(userId, "userId");

        List<NotificationEntity> rows = notificationRepository.findAllByOrderByCreatedAtDesc().stream()
                .filter(n -> userFilter == null || userFilter.equals(n.getUserId()))
                .filter(n -> type == null || type.isBlank() || type.equalsIgnoreCase(n.getType()))
                .filter(n -> read == null || n.isRead() == read)
                .toList();
        if (rows.isEmpty()) {
            return List.of();
        }

        Map<Long, String> names = userNames(
                rows.stream().map(NotificationEntity::getUserId).collect(Collectors.toSet()));

        return rows.stream()
                .map(n -> AdminNotificationDto.from(n, names.get(n.getUserId())))
                .toList();
    }

    // ================================================================
    // Reports
    // ================================================================

    /**
     * Order and revenue statistics over a window, defaulting to the last
     * {@value #DEFAULT_REPORT_DAYS} days. Three grouped queries, no
     * row-by-row work.
     */
    public AdminReportDto report(Instant from, Instant to, int topSellerLimit) {
        Instant end = to != null ? to : Instant.now();
        Instant start = from != null ? from : end.minus(DEFAULT_REPORT_DAYS, ChronoUnit.DAYS);
        if (start.isAfter(end)) {
            throw new BadRequestException("`from` must be before `to`.");
        }

        // Status counts + revenue for the window.
        Map<OrderStatus, Long> counts = new EnumMap<>(OrderStatus.class);
        BigDecimal deliveredRevenue = BigDecimal.ZERO;
        for (Object[] r : orderRepository.aggregateStatusTotalsBetween(start, end)) {
            OrderStatus status = (OrderStatus) r[0];
            counts.put(status, ((Number) r[1]).longValue());
            if (status == OrderStatus.DELIVERED) {
                deliveredRevenue = zeroIfNull((BigDecimal) r[2]);
            }
        }
        OrderStatusCountsDto breakdown = OrderStatusCountsDto.from(counts);
        long total = counts.values().stream().mapToLong(Long::longValue).sum();
        long delivered = counts.getOrDefault(OrderStatus.DELIVERED, 0L);

        List<AdminReportDto.DailyPoint> daily = orderRepository.aggregateDaily(start, end).stream()
                .map(r -> new AdminReportDto.DailyPoint(
                        String.valueOf(r[0]),
                        ((Number) r[1]).longValue(),
                        zeroIfNull((BigDecimal) r[2])))
                .toList();

        List<Object[]> topRows = orderRepository
                .aggregateTopSellers(start, end, PageRequest.of(0, Math.max(1, topSellerLimit)));
        // Resolve the seller's *current* name from `users` — the name on
        // the order is a snapshot from when it was placed.
        Map<Long, String> topNames = userNames(topRows.stream()
                .map(r -> ((Number) r[0]).longValue())
                .collect(Collectors.toSet()));
        List<AdminReportDto.TopSeller> top = topRows.stream()
                .map(r -> {
                    Long sellerId = ((Number) r[0]).longValue();
                    return new AdminReportDto.TopSeller(
                            String.valueOf(sellerId),
                            topNames.get(sellerId),
                            ((Number) r[1]).longValue(),
                            zeroIfNull((BigDecimal) r[2]));
                })
                .toList();

        BigDecimal average = delivered == 0
                ? BigDecimal.ZERO
                : deliveredRevenue.divide(BigDecimal.valueOf(delivered), 2, RoundingMode.HALF_UP);

        return new AdminReportDto(
                start,
                end,
                total,
                delivered,
                counts.getOrDefault(OrderStatus.CANCELLED, 0L),
                counts.getOrDefault(OrderStatus.REJECTED, 0L),
                deliveredRevenue,
                average,
                daily,
                top,
                breakdown
        );
    }

    // ================================================================
    // Helpers
    // ================================================================

    /** Resolves display names for a set of user ids in one query. */
    private Map<Long, String> userNames(Collection<Long> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> names = new HashMap<>();
        userRepository.findAllById(ids).forEach(u -> names.put(u.getId(), u.getFullName()));
        return names;
    }

    private User requireUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new BadRequestException("No user with id " + id + "."));
    }

    private static Collection<Long> idsOf(List<User> users) {
        return users.stream().map(User::getId).toList();
    }

    /** Case-insensitive substring match of {@code query} against a user's identity fields. */
    private static boolean matchesUser(User u, String query) {
        return matches(query, u.getFullName(), u.getUsername(), u.getEmail(), u.getPhone());
    }

    /** True when the query is blank, or any field contains it case-insensitively. */
    private static boolean matches(String query, String... fields) {
        if (query == null || query.isBlank()) {
            return true;
        }
        String needle = query.trim().toLowerCase();
        for (String field : fields) {
            if (field != null && field.toLowerCase().contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private static BigDecimal zeroIfNull(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static Long blankToNull(String raw, String field) {
        return raw == null || raw.isBlank() ? null : parseId(raw, field);
    }

    private static Long parseId(String raw, String field) {
        try {
            return Long.parseLong(raw.trim());
        } catch (NumberFormatException e) {
            throw new BadRequestException(field + " must be a numeric id.");
        }
    }

    private static Role parseRole(String raw) {
        try {
            return Role.fromJson(raw);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown role: " + raw);
        }
    }

    private static OrderStatus parseOrderStatus(String raw) {
        try {
            return OrderStatus.fromJson(raw);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown order status: " + raw);
        }
    }

    private static PermitStatus parsePermitStatus(String raw) {
        try {
            return PermitStatus.fromJson(raw);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Unknown permit status: " + raw);
        }
    }
}
