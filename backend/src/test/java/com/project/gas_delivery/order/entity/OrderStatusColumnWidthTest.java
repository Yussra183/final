package com.project.gas_delivery.order.entity;

import com.project.gas_delivery.order.enums.OrderStatus;
import jakarta.persistence.Column;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the invariant that broke the rider pickup flow in production.
 *
 * <p>{@code OrderEntity.status} is mapped {@code @Enumerated(EnumType.STRING)},
 * so the column stores the <em>uppercase enum name</em> — not the short
 * lowercase JSON wire form produced by {@link OrderStatus#toJson()}. The
 * original column was {@code VARCHAR(20)}, sized against the wire forms
 * ({@code "pickup_pending"} is 14 chars). That held until
 * {@code PICKUP_CONFIRMATION_PENDING} (27 chars) was added: every attempt
 * to persist it failed with a Postgres {@code value too long} error,
 * surfacing to the rider as an opaque HTTP 500.</p>
 *
 * <p>The failure was invisible to the state-machine tests because the
 * transition table was entirely correct — only the write to disk failed.
 * This test compares the declared column length against the longest
 * enum name so any future status that outgrows the column fails here
 * rather than at the rider's fingertips.</p>
 */
class OrderStatusColumnWidthTest {

    @Test
    @DisplayName("orders.status column fits the longest persisted enum name")
    void statusColumnFitsLongestEnumName() throws NoSuchFieldException {
        Field statusField = OrderEntity.class.getDeclaredField("status");
        Column column = statusField.getAnnotation(Column.class);

        assertThat(column)
                .as("status must carry an explicit @Column so the length is reviewable")
                .isNotNull();

        OrderStatus longest = java.util.Arrays.stream(OrderStatus.values())
                .max(java.util.Comparator.comparingInt(s -> s.name().length()))
                .orElseThrow();

        assertThat(column.length())
                .as("column must fit '%s' (%d chars) — EnumType.STRING persists the "
                                + "enum NAME, not the lowercase wire form '%s'",
                        longest.name(), longest.name().length(), longest.toJson())
                .isGreaterThanOrEqualTo(longest.name().length());
    }

    @Test
    @DisplayName("Every status name is persistable, not just the longest")
    void everyStatusNameIsPersistable() throws NoSuchFieldException {
        int length = OrderEntity.class.getDeclaredField("status")
                .getAnnotation(Column.class)
                .length();

        for (OrderStatus status : OrderStatus.values()) {
            assertThat(status.name().length())
                    .as("status %s would be truncated by VARCHAR(%d)", status.name(), length)
                    .isLessThanOrEqualTo(length);
        }
    }
}
