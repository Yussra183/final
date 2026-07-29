package com.project.gas_delivery.auth.repository;

import com.project.gas_delivery.auth.entity.User;
import com.project.gas_delivery.auth.enums.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for {@link User}.
 * <p>
 * All methods are derived from their names — Spring generates the SQL.
 * </p>
 */
@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    Optional<User> findByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    // ---- Admin read surface -------------------------------------------
    // Additive queries backing the admin directory screens. Nothing here
    // is consumed by the auth flow.

    /** Headcount for one role — backs the admin dashboard tiles. */
    long countByRole(Role role);

    /** Every user with the given role, newest registration first. */
    List<User> findByRoleOrderByCreatedAtDesc(Role role);

    /** Whole directory, newest registration first. */
    List<User> findAllByOrderByCreatedAtDesc();
}