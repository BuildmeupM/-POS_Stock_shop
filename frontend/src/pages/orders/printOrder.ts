import { fmtDateTimeFull as fmtDate } from '../../utils/formatters'
import { printA4Invoice } from '../../utils/printReceipt'
import {
  PLATFORM_CONFIG as platformConfig,
} from '../../utils/constants'
import type { Order, CreditNote } from '../../types'

interface CompanyInfo {
  name?: string
  address?: string
  phone?: string
  tax_id?: string
  settings?: any
}

/**
 * Print order as A4 invoice / delivery note
 */
export function printOrder(order: Order, creditNote?: CreditNote, company?: CompanyInfo) {
  if (!order) return
  const plat = platformConfig[order.platform] || platformConfig.other
  const settings = company?.settings || {}

  printA4Invoice({
    companyName: company?.name || 'บริษัท',
    companyAddress: company?.address || '',
    companyPhone: company?.phone || '',
    companyTaxId: company?.tax_id || '',
    receiptNumber: order.order_number,
    date: fmtDate(order.created_at),
    customerName: order.customer_name || 'ลูกค้าทั่วไป',
    customerPhone: order.customer_phone || '',
    items: (order.items || []).map(item => ({
      name: `${item.sku ? `[${item.sku}] ` : ''}${item.product_name || '-'}`,
      qty: item.quantity,
      price: parseFloat(item.unit_price),
      discount: parseFloat(item.discount || '0'),
      subtotal: parseFloat(item.subtotal),
    })),
    subtotal: parseFloat(order.total_amount),
    discountTotal: parseFloat(order.discount_amount) || 0,
    vatAmount: 0,
    netAmount: parseFloat(order.net_amount),
    docTitle: order.order_status === 'returned' ? 'ใบลดหนี้ / ใบคืนสินค้า' : 'ใบส่งสินค้า / Invoice',
    shippingAddress: order.shipping_address,
    shippingCost: parseFloat(order.shipping_cost) || 0,
    trackingNumber: order.tracking_number,
    shippingProvider: order.shipping_provider,
    platform: plat.label,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    note: order.note,
    showTaxId: settings.receipt_show_tax_id !== false,
    showAddress: settings.receipt_show_address !== false,
    footerText: settings.receipt_footer_text || 'ขอบคุณที่ใช้บริการ',
  })
}
