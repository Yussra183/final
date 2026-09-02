# GDSA — Systems Design Document

**Project:** Gas Delivery System Application (GDSA)
**Document Version:** 1.0
**Date:** 2026-08-31
**Status:** Approved for Implementation

---

## 1. INTRODUCTION

### 1.1 Purpose and Scope

#### 1.1.1 Purpose

This Systems Design Document (SDD) describes the technical architecture, component design, data model, and integration contracts for the **Gas Delivery System Application (GDSA)** — a multi-role, location-aware mobile platform that connects end customers needing cooking gas with verified local sellers, delivery riders, and upstream suppliers under the supervision of a platform administrator.

The document serves as the **authoritative technical reference** for the GDSA engineering team and is intended to:

- Translate the seven high-level Functional Requirements (FR-01 through FR-07) into a concrete, implementable system design.
- Define the **backend service architecture** (Spring Boot 4.1 / Java 17, PostgreSQL, Flyway, JPA, WebSocket), the **frontend mobile application** (Expo SDK 54 / React Native 0.81 / expo-router 6), and the contracts that connect them.
- Capture the **state machines**, **data lifecycle rules**, and **role-based access invariants** that govern the order, permit, supply, and tracking flows.
- Provide a stable baseline against which code reviews, regression tests, and onboarding material can be anchored.

#### 1.1.2 Scope

**In Scope.** This SDD covers the complete delivery of the GDSA MVP, including:

1. **Five user roles** — Customer, Seller, Rider, Supplier, Administrator — each with its own registration, profile, dashboard, and verification flow.
2. **Authentication and verification** — BCrypt-hashed credentials, session-token issuance via `AuthFilter`, and an admin-gated permit workflow (seller / rider / supplier) backed by uploaded PDF and image documents and a generated QR-embedded licence PDF.
3. **Order lifecycle** — a fully enforced state machine (`pending → accepted → assigned → pickup_pending → picked_up → in_transit → delivered`; or `cancelled` / `rejected`) with role-segregated transitions on both client and server.
4. **Real-time delivery tracking** — a WebSocket channel (`/ws/tracking`) that streams rider GPS samples for order deliveries and supplier trip operations, plus REST bootstrap endpoints for first-paint markers.
5. **Inventory and pricing** — per-seller product CRUD with low/out-of-stock thresholds and auto stock updates on order completion.
6. **Seller→Supplier restock pipeline** — supply order state machine (`pending → accepted → preparing → dispatched → delivered → received`) with auto-replenishment on seller receipt.
7. **Supplier logistics** — recurring delivery routes, ordered seller stops, vehicles, crew assignment, and persisted delivery trips (`planned → ready → active → completed`) with snapshotted stops.
8. **Payment simulation** — `CASH / MPESA / CARD / BANK` methods with idempotent customer-initiated payment, auto-completion on delivery, and refund-on-cancel.
9. **Notification feed** — persistent in-app notifications scoped to the authenticated user.
10. **Admin oversight** — read surfaces for users, orders, products, payments, supply orders, deliveries, and a stats / reports aggregation endpoint.
11. **Cross-cutting concerns** — global exception handling, file storage abstraction, geocoding service, CORS configuration, and PDF / QR generation.

**Out of Scope.** The following items are **explicitly excluded** from this SDD and from the MVP delivery:

1. **Real money settlement.** Payments are a simulated flow that records `transaction_ref` codes; no integration with a live payment processor, mobile money operator, or banking API is included.
2. **Push-notification delivery infrastructure.** `expo-notifications` is declared as a dependency and local notification scheduling is supported, but server-side push fan-out is not in scope.
3. **Native mobile release pipelines.** The project ships an Expo development build (`expo start`) and a Vite web build (`vite build`); App Store / Play Store submission workflows are out of scope.
4. **Production-grade infrastructure automation.** Docker, Kubernetes, Terraform, CI/CD pipelines, secrets management, and observability stacks are not covered here.
5. **Multi-tenant or multi-region deployment.** The schema, configuration, and CORS policy assume a single deployment serving one geography.
6. **Advanced analytics, ML-based dispatch, or ETA prediction.** The proximity-ranked dispatch queue uses Haversine distance only.

#### 1.1.3 Audience

This document is written for:

- **Backend engineers** implementing controllers, services, JPA entities, and Flyway migrations.
- **Mobile / frontend engineers** implementing screens under `app/(customer)`, `app/seller`, `app/rider`, `app/(supplier)`, and `app/(admin)`, plus the API client and store layer.
- **QA engineers** designing regression coverage for the order, permit, supply, and tracking flows.
- **Project reviewers and stakeholders** verifying that the implementation matches the agreed scope.

#### 1.1.4 Document Conventions

- File references use markdown links rooted at the repository, e.g. [backend/pom.xml](backend/pom.xml).
- Wire formats follow the **lowercase JSON convention** documented in [Role.java](backend/src/main/java/com/project/gas_delivery/auth/enums/Role.java) and [OrderStatus.java](backend/src/main/java/com/project/gas_delivery/order/enums/OrderStatus.java): enum names are stored uppercase in the database but serialised lowercase on the wire.
- Functional Requirements are referenced by their canonical IDs (FR-01 … FR-07) as defined in the project overview.
- "MVP" refers to the full set of features listed under §1.1.2 *In Scope*.

### 1.2 Project Executive Summary

#### 1.2.1 Project Context

GDSA (Gas Delivery System Application) is a multi-role mobile platform designed to digitise the last-mile delivery of cooking gas. The system brings together four distinct operating actors — **Customers**, **Sellers**, **Riders**, and **Suppliers** — under the supervision of a **platform Administrator**. The application addresses fragmented, phone-call-driven ordering processes by replacing them with a verifiable, location-aware, end-to-end workflow covering ordering, fulfilment, payment, and restock.

#### 1.2.2 Management Perspective

From a delivery standpoint, GDSA is built around seven Functional Requirements (FR-01 … FR-07), each owned by a clear role and each backed by a dedicated backend module:

| FR  | Title                                       | Primary Roles                  | Backend Module                                  |
| --- | ------------------------------------------- | ------------------------------ | ----------------------------------------------- |
| FR-01 | Registration, authentication, verification | All roles (admin gates 3) | `auth`, `permit`, `admin` |
| FR-02 | Seller discovery via location / map         | Customer, Admin                | `seller`, `customer`                            |
| FR-03 | Order placement and lifecycle               | Customer, Seller, Rider        | `order`                                         |
| FR-04 | Live rider tracking and payment on arrival  | Customer, Rider, Seller        | `tracking`, `payment`                           |
| FR-05 | Seller inventory CRUD and stock alerts      | Seller, Admin                  | `product`, `seller`                             |
| FR-06 | Seller → Supplier restock flow              | Seller, Supplier, Admin        | `supplier`, `order` (`supply_orders`)           |
| FR-07 | Admin oversight and system notifications    | Admin, All roles               | `admin`, `notification`                         |

Every screen, endpoint, and database table maps to exactly one of these FRs — the cross-reference is the project's standing review heuristic (see *GDSA Project Overview* memory).

#### 1.2.3 Conceptual Framework

The conceptual system design was prepared under the following guiding principles:

1. **Role-based verification is non-negotiable.** Sellers, riders, and suppliers cannot perform role activities until the administrator approves their submitted documents. Customers face no such gate. This invariant is enforced both at the database level (e.g. `seller_permits.status = 'APPROVED'` is required for `/api/sellers` public visibility) and at the service level (e.g. `AdminGuard`, `ApprovedRiderGuard`, `ApprovedSupplierController`).
2. **Server is the source of truth for state machines.** The `OrderStatusTransitions` table in [OrderStatusTransitions.java](backend/src/main/java/com/project/gas_delivery/order/service/OrderStatusTransitions.java) mirrors the frontend's `ORDER_TRANSITIONS` table verbatim. Clients can hide illegal buttons; the server rejects illegal transitions with HTTP 4xx.
3. **Lifecycle snapshots over joins.** Order items, supply order line snapshots, and delivery trip stops are denormalised at write-time so that later edits to a catalogue or route cannot mutate historical records.
4. **Progressive enhancement.** The app runs as an Expo development build, a Vite web build, and an Android / iOS native shell through the same `expo-router` tree; the API client auto-discovers the reachable backend host and rebuilds the WebSocket URL accordingly.
5. **Operations before optimisation.** Indexes, partial unique indexes, and denormalisation are introduced only when the dominant filter requires them (e.g. the dispatch queue partial index on `orders(status='accepted' AND rider_id IS NULL)`).

