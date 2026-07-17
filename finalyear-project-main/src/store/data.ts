/**
 * Mock data store. Pre-seeds the app with realistic data so all role
 * dashboards, orders, inventory, and reports are immediately usable.
 * In production, this layer is replaced by API calls to the Spring Boot
 * backend (see constants/types.ts for the request/response shapes).
 */

import {
  EmergencyContact,
  GasProduct,
  Order,
  SellerProfile,
  PermitApplication,
  RestockRequest,
  NotificationItem,
  Complaint,
  User,
  DeliveryRoute,
  Vehicle,
  Rider,
  DeliveryTrip,
  LatLng,
} from "../../constants/types";

export const seedUsers: User[] = [
  {
    id: "u-cust-1",
    fullName: "Asha Mwakanyemba",
    username: "asha",
    email: "asha@example.com",
    phone: "+255700000001",
    role: "customer",
    createdAt: "2026-01-04T10:00:00Z",
  },
  {
    id: "u-sell-1",
    fullName: "John Gas Seller",
    username: "gaspro",
    email: "seller@example.com",
    phone: "+255700000002",
    role: "seller",
    createdAt: "2026-01-05T10:00:00Z",
  },
  // Additional sellers distributed across the supplier's routes so the
  // logistics dashboard has real users to address notifications to. They
  // share the same demo password ("1234") via the StoreContext's
  // `credentials` bootstrap.
  {
    id: "u-sell-2",
    fullName: "Maria Mwendapole",
    username: "mariag",
    email: "maria@example.com",
    phone: "+255711222333",
    role: "seller",
    createdAt: "2026-02-05T10:00:00Z",
  },
  {
    id: "u-sell-3",
    fullName: "Hassan Juma",
    username: "hassanj",
    email: "hassan.j@example.com",
    phone: "+255713333444",
    role: "seller",
    createdAt: "2026-02-12T10:00:00Z",
  },
  {
    id: "u-sell-4",
    fullName: "Fatma Said",
    username: "fatmas",
    email: "fatma@example.com",
    phone: "+255715555666",
    role: "seller",
    createdAt: "2026-02-20T10:00:00Z",
  },
  {
    id: "u-sell-5",
    fullName: "Omar Bakari",
    username: "omar",
    email: "omar@example.com",
    phone: "+255717777888",
    role: "seller",
    createdAt: "2026-03-02T10:00:00Z",
  },
  {
    id: "u-sell-6",
    fullName: "Zainab Ali",
    username: "zainab",
    email: "zainab@example.com",
    phone: "+255719999000",
    role: "seller",
    createdAt: "2026-03-09T10:00:00Z",
  },
  {
    id: "u-sell-7",
    fullName: "Salim Khamis",
    username: "salim",
    email: "salim@example.com",
    phone: "+255720111222",
    role: "seller",
    createdAt: "2026-03-15T10:00:00Z",
  },
  {
    id: "u-sell-8",
    fullName: "Rehema Hassan",
    username: "rehema",
    email: "rehema@example.com",
    phone: "+255722333444",
    role: "seller",
    createdAt: "2026-04-01T10:00:00Z",
  },
  {
    id: "u-supp-1",
    fullName: "Msaidi Suppliers Ltd",
    username: "msaidi",
    email: "supplier@example.com",
    phone: "+255700000003",
    role: "supplier",
    createdAt: "2026-01-06T10:00:00Z",
  },
  {
    id: "u-ride-1",
    fullName: "Hassan Rider",
    username: "hassan",
    email: "rider@example.com",
    phone: "+255700000004",
    role: "rider",
    createdAt: "2026-01-07T10:00:00Z",
  },
  {
    id: "u-adm-1",
    fullName: "System Admin",
    username: "admin",
    email: "admin@example.com",
    phone: "+255700000005",
    role: "admin",
    createdAt: "2026-01-01T10:00:00Z",
  },
];



