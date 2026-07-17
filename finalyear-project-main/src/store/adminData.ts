/**
 * Admin Dashboard Dummy Data
 *
 * Centralized mock data store for the Admin Dashboard. Mirrors the shape
 * of the backend payloads expected by each page so the UI can be wired
 * to a real API with minimal refactoring.
 */

export type AdminRole = "super_admin" | "operations" | "support";

export interface AdminUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: AdminRole;
  avatar?: string;
}

export type SupplierStatus = "active" | "suspended";
export interface Supplier {
  id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  location: string;
  routes: number;
  status: SupplierStatus;
  joinedDate: string;
}

export type SellerAppStatus = "pending" | "approved" | "rejected";
export interface SellerApplication {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  location: string;
  license: string;
  submittedDate: string;
  status: SellerAppStatus;
  documents: string[];
}

export type RiderAppStatus = "pending" | "approved" | "rejected";
export interface RiderApplication {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  drivingLicense: string;
  nationalId: string;
  vehicleType: string;
  vehiclePlate: string;
  submittedDate: string;
  status: RiderAppStatus;
}

export type AssignmentStatus =
  | "pending_seller_response"
  | "accepted"
  | "rejected";
export interface RiderAssignment {
  id: string;
  riderId: string;
  riderName: string;
  sellerId: string;
  sellerName: string;
  assignedDate: string;
  status: AssignmentStatus;
  respondedDate?: string;
}

export type SellerStatus = "active" | "suspended" | "inactive";
export interface Seller {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  location: string;
  license: string;
  joinedDate: string;
  assignedRiders: string[]; // rider ids
  orderCount: number;
  status: SellerStatus;
}

export type RiderApproval = "approved" | "pending" | "rejected";
export type RiderStatus = "active" | "inactive" | "suspended";
export interface Rider {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  drivingLicense: string;
  vehicleType: string;
  vehiclePlate: string;
  assignedSellerId?: string;
  assignedSellerName?: string;
  approvalStatus: RiderApproval;
  status: RiderStatus;
  joinedDate: string;
}

export interface Customer {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  totalOrders: number;
  totalSpent: number;
  joinedDate: string;
  status: "active" | "inactive";
}

export interface DeliveryRoute {
  id: string;
  name: string;
  supplierId: string;
  supplierName: string;
  startLocation: string;
  endLocation: string;
  stops: string[];
  deliveryDays: string[];
  deliveryTime: string;
  status: "active" | "inactive";
}

export type OrderStatus =
  | "pending"
  | "processing"
  | "in_transit"
  | "delivered"
  | "cancelled";
export interface AdminOrder {
  id: string;
  customerName: string;
  sellerName: string;
  riderName?: string;
  product: string;
  quantity: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  deliveredAt?: string;
  paymentMethod: "cash" | "card" | "mobile_money";
}

export interface ActivityItem {
  id: string;
  type:
    | "seller_application"
    | "rider_application"
    | "supplier_registered"
    | "rider_assigned"
    | "order_placed"
    | "order_delivered";
  message: string;
  timestamp: string;
}

// ───────────────────────────────────────────────────────────────────────────
// Static Seed Data
// ───────────────────────────────────────────────────────────────────────────

export const ADMIN_USER: AdminUser = {
  id: "admin-001",
  fullName: "Sarah Mwangi",
  username: "sarah.admin",
  email: "sarah.admin@gasdeliver.com",
  role: "super_admin",
};

export const SUPPLIERS: Supplier[] = [
  {
    id: "sup-001",
    companyName: "TotalGas Distributors Ltd",
    contactPerson: "James Otieno",
    email: "james@totalgas.co.ke",
    phone: "+254 712 345 678",
    location: "Industrial Area, Nairobi",
    routes: 6,
    status: "active",
    joinedDate: "2024-03-12",
  },
  {
    id: "sup-002",
    companyName: "AfriGas Supply Co.",
    contactPerson: "Mary Achieng",
    email: "mary@afrigas.co.ke",
    phone: "+254 720 112 233",
    location: "Mombasa Road, Nairobi",
    routes: 4,
    status: "active",
    joinedDate: "2024-05-04",
  },
  {
    id: "sup-003",
    companyName: "BlueFlame Energy",
    contactPerson: "Peter Kamau",
    email: "peter@blueflame.co.ke",
    phone: "+254 733 998 877",
    location: "Thika Road, Nairobi",
    routes: 5,
    status: "active",
    joinedDate: "2024-07-21",
  },
  {
    id: "sup-004",
    companyName: "Kengen Gas Solutions",
    contactPerson: "Esther Wambui",
    email: "esther@kengengas.co.ke",
    phone: "+254 711 556 644",
    location: "Westlands, Nairobi",
    routes: 3,
    status: "suspended",
    joinedDate: "2024-01-18",
  },
];

