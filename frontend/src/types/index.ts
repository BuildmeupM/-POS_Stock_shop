/**
 * Shared TypeScript interfaces for the POS Bookdee frontend.
 * Replaces the `any` types scattered across page files.
 */

// ============================================================
// Product & Stock
// ============================================================
export interface Product {
  id: number
  sku: string
  barcode?: string
  name: string
  description?: string
  image_url?: string
  unit: string
  cost_price: string
  selling_price: string
  wholesale_price?: string
  vip_price?: string
  min_selling_price?: string
  min_stock: number
  total_stock: string
  is_active: boolean
  category_id?: number
  category_name?: string
  attributes?: ProductAttribute[]
}

export interface ProductAttribute {
  groupId: number
  valueId: number
  groupName: string
  valueName: string
}

export interface AttributeGroup {
  id: number
  name: string
  values: AttributeValue[]
}

export interface AttributeValue {
  id: number
  value: string
}

// ============================================================
// Cart (POS)
// ============================================================
export interface CartItem {
  productId: number
  name: string
  sku: string
  unitPrice: number
  quantity: number
  discount: number
  isService?: boolean
}

export interface HeldOrder {
  id: number
  label: string
  items: CartItem[]
  customerId: string
  heldAt: Date
}

// ============================================================
// Orders
// ============================================================
export interface Order {
  id: number
  order_number: string
  order_status: string
  customer_name?: string
  customer_phone?: string
  shipping_address?: string
  platform: string
  payment_method: string
  payment_status: string
  total_amount: string
  shipping_cost: string
  discount_amount: string
  net_amount: string
  tracking_number?: string
  shipping_provider?: string
  note?: string
  sale_id?: number
  created_at: string
  items?: OrderItem[]
}

export interface OrderItem {
  id: number
  product_id: number
  product_name: string
  sku: string
  quantity: number
  unit_price: string
  discount?: string
  subtotal: string
}

// ============================================================
// Purchase Orders
// ============================================================
export interface PurchaseOrder {
  id: number
  po_number: string
  contact_id: number
  contact_name: string
  status: string
  order_date: string
  expected_date?: string
  subtotal: string
  vat_amount: string
  total_amount: string
  note?: string
  item_count?: number
  items?: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: number
  product_id: number
  product_name: string
  sku: string
  quantity: number
  received_quantity: number
  unit_cost: string
  subtotal: string
}

// ============================================================
// Contacts
// ============================================================
export interface Contact {
  id: number
  name: string
  type: 'customer' | 'vendor' | 'both'
  phone?: string
  email?: string
  tax_id?: string
  address?: string
  points_balance?: number
  price_level?: 'retail' | 'wholesale' | 'vip'
}

// ============================================================
// Loyalty
// ============================================================
export interface LoyaltyTransaction {
  id: number
  company_id: number
  contact_id: number
  sale_id?: number
  type: 'earn' | 'redeem' | 'adjust' | 'expire'
  points: number
  balance_after: number
  description?: string
  created_by?: number
  created_by_name?: string
  created_at: string
}

// ============================================================
// Wallet / Payment Channels
// ============================================================
export interface WalletChannel {
  id: number
  channel_code?: string
  name: string
  type: string
  is_active: boolean | number
  is_default?: boolean
  balance?: string
  account_name?: string
  account_number?: string
  bank_name?: string
  qr_code_url?: string
  icon?: string
  note?: string
}

// ============================================================
// Common
// ============================================================
export interface Warehouse {
  id: number
  name: string
}

export interface StockTransaction {
  id: number
  type: string
  product_name: string
  sku: string
  quantity: number
  cost_per_unit: string
  note?: string
  warehouse_name: string
  created_by_name: string
  created_at: string
}

export interface CreditNote {
  id: number
  credit_note_number: string
  reason?: string
  net_amount: string
  items?: CreditNoteItem[]
}

export interface CreditNoteItem {
  product_id: number
  product_name: string
  quantity: number
  unit_price: string
  discount?: string
  subtotal: string
}

// ============================================================
// Form Data
// ============================================================
export interface ProductFormData {
  sku: string
  barcode: string
  name: string
  description: string
  unit: string
  costPrice: number
  sellingPrice: number
  minSellingPrice: number
  minStock: number
  attributes: { groupId: number; valueId: number }[]
}

export interface ReceiveFormData {
  quantity: number
  costPerUnit: number
  note: string
}

export interface IssueFormData {
  productId: string
  warehouseId: string
  quantity: number
  note: string
}

export interface EditOrderItem {
  productId: string
  quantity: number
  unitPrice: number
  discount: number
}

// ============================================================
// Utility Types
// ============================================================

/** Standard Axios error shape */
export interface ApiError {
  response?: { data?: { message?: string } }
}

/** Query params for stock transactions */
export interface TransactionParams {
  type?: string
  from?: string
  to?: string
}

/** Query params for sales listing */
export interface SalesQueryParams {
  from?: string
  to?: string
  status?: string
  saleType?: string
}

// ============================================================
// Sales
// ============================================================
export interface Sale {
  id: number
  invoice_number: string
  sale_type: string
  status: string
  sold_at: string
  customer_name?: string
  cashier_name?: string
  payment_method: string
  total_amount: string
  discount_amount: string
  vat_amount: string
  net_amount: string
  linked_doc_refs?: string
  items?: SaleItem[]
  payments?: SalePayment[]
}

