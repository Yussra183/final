package com.project.gas_delivery.payment.repository;

import com.project.gas_delivery.payment.entity.PaymentEntity;
import com.project.gas_delivery.payment.enums.PaymentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for {@link PaymentEntity}.
 *
 * <p>The dominant read paths are: per-customer history
 * ({@link #findByCustomerIdOrderByUpdatedAtDesc}), per-seller revenue
 * reconciliation, and the "active payment for order" lookup that the
 * service uses before creating / refunding.</p>
 */
@Repository
public interface PaymentRepository extends JpaRepository<PaymentEntity, Long> {

    /** Most recent payment for one customer — backs the customer's payment history tab. */
    List<PaymentEntity> findByCustomerIdOrderByUpdatedAtDesc(Long customerId);

    /** Most recent payment for one seller — backs the seller dashboard tile. */
    List<PaymentEntity> findBySellerIdOrderByUpdatedAtDesc(Long sellerId);

    /**
     * Active payment (PENDING or COMPLETED) for an order. Returns
     * {@code Optional.empty()} if the order has no active payment — used
     * to prevent duplicate payments before insert and to look up the
     * existing row when refunding.
     */
    @Query("""
            SELECT p FROM PaymentEntity p
             WHERE p.orderId = :orderId
               AND p.status IN (com.project.gas_delivery.payment.enums.PaymentStatus.PENDING,
                                com.project.gas_delivery.payment.enums.PaymentStatus.COMPLETED)
            """)
    Optional<PaymentEntity> findActiveByOrderId(@Param("orderId") Long orderId);

    /** Latest payment for one order (any status). */
    Optional<PaymentEntity> findFirstByOrderIdOrderByUpdatedAtDesc(Long orderId);

    // ---- Admin read surface -------------------------------------------

    /** Realised revenue — summed over COMPLETED payments in a window. */
    @Query("""
            SELECT COALESCE(SUM(p.amount), 0)
              FROM PaymentEntity p
             WHERE p.status = :status
               AND p.paidAt BETWEEN :from AND :to
            """)
    BigDecimal sumAmountByStatusBetween(@Param("status") PaymentStatus status,
                                        @Param("from") Instant from,
                                        @Param("to") Instant to);

    /** Status counts over a window — backs the admin report's payment summary. */
    @Query("""
            SELECT p.status, COUNT(p), COALESCE(SUM(p.amount), 0)
              FROM PaymentEntity p
             WHERE p.createdAt BETWEEN :from AND :to
             GROUP BY p.status
            """)
    List<Object[]> aggregateStatusTotalsBetween(@Param("from") Instant from,
                                                @Param("to") Instant to);

    /** Daily revenue (COMPLETED only) for the report's daily revenue line. */
    @Query("""
            SELECT FUNCTION('DATE', p.paidAt), COUNT(p), COALESCE(SUM(p.amount), 0)
              FROM PaymentEntity p
             WHERE p.paidAt BETWEEN :from AND :to
               AND p.status = com.project.gas_delivery.payment.enums.PaymentStatus.COMPLETED
             GROUP BY FUNCTION('DATE', p.paidAt)
             ORDER BY FUNCTION('DATE', p.paidAt) ASC
            """)
    List<Object[]> aggregateDailyRevenue(@Param("from") Instant from,
                                         @Param("to") Instant to);
}