export const seedProducts: GasProduct[] = [
  {
    id: "p-1",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    name: "LPG Cylinder Refill",
    size: "6kg",
    price: 18000,
    stock: 42,
    image: "🔥",
    description: "Standard 6kg cooking gas refill, certified and safety tested.",
    category: "refill",
  },
  {
    id: "p-2",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    name: "LPG Cylinder Refill",
    size: "13kg",
    price: 32000,
    stock: 28,
    image: "🔥",
    description: "Family-size 13kg cooking gas refill.",
    category: "refill",
  },
  {
    id: "p-3",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    name: "LPG Cylinder Refill",
    size: "22kg",
    price: 54000,
    stock: 15,
    image: "🔥",
    description: "Commercial 22kg cooking gas refill.",
    category: "refill",
  },
  {
    id: "p-4",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    name: "New Cylinder (empty)",
    size: "13kg",
    price: 75000,
    stock: 8,
    image: "🛢️",
    description: "Brand new 13kg empty cylinder with valve.",
    category: "new_cylinder",
  },
  {
    id: "p-5",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    name: "Gas Regulator",
    size: "Standard",
    price: 8500,
    stock: 30,
    image: "⚙️",
    description: "Compatible pressure regulator with hose.",
    category: "accessory",
  },
];



export const seedOrders: Order[] = [
  {
    id: "o-1001",
    customerId: "u-cust-1",
    customerName: "Asha Mwakanyemba",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    riderId: "u-ride-1",
    riderName: "Hassan Rider",
    items: [
      {
        productId: "p-2",
        productName: "LPG Cylinder Refill",
        size: "13kg",
        quantity: 1,
        unitPrice: 32000,
      },
    ],
    total: 32000,
    status: "in_transit",
    createdAt: "2026-06-21T08:30:00Z",
    updatedAt: "2026-06-22T07:10:00Z",
    deliveryLocation: {
      address: "Plot 12, Mikocheni B, Dar es Salaam",
    },
    notes: "Please call on arrival.",
  },
  {
    id: "o-1002",
    customerId: "u-cust-1",
    customerName: "Asha Mwakanyemba",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    items: [
      {
        productId: "p-1",
        productName: "LPG Cylinder Refill",
        size: "6kg",
        quantity: 2,
        unitPrice: 18000,
      },
    ],
    total: 36000,
    status: "delivered",
    createdAt: "2026-06-15T10:00:00Z",
    updatedAt: "2026-06-15T15:00:00Z",
    deliveryLocation: {
      address: "Plot 12, Mikocheni B, Dar es Salaam",
    },
  },
  {
    id: "o-1003",
    customerId: "u-cust-1",
    customerName: "Asha Mwakanyemba",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    items: [
      {
        productId: "p-3",
        productName: "LPG Cylinder Refill",
        size: "22kg",
        quantity: 1,
        unitPrice: 54000,
      },
    ],
    total: 54000,
    status: "pending",
    createdAt: "2026-06-22T09:15:00Z",
    updatedAt: "2026-06-22T09:15:00Z",
    deliveryLocation: {
      address: "Plot 12, Mikocheni B, Dar es Salaam",
    },
  },
];



export const seedRestockRequests: RestockRequest[] = [
  // --- Awaiting supplier action (pending) ---
  {
    id: "r-501",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "22kg",
    quantity: 30,
    status: "pending",
    createdAt: "2026-07-06T07:00:00Z",
  },
  {
    id: "r-502",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "13kg",
    quantity: 20,
    status: "pending",
    createdAt: "2026-07-06T08:30:00Z",
  },
  // --- Ready to dispatch (approved) ---
  {
    id: "r-503",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "6kg",
    quantity: 40,
    status: "approved",
    createdAt: "2026-07-05T09:15:00Z",
  },
  // --- On the road (in_transit) ---
  {
    id: "r-504",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "13kg",
    quantity: 50,
    status: "in_transit",
    createdAt: "2026-07-04T08:00:00Z",
  },
  {
    id: "r-505",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "22kg",
    quantity: 25,
    status: "in_transit",
    createdAt: "2026-07-05T11:00:00Z",
  },
  // --- Delivered history ---
  {
    id: "r-506",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "13kg",
    quantity: 60,
    status: "delivered",
    createdAt: "2026-07-01T07:30:00Z",
  },
  {
    id: "r-507",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "6kg",
    quantity: 35,
    status: "delivered",
    createdAt: "2026-06-28T09:00:00Z",
  },
  // --- Rejected (so the History view shows a danger-tone pill) ---
  {
    id: "r-508",
    sellerId: "u-sell-1",
    sellerName: "GasPro Supplies",
    supplierId: "u-supp-1",
    supplierName: "Msaidi Suppliers Ltd",
    productName: "LPG Cylinder Refill",
    size: "22kg",
    quantity: 100,
    status: "rejected",
    createdAt: "2026-06-25T10:00:00Z",
  },
];



