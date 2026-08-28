package com.project.gas_delivery.order.service;

import com.project.gas_delivery.order.entity.OrderEntity;
import com.project.gas_delivery.order.repository.OrderRepository;
import com.project.gas_delivery.order.service.impl.OrderServiceImpl;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

/**
 * Scheduled sweep that reverts expired rider pickup holds back to
 * {@code accepted} so other eligible riders can pick them up.
 *
 * <p>The database is the source of truth — the rider app's countdown is
 * only a visual representation. Running this every 30 s keeps the
 * reversion latency bounded without spending the whole schedule slot
 * on a tight loop.</p>
 *
 * <p>Each expired row is processed in its own transaction via
 * {@link OrderServiceImpl#expireHold(Long)} so a single failure (a race
 * with another transition, a notification outage, …) cannot take down
 * the rest of the sweep.</p>
 */
@Component
public class PickupHoldExpirationTask {

    private static final Logger log = LoggerFactory.getLogger(PickupHoldExpirationTask.class);

    private final OrderRepository orderRepository;
    private final OrderServiceImpl orderService;

    public PickupHoldExpirationTask(OrderRepository orderRepository,
                                    OrderServiceImpl orderService) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
    }

    /**
     * Runs every 30 seconds. {@code fixedDelay} (not {@code fixedRate})
     * so a slow sweep doesn't pile up overlapping runs.
     */
    @Scheduled(fixedDelayString = "${gas.pickup.expiration-poll-ms:30000}")
    public void sweep() {
        Instant now = Instant.now();
        List<OrderEntity> expired = orderRepository.findExpiredHolds(now);
        if (expired.isEmpty()) {
            return;
        }
        log.info("[ORDER_LIFECYCLE][HOLD_EXPIRY_SWEEP] candidates={}", expired.size());
        int reverted = 0;
        for (OrderEntity candidate : expired) {
            try {
                if (orderService.expireHold(candidate.getId())) {
                    reverted++;
                }
            } catch (RuntimeException ex) {
                // One bad row must not poison the rest of the sweep.
                log.warn("[ORDER_LIFECYCLE][HOLD_EXPIRY_FAILED] orderId={} error={}",
                        candidate.getId(), ex.getMessage());
            }
        }
        if (reverted > 0) {
            log.info("[ORDER_LIFECYCLE][HOLD_EXPIRY_SWEEP_DONE] reverted={}", reverted);
        }
    }
}