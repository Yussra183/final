# GDSA — Test Plan

**Project:** Gas Delivery System Application (GDSA)
**Document Version:** 1.0
**Date:** 2026-09-01
**Status:** Draft — Template for QA Team to populate

---

## 1. INTRODUCTION

### 1.1 Purpose

This Test Plan defines the functional testing scope for the GDSA MVP. It maps every functional requirement (FR-01 through FR-07) and every user role (Customer, Seller, Rider, Supplier, Administrator) to executable test cases. Test cases are derived from the Functional Requirements Document and the Systems Design Document ([docs/SDD.md](docs/SDD.md)).

### 1.2 Scope

Functional testing covers end-to-end behaviour of the seven functional requirements, with each FR validated against its owning subsystem:

| FR    | Title                                       | Owner Subsystem                          |
| ----- | ------------------------------------------- | ---------------------------------------- |
| FR-01 | Registration, authentication, verification  | `auth`, `permit`, `admin`                |
| FR-02 | Seller discovery via location / map         | `seller`, `customer`                     |
| FR-03 | Order placement and lifecycle               | `order`, `seller`, `rider`               |
| FR-04 | Live rider tracking and payment on arrival  | `tracking`, `payment`, `order`           |
| FR-05 | Seller inventory CRUD and stock alerts      | `product`, `seller`                      |
| FR-06 | Seller → Supplier restock flow              | `supplier`, `order` (`supply_orders`)    |
| FR-07 | Admin oversight and system notifications    | `admin`, `notification`                  |

### 1.3 Verification-Gate Invariant

All functional tests assume the project's standing invariant: sellers, riders, and suppliers **cannot** perform role activities until an administrator approves their submitted documents. Any test that bypasses this gate is out-of-scope; any failure of this gate is a CRITICAL defect.

### 1.4 Audience

QA engineers, regression-test authors, and reviewers verifying that implemented behaviour matches FR-01 through FR-07.

---

## 2. TEST STRATEGY

### 2.1 Test Levels

| Level            | Description                                                    | Owner                |
| ---------------- | -------------------------------------------------------------- | -------------------- |
| Unit             | Service and controller-level coverage in the Spring Boot suite | Backend engineers    |
| Integration      | End-to-end REST + JPA against the in-memory database           | Backend engineers    |
| Functional (UI)  | Manual + automated Expo client exercises the FR journeys      | QA engineers         |
| Non-functional   | Performance, security, and accessibility (out of scope here)  | —                    |

### 2.2 Test Environment

- **Backend:** Local Spring Boot 4.1 service with PostgreSQL test schema (Flyway V1 – V21).
- **Frontend:** Expo SDK 54 development build pointing at the local backend.
- **WebSocket:** `/ws/tracking` reachable from the device or web shell.
- **Geocoding:** Stubbed in-process (no external provider in the MVP).

### 2.3 Functional Testing

**GUIDANCE:** Use SRS requirement IDs (FR-01 … FR-07). Do not rewrite the requirement statements.

| Test ID | SRS requirement ID | Test action / input                          | Expected result                                     | Actual result | Status   |
| ------- | ------------------ | -------------------------------------------- | --------------------------------------------------- | ------------- | -------- |
| T-01    | [FR-ID]            | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-02    | [FR-ID]            | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-03    | FR-01              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-04    | FR-01              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-05    | FR-02              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-06    | FR-02              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-07    | FR-03              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-08    | FR-03              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-09    | FR-04              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-10    | FR-04              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-11    | FR-05              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-12    | FR-05              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-13    | FR-06              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-14    | FR-06              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-15    | FR-07              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-16    | FR-07              | [Insert]                                     | [Insert]                                            | [Insert]      | Pass/Fail |
| T-17    | FR-01              | [Insert — negative case: ungated access]     | [Insert — server rejects with 403/401]              | [Insert]      | Pass/Fail |
| T-18    | FR-06              | [Insert — negative case: pending supplier]   | [Insert — server rejects with 403/401]              | [Insert]      | Pass/Fail |

#### 2.3.1 Pre-existing Backend Test Failures (Baseline)

Six backend tests are known to fail on a clean checkout of `main`. These are **not** regressions introduced by new work; they are the standing baseline. Any new PR that adds a seventh failing test without a documented justification is a regression.

| Test class                                                                           | Module     | Reason (known)                |
| ------------------------------------------------------------------------------------ | ---------- | ----------------------------- |
| (See baseline list — to be cross-checked against `mvn test` output)                  |            |                               |

### 2.4 Acceptance Criteria

The MVP is considered test-complete when:

1. Every row in the table above has a non-empty **Test action / input**, **Expected result**, **Actual result**, and a Pass/Fail status.
2. All seven FRs have at least one positive and one negative test row.
3. The verification-gate invariant is exercised by both a positive (approved-user allowed) and negative (pending-user rejected) case.
4. No regression beyond the six pre-existing failing tests is introduced.

---

## 3. TEST DELIVERABLES

- This document — `/home/yusaab/Desktop/GDSA/docs/TEST_PLAN.md`
- Populated `Actual result` and `Status` columns after execution.
- Defect log for any Pass/Fail outcome that disagrees with the Expected result.

---

## 4. GLOSSARY

- **FR** — Functional Requirement (FR-01 through FR-07).
- **Permit** — Submitted document package for a seller, rider, or supplier awaiting admin approval.
- **Order state machine** — `pending → accepted → assigned → pickup_pending → picked_up → in_transit → delivered` (or `cancelled` / `rejected`).
- **Supply order state machine** — `pending → accepted → preparing → dispatched → delivered → received`.