export const seedPermits: PermitApplication[] = [
  {
    id: "pm-1",
    sellerId: "u-sell-1",
    sellerName: "John Gas Seller",
    businessName: "GasPro Supplies",
    businessAddress: "Kariakoo Market, Block D, Dar es Salaam",
    businessType: "Retail",
    registrationNumber: "BRELA-2024-9981",
    documents: ["business_license.pdf", "tin_certificate.pdf", "id_copy.pdf"],
    status: "pending",
    submittedAt: "2026-06-10T10:00:00Z",
  },
];



export const seedNotifications: NotificationItem[] = [
  {
    id: "n-1",
    userId: "u-cust-1",
    title: "Order in transit",
    message: "Your order #1001 is on the way.",
    type: "delivery",
    read: false,
    createdAt: "2026-06-22T07:10:00Z",
  },
  {
    id: "n-2",
    userId: "u-cust-1",
    title: "Order confirmed",
    message: "Your order #1003 has been confirmed by GasPro Supplies.",
    type: "order",
    read: false,
    createdAt: "2026-06-22T09:20:00Z",
  },
  {
    id: "n-3",
    userId: "u-sell-1",
    title: "Low stock alert",
    message: "22kg LPG Cylinder Refill is low (15 units left).",
    type: "stock",
    read: false,
    createdAt: "2026-06-22T06:00:00Z",
  },
  {
    id: "n-4",
    userId: "u-sell-1",
    title: "Permit under review",
    message: "Your business permit application is being reviewed by admin.",
    type: "permit",
    read: true,
    createdAt: "2026-06-10T11:00:00Z",
  },
  // Supplier-side notifications — generated by the logistics module so
  // the Notifications screen has a feed on first launch.
  {
    id: "sn-1",
    userId: "u-supp-1",
    title: "Trip started",
    message: "Tunguu route started at 05:12.",
    type: "trip_started",
    read: false,
    createdAt: "2026-07-07T05:12:00Z",
  },
  {
    id: "sn-2",
    userId: "u-supp-1",
    title: "Seller alerted — Sinza B",
    message: "Hassan Juma was notified that supply is on the way.",
    type: "delivery",
    read: false,
    createdAt: "2026-07-07T05:13:00Z",
  },
  {
    id: "sn-3",
    userId: "u-supp-1",
    title: "Near your shop",
    message: "You are within 500 m of Sinza B.",
    type: "near_arrival",
    read: true,
    createdAt: "2026-07-07T05:28:00Z",
  },
];



export const seedComplaints: Complaint[] = [
  {
    id: "c-1",
    userId: "u-cust-1",
    userName: "Asha Mwakanyemba",
    subject: "Late delivery",
    message: "Order #1001 took longer than the estimated window.",
    status: "in_progress",
    createdAt: "2026-06-22T08:00:00Z",
  },
];



export const seedSellers: SellerProfile[] = [
  {
    sellerId: "u-sell-1",
    sellerName: "John Gas Seller",
    businessName: "GasPro Supplies",
    location: "Kariakoo Market, Block D, Dar es Salaam",
    distanceKm: 1.4,
    phone: "+255700000002",
    rating: 4.7,
    availableSizes: ["6kg", "13kg", "22kg"],
    openNow: true,
  },
  {
    sellerId: "u-sell-2",
    sellerName: "Maria Mwendapole",
    businessName: "Quick Gas Mikocheni",
    location: "Mikocheni B, Near Shoppers Plaza, Dar es Salaam",
    distanceKm: 2.1,
    phone: "+255711222333",
    rating: 4.5,
    availableSizes: ["6kg", "13kg"],
    openNow: true,
  },
  {
    sellerId: "u-sell-3",
    sellerName: "Hassan Juma",
    businessName: "Sinza Gas Point",
    location: "Sinza B, Dar es Salaam",
    distanceKm: 3.8,
    phone: "+255713333444",
    rating: 4.2,
    availableSizes: ["13kg", "22kg"],
    openNow: false,
  },
  {
    sellerId: "u-sell-4",
    sellerName: "Fatma Said",
    businessName: "Mbezi LPG Center",
    location: "Mbezi Beach, Bagamoyo Road, Dar es Salaam",
    distanceKm: 5.6,
    phone: "+255715555666",
    rating: 4.8,
    availableSizes: ["6kg", "13kg", "22kg"],
    openNow: true,
  },
];