#### 1.2.4 Deliverables Covered by this SDD

The subsequent sections describe:

- **System architecture** — backend layering, frontend app-router tree, build tooling, and runtime topology.
- **Role model and access control** — the five user roles, their dashboards, and the gates between them.
- **Data model** — every persisted table, its lifecycle columns, and its indexes.
- **State machines** — the legal transitions for orders, supply orders, permits, deliveries, and trips.
- **Module-by-module design** — controllers, services, repositories, and supporting utilities per backend package.
- **Frontend design** — navigation tree, store / service layering, and the API client contract.
- **Cross-cutting concerns** — security, error handling, file storage, geocoding, PDF / QR generation.
- **Operational concerns** — configuration, environment variables, and acceptance criteria.

#### 1.2.5 Status and Acceptance Baseline

The MVP is considered delivery-complete when:

- All seven FRs are reachable end-to-end through the Expo application.
- The backend's test suite passes (with documented known pre-existing failures as the baseline).
- A registered, unverified seller / rider / supplier cannot transact; an administrator can approve their documents and unlock the role.
- An order can traverse the full lifecycle (`pending → delivered`) with a real rider location stream, a recorded payment, and a customer-side map showing the rider.
- A seller can restock from a supplier and the supplier-side trip can be tracked live by sellers on the route.

#### 1.2.1 System Overview

This subsection describes GDSA in plain, non-technical terms before any of the implementation detail in the later sections. The goal is to give every reader — manager, reviewer, new engineer, or stakeholder — the same mental model of what the system does, who uses it, and how its moving parts fit together.

##### 1.2.1.1 Narrative Description

GDSA is a mobile-first service that lets a household customer order a cylinder of cooking gas from a nearby registered shop, watch a rider deliver it in real time on a map, and pay for it on arrival. Behind the customer-facing app there are three other groups of users who make the promise work:

- **Verified Sellers** post their inventory and prices, accept or decline incoming orders, hand the cylinder to a rider, and reorder stock from suppliers when their shelves run low.
- **Verified Riders** see a list of orders ready for pickup near them, claim one, drive to the seller, collect the cylinder, deliver it to the customer, and collect payment.
- **Verified Suppliers** keep the sellers supplied. They plan delivery routes, assign vehicles and crew, run the deliveries, and let sellers on the route watch their truck approach on a live map.

An **Administrator** sits above all four roles, reviewing the documents each new seller, rider, or supplier submits, and approving them before they can transact. The administrator also has a global view of every order, payment, supply movement, and user in the system.

The platform is designed so that **no seller, rider, or supplier can begin working until the administrator has approved their paperwork**. This single rule is the trust backbone of the marketplace — customers only ever see sellers and riders who have been cleared to operate.

##### 1.2.1.2 High-Level Architecture (Subsystem View)

The following diagram shows the major subsystems of GDSA and the relationships between them. Each block corresponds to a deployable concern, not a single file.

```
                ┌────────────────────────────────────────────────────────────┐
                │                  GDSA Mobile Application                 │
                │   (Expo · React Native · expo-router · react-native-maps)│
                └──────────────┬─────────────────────────────┬──────────────┘
                               │                             │
                          HTTPS │                      WSS   │
                  REST + JSON   │                  Tracking   │
                               ▼                             ▼
        ┌──────────────────────────────────────────────────────────────┐
        │                       GDSA Backend Service                    │
        │                 (Spring Boot 4.1 · Java 17 · JPA)             │
        │                                                              │
        │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐  │
        │  │   Auth &   │  │   Order    │  │  Tracking  │  │  Pay-  │  │
        │  │   Permit   │  │   Module   │  │  Channel   │  │  ments │  │
        │  └────────────┘  └────────────┘  └────────────┘  └────────┘  │
        │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────┐  │
        │  │  Seller /  │  │   Rider    │  │  Supplier  │  │  Admin │  │
        │  │  Products  │  │  Module    │  │  Module    │  │ Module │  │
        │  └────────────┘  └────────────┘  └────────────┘  └────────┘  │
        │  ┌──────────────────────────────────────────────────────────┐ │
        │  │          Shared Services: Geocoding, File Storage,      │ │
        │  │               PDF / QR Generation, Notifications         │ │
        │  └──────────────────────────────────────────────────────────┘ │
        └──────────────────────────────┬───────────────────────────────────┘
                                       │ JPA / Flyway
                                       ▼
                            ┌────────────────────────┐
                            │   PostgreSQL Database  │
                            │   (Schema V1 – V21)    │
                            └────────────────────────┘
```