export interface SaleItem {
  id: number
  product_id: number
  product_name: string
  sku: string
  quantity: number
  unit_price: string
  discount: string
  subtotal: string
}

export interface SalePayment {
  id: number
  method: string
  amount: string
  reference?: string
}

// ============================================================
// Purchase Timeline / GRN / Invoices / Payments
// ============================================================
export interface GRN {
  id: number
  grn_number: string
  po_number?: string
  contact_name?: string
  received_date: string
  warehouse_name: string
  total_quantity: number
  item_count?: number
  note?: string
  created_by_name?: string
}

export interface Invoice {
  id: number
  invoice_number: string
  po_number?: string
  contact_name?: string
  invoice_date?: string
  total_amount: string
  paid_amount: string
  status: string
  due_date?: string
  tax_invoice_number?: string
}

export interface PurchasePayment {
  id: number
  payment_number?: string
  invoice_number?: string
  po_number?: string
  contact_name?: string
  amount: string
  payment_method: string
  payment_date?: string
  reference_number?: string
  bank_name?: string
  paid_at: string
  note?: string
}

export interface PurchaseTimeline {
  grns?: GRN[]
  invoices?: Invoice[]
  payments?: PurchasePayment[]
}

export interface PurchaseReceiveItem {
  poItemId: number
  productId: number
  productName: string
  sku: string
  orderedQuantity: number
  ordered?: number
  alreadyReceived?: number
  received: number
  remaining: number
  receivedQuantity: number
  costPerUnit: number
}

/** Raw PO item from API */
export interface PurchaseOrderItem {
  id: number
  product_id: number
  product_name: string
  sku: string
  quantity: number
  received_quantity: number
  unit_price: string
  subtotal: string
}

// ============================================================
// Settings / Company
// ============================================================
export interface Company {
  id: number
  name: string
  address?: string
  phone?: string
  email?: string
  tax_id?: string
  logo_url?: string
}

// ============================================================
// Sale Returns
// ============================================================
export interface SaleReturn {
  id: number
  return_number: string
  sale_id: number
  invoice_number?: string
  customer_name?: string
  return_date: string
  reason?: string
  status: string
  subtotal: string
  vat_amount: string
  net_amount: string
  refund_method: string
  refund_amount: string
  created_by_name?: string
  created_at?: string
  items?: SaleReturnItem[]
}

export interface SaleReturnItem {
  id: number
  sale_item_id?: number
  product_id: number
  product_name: string
  sku: string
  quantity: number
  unit_price: string
  cost_price?: string
  discount: string
  subtotal: string
  restock: boolean
}

export interface SaleForReturn {
  id: number
  invoice_number: string
  sold_at: string
  net_amount: string
  total_amount: string
  customer_name?: string
  customer_id?: number
  items: SaleItemForReturn[]
}

export interface SaleItemForReturn {
  id: number
  product_id: number
  product_name: string
  sku: string
  quantity: number
  unit_price: string
  cost_price: string
  discount: string
  subtotal: string
  returned_quantity: number
  returnable_quantity: number
}

// ============================================================
// WHT Certificate (หนังสือรับรองหัก ณ ที่จ่าย)
// ============================================================
export interface WhtCertificate {
  id: number
  certificate_number: string
  form_type: string
  contact_id: number
  contact_name?: string
  contact_tax_id?: string
  contact_address?: string
  contact_phone?: string
  expense_id?: number
  payment_date: string
  income_type: string
  income_description?: string
  paid_amount: string
  wht_rate: string
  wht_amount: string
  tax_month: number
  tax_year: number
  status: string
  created_by?: number
  created_by_name?: string
  created_at?: string
}

// ============================================================
// Cash Flow Statement
// ============================================================
export interface CashFlowData {
  period: { from: string | null; to: string | null }
  operating: {
    salesCash: number
    expensesCash: number
    netOperating: number
  }
  investing: {
    purchasePayments: number
    netInvesting: number
  }
  financing: {
    netFinancing: number
  }
  netChange: number
  beginningCash: number
  endingCash: number
}

// ============================================================
// Bank Reconciliation
// ============================================================
export interface BankReconciliation {
  id: number
  company_id: number
  channel_id: number
  channel_name: string
  channel_type: string
  period_from: string
  period_to: string
  statement_balance: string
  system_balance: string
  difference: string
  status: 'draft' | 'reconciled'
  note: string | null
  reconciled_by: number | null
  reconciled_by_name: string | null
  reconciled_at: string | null
  created_at: string
}

// ============================================================
// Sales Report Types
// ============================================================
export interface SalesByHour {
  hour: number
  sale_count: number
  total_revenue: string
}

export interface SalesByPayment {
  payment_method: string
  sale_count: number
  total_revenue: string
}

// ============================================================
// Stocktaking / Stock Count
// ============================================================
export interface StockCount {
  id: number
  count_number: string
  warehouse_id: number
  warehouse_name: string
  count_date: string
  status: string
  note?: string
  total_items: number
  total_variance_qty: number
  total_variance_value: string
  created_by_name?: string
  created_at: string
  items?: StockCountItem[]
}

export interface StockCountItem {
  id: number
  product_id: number
  product_name: string
  sku: string
  system_qty: number
  counted_qty: number | null
  variance_qty: number
  cost_per_unit: string
  variance_value: string
  note?: string
}