export const seedEmergencyContacts: EmergencyContact[] = [
  {
    id: "e-fire",
    label: "Fire Department",
    number: "114",
    icon: "🚒",
  },
  {
    id: "e-gas",
    label: "Gas Emergency Hotline",
    number: "+255800111222",
    icon: "🔥",
  },
  {
    id: "e-police",
    label: "Police Emergency",
    number: "112",
    icon: "🚓",
  },
  {
    id: "e-ambulance",
    label: "Ambulance",
    number: "115",
    icon: "🚑",
  },
];



// ----------------------------------------------------------------------
// Supplier logistics — routes, vehicles, riders, starter trip.
// ----------------------------------------------------------------------

/**
 * Build a smooth polyline between `from` and `to` by interpolating N
 * intermediate points. Used to make the live-map's animated supplier
 * marker follow a believable arc instead of a single straight line.
 */
function makePolyline(from: LatLng, to: LatLng, steps = 12): LatLng[] {
  const out: LatLng[] = [];


  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Add a small "wobble" perpendicular to the line so the path curves
    // instead of being a ruler-straight segment. The wobble uses a sine
    // wave — cheap and looks like a road.
    const wobble = Math.sin(t * Math.PI) * 0.0025;
    const dLat = to.lat - from.lat;
    const dLng = to.lng - from.lng;
    out.push({
      lat: from.lat + dLat * t + wobble,
      lng: from.lng + dLng * t + wobble,
    });
  }
  return out;
}

/**
 * Four named routes that the supplier serves on a fixed weekly schedule.
 * Coordinates are approximate Zanzibar-area points so the demo map looks
 * believable. Each route has 3 stops + a supplier depot marker = 4-point
 * polyline.
 */
export const seedRoutes: DeliveryRoute[] = [
  {
    id: "r-tunguu",
    name: "Tunguu",
    scheduleDay: "Mon",
    scheduleTime: "05:00",
    active: true,
    polyline: makePolyline(
      { lat: -6.165, lng: 39.205 }, // depot (Zanzibar Town)
      { lat: -6.235, lng: 39.310 }, // Tunguu end
    ),
    stops: [
      {
        sellerId: "u-sell-3",
        sellerName: "Hassan Juma",
        sequence: 1,
        address: "Sinza B, Zanzibar",
        lat: -6.195,
        lng: 39.245,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-4",
        sellerName: "Fatma Said",
        sequence: 2,
        address: "Mbezi Beach, Zanzibar",
        lat: -6.215,
        lng: 39.275,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-5",
        sellerName: "Omar Bakari",
        sequence: 3,
        address: "Tunguu Central, Zanzibar",
        lat: -6.235,
        lng: 39.310,
        status: "scheduled",
      },
    ],
  },
  {
    id: "r-bububu",
    name: "Bububu",
    scheduleDay: "Tue",
    scheduleTime: "06:00",
    active: true,
    polyline: makePolyline(
      { lat: -6.165, lng: 39.205 },
      { lat: -6.105, lng: 39.245 },
    ),
    stops: [
      {
        sellerId: "u-sell-1",
        sellerName: "John Gas Seller",
        sequence: 1,
        address: "Kariakoo, Bububu West",
        lat: -6.140,
        lng: 39.220,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-2",
        sellerName: "Maria Mwendapole",
        sequence: 2,
        address: "Mikocheni, Bububu",
        lat: -6.120,
        lng: 39.235,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-6",
        sellerName: "Zainab Ali",
        sequence: 3,
        address: "Bububu Center",
        lat: -6.105,
        lng: 39.245,
        status: "scheduled",
      },
    ],
  },
  {
    id: "r-fuoni",
    name: "Fuoni",
    scheduleDay: "Wed",
    scheduleTime: "05:30",
    active: true,
    polyline: makePolyline(
      { lat: -6.165, lng: 39.205 },
      { lat: -6.220, lng: 39.170 },
    ),
    stops: [
      {
        sellerId: "u-sell-7",
        sellerName: "Salim Khamis",
        sequence: 1,
        address: "Fuoni Kibanda",
        lat: -6.190,
        lng: 39.190,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-8",
        sellerName: "Rehema Hassan",
        sequence: 2,
        address: "Fuoni Bondeni",
        lat: -6.205,
        lng: 39.180,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-4",
        sellerName: "Fatma Said",
        sequence: 3,
        address: "Fuoni Matarum",
        lat: -6.220,
        lng: 39.170,
        status: "scheduled",
      },
    ],
  },
  {
    id: "r-chwaka",
    name: "Chwaka",
    scheduleDay: "Thu",
    scheduleTime: "05:00",
    active: true,
    polyline: makePolyline(
      { lat: -6.165, lng: 39.205 },
      { lat: -6.105, lng: 39.385 },
    ),
    stops: [
      {
        sellerId: "u-sell-5",
        sellerName: "Omar Bakari",
        sequence: 1,
        address: "Chwaka Central",
        lat: -6.135,
        lng: 39.305,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-6",
        sellerName: "Zainab Ali",
        sequence: 2,
        address: "Uroa Junction",
        lat: -6.120,
        lng: 39.345,
        status: "scheduled",
      },
      {
        sellerId: "u-sell-3",
        sellerName: "Hassan Juma",
        sequence: 3,
        address: "Marumbi Village",
        lat: -6.105,
        lng: 39.385,
        status: "scheduled",
      },
    ],
  },
];



