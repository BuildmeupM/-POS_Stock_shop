import { fmt, fmtDateTimeFull as fmtDate } from '../../utils/formatters'
import {
  ORDER_STATUSES as statusConfig,
  PLATFORM_CONFIG as platformConfig,
  PAYMENT_LABELS as paymentLabels,
} from '../../utils/constants'
import type { Order, OrderItem, CreditNote, CreditNoteItem } from '../../types'

/**
 * Generate print HTML for an order and open it in a new tab.
 */
export function printOrder(order: Order, creditNote?: CreditNote) {
  if (!order) return
  const st = statusConfig[order.order_status] || statusConfig.pending
  const plat = platformConfig[order.platform] || platformConfig.other
  const payLabel = paymentLabels[order.payment_method] || order.payment_method
  const items = order.items || []
  const hasCN = order.order_status === 'returned' && creditNote

  const itemRows = items.map((item: OrderItem, idx: number) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td>${item.sku || '-'}</td>
      <td>${item.product_name || '-'}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${fmt(parseFloat(item.unit_price))}</td>
      <td style="text-align:right">${fmt(parseFloat(item.discount || '0'))}</td>
      <td style="text-align:right">${fmt(parseFloat(item.subtotal))}</td>
    </tr>
  `).join('')

  const cnSection = hasCN ? `
    <div style="margin-top:24px; border:2px solid #ef4444; border-radius:8px; padding:16px;">
      <h3 style="color:#ef4444; margin:0 0 12px 0; font-size:16px;">📄 ใบลดหนี้ (Credit Note)</h3>
      <table style="width:100%; margin-bottom:8px;">
        <tr>
          <td style="width:50%"><strong>เลขที่:</strong> <span style="color:#ef4444; font-family:monospace;">${creditNote.credit_note_number}</span></td>
          <td><strong>สาเหตุ:</strong> ${creditNote.reason || '-'}</td>
        </tr>
      </table>
      <table style="width:100%; border-collapse:collapse; margin-top:8px;">
        <thead>
          <tr style="background:#fef2f2; border-bottom:2px solid #ef4444;">
            <th style="padding:6px; text-align:left;">สินค้า</th>
            <th style="padding:6px; text-align:center;">จำนวน</th>
            <th style="padding:6px; text-align:right;">ราคา/หน่วย</th>
            <th style="padding:6px; text-align:right;">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${(creditNote.items || []).map((ci: CreditNoteItem) => `
            <tr style="border-bottom:1px solid #fecaca;">
              <td style="padding:5px;">${ci.product_name || '-'}</td>
              <td style="padding:5px; text-align:center;">${ci.quantity}</td>
              <td style="padding:5px; text-align:right;">${fmt(parseFloat(ci.unit_price))}</td>
              <td style="padding:5px; text-align:right; color:#ef4444; font-weight:600;">${fmt(parseFloat(ci.subtotal))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="text-align:right; margin-top:12px; font-size:18px; color:#ef4444; font-weight:800;">ยอดคืนเงินทั้งสิ้น: ฿${fmt(parseFloat(creditNote.net_amount))}</div>
    </div>
  ` : ''

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>${order.order_number} - ใบส่งสินค้า</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Sarabun', sans-serif; color: #1a1a1a; padding: 32px; font-size: 14px; line-height: 1.6; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #4f46e5; }
        .company-name { font-size: 24px; font-weight: 800; color: #4f46e5; }
        .doc-title { font-size: 22px; font-weight: 800; color: #4f46e5; text-align: right; }
        .doc-number { font-family: monospace; font-size: 16px; font-weight: 700; color: #374151; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
        .info-box h4 { font-size: 13px; color: #6b7280; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .info-box p { font-size: 14px; margin: 2px 0; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .items-table thead th { background: #4f46e5; color: white; padding: 8px 10px; font-size: 13px; font-weight: 600; }
        .items-table thead th:first-child { border-radius: 6px 0 0 0; }
        .items-table thead th:last-child { border-radius: 0 6px 0 0; }
        .items-table tbody td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        .items-table tbody tr:nth-child(even) { background: #f9fafb; }
        .summary-box { margin-left: auto; width: 300px; }
        .summary-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
        .summary-row.total { font-size: 18px; font-weight: 800; border-top: 2px solid #4f46e5; padding-top: 10px; margin-top: 6px; color: #4f46e5; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 16px; text-align: center; color: #9ca3af; font-size: 11px; }
        .signature-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
        .sig-box { text-align: center; }
        .sig-line { border-top: 1px solid #374151; width: 200px; margin: 40px auto 6px; }
        @media print {
          body { padding: 16px; }
          @page { margin: 12mm; size: A4; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="company-name">POS Bookdee</div>
          <p style="color:#6b7280; font-size:13px;">ระบบจัดการร้านค้าออนไลน์</p>
        </div>
        <div>
          <div class="doc-title">${order.order_status === 'returned' ? 'ใบลดหนี้ / ใบคืนสินค้า' : 'ใบส่งสินค้า / Invoice'}</div>
          <div class="doc-number" style="text-align:right; margin-top:4px;">${order.order_number}</div>
          <p style="text-align:right; color:#6b7280; font-size:12px; margin-top:2px;">วันที่: ${fmtDate(order.created_at)}</p>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <h4>👤 ข้อมูลลูกค้า</h4>
          <p><strong>${order.customer_name || '-'}</strong></p>
          <p>📞 ${order.customer_phone || '-'}</p>
        </div>
        <div class="info-box">
          <h4>📍 ที่อยู่จัดส่ง</h4>
          <p>${order.shipping_address || '-'}</p>
          ${order.tracking_number ? `<p style="margin-top:6px;">📦 <strong>Tracking:</strong> <span style="font-family:monospace;">${order.tracking_number}</span> ${order.shipping_provider ? `(${order.shipping_provider})` : ''}</p>` : ''}
        </div>
        <div class="info-box">
          <h4>📋 รายละเอียดออเดอร์</h4>
          <p><strong>สถานะ:</strong> <span class="status-badge" style="background:#e0e7ff; color:#4f46e5;">${st.label}</span></p>
          <p><strong>ช่องทาง:</strong> ${plat.label}</p>
          <p><strong>ชำระเงิน:</strong> ${payLabel}</p>
        </div>
        <div class="info-box">
          <h4>💰 สถานะชำระเงิน</h4>
          <p><span class="status-badge" style="background:${order.payment_status === 'confirmed' ? '#d1fae5' : '#fef3c7'}; color:${order.payment_status === 'confirmed' ? '#059669' : '#d97706'};">
            ${order.payment_status === 'confirmed' ? '✅ ชำระแล้ว' : order.payment_status === 'refunded' ? '🔄 คืนเงินแล้ว' : '⏳ รอชำระ'}
          </span></p>
          ${order.note ? `<p style="margin-top:6px; color:#6b7280;">📝 ${order.note}</p>` : ''}
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align:center; width:40px;">#</th>
            <th>SKU</th>
            <th>สินค้า</th>
            <th style="text-align:center;">จำนวน</th>
            <th style="text-align:right;">ราคา/หน่วย</th>
            <th style="text-align:right;">ส่วนลด</th>
            <th style="text-align:right;">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="summary-box">
        <div class="summary-row"><span>ยอดสินค้า</span><span>฿${fmt(parseFloat(order.total_amount))}</span></div>
        ${parseFloat(order.shipping_cost) > 0 ? `<div class="summary-row"><span>ค่าจัดส่ง</span><span>฿${fmt(parseFloat(order.shipping_cost))}</span></div>` : ''}
        ${parseFloat(order.discount_amount) > 0 ? `<div class="summary-row"><span>ส่วนลด</span><span style="color:#ef4444;">-฿${fmt(parseFloat(order.discount_amount))}</span></div>` : ''}
        <div class="summary-row total"><span>ยอดสุทธิ</span><span>฿${fmt(parseFloat(order.net_amount))}</span></div>
      </div>

      ${cnSection}

      <div class="signature-area">
        <div class="sig-box">
          <div class="sig-line"></div>
          <p style="font-weight:600;">ผู้ส่งสินค้า</p>
          <p style="color:#9ca3af; font-size:12px;">วันที่ ____/____/____</p>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <p style="font-weight:600;">ผู้รับสินค้า</p>
          <p style="color:#9ca3af; font-size:12px;">วันที่ ____/____/____</p>
        </div>
      </div>

      <div class="footer">
        <p>เอกสารนี้ออกโดยระบบ POS Bookdee • พิมพ์เมื่อ ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      </div>
    </body>
    </html>
  `

  // Open new tab and write print content
  const w = window.open('about:blank', '_blank')
  if (!w) {
    alert('กรุณาอนุญาต popup เพื่อพิมพ์เอกสาร')
    return
  }
  w.document.open()
  w.document.write(htmlContent)
  w.document.close()
  w.onload = () => {
    w.focus()
    w.print()
  }
  // Fallback if onload doesn't fire
  setTimeout(() => {
    w.focus()
    w.print()
  }, 1000)
}
