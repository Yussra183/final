package com.project.gas_delivery.notification.repository;

import com.project.gas_delivery.notification.entity.NotificationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<NotificationEntity, Long> {

    /** Newest-first feed for the current user. */
    List<NotificationEntity> findByUserIdOrderByCreatedAtDesc(Long userId);

    long countByUserIdAndReadFalse(Long userId);

    @Modifying
    @Query("UPDATE NotificationEntity n SET n.read = true WHERE n.userId = :userId AND n.read = false")
    int markAllRead(@Param("userId") Long userId);
}
