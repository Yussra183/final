# Gas Delivery Upgrade Plan - Implementation Guide

**Plan Location**: `.github/modernize/gas-delivery-upgrade/`

**Generated**: 2024-07-16

---

## Quick Reference

| Task | Type | Phase | Priority | Dependencies | Est. Effort |
|------|------|-------|----------|--------------|-------------|
| 001 - Testing Infrastructure | Transform | 1 | HIGH | None | 3-4 days |
| 002 - Containerization | Containerization | 1 | HIGH | Task 001 | 2-3 days |
| 003 - Configuration | Transform | 2 | MEDIUM | Task 002 | 1-2 days |
| 004 - JWT Auth & RBAC | Transform | 2 | MEDIUM | Task 003 | 3-4 days |
| 005 - Rate Limiting | Transform | 2 | MEDIUM | Task 004 | 1-2 days |
| 006 - API Documentation | Transform | 3 | MEDIUM | Task 005 | 1-2 days |
| 007 - Database Migrations | Transform | 3 | MEDIUM | Task 001 | 2-3 days |
| 008 - Monitoring & Logging | Transform | 3 | MEDIUM | Task 006 | 2-3 days |
| 009 - CVE Scanning | Security | 4 | HIGH | Task 008 | 1 day |

**Total Estimated Effort**: 16-24 days (4-6 weeks with standard sprint velocity)

---

## Phase 1: Foundation (Weeks 1-2)

### Task 001: Testing Infrastructure

**Key Activities**:
- Add test dependencies to pom.xml: JUnit 5, Mockito, AssertJ, Spring Test, Testcontainers
- Create test directory structure: `src/test/java/com/project/gasdelivery/`
- Implement TestContainers configuration for PostgreSQL
- Create test fixtures and builder patterns
- Add MockMvc tests for all controller classes
- Configure test database initialization

**Key Dependencies to Add**:
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>testcontainers</artifactId>
    <version>1.19.0</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>postgresql</artifactId>
    <version>1.19.0</version>
    <scope>test</scope>
</dependency>
```

**Success Metrics**:
- All builds pass
- 70%+ code coverage achieved
- All unit tests pass
- Integration tests run successfully

---

### Task 002: Containerization

**Key Activities**:
- Create multi-stage Dockerfile with builder and runtime stages
- Optimize layer caching for faster builds
- Configure Spring Boot executable JAR
- Add health check probes
- Create docker-compose.yml for development
- Document build and run instructions

**Dockerfile Template**:
```dockerfile
# Stage 1: Build
FROM maven:3.9.0-eclipse-temurin-25 as builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY . .
RUN mvn clean package -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD java -cp app.jar org.springframework.boot.loader.JarLauncher \
        -Dspring.profiles.active=health
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Success Metrics**:
- Docker image builds successfully
- Application starts in container
- Health checks respond correctly
- docker-compose environment is functional

---

## Phase 2: Security & Configuration (Weeks 3-4)

### Task 003: Configuration Externalization

**Key Activities**:
- Remove hardcoded credentials from `application.properties`
- Create profile-specific configuration files
- Implement @ConfigurationProperties beans
- Document all environment variables
- Create `.env.example` for reference

**Required Environment Variables**:
```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gas_delivery
DB_USER=gasadmin
DB_PASSWORD=<secure-password>
DB_POOL_SIZE=10

# Application Configuration
APP_NAME=GasDelivery
APP_ENVIRONMENT=production
APP_PORT=8080

# Logging Configuration
LOG_LEVEL=INFO
LOG_FILE_PATH=/var/log/app/
```

---

### Task 004: JWT Authentication & RBAC

**Key Activities**:
- Add Spring Security JWT dependencies
- Implement JWT token generation in login endpoint
- Create JWT validation filter
- Define application roles: ADMIN, CUSTOMER, SUPPLIER, RIDER
- Apply @PreAuthorize on all protected endpoints
- Configure CORS for API access

**Key Dependencies**:
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.12.3</version>
</dependency>
```

**Role-Based Endpoint Protection**:
```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    
    @GetMapping
    @PreAuthorize("hasAnyRole('CUSTOMER', 'ADMIN')")
    public List<Order> getOrders() { ... }
    
    @PostMapping
    @PreAuthorize("hasRole('CUSTOMER')")
    public Order createOrder(@RequestBody OrderRequest req) { ... }
    
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteOrder(@PathVariable Long id) { ... }
}
```

---

### Task 005: Rate Limiting

**Key Activities**:
- Add Resilience4j rate limiting dependency
- Implement @RateLimiter on high-traffic endpoints
- Configure sliding window strategy
- Create global rate limit exception handler
- Document rate limits in Swagger

**Key Dependencies**:
```xml
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot3</artifactId>
    <version>2.1.0</version>
</dependency>
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-ratelimiter</artifactId>
    <version>2.1.0</version>
