/**
 * End-to-end test for the Order Flow, against the REAL Spring Boot backend.
 *
 * No mocks, no in-memory substitutes — every step hits a live HTTP endpoint
 * (POST /api/auth/register, POST /api/orders, etc.) and the row written to
 * PostgreSQL is re-read at each milestone so the test catches anything the
 * wire-level assertions would miss (stale Hibernate cache, flush-order
 * surprises, mismatched triggers).
 *
 * Run with:
 *   ORDER_E2E_BASE_URL=http://localhost:8080 node scripts/order-flow-e2e.js
 *
 * Env overrides (all optional):
 *   ORDER_E2E_BASE_URL — backend base URL (default http://localhost:8080)
 *   ORDER_E2E_PG_URL   — PostgreSQL URL for direct DB sanity checks.
 *                         Default: postgres://postgres:123456@localhost:5432/student_db1
 *
 * Exits 0 on success, 1 on any failed assertion.
 */
"use strict";

const { Client: PgClient } = (() => {
  // Lazy require so the test still runs (sans DB sanity checks) on
  // machines that don't have the `pg` driver installed.
  try {
    return { Client: require("pg").Client };
  } catch (e) {
    return { Client: null };
  }
})();

const BASE_URL = process.env.ORDER_E2E_BASE_URL || "http://localhost:8080";
const PG_URL =
  process.env.ORDER_E2E_PG_URL ||
  "postgres://postgres:123456@localhost:5432/student_db1";

/** PostgreSQL normalises VARCHAR status columns to upper-case; compare case-insensitively. */
const eqStatus = (a, b) => typeof a === "string" && typeof b === "string"
  && a.toUpperCase() === b.toUpperCase();

// ---- Tiny assert harness -----------------------------------------------

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

// ---- HTTP helpers ------------------------------------------------------

async function http(method, path, { token, body, expectStatus, includeRaw } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* keep as string */
  }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    const msg =
      (data && typeof data === "object" && "message" in data
        ? data.message
        : null) || `HTTP ${res.status}`;
    throw new Error(
      `Expected ${method} ${path} → ${expectStatus}, got ${res.status}: ${msg}`,
    );
  }
  return includeRaw ? { status: res.status, data, text } : { status: res.status, data };
}

/**
 * Call the endpoint, expect a non-2xx response, and assert status +
 * optional code. Returns the parsed response body so the test can
 * inspect additional fields if useful.
 */
async function expectFailure(method, path, opts, expectedStatus, expectedCode, label) {
  let result;
  try {
    result = await http(method, path, opts);
  } catch (e) {
    // Expected — request threw because status didn't match expectStatus.
    const m = e.message.match(/got (\d+): (.+)/);
    const code = m && m[2];
    let parsed;
    try {
      parsed = code ? JSON.parse(code) : null;
    } catch {
      parsed = null;
    }
    return assertHttpFailure(m && parseInt(m[1], 10), parsed && parsed.code, expectedStatus, expectedCode, label);
  }
  return assertHttpFailure(result.status, result.data && result.data.code, expectedStatus, expectedCode, label);
}

function assertHttpFailure(actualStatus, actualCode, expectedStatus, expectedCode, label) {
  assert(
    actualStatus === expectedStatus,
    `${label} → HTTP ${expectedStatus} (got ${actualStatus})`,
  );
  assert(
    expectedCode === undefined || actualCode === expectedCode,
    `${label} → code=${expectedCode} (got ${actualCode || "missing"})`,
  );
}

// ---- DB sanity check ---------------------------------------------------

