/**
 * Smoke tests for the Order Flow state machine.
 *
 * Runs without a test framework — exits with code 1 on any failed
 * assertion, 0 on success. Run with:
 *
 *   node scripts/order-flow-smoke.js
 *
 * or after building the service layer with `tsc`:
 *
 *   tsc --outDir /tmp/build --rootDir . \
 *     constants/order.ts src/services/*.ts
 *   node -e "require('/tmp/build/scripts/order-flow-smoke.js')"
 *
 * The build script in package.json handles both steps.
 */
"use strict";

const path = require("path");

// ---- Resolve the built modules ----------------------------------------
const BUILD_DIR = process.env.ORDER_FLOW_BUILD_DIR ||
  path.join(__dirname, "..", ".build");

const constants = require(path.join(BUILD_DIR, "constants", "order.js"));
const { orderService } = require(path.join(BUILD_DIR, "src", "services", "OrderService.js"));
const {
  OrderServiceError,
} = require(path.join(BUILD_DIR, "src", "services", "orderErrors.js"));

// ---- Tiny assertion harness -------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

async function expectThrows(fn, code, label) {
  try {
    await fn();
    assert(false, `${label} (expected throw ${code})`);
  } catch (err) {
    assert(err instanceof OrderServiceError && err.code === code,
      `${label} (threw ${err && err.code})`);
  }
}

// ---- Fixture orders ---------------------------------------------------

const NOW = "2026-07-17T10:00:00.000Z";

const seller = {
  id: "u-s1",
  role: "seller",
  fullName: "Acme Gas",
  username: "acme",
  email: "acme@x.com",
  phone: "+255712000001",
  createdAt: NOW,
};

const customer = {
  id: "u-c1",
  role: "customer",
  fullName: "Jane Doe",
  username: "jane",
  email: "jane@x.com",
  phone: "+255712000002",
  createdAt: NOW,
};

const rider = {
  id: "u-r1",
  role: "rider",
  fullName: "Rider One",
  username: "r1",
  email: "r1@x.com",
  phone: "+255712000003",
  createdAt: NOW,
};

const otherSeller = { ...seller, id: "u-s2", fullName: "Other Seller" };

function makeOrder(overrides = {}) {
  return {
    id: "o-1",
    customerId: customer.id,
    customerName: customer.fullName,
    sellerId: seller.id,
    sellerName: seller.fullName,
    items: [{ productId: "p1", productName: "Oryx Gas", size: "6 kg", quantity: 1, unitPrice: 18000 }],
    total: 18000,
    phone: customer.phone,
    deliveryLocation: { address: "1 Main St" },
    status: "pending",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// ---- Tests ------------------------------------------------------------

(async () => {
  // -- Constants table sanity --
  section("[constants] transition table");
  assert(typeof constants.orderStatusLabel === "function", "orderStatusLabel is a function");
  assert(typeof constants.canTransition === "function", "canTransition is a function");
  assert(constants.orderStatusLabel("in_transit") === "On the Way",
    `in_transit label is "On the Way" (got: "${constants.orderStatusLabel("in_transit")}")`);
  assert(constants.orderStatusLabel("accepted") === "Accepted",
    "accepted label is 'Accepted'");
  assert(constants.orderStatusLabel("rejected") === "Rejected",
    "rejected label is 'Rejected'");
  assert(constants.canTransition("seller", "pending", "accepted"),
    "seller can PENDING → ACCEPTED");
  assert(!constants.canTransition("customer", "pending", "accepted"),
    "customer cannot PENDING → ACCEPTED");
  assert(constants.canTransition("customer", "pending", "cancelled"),
    "customer can PENDING → CANCELLED");
  assert(!constants.canTransition("seller", "pending", "cancelled"),
    "seller cannot PENDING → CANCELLED");
  assert(!constants.canTransition("rider", "accepted", "delivered"),
    "rider cannot ACCEPTED → DELIVERED (must go through ASSIGNED → PICKED_UP → IN_TRANSIT)");
  assert(!constants.canTransition("customer", "delivered", "cancelled"),
    "customer cannot DELIVERED → CANCELLED (terminal)");

  // -- OrderService pure rules --
  section("[OrderService] transition guards");

  // Customer attempting to accept an order: their own order, but the
  // role/transition matrix doesn't permit `customer → accept`. The
  // guard returns INVALID_TRANSITION (most precise error).
  await expectThrows(
    () => orderService.accept({ actor: customer }, makeOrder()),
    "INVALID_TRANSITION",
    "customer acceptOrder is rejected by transition guard",
  );

  // Seller cannot advance to picked_up directly.
  await expectThrows(
    () => orderService.advance({ actor: seller }, makeOrder(), "picked_up"),
    "INVALID_TRANSITION",
    "PENDING → picked_up is illegal",
  );

  // Rider cannot reject (wrong role + wrong transition both apply; we
  // surface NOT_AUTHORIZED first because the rider doesn't own this
  // order yet, so the ownership rule fires before the transition rule).
  await expectThrows(
    () => orderService.reject({ actor: rider }, makeOrder({ status: "pending" })),
    "NOT_AUTHORIZED",
    "rider is rejected from rejectOrder",
  );

  // Cross-seller guard.
  await expectThrows(
    () => orderService.accept({ actor: otherSeller }, makeOrder()),
    "NOT_AUTHORIZED",
    "other seller can't accept someone else's order",
  );

  // Terminal states are dead-ends.
  await expectThrows(
    () => orderService.advance(
      { actor: rider },
      makeOrder({ status: "delivered", riderId: rider.id }),
      "delivered",
    ),
    "INVALID_TRANSITION",
    "delivered → delivered is invalid (terminal)",
  );

  await expectThrows(
    () => orderService.cancel(
      { actor: customer },
      makeOrder({ status: "accepted" }),
    ),
    "INVALID_TRANSITION",
    "cannot cancel an accepted order",
  );

  // -- Happy-path timeline --
  section("[OrderService] happy-path timeline (mock repo)");
  // The default httpOrderRepository is wired to the live API; instead of
  // stubbing it here we just verify that the validation/transition layer
  // produces the expected errors BEFORE the network call, which is what
  // we actually want to assert at the unit level. The store layer is
  // covered by the mock-branch tests in the Expo runtime.

  // pending → accepted by seller: only check that the guard accepts it
  // (we're not hitting the network here).
  const orderP = makeOrder();
  try {
    // Will throw ApiError because the repo hits the network; we just
    // need to confirm the guard didn't throw first.
    await orderService.accept({ actor: seller }, orderP);
    assert(false, "accept should fail without network — should have thrown ApiError");
  } catch (err) {
    if (err instanceof OrderServiceError) {
      assert(false, `guard incorrectly rejected accept: ${err.code}`);
    } else {
      // ApiError or fetch error — that's the network layer firing,
      // which means the guard passed. This is what we want.
      assert(true, "accept guard passed; failure is the network layer (expected)");
    }
  }

  // -- Summary --
  console.log("");
  if (failed > 0) {
    console.error(`FAILED: ${failed} of ${passed + failed} assertions`);
    console.error("Failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`PASSED: ${passed}/${passed + failed} assertions`);
})();