export const SELLER_APPLICATIONS: SellerApplication[] = [
  {
    id: "sa-001",
    businessName: "Quick Gas Mart",
    ownerName: "Brian Mutiso",
    phone: "+254 798 221 334",
    email: "brian@quickgas.co.ke",
    location: "Kasarani, Nairobi",
    license: "LIC-2024-44122",
    submittedDate: "2026-07-06",
    status: "pending",
    documents: ["Business Registration", "KRA Pin", "ID Copy"],
  },
  {
    id: "sa-002",
    businessName: "Mama Njeri Gas Point",
    ownerName: "Njeri Karanja",
    phone: "+254 712 998 110",
    email: "njeri@mamanjeri.co.ke",
    location: "Kawangware, Nairobi",
    license: "LIC-2024-44518",
    submittedDate: "2026-07-04",
    status: "pending",
    documents: ["Business Registration", "KRA Pin", "ID Copy"],
  },
  {
    id: "sa-003",
    businessName: "Westgate Gas Centre",
    ownerName: "Ali Hassan",
    phone: "+254 722 113 009",
    email: "ali@westgate-gas.co.ke",
    location: "Westlands, Nairobi",
    license: "LIC-2024-44992",
    submittedDate: "2026-06-29",
    status: "pending",
    documents: ["Business Registration", "KRA Pin", "ID Copy", "NEMA Cert"],
  },
  {
    id: "sa-004",
    businessName: "Karen Gas Stop",
    ownerName: "Diana Chebet",
    phone: "+254 705 443 882",
    email: "diana@karengas.co.ke",
    location: "Karen, Nairobi",
    license: "LIC-2024-45221",
    submittedDate: "2026-07-01",
    status: "approved",
    documents: ["Business Registration", "KRA Pin", "ID Copy"],
  },
  {
    id: "sa-005",
    businessName: "Rongai Gas Express",
    ownerName: "Samuel Kiprono",
    phone: "+254 728 117 442",
    email: "samuel@rongaigas.co.ke",
    location: "Rongai, Kajiado",
    license: "LIC-2024-45003",
    submittedDate: "2026-06-22",
    status: "rejected",
    documents: ["Business Registration", "ID Copy"],
  },
];

export const RIDER_APPLICATIONS: RiderApplication[] = [
  {
    id: "ra-001",
    fullName: "Kevin Njoroge",
    phone: "+254 711 226 119",
    email: "kevin.n@gmail.com",
    drivingLicense: "DL-99812345",
    nationalId: "34567812",
    vehicleType: "Motorbike",
    vehiclePlate: "KMDR 123B",
    submittedDate: "2026-07-07",
    status: "pending",
  },
  {
    id: "ra-002",
    fullName: "Faith Wairimu",
    phone: "+254 798 009 776",
    email: "faith.w@gmail.com",
    drivingLicense: "DL-99877123",
    nationalId: "29887731",
    vehicleType: "Pickup Truck",
    vehiclePlate: "KDA 441C",
    submittedDate: "2026-07-05",
    status: "pending",
  },
  {
    id: "ra-003",
    fullName: "John Otieno",
    phone: "+254 722 553 117",
    email: "john.otieno@gmail.com",
    drivingLicense: "DL-99899001",
    nationalId: "27881234",
    vehicleType: "Motorbike",
    vehiclePlate: "KMEP 778D",
    submittedDate: "2026-07-03",
    status: "pending",
  },
  {
    id: "ra-004",
    fullName: "Lucy Akinyi",
    phone: "+254 712 998 001",
    email: "lucy.a@gmail.com",
    drivingLicense: "DL-99855432",
    nationalId: "31122890",
    vehicleType: "Van",
    vehiclePlate: "KBC 221A",
    submittedDate: "2026-06-30",
    status: "approved",
  },
  {
    id: "ra-005",
    fullName: "Michael Kipruto",
    phone: "+254 720 119 887",
    email: "mike.k@gmail.com",
    drivingLicense: "DL-99821100",
    nationalId: "25112381",
    vehicleType: "Motorbike",
    vehiclePlate: "KMDA 998X",
    submittedDate: "2026-06-25",
    status: "rejected",
  },
];

