package com.project.gas_delivery.auth.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Spring Security configuration for the auth module.
 * <p>
 * <strong>Temporary setup:</strong> the JWT filter is parked and every
 * request is permitted, because we agreed to keep auth simple until the
 * JWT phase lands. The {@link PasswordEncoder} bean stays so the service
 * layer can hash credentials with BCrypt.
 * </p>
 * <p>
 * When JWT is reintroduced, swap the lambda in
 * {@link #securityFilterChain(HttpSecurity)} to call
 * {@code .anyRequest().authenticated()} and re-add the
 * {@code JwtAuthenticationFilter} to the chain.
 * </p>
 */
@Configuration
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {}) // CORS handled by the project's CorsConfig (WebMvcConfigurer)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());

        return http.build();
    }
}