async function dbRowById(id) {
  if (!PgClient) return null;
  const client = new PgClient({ connectionString: PG_URL });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT id, customer_id, seller_id, rider_id, status, updated_at
         FROM orders WHERE id = $1`,
      [id],
    );
    return r.rows[0] || null;
  } finally {
    await client.end();
  }
}

async function dbDispatchCount() {
  if (!PgClient) return null;
  const client = new PgClient({ connectionString: PG_URL });
  await client.connect();
  try {
    // Storage enum is uppercase; compare case-insensitively.
    const r = await client.query(
      `SELECT COUNT(*)::int AS n FROM orders
         WHERE UPPER(status) = 'ACCEPTED' AND rider_id IS NULL`,
    );
    return r.rows[0].n;
  } finally {
    await client.end();
  }
}

async function dbOrdersVisibleToRider(riderId) {
  if (!PgClient) return null;
  const client = new PgClient({ connectionString: PG_URL });
  await client.connect();
  try {
    const r = await client.query(
      `SELECT o.id::text AS id
         FROM orders o
        WHERE o.seller_id IN (
          SELECT sr.seller_id
            FROM seller_riders sr
           WHERE sr.rider_id = $1
        )
        ORDER BY o.updated_at DESC`,
      [riderId],
    );
    return { count: r.rows.length, ids: r.rows.map((row) => row.id) };
  } finally {
    await client.end();
  }
}

function printRiderOrderEvidence(stage, httpResult, dbResult) {
  const rows = Array.isArray(httpResult.data) ? httpResult.data : [];
  console.log(`[RIDER_ORDERS_PROOF][${stage}][EXACT_JSON] ${httpResult.text}`);
  console.log(
    `[RIDER_ORDERS_PROOF][${stage}][BACKEND] ${JSON.stringify({
      status: httpResult.status,
      count: rows.length,
      ids: rows.map((order) => order.id),
    })}`,
  );
  console.log(
    `[RIDER_ORDERS_PROOF][${stage}][DATABASE] ${JSON.stringify(dbResult)}`,
  );
}

// ---- Test run ----------------------------------------------------------

const STAMP = Date.now();

function seededOrderBody(customer, seller, note) {
  return {
    customerId: customer.user.id,
    customerName: customer.user.fullName,
    sellerId: seller.user.id,
    sellerName: seller.user.fullName,
    items: [
      {
        productId: "1",
        productName: "Oryx Gas",
        size: "6 kg",
        quantity: 1,
        unitPrice: 18000,
      },
    ],
    total: 18000,
    phone: customer.user.phone || "+255700000001",
    deliveryLocation: {
      address: "Rider order-retention proof, Dar es Salaam",
    },
    notes: note,
  };
}

async function runRiderOrderRetentionProof() {
  console.log(`Rider order-retention proof — backend at ${BASE_URL}`);

  const customer = (
    await http("POST", "/api/auth/login", {
      body: { identifier: "asha", password: "Password1!" },
      expectStatus: 200,
    })
  ).data;
  const seller = (
    await http("POST", "/api/auth/login", {
      body: { identifier: "gaspro", password: "Password1!" },
      expectStatus: 200,
    })
  ).data;
  const rider = (
    await http("POST", "/api/auth/login", {
      body: { identifier: "hassan", password: "Password1!" },
      expectStatus: 200,
    })
  ).data;

  const initial = await http("GET", "/api/orders", {
    token: rider.token,
    expectStatus: 200,
    includeRaw: true,
  });
  const initialRows = Array.isArray(initial.data) ? initial.data : [];
  const baselineNeeded = Math.max(0, 2 - initialRows.length);

  for (let i = 0; i < baselineNeeded; i++) {
    await http("POST", "/api/orders", {
      token: customer.token,
      expectStatus: 201,
      body: seededOrderBody(customer, seller, `retention baseline ${STAMP}-${i}`),
    });
  }

  const before = await http("GET", "/api/orders", {
    token: rider.token,
    expectStatus: 200,
    includeRaw: true,
  });
  const beforeDb = await dbOrdersVisibleToRider(rider.user.id);
  printRiderOrderEvidence("BEFORE_CREATE", before, beforeDb);

  const created = await http("POST", "/api/orders", {
    token: customer.token,
    expectStatus: 201,
    body: seededOrderBody(customer, seller, `retention target ${STAMP}`),
  });

  const after = await http("GET", "/api/orders", {
    token: rider.token,
    expectStatus: 200,
    includeRaw: true,
  });
  const afterDb = await dbOrdersVisibleToRider(rider.user.id);
  printRiderOrderEvidence("AFTER_CREATE", after, afterDb);

  const beforeRows = Array.isArray(before.data) ? before.data : [];
  const afterRows = Array.isArray(after.data) ? after.data : [];
  const beforeIds = beforeRows.map((order) => order.id);
  const afterIds = afterRows.map((order) => order.id);
  const missingIds = beforeIds.filter((id) => !afterIds.includes(id));

  assert(beforeRows.length >= 2, `proof starts with at least 2 rider-visible orders (got: ${beforeRows.length})`);
  assert(
    afterRows.length === beforeRows.length + 1,
    `GET /api/orders count increases by exactly 1 (${beforeRows.length} → ${afterRows.length})`,
  );
  assert(missingIds.length === 0, `all previous order ids remain present (missing: ${missingIds.join(",") || "none"})`);
  assert(afterIds.includes(created.data.id), `new order ${created.data.id} is present after create`);
  if (beforeDb && afterDb) {
    assert(beforeDb.count === beforeRows.length, `before DB count matches GET count (${beforeDb.count})`);
    assert(afterDb.count === afterRows.length, `after DB count matches GET count (${afterDb.count})`);
  }

  const accepted = await http("POST", `/api/orders/${created.data.id}/accept`, {
    token: seller.token,
    expectStatus: 200,
    body: {},
  });
  assert(accepted.data.status === "accepted", "target order is accepted for the rider Available tab");

  const afterAccept = await http("GET", "/api/orders", {
    token: rider.token,
    expectStatus: 200,
    includeRaw: true,
  });
  const afterAcceptDb = await dbOrdersVisibleToRider(rider.user.id);
  printRiderOrderEvidence("AFTER_ACCEPT", afterAccept, afterAcceptDb);
  const afterAcceptIds = afterAccept.data.map((order) => order.id);
  assert(
    beforeIds.every((id) => afterAcceptIds.includes(id)),
    "all previous order ids remain present after seller acceptance",
  );

  console.log("");
  if (failed > 0) {
    console.error(`FAILED: ${failed} of ${passed + failed} rider-retention assertions`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`PASSED: ${passed}/${passed + failed} rider-retention assertions.`);
}

async function main() {
  console.log(`Order Flow E2E — backend at ${BASE_URL}`);
  console.log(`DB driver available: ${PgClient ? "yes" : "no (skipping DB sanity checks)"}`);

  // ---- Seeded sellers / products / riders (V3 migration) ---------
  section("Seeded sellers / products / riders (V3 migration)");

  const sellers = (await http("GET", "/api/sellers")).data;
  assert(Array.isArray(sellers) && sellers.length >= 4,
    `GET /api/sellers returns ≥4 sellers (got: ${sellers.length})`);
  const gaspro = sellers.find((s) => s.businessName === "GasPro Supplies");
  assert(!!gaspro, "GasPro Supplies is in the seller list");
  assert(gaspro.sellerId === "2",
    `GasPro sellerId is "2" (got: ${gaspro && gaspro.sellerId})`);
  assert(gaspro.openNow === true, "GasPro is openNow");
  assert(Array.isArray(gaspro.availableSizes) && gaspro.availableSizes.includes("6 kg"),
    "GasPro availableSizes includes 6 kg");

  const products = (await http("GET", "/api/products")).data;
  assert(Array.isArray(products) && products.length >= 5,
    `GET /api/products returns ≥5 products (got: ${products.length})`);
  const sixKg = products.find(
    (p) => p.sellerId === "2" && p.size === "6 kg" && p.category === "refill",
  );
  assert(!!sixKg && sixKg.id === "1", "GasPro 6 kg refill is product id 1");
  assert(sixKg.stock > 0, "GasPro 6 kg refill has stock > 0");

  const productsForGaspro = (await http("GET", "/api/products?sellerId=2")).data;
  assert(productsForGaspro.every((p) => p.sellerId === "2"),
    "GET /api/products?sellerId=2 only returns GasPro's products");
  assert(productsForGaspro.length >= 5,
    `GasPro has ≥5 products (got: ${productsForGaspro.length})`);

  const riders = (await http("GET", "/api/riders")).data;
  assert(Array.isArray(riders) && riders.length >= 3,
    `GET /api/riders returns ≥3 riders (got: ${riders.length})`);
  const hassan = riders.find((r) => r.id === "11");
  assert(!!hassan, "Hassan Rider (id 11) is in the rider list");
  assert(hassan.vehicleType === "motorcycle", "Hassan's vehicle is motorcycle");
  assert(hassan.vehiclePlate === "T 100 ABC", "Hassan's vehicle plate is T 100 ABC");
  assert(hassan.available === true, "Hassan is available");

  const gasproRiders = (await http("GET", "/api/sellers/2/riders")).data;
  assert(gasproRiders.length >= 2,
    `GasPro has ≥2 assigned riders (got: ${gasproRiders.length})`);
  assert(gasproRiders.some((r) => r.id === "11"),
    "Hassan is in GasPro's rider team");

  // ---- Register the actors ------------------------------------
  section("Register customer + seller + 2 riders + intruder");

  const customer = (
    await http("POST", "/api/auth/register", {
      body: {
        fullName: "E2E Customer",
        username: `e2ecust_${STAMP}`,
        email: `e2ecust_${STAMP}@example.com`,
        phone: "+255700000001",
        password: "Password1!",
        role: "CUSTOMER",
      },
    })
  ).data;
  assert(typeof customer.user.id === "string", "customer has string id");
  assert(typeof customer.token === "string" && customer.token.startsWith("tok_"),
    "customer token is opaque (tok_*)");

  const seller = (
    await http("POST", "/api/auth/register", {
      body: {
        fullName: "E2E Seller",
        username: `e2esell_${STAMP}`,
        email: `e2esell_${STAMP}@example.com`,
        phone: "+255700000002",
        password: "Password1!",
        role: "SELLER",
      },
    })
  ).data;

  const riderA = (
    await http("POST", "/api/auth/register", {
      body: {
        fullName: "E2E Rider A",
        username: `e2era_${STAMP}`,
        email: `e2era_${STAMP}@example.com`,
        phone: "+255700000003",
        password: "Password1!",
        role: "RIDER",
      },
    })
  ).data;

  const riderB = (
    await http("POST", "/api/auth/register", {
      body: {
        fullName: "E2E Rider B",
        username: `e2erb_${STAMP}`,
        email: `e2erb_${STAMP}@example.com`,
        phone: "+255700000004",
        password: "Password1!",
        role: "RIDER",
      },
    })
  ).data;

  const intruder = (
    await http("POST", "/api/auth/register", {
      body: {
        fullName: "E2E Intruder",
        username: `e2ein_${STAMP}`,
        email: `e2ein_${STAMP}@example.com`,
        phone: "+255700000005",
        password: "Password1!",
        role: "CUSTOMER",
      },
    })
  ).data;

  // ---- Place the first order (the one we'll walk through) ---------
  section("Place first order (POST /api/orders)");

  const firstOrder = await http("POST", "/api/orders", {
    token: customer.token,
    body: {
      customerId: customer.user.id,
      customerName: customer.user.fullName,
      sellerId: seller.user.id,
      sellerName: seller.user.fullName,
      items: [
        {
          productId: "p1",
          productName: "Oryx Gas",
          size: "6 kg",
          quantity: 1,
          unitPrice: 18000,
        },
      ],
      total: 18000,
      phone: "+255700000001",
      deliveryLocation: { address: "1 Main St", lat: -1.286, lng: 36.817 },
      notes: "E2E test order",
    },
  });
  assert(firstOrder.status === 201, "POST /api/orders → 201 Created");
  assert(firstOrder.data.status === "pending", "new order is pending");
  assert(typeof firstOrder.data.id === "string",
    `order id is string (got: ${firstOrder.data.id})`);
  assert(firstOrder.data.items.length === 1, "items round-tripped");
  assert(firstOrder.data.deliveryLocation.address === "1 Main St",
    "delivery address round-tripped");
  const orderId = firstOrder.data.id;

  if (PgClient) {
    const row = await dbRowById(orderId);
    assert(row && eqStatus(row.status, "pending"),
      `DB row matches: status='pending' (got: ${row && row.status})`);
  }

  // ---- Negative path: wrong customer cancels a PENDING order -----
  section("Negative — intruder cancels a PENDING order (NOT_AUTHORIZED)");

  await expectFailure(
    "POST",
    `/api/orders/${orderId}/cancel`,
    { token: intruder.token, body: { reason: "malicious" } },
    403,
    "NOT_AUTHORIZED",
    "intruder customer cannot cancel another customer's pending order",
  );

  // ---- Negative path: a seller tries to create an order ----------
  section("Negative — seller tries to create an order (NOT_AUTHORIZED)");

  await expectFailure(
    "POST",
    "/api/orders",
    {
      token: seller.token,
      body: {
        customerId: customer.user.id,
        customerName: customer.user.fullName,
        sellerId: seller.user.id,
        sellerName: seller.user.fullName,
        items: [
          { productId: "p1", productName: "Oryx Gas", size: "6 kg", quantity: 1, unitPrice: 18000 },
        ],
        total: 18000,
        phone: "+255700000001",
        deliveryLocation: { address: "1 Main St" },
      },
    },
    403,
    "NOT_AUTHORIZED",
    "seller cannot create an order (must be a customer)",
  );

  // ---- Seller accepts ---------------------------------------------
  section("Seller accepts (POST /api/orders/{id}/accept)");

  const acceptRes = await http("POST", `/api/orders/${orderId}/accept`, {
    token: seller.token,
    body: {},
  });
  assert(acceptRes.data.status === "accepted",
    `order is accepted (got: ${acceptRes.data.status})`);

  if (PgClient) {
    const row = await dbRowById(orderId);
    assert(row && eqStatus(row.status, "accepted"),
      `DB row matches: status='accepted' (got: ${row && row.status})`);
  }

  // ---- Negative path: seller rejecting an already-accepted order -
  section("Negative — reject after accept (INVALID_TRANSITION)");

  await expectFailure(
    "POST",
    `/api/orders/${orderId}/reject`,
    { token: seller.token, body: { reason: "too late" } },
    409,
    "INVALID_TRANSITION",
    "seller cannot reject after accepting",
  );

  // ---- Dispatch queue visible -------------------------------------
  section("Dispatch queue (GET /api/orders/dispatch/available)");

  const queue = await http("GET", "/api/orders/dispatch/available");
  assert(queue.status === 200, "queue returns 200");
  assert(Array.isArray(queue.data), "queue is an array");
  assert(
    queue.data.some((o) => o.id === orderId && !o.riderId),
    "the accepted order appears in the dispatch queue",
  );

  if (PgClient) {
    const n = await dbDispatchCount();
    assert(n >= 1, `DB: dispatch queue has ≥1 row (got: ${n})`);
  }

  // ---- Dispatch queue narrowed by rider↔seller assignment ---------
  // The seeded rider "Hassan" (id 11) is assigned to sellers 2, 3, and 5
  // but NOT 4 or 6. The accepted order above is from the dynamically
  // registered `seller` (id > 16), which Hassan is NOT assigned to —
  // so Hassan's queue must NOT contain it.
  section("Dispatch queue — narrowed by seller_riders assignment");

  const hassanLogin = (
    await http("POST", "/api/auth/login", {
      body: { identifier: "hassan", password: "Password1!" },
    })
  ).data;
  const hassanQueue = (
    await http("GET", "/api/orders/dispatch/available", {
      token: hassanLogin.token,
    })
  ).data;
  assert(Array.isArray(hassanQueue), "Hassan's queue is an array");
  assert(
    !hassanQueue.some((o) => o.id === orderId),
    `Hassan does NOT see the unregistered-seller's order (queue len: ${hassanQueue.length})`,
  );

  // ---- Rider A claims (atomic) ------------------------------------
  section("Rider A claims (POST /api/orders/{id}/claim)");

  const claimRes = await http("POST", `/api/orders/${orderId}/claim`, {
    token: riderA.token,
    body: { riderId: riderA.user.id, riderName: riderA.user.fullName },
  });
  assert(claimRes.data.status === "assigned",
    `order is assigned (got: ${claimRes.data.status})`);
  assert(claimRes.data.riderId === riderA.user.id,
    `riderId matches Rider A (got: ${claimRes.data.riderId})`);

  if (PgClient) {
    const row = await dbRowById(orderId);
    assert(row && row.rider_id != null && row.rider_id.toString() === riderA.user.id,
      "DB: rider_id set to Rider A");
  }

  // ---- Negative path: Rider B claims the same order ---------------
  section("Negative — Rider B claims the same order (RIDER_BUSY)");

  await expectFailure(
    "POST",
    `/api/orders/${orderId}/claim`,
    {
      token: riderB.token,
      body: { riderId: riderB.user.id, riderName: riderB.user.fullName },
    },
    409,
    "RIDER_BUSY",
    "second rider claim is rejected (RIDER_BUSY)",
  );

  // ---- Negative path: Rider B tries to advance ------------------
  section("Negative — Rider B advances an order assigned to Rider A");

  await expectFailure(
    "PATCH",
    `/api/orders/${orderId}/status`,
    {
      token: riderB.token,
      body: { status: "picked_up" },
    },
    403,
    "NOT_AUTHORIZED",
    "rider B cannot advance an order assigned to rider A",
  );

  // ---- Rider advances through delivery ---------------------------
  section("Rider A advances delivery (PATCH /api/orders/{id}/status)");

  for (const step of ["picked_up", "in_transit", "delivered"]) {
    const r = await http("PATCH", `/api/orders/${orderId}/status`, {
      token: riderA.token,
      body: { status: step },
    });
    assert(r.data.status === step,
      `rider A advanced order → ${step} (got: ${r.data.status})`);
    if (PgClient) {
      const row = await dbRowById(orderId);
      assert(row && eqStatus(row.status, step),
        `DB: row status updated to ${step}`);
    }
  }

  // ---- Negative path: try to advance a delivered order ------------
  section("Negative — advance a delivered (terminal) order");

  await expectFailure(
    "PATCH",
    `/api/orders/${orderId}/status`,
    { token: riderA.token, body: { status: "delivered" } },
    409,
    "INVALID_TRANSITION",
    "delivered → delivered is illegal",
  );

  // ---- List orders from each perspective --------------------------
  section("List orders from each role's perspective (GET /api/orders)");

  const customerList = await http("GET", "/api/orders", {
    token: customer.token,
  });
  assert(
    Array.isArray(customerList.data) &&
      customerList.data.some((o) => o.id === orderId),
    "customer sees the order in their list",
  );

  const sellerList = await http("GET", "/api/orders", {
    token: seller.token,
  });
  assert(
    Array.isArray(sellerList.data) &&
      sellerList.data.some((o) => o.id === orderId),
    "seller sees the order in their list",
  );

  const riderList = await http("GET", `/api/orders?riderId=${riderA.user.id}`, {
    token: riderA.token,
  });
  assert(
    Array.isArray(riderList.data) &&
      riderList.data.some((o) => o.id === orderId),
    `rider A sees the order in their ?riderId=${riderA.user.id} list`,
  );

  // ---- Dispatch queue no longer contains the delivered order ------
  const queueAfter = await http("GET", "/api/orders/dispatch/available");
  assert(
    !queueAfter.data.some((o) => o.id === orderId),
    "the delivered order no longer appears in the dispatch queue",
  );

  // ---- Cancel a second order through the legitimate path ---------
  section("Customer cancels a fresh PENDING order (legitimate path)");

  const cancelOrder = await http("POST", "/api/orders", {
    token: customer.token,
    body: {
      customerId: customer.user.id,
      customerName: customer.user.fullName,
      sellerId: seller.user.id,
      sellerName: seller.user.fullName,
      items: [
        { productId: "p1", productName: "Oryx Gas", size: "6 kg", quantity: 1, unitPrice: 18000 },
      ],
      total: 18000,
      phone: "+255700000001",
      deliveryLocation: { address: "1 Main St" },
    },
  });
  assert(cancelOrder.data.status === "pending", "second order is pending");

  const cancelRes = await http("POST", `/api/orders/${cancelOrder.data.id}/cancel`, {
    token: customer.token,
    body: { reason: "changed my mind" },
  });
  assert(cancelRes.data.status === "cancelled",
    `order is cancelled (got: ${cancelRes.data.status})`);
  assert(cancelRes.data.rejectReason === "changed my mind",
    "reason persisted on the cancelled order");

  // ---- Reject a third order through the legitimate path ----------
  section("Seller rejects a fresh PENDING order (legitimate path)");

  const rejectOrder = await http("POST", "/api/orders", {
    token: customer.token,
    body: {
      customerId: customer.user.id,
      customerName: customer.user.fullName,
      sellerId: seller.user.id,
      sellerName: seller.user.fullName,
      items: [
        { productId: "p1", productName: "Oryx Gas", size: "6 kg", quantity: 1, unitPrice: 18000 },
      ],
      total: 18000,
      phone: "+255700000001",
      deliveryLocation: { address: "1 Main St" },
    },
  });

  const rejectRes = await http("POST", `/api/orders/${rejectOrder.data.id}/reject`, {
    token: seller.token,
    body: { reason: "Out of stock" },
  });
  assert(rejectRes.data.status === "rejected",
    `order is rejected (got: ${rejectRes.data.status})`);
  assert(rejectRes.data.rejectReason === "Out of stock",
    "reason persisted on the rejected order");

  // ---- End-to-end against SEEDED sellers / riders ------------------
  // Customer places an order with GasPro Supplies (seeded id 2). The
  // seller logs in as "gaspro" and accepts. Hassan (seeded rider id 11)
  // is assigned to GasPro so his dispatch queue contains it; he claims
  // and walks it to delivered.
  section("End-to-end against seeded sellers + riders");

  const gasproLogin = (
    await http("POST", "/api/auth/login", {
      body: { identifier: "gaspro", password: "Password1!" },
    })
  ).data;
  assert(gasproLogin.user.id === "2",
    `gaspro login → id "2" (got: ${gasproLogin.user.id})`);

  const hassanRiderLogin = (
    await http("POST", "/api/auth/login", {
      body: { identifier: "hassan", password: "Password1!" },
    })
  ).data;
  assert(hassanRiderLogin.user.id === "11",
    `hassan login → id "11" (got: ${hassanRiderLogin.user.id})`);

  const seedOrder = await http("POST", "/api/orders", {
    token: customer.token,
    body: {
      customerId: customer.user.id,
      customerName: customer.user.fullName,
      sellerId: "2",
      sellerName: gasproLogin.user.fullName,
      items: [
        { productId: "1", productName: "Oryx Gas", size: "6 kg", quantity: 1, unitPrice: 18000 },
      ],
      total: 18000,
      phone: "+255700000001",
      deliveryLocation: { address: "Plot 12, Mikocheni B, Dar es Salaam" },
    },
  });
  assert(seedOrder.data.status === "pending", "seeded-seller order is pending");
  const seedOrderId = seedOrder.data.id;

  const seededAccept = await http("POST", `/api/orders/${seedOrderId}/accept`, {
    token: gasproLogin.token,
    body: {},
  });
  assert(seededAccept.data.status === "accepted",
    `GasPro accepts the order (got: ${seededAccept.data.status})`);
  assert(seededAccept.data.sellerId === "2",
    `sellerId on response is "2" (got: ${seededAccept.data.sellerId})`);

  // Hassan's queue SHOULD now contain this order (he's assigned to seller 2).
  const hassanQueueAfterSeed = (
    await http("GET", "/api/orders/dispatch/available", {
      token: hassanRiderLogin.token,
    })
  ).data;
  assert(
    hassanQueueAfterSeed.some((o) => o.id === seedOrderId),
    "Hassan's dispatch queue contains the GasPro order (he's assigned)",
  );

  const hassanClaim = await http("POST", `/api/orders/${seedOrderId}/claim`, {
    token: hassanRiderLogin.token,
    body: { riderId: "11", riderName: "Hassan Rider" },
  });
  assert(hassanClaim.data.status === "assigned",
    `Hassan claims GasPro order → assigned (got: ${hassanClaim.data.status})`);
  assert(hassanClaim.data.riderId === "11",
    `riderId is "11" (got: ${hassanClaim.data.riderId})`);

  for (const step of ["picked_up", "in_transit", "delivered"]) {
    const r = await http("PATCH", `/api/orders/${seedOrderId}/status`, {
      token: hassanRiderLogin.token,
      body: { status: step },
    });
    assert(r.data.status === step,
      `Hassan advanced seeded order → ${step} (got: ${r.data.status})`);
  }

  // ---- Summary ---------------------------------------------------
  console.log("");
  if (failed > 0) {
    console.error(`FAILED: ${failed} of ${passed + failed} assertions`);
    console.error("Failures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `PASSED: ${passed}/${passed + failed} assertions — full Order Flow exercised end-to-end.`,
  );
}

if (process.env.ORDER_E2E_RIDER_RETENTION_ONLY === "1") {
  runRiderOrderRetentionProof().catch((err) => {
    console.error("Rider order-retention proof threw:");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error("E2E test threw:");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}