export const RIDERS: Rider[] = [
  {
    id: "rid-001",
    fullName: "Lucy Akinyi",
    phone: "+254 712 998 001",
    email: "lucy.a@gmail.com",
    nationalId: "31122890",
    drivingLicense: "DL-99855432",
    vehicleType: "Van",
    vehiclePlate: "KBC 221A",
    approvalStatus: "approved",
    status: "active",
    joinedDate: "2026-06-30",
  },
  {
    id: "rid-002",
    fullName: "Daniel Mwenda",
    phone: "+254 711 442 991",
    email: "daniel.m@gmail.com",
    nationalId: "29001123",
    drivingLicense: "DL-99788921",
    vehicleType: "Motorbike",
    vehiclePlate: "KMDR 881P",
    approvalStatus: "approved",
    status: "active",
    joinedDate: "2026-06-25",
    assignedSellerId: "sel-001",
    assignedSellerName: "Karen Gas Stop",
  },
  {
    id: "rid-003",
    fullName: "Esther Nyambura",
    phone: "+254 728 663 110",
    email: "esther.n@gmail.com",
    nationalId: "30119877",
    drivingLicense: "DL-99765432",
    vehicleType: "Motorbike",
    vehiclePlate: "KMEP 442T",
    approvalStatus: "approved",
    status: "active",
    joinedDate: "2026-06-22",
  },
  {
    id: "rid-004",
    fullName: "Joseph Mutua",
    phone: "+254 720 553 998",
    email: "joseph.m@gmail.com",
    nationalId: "28001234",
    drivingLicense: "DL-99712345",
    vehicleType: "Pickup",
    vehiclePlate: "KDA 119B",
    approvalStatus: "approved",
    status: "suspended",
    joinedDate: "2026-05-30",
    assignedSellerId: "sel-002",
    assignedSellerName: "Quick Gas Mart",
  },
];

export const SELLERS: Seller[] = [
  {
    id: "sel-001",
    businessName: "Karen Gas Stop",
    ownerName: "Diana Chebet",
    phone: "+254 705 443 882",
    email: "diana@karengas.co.ke",
    location: "Karen, Nairobi",
    license: "LIC-2024-45221",
    joinedDate: "2026-07-01",
    assignedRiders: ["rid-002"],
    orderCount: 142,
    status: "active",
  },
  {
    id: "sel-002",
    businessName: "Quick Gas Mart",
    ownerName: "Brian Mutiso",
    phone: "+254 798 221 334",
    email: "brian@quickgas.co.ke",
    location: "Kasarani, Nairobi",
    license: "LIC-2024-44122",
    joinedDate: "2026-05-14",
    assignedRiders: ["rid-004"],
    orderCount: 87,
    status: "active",
  },
  {
    id: "sel-003",
    businessName: "Westgate Gas Centre",
    ownerName: "Ali Hassan",
    phone: "+254 722 113 009",
    email: "ali@westgate-gas.co.ke",
    location: "Westlands, Nairobi",
    license: "LIC-2024-44992",
    joinedDate: "2026-04-22",
    assignedRiders: [],
    orderCount: 220,
    status: "active",
  },
  {
    id: "sel-004",
    businessName: "Embakasi Gas Hub",
    ownerName: "Rose Atieno",
    phone: "+254 711 224 880",
    email: "rose@embakasigas.co.ke",
    location: "Embakasi, Nairobi",
    license: "LIC-2024-44778",
    joinedDate: "2026-03-18",
    assignedRiders: [],
    orderCount: 65,
    status: "suspended",
  },
];

