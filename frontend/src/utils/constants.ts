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
export const ORDER_STATUSES: Record<string, { color: string; label: string; icon: any; step: number }> = {
  pending:    { color: 'yellow', label: 'ออกบิล',        icon: IconClock,          step: 1 },
  confirmed:  { color: 'blue',   label: 'ชำระเงินแล้ว',  icon: IconCheck,          step: 2 },
  packing:    { color: 'cyan',   label: 'แพ็คสินค้า',    icon: IconPackage,        step: 3 },
  shipped:    { color: 'indigo',  label: 'จัดส่งแล้ว',    icon: IconTruckDelivery,  step: 4 },
  delivered:  { color: 'green',   label: 'ได้รับแล้ว',    icon: IconCheck,          step: 5 },
  cancelled:  { color: 'red',     label: 'ยกเลิก',       icon: IconX,              step: 0 },
  returned:   { color: 'orange',  label: 'คืนสินค้า',    icon: IconAlertTriangle,  step: 6 },
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
// Flow: ออกบิล(pending) → ชำระเงิน(confirmed) → แพ็ค(packing) → จัดส่ง(shipped) → ได้รับ(delivered) → คืน(returned)
export const ORDER_NEXT_STATUS: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],   // ออกบิล → รอลูกค้าชำระ หรือ ยกเลิก
  confirmed: ['packing', 'cancelled'],     // ชำระแล้ว → แพ็คสินค้า
  packing:   ['shipped'],                  // แพ็คเสร็จ → จัดส่ง
  shipped:   ['delivered'],                // จัดส่งแล้ว → ลูกค้าได้รับ
  delivered: ['returned'],                 // ได้รับแล้ว → คืนสินค้า (ถ้ามี)
  cancelled: [],
  returned:  [],
}

export const ORDER_PREV_STATUS: Record<string, string> = {
  confirmed: 'pending',
  packing:   'confirmed',
  shipped:   'packing',
  delivered: 'shipped',
}

// Workflow steps for stepper display
export const ORDER_FLOW_STEPS = [
  { key: 'pending',   label: 'ออกบิล',       description: 'สร้างออเดอร์และรอลูกค้าชำระเงิน' },
  { key: 'confirmed', label: 'ชำระเงิน',     description: 'ลูกค้าชำระเงินเรียบร้อย' },
  { key: 'packing',   label: 'แพ็คสินค้า',   description: 'เตรียมสินค้าและบรรจุภัณฑ์' },
  { key: 'shipped',   label: 'จัดส่ง',       description: 'ส่งสินค้าให้ขนส่ง' },
  { key: 'delivered', label: 'ติดตามผล',     description: 'ลูกค้าได้รับสินค้าเรียบร้อย' },
]

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