/** Two vehicles the supplier can dispatch on any given trip. */
export const seedVehicles: Vehicle[] = [
  {
    id: "v-1",
    plate: "T 123 ABC",
    model: "Isuzu NPR",
    capacityKg: 3000,
    active: true,
  },
  {
    id: "v-2",
    plate: "T 456 DEF",
    model: "Toyota Dyna",
    capacityKg: 2000,
    active: true,
  },
];



/** Two riders the supplier can dispatch on any given trip. */
export const seedRiders: Rider[] = [
  {
    id: "u-ride-1",
    fullName: "Hassan Rider",
    phone: "+255700000004",
    licenseNo: "TZ-DL-9981",
    active: true,
  },
  {
    id: "rider-2",
    fullName: "Mariam Said",
    phone: "+255777112233",
    licenseNo: "TZ-DL-7753",
    active: true,
  },
];



/**
 * A pre-seeded trip in `in_transit` so the Live Map screen has something
 * to show on first launch. Supplier is mid-way along the Tunguu polyline
 * with the first stop already `started`, the second `on_the_way`, and
 * the third still `scheduled`.
 */
export const seedTrips: DeliveryTrip[] = [
  {
    id: "trip-1",
    supplierId: "u-supp-1",
    routeId: "r-tunguu",
    routeName: "Tunguu",
    vehicleId: "v-1",
    vehiclePlate: "T 123 ABC",
    riderId: "u-ride-1",
    riderName: "Hassan Rider",
    date: "2026-07-07",
    departureTime: "05:12",
    status: "in_transit",
    startedAt: "2026-07-07T05:12:00Z",
    progress: 0.45,
    positions: [],
    stops: [
      {
        sellerId: "u-sell-3",
        sellerName: "Hassan Juma",
        sequence: 1,
        address: "Sinza B, Zanzibar",
        lat: -6.195,
        lng: 39.245,
        status: "started",
      },
      {
        sellerId: "u-sell-4",
        sellerName: "Fatma Said",
        sequence: 2,
        address: "Mbezi Beach, Zanzibar",
        lat: -6.215,
        lng: 39.275,
        status: "on_the_way",
      },
      {
        sellerId: "u-sell-5",
        sellerName: "Omar Bakari",
        sequence: 3,
        address: "Tunguu Central, Zanzibar",
        lat: -6.235,
        lng: 39.310,
        status: "scheduled",
      },
    ],
  },
];