</dependency>
```

**Typical Rate Limit Configuration**:
```properties
resilience4j.ratelimiter.instances.orders.register-health-indicator=true
resilience4j.ratelimiter.instances.orders.limit-for-period=100
resilience4j.ratelimiter.instances.orders.limit-refresh-period=1m
resilience4j.ratelimiter.instances.orders.timeout-duration=5s
```

---

## Phase 3: Observability & Documentation (Weeks 5-6)

### Task 006: API Documentation

**Key Activities**:
- Add SpringDoc OpenAPI dependency
- Annotate all REST controllers
- Document request/response models
- Configure Swagger UI path
- Export OpenAPI specification

**Key Dependencies**:
```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.0.2</version>
</dependency>
```

**Controller Annotation Example**:
```java
@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Order management endpoints")
public class OrderController {
    
    @PostMapping
    @Operation(
        summary = "Create new order",
        description = "Place a new delivery order with items",
        security = @SecurityRequirement(name = "bearerAuth")
    )
    @ApiResponse(responseCode = "201", description = "Order created successfully")
    @ApiResponse(responseCode = "400", description = "Invalid order data")
    public ResponseEntity<OrderResponse> createOrder(
        @RequestBody @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true) 
        OrderRequest request) {
        // Implementation
    }
}
```

### Task 007: Database Migrations

**Key Activities**:
- Create migration script directory: `src/main/resources/db/migration/`
- Write V1__Initial_Schema.sql with current database definition
- Document migration naming convention
- Create callbacks for data population if needed
- Add baseline configuration for existing databases

**Migration Script Example**:
```sql
-- V1__Initial_Schema.sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

### Task 008: Monitoring & Logging

**Key Activities**:
- Enable Spring Boot Actuator
- Configure Logback with JSON layout
- Add correlation ID support
- Create custom metrics
- Configure health indicators
- Document ELK Stack integration

**Key Dependencies**:
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.3</version>
</dependency>
```

**Logback Configuration for ELK**:
```xml
<configuration>
    <appender name="console" class="ch.qos.logback.core.ConsoleAppender">
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <customFields>{"app_name":"gas-delivery","environment":"${APP_ENV}"}</customFields>
        </encoder>
    </appender>
    <root level="INFO">
        <appender-ref ref="console"/>
    </root>
</configuration>
```

---

## Phase 4: Compliance & Validation (Week 7)

### Task 009: CVE Scanning

**Key Activities**:
- Run Maven CVE scan
- Identify vulnerable dependencies
- Update to patched versions
- Verify build and tests pass
- Generate compliance report

**Maven Command**:
```bash
mvn dependency:check
mvn org.owasp:dependency-check-maven:check
```

---

## Testing Strategy

### Unit Testing
- Test all business logic in service classes
- Mock external dependencies
- Use AssertJ for fluent assertions
- Target: 80%+ coverage

### Integration Testing
- Use TestContainers for PostgreSQL
- Test repository and database interactions
- Test controller endpoints with MockMvc
- Test security filters and JWT validation

### End-to-End Testing (Post-Deployment)
- Deploy to staging environment
- Run API contract tests
- Test all user workflows
- Verify rate limiting and authentication

---

## Deployment Checklist

- [ ] All tests pass with 70%+ coverage
- [ ] Docker image builds and runs successfully
- [ ] All environment variables documented
- [ ] JWT token generation and validation working
- [ ] Rate limiting enforced on protected endpoints
- [ ] Swagger UI accessible at /swagger-ui.html
- [ ] Database migrations run successfully
- [ ] Actuator health checks responding
- [ ] Structured JSON logging configured
- [ ] CVE scan shows no high/critical vulnerabilities
- [ ] Configuration completely externalized
- [ ] RBAC enforced on all endpoints

---

## Resource Links

- [Spring Boot Testing Guide](https://spring.io/guides/gs/testing-web/)
- [Testcontainers Documentation](https://www.testcontainers.org/)
- [Spring Security JWT Guide](https://spring.io/projects/spring-security)
- [Resilience4j Rate Limiting](https://resilience4j.readme.io/docs/ratelimiter)
- [SpringDoc OpenAPI](https://springdoc.org/)
- [Flyway Database Migrations](https://flywaydb.org/)
- [Spring Boot Actuator Guide](https://spring.io/guides/gs/actuator-service/)
- [ELK Stack with Spring Boot](https://logz.io/blog/spring-boot-elk-stack/)

---

## Rollback Plan

If any phase encounters critical issues:

1. **Phase 1 Rollback**: Revert pom.xml changes, remove test code
2. **Phase 2 Rollback**: Restore original configuration files, revert security changes
3. **Phase 3 Rollback**: Disable Actuator and structured logging, remove API annotations
4. **Phase 4 Rollback**: Keep current dependency versions if CVE remediation breaks build

All changes are tracked in git - use `git reset --hard` to rollback if needed.

---

## Support & Questions

For questions about:
- **Testing**: Review Spring Boot Testing documentation and TestContainers guides
- **Containerization**: Check Docker best practices and multi-stage build patterns
- **Security**: Consult Spring Security and OWASP authentication guidelines
- **Observability**: Review ELK Stack documentation and Spring Boot Actuator guides

Contact the development team for clarification on specific implementation details.