export const RIDER_ASSIGNMENTS: RiderAssignment[] = [
  {
    id: "asg-001",
    riderId: "rid-002",
    riderName: "Daniel Mwenda",
    sellerId: "sel-001",
    sellerName: "Karen Gas Stop",
    assignedDate: "2026-07-05",
    status: "accepted",
    respondedDate: "2026-07-06",
  },
  {
    id: "asg-002",
    riderId: "rid-004",
    riderName: "Joseph Mutua",
    sellerId: "sel-002",
    sellerName: "Quick Gas Mart",
    assignedDate: "2026-07-02",
    status: "accepted",
    respondedDate: "2026-07-03",
  },
  {
    id: "asg-003",
    riderId: "rid-003",
    riderName: "Esther Nyambura",
    sellerId: "sel-003",
    sellerName: "Westgate Gas Centre",
    assignedDate: "2026-07-08",
    status: "pending_seller_response",
  },
];

export const CUSTOMERS: Customer[] = [
  {
    id: "cus-001",
    fullName: "Ann Wambui",
    email: "ann.w@gmail.com",
    phone: "+254 712 334 778",
    location: "Kileleshwa, Nairobi",
    totalOrders: 28,
    totalSpent: 78400,
    joinedDate: "2025-08-12",
    status: "active",
  },
  {
    id: "cus-002",
    fullName: "Peter Karanja",
    email: "peter.k@gmail.com",
    phone: "+254 798 113 992",
    location: "Lavington, Nairobi",
    totalOrders: 14,
    totalSpent: 39200,
    joinedDate: "2025-11-04",
    status: "active",
  },
  {
    id: "cus-003",
    fullName: "Mary Achieng",
    email: "mary.a@gmail.com",
    phone: "+254 720 887 119",
    location: "South C, Nairobi",
    totalOrders: 6,
    totalSpent: 16800,
    joinedDate: "2026-02-19",
    status: "active",
  },
  {
    id: "cus-004",
    fullName: "James Maina",
    email: "james.m@gmail.com",
    phone: "+254 711 553 880",
    location: "Parklands, Nairobi",
    totalOrders: 41,
    totalSpent: 114800,
    joinedDate: "2025-05-30",
    status: "active",
  },
  {
    id: "cus-005",
    fullName: "Grace Naliaka",
    email: "grace.n@gmail.com",
    phone: "+254 728 220 113",
    location: "Kitisuru, Nairobi",
    totalOrders: 3,
    totalSpent: 8400,
    joinedDate: "2026-06-11",
    status: "inactive",
  },
  {
    id: "cus-006",
    fullName: "David Kiprotich",
    email: "david.k@gmail.com",
    phone: "+254 705 119 887",
    location: "Runda, Nairobi",
    totalOrders: 22,
    totalSpent: 61600,
    joinedDate: "2025-12-08",
    status: "active",
  },
];

export const ROUTES: DeliveryRoute[] = [
  {
    id: "rt-001",
    name: "Nairobi West Circuit",
    supplierId: "sup-001",
    supplierName: "TotalGas Distributors Ltd",
    startLocation: "Industrial Area Depot",
    endLocation: "Karen",
    stops: ["Industrial Area", "South C", "Langata", "Karen"],
    deliveryDays: ["Monday", "Wednesday", "Friday"],
    deliveryTime: "08:00 - 14:00",
    status: "active",
  },
  {
    id: "rt-002",
    name: "Thika Road Express",
    supplierId: "sup-003",
    supplierName: "BlueFlame Energy",
    startLocation: "BlueFlame Yard",
    endLocation: "Ruiru",
    stops: ["Thika Road", "Kasarani", "Roysambu", "Ruiru"],
    deliveryDays: ["Tuesday", "Thursday", "Saturday"],
    deliveryTime: "07:30 - 13:30",
    status: "active",
  },
  {
    id: "rt-003",
    name: "Mombasa Road Corridor",
    supplierId: "sup-002",
    supplierName: "AfriGas Supply Co.",
    startLocation: "Mombasa Road Depot",
    endLocation: "Athi River",
    stops: ["Imara Daima", "Syokimau", "Kitengela", "Athi River"],
    deliveryDays: ["Monday", "Thursday"],
    deliveryTime: "09:00 - 15:00",
    status: "active",
  },
  {
    id: "rt-004",
    name: "Westlands Premium Run",
    supplierId: "sup-004",
    supplierName: "Kengen Gas Solutions",
    startLocation: "Westlands Hub",
    endLocation: "Kitisuru",
    stops: ["Westlands", "Lavington", "Kileleshwa", "Kitisuru"],
    deliveryDays: ["Wednesday", "Saturday"],
    deliveryTime: "10:00 - 16:00",
    status: "inactive",
  },
];

