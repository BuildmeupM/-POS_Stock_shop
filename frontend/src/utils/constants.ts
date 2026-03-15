/**
 * Shared constants and configuration maps used across multiple pages.
 */
import {
  IconClock, IconCheck, IconX, IconTruckDelivery, IconPackage,
  IconAlertTriangle, IconWorld, IconBrandFacebook, IconPhone,
  IconBrandShopee, IconShoppingBag, IconCash, IconBuildingBank,
  IconQrcode, IconCreditCard,
} from '@tabler/icons-react'

// ============================================================
// Purchase Order Statuses
// ============================================================
export const PO_STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: 'ฉบับร่าง', color: 'gray' },
  approved: { label: 'รอรับสินค้า', color: 'blue' },
  partial: { label: 'รับบางส่วน', color: 'orange' },
  received: { label: 'รับครบแล้ว', color: 'teal' },
  invoiced: { label: 'แจ้งหนี้แล้ว', color: 'violet' },
  paid: { label: 'จ่ายครบแล้ว', color: 'green' },
  cancelled: { label: 'ยกเลิก', color: 'red' },
}

// ============================================================
// Purchase Invoice Statuses
// ============================================================
export const INV_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: 'รอชำระ', color: 'orange' },
  partial: { label: 'ชำระบางส่วน', color: 'blue' },
  paid: { label: 'ชำระครบ', color: 'green' },
}

// ============================================================
// Order Statuses
// ============================================================
export const ORDER_STATUSES: Record<string, { color: string; label: string; icon: any }> = {
  pending:    { color: 'yellow', label: 'รอยืนยัน', icon: IconClock },
  confirmed:  { color: 'blue',   label: 'ยืนยันแล้ว', icon: IconCheck },
  packing:    { color: 'cyan',   label: 'กำลังแพ็ค', icon: IconPackage },
  shipped:    { color: 'indigo',  label: 'จัดส่งแล้ว', icon: IconTruckDelivery },
  delivered:  { color: 'green',   label: 'ได้รับแล้ว', icon: IconCheck },
  cancelled:  { color: 'red',     label: 'ยกเลิก', icon: IconX },
  returned:   { color: 'orange',  label: 'คืนสินค้า', icon: IconAlertTriangle },
}

// ============================================================
// Platform Config (Sales channels)
// ============================================================
export const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  website:  { label: 'Website', color: 'blue', icon: IconWorld },
  facebook: { label: 'Facebook', color: 'blue', icon: IconBrandFacebook },
  line:     { label: 'LINE', color: 'green', icon: IconPhone },
  shopee:   { label: 'Shopee', color: 'orange', icon: IconBrandShopee },
  lazada:   { label: 'Lazada', color: 'blue', icon: IconShoppingBag },
  other:    { label: 'อื่นๆ', color: 'gray', icon: IconWorld },
}

export const PLATFORM_OPTIONS = [
  { value: 'facebook', label: '📘 Facebook' },
  { value: 'line', label: '💬 LINE' },
  { value: 'shopee', label: '🟠 Shopee' },
  { value: 'lazada', label: '🔵 Lazada' },
  { value: 'website', label: '🌐 Website' },
  { value: 'other', label: '📦 อื่นๆ' },
]

// ============================================================
// Payment Labels & Options
// ============================================================
export const PAYMENT_LABELS: Record<string, string> = {
  transfer: '🏦 โอนเงิน',
  cod: '📦 เก็บปลายทาง',
  credit_card: '💳 บัตรเครดิต',
  qr_code: '📱 QR Code',
  cash: '💵 เงินสด',
}

export const PAYMENT_OPTIONS = [
  { value: 'transfer', label: '🏦 โอนเงิน' },
  { value: 'cod', label: '📦 เก็บปลายทาง (COD)' },
  { value: 'credit_card', label: '💳 บัตรเครดิต' },
  { value: 'qr_code', label: '📱 QR Code' },
]

// ============================================================
// Order Status Flow
// ============================================================
export const ORDER_NEXT_STATUS: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['packing', 'cancelled'],
  packing:   ['shipped', 'cancelled'],
  shipped:   ['delivered', 'returned'],
  delivered: [],
  cancelled: [],
  returned:  [],
}

export const ORDER_PREV_STATUS: Record<string, string> = {
  confirmed: 'pending',
  packing:   'confirmed',
  shipped:   'packing',
  delivered: 'shipped',
}

// ============================================================
// Stock / Inventory
// ============================================================
export const TXN_TYPES = [
  { value: 'IN', label: 'รับเข้า', color: 'green' },
  { value: 'OUT', label: 'เบิกออก', color: 'red' },
  { value: 'SALE', label: 'ขาย', color: 'indigo' },
  { value: 'RETURN', label: 'คืน', color: 'orange' },
  { value: 'ADJUST', label: 'ปรับปรุง', color: 'violet' },
  { value: 'TRANSFER', label: 'โอนย้าย', color: 'cyan' },
]

export const TXN_LABELS: Record<string, string> = Object.fromEntries(
  TXN_TYPES.map((t) => [t.value, t.label])
)

export const TXN_CSS: Record<string, string> = {
  IN: 'txn-in', OUT: 'txn-out', SALE: 'txn-sale',
  RETURN: 'txn-return', ADJUST: 'txn-adjust', TRANSFER: 'txn-transfer',
}

export const ATTR_COLORS = [
  'blue', 'green', 'violet', 'orange', 'cyan',
  'pink', 'teal', 'grape', 'indigo', 'lime',
]

// ============================================================
// Wallet / Payment Channel Icons & Colors
// ============================================================
export const CHANNEL_TYPE_ICONS: Record<string, any> = {
  cash: IconCash,
  bank_account: IconBuildingBank,
  promptpay: IconQrcode,
  credit_card: IconCreditCard,
  e_wallet: IconCash,
  other: IconCash,
}

export const CHANNEL_TYPE_COLORS: Record<string, string> = {
  cash: '#059669',
  bank_account: '#2563eb',
  promptpay: '#0891b2',
  credit_card: '#7c3aed',
  e_wallet: '#14b8a6',
  other: '#6b7280',
}
