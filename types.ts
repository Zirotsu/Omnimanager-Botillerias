export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  supplierCodes?: Array<{ supplierRut?: string; supplierName?: string; code: string }>;
  name: string;
  category: string;
  compatibility: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
}

export interface SaleItem {
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  unitCost?: number;
}

export type PaidPaymentMethod = 'EFECTIVO' | 'TRANSFERENCIA' | 'DEBITO' | 'CREDITO';
export interface PaymentAllocation { method: PaidPaymentMethod; amount: number; }

export interface Sale {
  id: string;
  date: string;
  localDay: string;
  status: 'PAGADO' | 'PENDIENTE' | 'ANULADO';
  cashierId?: string;
  cashierName?: string;
  cashShiftId?: string;
  clientName: string;
  clientRut: string;
  clientPhone: string;
  clientEmail: string;
  items: SaleItem[];
  paymentMethod: PaidPaymentMethod | 'COMBINADO' | 'PENDIENTE';
  paymentBreakdown?: PaymentAllocation[];
  cashReceived?: number;
  cashChange?: number;
  totalNeto: number;
  totalIVA: number;
  totalGeneral: number;
  voidedAt?: string;
}

export interface CashClosure {
  id: string;
  date: string;
  localDay: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  openedAt?: string;
  closedAt?: string;
  closedById?: string;
  closedByName?: string;
  openingCash: number;
  totalCashSales: number;
  totalCardSales: number;
  totalTransferSales: number;
  totalCashExpenses?: number;
  totalExpenses?: number;
  totalExpectedCash: number;
  declaredCash: number;
  difference: number;
  totalShiftSales: number;
  salesCount: number;
  notes?: string;
  openingNotes?: string;
  status: 'ABIERTA' | 'CERRADA';
}

export interface Purchase {
  id: string;
  date: string;
  localDay: string;
  supplier: string;
  description: string;
  totalAmount: number;
  type: 'INVENTARIO' | 'GASTOS' | 'HERRAMIENTAS' | 'BIENES';
  status?: 'VIGENTE' | 'ANULADO';
  paymentMethod?: PaidPaymentMethod;
  cashShiftId?: string;
  items?: { productId: string; quantity: number; cost: number }[];
  voidedAt?: string;
}

export interface BusinessProfile {
  name: string;
  rut: string;
  address: string;
  phone: string;
  email: string;
}

export interface Promotion {
  id: string;
  name: string;
  productId: string;
  type: 'QTY_DISCOUNT' | 'PERCENT_DISCOUNT' | 'COMBO';
  buyQtyValue: number;
  payQtyValue: number;
  discountPercent?: number;
  active: boolean;
  comboProducts?: { productId: string; quantity: number }[];
  comboPrice?: number;
}

export type UserRole = 'ADMIN' | 'CAJERO' | 'SUPERVISOR';
export interface User {
  id: string;
  name: string;
  rut?: string;
  role: UserRole;
  pin: string;
  avatarBg?: string;
  active?: boolean;
}

export type ViewState = 'dashboard' | 'inventory' | 'sales' | 'purchases' | 'reports' | 'settings';

export interface OmniSnapshot {
  schemaVersion?: number;
  profile: BusinessProfile;
  products: Product[];
  sales: Sale[];
  purchases: Purchase[];
  promotions: Promotion[];
  users: User[];
  cashClosures: CashClosure[];
}

export const CATEGORIES = [
  'Cervezas',
  'Vinos y Espumantes',
  'Destilados',
  'Bebidas y Jugos',
  'Energéticas',
  'Aguas',
  'Snacks y Confitería',
  'Hielo',
  'Abarrotes',
  'Cigarrillos y Accesorios',
  'Otros y Varios'
];