export const ORDERS: AdminOrder[] = [
  {
    id: "ord-1001",
    customerName: "Ann Wambui",
    sellerName: "Karen Gas Stop",
    riderName: "Daniel Mwenda",
    product: "13kg LPG Cylinder",
    quantity: 2,
    total: 5600,
    status: "delivered",
    createdAt: "2026-07-08 09:21",
    deliveredAt: "2026-07-08 11:42",
    paymentMethod: "mobile_money",
  },
  {
    id: "ord-1002",
    customerName: "Peter Karanja",
    sellerName: "Quick Gas Mart",
    product: "6kg LPG Cylinder",
    quantity: 1,
    total: 1850,
    status: "in_transit",
    createdAt: "2026-07-09 08:05",
    paymentMethod: "cash",
  },
  {
    id: "ord-1003",
    customerName: "Mary Achieng",
    sellerName: "Westgate Gas Centre",
    product: "13kg LPG Cylinder",
    quantity: 1,
    total: 2800,
    status: "processing",
    createdAt: "2026-07-09 09:11",
    paymentMethod: "card",
  },
  {
    id: "ord-1004",
    customerName: "James Maina",
    sellerName: "Karen Gas Stop",
    riderName: "Daniel Mwenda",
    product: "13kg LPG Cylinder",
    quantity: 3,
    total: 8400,
    status: "delivered",
    createdAt: "2026-07-07 14:32",
    deliveredAt: "2026-07-07 17:08",
    paymentMethod: "mobile_money",
  },
  {
    id: "ord-1005",
    customerName: "Grace Naliaka",
    sellerName: "Embakasi Gas Hub",
    product: "6kg LPG Cylinder",
    quantity: 1,
    total: 1850,
    status: "cancelled",
    createdAt: "2026-07-06 16:48",
    paymentMethod: "cash",
  },
  {
    id: "ord-1006",
    customerName: "David Kiprotich",
    sellerName: "Westgate Gas Centre",
    product: "13kg LPG Cylinder",
    quantity: 2,
    total: 5600,
    status: "pending",
    createdAt: "2026-07-09 10:02",
    paymentMethod: "card",
  },
  {
    id: "ord-1007",
    customerName: "Ann Wambui",
    sellerName: "Karen Gas Stop",
    product: "13kg LPG Cylinder",
    quantity: 1,
    total: 2800,
    status: "pending",
    createdAt: "2026-07-09 10:14",
    paymentMethod: "mobile_money",
  },
];

export const RECENT_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-001",
    type: "seller_application",
    message: "New seller application: Quick Gas Mart",
    timestamp: "12 min ago",
  },
  {
    id: "act-002",
    type: "rider_application",
    message: "Kevin Njoroge submitted a rider application",
    timestamp: "34 min ago",
  },
  {
    id: "act-003",
    type: "rider_assigned",
    message: "Esther Nyambura assigned to Westgate Gas Centre",
    timestamp: "1 hr ago",
  },
  {
    id: "act-004",
    type: "order_delivered",
    message: "Order #1001 delivered to Ann Wambui",
    timestamp: "2 hrs ago",
  },
  {
    id: "act-005",
    type: "supplier_registered",
    message: "BlueFlame Energy onboarded as a supplier",
    timestamp: "Yesterday",
  },
  {
    id: "act-006",
    type: "order_placed",
    message: "Order #1007 placed by Ann Wambui",
    timestamp: "Just now",
  },
];