The mobile application is the only client; the backend is a single Spring Boot service that fronts a single PostgreSQL database. There is no external system integration in the MVP — payment is simulated, push delivery is local, and geocoding is provided by an in-process abstraction that can be swapped for a real provider later.

##### 1.2.1.3 Context Diagram (System and Actors)

The context diagram below shows the system boundary (the dashed box) and every external actor that interacts with GDSA, including the interfaces they use.

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
   ┌──────────┐    │   ┌────────────────────────────────────┐     │    ┌──────────────┐
   │ Customer │ ───┼──▶│   Customer-facing screens          │     │◀───│  Map / GPS   │
   └──────────┘    │   │   (browse sellers, order, track)   │     │    │  (device)    │
                    │   └────────────────────────────────────┘     │    └──────────────┘
   ┌──────────┐    │   ┌────────────────────────────────────┐     │    ┌──────────────┐
   │  Seller  │ ───┼──▶│   Seller app (inventory, orders,  │     │◀───│   Document   │
   └──────────┘    │   │   permit, restock, live tracking)  │     │    │  Upload (PDF)│
                    │   └────────────────────────────────────┘     │    └──────────────┘
   ┌──────────┐    │   ┌────────────────────────────────────┐     │    ┌──────────────┐
   │  Rider   │ ───┼──▶│   Rider app (delivery queue,       │     │◀───│   Map / GPS  │
   └──────────┘    │   │   pickup, status updates, payments)│     │    │  (device)    │
                    │   └────────────────────────────────────┘     │    └──────────────┘
   ┌──────────┐    │   ┌────────────────────────────────────┐     │    ┌──────────────┐
   │ Supplier │ ───┼──▶│   Supplier app (routes, vehicles,  │     │    └──────────────┘
   └──────────┘    │   │   trips, supply orders, live ops)  │     │
                    │   └────────────────────────────────────┘     │    ┌──────────────┐
   ┌──────────┐    │   ┌────────────────────────────────────┐     │    │  PostgreSQL  │
   │  Admin   │ ───┼──▶│   Admin console (users, permits,  │─────┼───▶│  Database    │
   └──────────┘    │   │   reports, stats)                  │     │    └──────────────┘
                    │   └────────────────────────────────────┘     │
                    │                  GDSA Platform                │
                    └──────────────────────────────────────────────┘
```

The dashed boundary is the system under design. **All arrows inside the boundary are subsystems of GDSA**; arrows crossing the boundary are interactions with human actors or with platform devices (GPS, camera, file storage). There are **no third-party service integrations** in the MVP — every external dependency is a device capability on the user's phone.

##### 1.2.1.4 Requirements Allocation (RTM Cross-Reference)

The table below allocates each Functional Requirement to the subsystem(s) that deliver it. The RTM itself lives in the Functional Requirements Document (FRD); this table exists so that a reader of this SDD can confirm that every FR is owned and that nothing is double-allocated.

| FR    | Subsystem(s) Implementing the Requirement                                                | Primary User Journey Touched                              |
| ----- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| FR-01 | `auth`, `permit`, `admin`                                                                 | Registration → login → document upload → admin approval  |
| FR-02 | `seller`, `customer`, Geocoding service                                                  | Customer opens map → finds nearby sellers → views shop   |
| FR-03 | `order`, `seller`, `rider`                                                               | Order placement → acceptance → assignment → delivery      |
| FR-04 | `tracking`, `payment`, `order`                                                           | Live rider map → arrival → payment → completion          |
| FR-05 | `product`, `seller`, Notifications service                                               | Seller manages inventory → stock alerts fire             |
| FR-06 | `supplier`, `order` (supply orders), `seller`                                            | Seller raises restock → supplier fulfils → stock updated |
| FR-07 | `admin`, Notifications service                                                           | Admin reviews users / permits / orders; everyone notified |

A requirement may span multiple subsystems (for example FR-03 touches `order` for the lifecycle, `seller` for accept / reject, and `rider` for claim and delivery) but is **owned by exactly one subsystem** — the one that owns its persistence.

---
