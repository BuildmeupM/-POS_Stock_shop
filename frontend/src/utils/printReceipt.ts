import { fmt } from './formatters'

interface PrintReceiptOptions {
  // Company info
  companyName: string
  companyAddress?: string
  companyPhone?: string
  companyTaxId?: string
  // Receipt info
  receiptNumber: string
  date: string
  cashierName?: string
  customerName?: string
  // Items
  items: { name: string; qty: number; price: number; discount: number; subtotal: number }[]
  // Totals
  subtotal: number
  discountTotal: number
  vatAmount: number
  netAmount: number
  vatRate?: number
  // Payments
  payments?: { method: string; amount: number }[]
  changeAmount?: number
  // Settings
  footerText?: string
  showTaxId?: boolean
  showAddress?: boolean
  receiptType?: 'pos' | 'invoice'  // pos = thermal-style, invoice = A4
}

/**
 * Print POS Receipt — thermal printer style (80mm)
 */
export function printPOSReceipt(opts: PrintReceiptOptions) {
  const {
    companyName, companyAddress, companyPhone, companyTaxId,
    receiptNumber, date, cashierName, customerName,
    items, subtotal, discountTotal, vatAmount, netAmount, vatRate,
    payments, changeAmount, footerText, showTaxId, showAddress,
  } = opts

  const itemRows = items.map(item => `
    <tr>
      <td style="text-align:left; padding:2px 0;">${item.name}</td>
      <td style="text-align:center; padding:2px 4px;">${item.qty}</td>
      <td style="text-align:right; padding:2px 0;">${fmt(item.subtotal)}</td>
    </tr>
    ${item.discount > 0 ? `<tr><td colspan="3" style="text-align:right; color:#888; font-size:11px; padding:0 0 2px;">ส่วนลด -${fmt(item.discount)}</td></tr>` : ''}
  `).join('')

  const paymentRows = (payments || []).map(p => {
    const label = p.method === 'cash' ? 'เงินสด' : p.method === 'transfer' ? 'โอนเงิน' :
      p.method === 'credit_card' ? 'บัตรเครดิต' : p.method === 'qr_code' ? 'QR Code' : p.method
    return `<tr><td style="padding:1px 0;">${label}</td><td style="text-align:right; padding:1px 0;">${fmt(p.amount)}</td></tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title> </title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Sarabun',sans-serif; width:80mm; margin:0 auto; padding:8mm 4mm; font-size:13px; color:#000; }
  .center { text-align:center; }
  .right { text-align:right; }
  .bold { font-weight:700; }
  .big { font-size:18px; font-weight:800; }
  .divider { border-top:1px dashed #999; margin:6px 0; }
  .divider-thick { border-top:2px solid #000; margin:6px 0; }
  table { width:100%; border-collapse:collapse; }
  .summary td { padding:2px 0; }
  .total-row td { font-size:18px; font-weight:800; padding-top:4px; border-top:2px solid #000; }
  @media print { @page { margin:0; size:80mm auto; } body { padding:4mm; } }
</style>
</head>
<body>
  <!-- Header -->
  <div class="center" style="margin-bottom:6px;">
    <div class="big">${companyName}</div>
    ${showAddress !== false && companyAddress ? `<div style="font-size:11px; color:#555; margin-top:2px;">${companyAddress}</div>` : ''}
    ${companyPhone ? `<div style="font-size:11px; color:#555;">Tel: ${companyPhone}</div>` : ''}
    ${showTaxId !== false && companyTaxId ? `<div style="font-size:11px; color:#555;">เลขผู้เสียภาษี: ${companyTaxId}</div>` : ''}
  </div>

  <div class="divider-thick"></div>

  <!-- Receipt info -->
  <div style="font-size:12px; margin:4px 0;">
    <div class="center bold" style="font-size:14px; margin-bottom:4px;">ใบเสร็จรับเงิน${vatAmount > 0 ? ' / ใบกำกับภาษีอย่างย่อ' : ''}</div>
    <table>
      <tr><td>เลขที่:</td><td class="right" style="font-family:monospace; font-weight:700;">${receiptNumber}</td></tr>
      <tr><td>วันที่:</td><td class="right">${date}</td></tr>
      ${cashierName ? `<tr><td>พนักงาน:</td><td class="right">${cashierName}</td></tr>` : ''}
      ${customerName && customerName !== 'ลูกค้าทั่วไป (Walk-in)' ? `<tr><td>ลูกค้า:</td><td class="right">${customerName}</td></tr>` : ''}
    </table>
  </div>

  <div class="divider"></div>

  <!-- Items -->
  <table>
    <thead>
      <tr style="border-bottom:1px solid #000; font-size:12px; font-weight:700;">
        <th style="text-align:left; padding:3px 0;">รายการ</th>
        <th style="text-align:center; padding:3px 4px;">จำนวน</th>
        <th style="text-align:right; padding:3px 0;">รวม</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="divider"></div>

  <!-- Summary -->
  <table class="summary">
    <tr><td>รวมสินค้า</td><td class="right">${fmt(subtotal)}</td></tr>
    ${discountTotal > 0 ? `<tr><td>ส่วนลด</td><td class="right" style="color:red;">-${fmt(discountTotal)}</td></tr>` : ''}
    ${vatAmount > 0 ? `<tr><td>ภาษีมูลค่าเพิ่ม ${vatRate || 7}%</td><td class="right">${fmt(vatAmount)}</td></tr>` : ''}
    ${vatAmount > 0 ? `<tr style="font-size:11px; color:#666;"><td>${vatAmount > 0 ? '(ราคารวม VAT แล้ว)' : ''}</td><td></td></tr>` : ''}
  </table>

  <table>
    <tr class="total-row">
      <td>ยอดสุทธิ</td>
      <td class="right">${fmt(netAmount)}</td>
    </tr>
  </table>

  ${payments && payments.length > 0 ? `
    <div class="divider"></div>
    <table class="summary">
      <tr><td colspan="2" class="bold" style="padding-bottom:2px;">การชำระเงิน</td></tr>
      ${paymentRows}
      ${changeAmount && changeAmount > 0 ? `<tr style="font-weight:700;"><td>เงินทอน</td><td class="right">${fmt(changeAmount)}</td></tr>` : ''}
    </table>
  ` : ''}

  <div class="divider"></div>

  <!-- Footer -->
  <div class="center" style="margin-top:6px; font-size:11px; color:#666;">
    <div>${footerText || 'ขอบคุณที่ใช้บริการ'}</div>
    <div style="margin-top:4px; font-size:10px; color:#aaa;">— ${companyName} —</div>
  </div>
</body>
</html>`

  openPrintWindow(html, receiptNumber)
}

/**
 * Print A4 Invoice — order/delivery note
 */
export function printA4Invoice(opts: PrintReceiptOptions & {
  docTitle?: string
  shippingAddress?: string
  shippingCost?: number
  trackingNumber?: string
  shippingProvider?: string
  platform?: string
  paymentMethod?: string
  paymentStatus?: string
  orderStatus?: string
  customerPhone?: string
  note?: string
}) {
  const {
    companyName, companyAddress, companyPhone, companyTaxId,
    receiptNumber, date, customerName,
    items, subtotal, discountTotal, vatAmount, netAmount, vatRate,
    docTitle, shippingAddress, shippingCost, trackingNumber, shippingProvider,
    platform, paymentMethod, paymentStatus, customerPhone, note, footerText,
    payments, orderStatus,
  } = opts

  const payMethodLabel = (m?: string) =>
    m === 'cash' ? 'เงินสด' : m === 'transfer' ? 'โอนเงิน' :
    m === 'credit_card' ? 'บัตรเครดิต' : m === 'qr_code' ? 'QR Code' :
    m === 'cod' ? 'เก็บเงินปลายทาง' : m || '-'

  const payStatusLabel = (s?: string) =>
    s === 'confirmed' || s === 'paid' ? 'ชำระแล้ว' :
    s === 'refunded' ? 'คืนเงินแล้ว' : 'รอชำระ'

  const payStatusColor = (s?: string) =>
    s === 'confirmed' || s === 'paid' ? '#059669' :
    s === 'refunded' ? '#ef4444' : '#d97706'

  const orderStatusLabel = (s?: string) =>
    s === 'pending' ? 'รอยืนยัน' : s === 'confirmed' ? 'ยืนยันแล้ว' :
    s === 'packing' ? 'กำลังแพ็ค' : s === 'shipped' ? 'จัดส่งแล้ว' :
    s === 'delivered' ? 'ได้รับแล้ว' : s === 'cancelled' ? 'ยกเลิก' :
    s === 'returned' ? 'คืนสินค้า' : s || ''

  const itemRows = items.map((item, i) => `
    <tr>
      <td class="tc">${i + 1}</td>
      <td>${item.name}</td>
      <td class="tc">${item.qty}</td>
      <td class="tr">${fmt(item.price)}</td>
      <td class="tr">${item.discount > 0 ? fmt(item.discount) : '-'}</td>
      <td class="tr bold">${fmt(item.subtotal)}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title> </title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Sarabun',sans-serif; color:#1a1a2e; padding:40px; font-size:14px; line-height:1.5; }
  .tc { text-align:center; } .tr { text-align:right; } .bold { font-weight:700; }

  .header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:18px; border-bottom:3px solid #1a1a2e; margin-bottom:20px; }
  .brand { font-size:24px; font-weight:800; color:#1a1a2e; }
  .brand-sub { font-size:11px; color:#6b7280; margin-top:1px; }
  .doc-type { font-size:18px; font-weight:800; color:#1a1a2e; text-align:right; }
  .doc-num { font-family:monospace; font-size:14px; color:#4f46e5; font-weight:700; margin-top:3px; text-align:right; }
  .doc-date { font-size:11px; color:#6b7280; text-align:right; margin-top:2px; }

  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px; }
  .info-box { border:1px solid #e5e7eb; border-radius:6px; padding:12px 14px; font-size:13px; }
  .info-box .lbl { font-size:10px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.8px; font-weight:700; margin-bottom:6px; border-bottom:1px solid #f3f4f6; padding-bottom:4px; }
  .info-row { display:flex; justify-content:space-between; padding:2px 0; }
  .info-row .k { color:#6b7280; }
  .info-row .v { font-weight:600; }
  .badge { display:inline-block; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:700; }

  .items { width:100%; border-collapse:collapse; margin-bottom:16px; }
  .items thead th { background:#1a1a2e; color:#fff; padding:8px 10px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; }
  .items thead th:first-child { border-radius:6px 0 0 0; }
  .items thead th:last-child { border-radius:0 6px 0 0; }
  .items tbody td { padding:8px 10px; border-bottom:1px solid #f3f4f6; font-size:12px; }
  .items tbody tr:nth-child(even) { background:#fafbfc; }

  .summary-wrap { display:flex; justify-content:flex-end; }
  .summary { width:300px; }
  .summary .row { display:flex; justify-content:space-between; padding:3px 0; font-size:13px; }
  .summary .total { font-size:18px; font-weight:800; border-top:3px solid #1a1a2e; padding-top:8px; margin-top:6px; }

  .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:50px; }
  .sig-box { text-align:center; }
  .sig-line { border-top:1px solid #374151; width:180px; margin:40px auto 4px; }
  .sig-name { font-weight:600; font-size:13px; }
  .sig-date { color:#9ca3af; font-size:10px; }

  .footer { margin-top:30px; border-top:1px solid #e5e7eb; padding-top:10px; text-align:center; color:#9ca3af; font-size:9px; }
  @media print { body { padding:14px; } @page { margin:8mm; size:A4; } }
</style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">${companyName}</div>
      ${companyAddress ? `<div class="brand-sub">${companyAddress}</div>` : ''}
      ${companyPhone ? `<div class="brand-sub">Tel: ${companyPhone}</div>` : ''}
      ${companyTaxId ? `<div class="brand-sub">เลขผู้เสียภาษี: ${companyTaxId}</div>` : ''}
    </div>
    <div>
      <div class="doc-type">${docTitle || 'ใบเสร็จรับเงิน / ใบกำกับภาษี'}</div>
      <div class="doc-num">${receiptNumber}</div>
      <div class="doc-date">วันที่: ${date}</div>
      ${orderStatus ? `<div style="text-align:right; margin-top:4px;"><span class="badge" style="background:#e0e7ff; color:#4338ca;">${orderStatusLabel(orderStatus)}</span></div>` : ''}
    </div>
  </div>

  <!-- Info: 2x2 grid -->
  <div class="info-grid">
    <!-- ลูกค้า -->
    <div class="info-box">
      <div class="lbl">ข้อมูลลูกค้า</div>
      <div class="info-row"><span class="k">ชื่อ</span><span class="v">${customerName || 'ลูกค้าทั่วไป'}</span></div>
      ${customerPhone ? `<div class="info-row"><span class="k">โทร</span><span class="v">${customerPhone}</span></div>` : ''}
      ${shippingAddress ? `<div style="font-size:11px; color:#6b7280; margin-top:4px; border-top:1px dashed #e5e7eb; padding-top:4px;">ที่อยู่: ${shippingAddress}</div>` : ''}
    </div>

    <!-- จัดส่ง -->
    <div class="info-box">
      <div class="lbl">การจัดส่ง</div>
      ${platform ? `<div class="info-row"><span class="k">ช่องทาง</span><span class="v">${platform}</span></div>` : ''}
      ${trackingNumber
        ? `<div class="info-row"><span class="k">Tracking</span><span class="v" style="font-family:monospace; color:#4f46e5;">${trackingNumber}</span></div>
           ${shippingProvider ? `<div class="info-row"><span class="k">ขนส่ง</span><span class="v">${shippingProvider}</span></div>` : ''}`
        : `<div style="color:#d1d5db; font-size:12px;">— ยังไม่ระบุ —</div>`}
    </div>

    <!-- ชำระเงิน -->
    <div class="info-box">
      <div class="lbl">การชำระเงิน</div>
      <div class="info-row"><span class="k">วิธีชำระ</span><span class="v">${payMethodLabel(paymentMethod)}</span></div>
      <div class="info-row"><span class="k">สถานะ</span><span class="v" style="color:${payStatusColor(paymentStatus)};">${payStatusLabel(paymentStatus)}</span></div>
      ${(payments && payments.length > 0) ? `
        <div style="border-top:1px dashed #e5e7eb; margin-top:4px; padding-top:4px;">
          ${payments.map(p => `<div class="info-row" style="font-size:11px;"><span class="k">${payMethodLabel(p.method)}</span><span>฿${fmt(p.amount)}</span></div>`).join('')}
        </div>` : ''}
    </div>

    <!-- หมายเหตุ -->
    <div class="info-box">
      <div class="lbl">หมายเหตุ</div>
      <div style="font-size:12px; color:${note ? '#374151' : '#d1d5db'};">${note || '— ไม่มี —'}</div>
    </div>
  </div>

  <!-- Items -->
  <table class="items">
    <thead>
      <tr>
        <th class="tc" style="width:35px;">#</th>
        <th style="text-align:left;">รายการสินค้า</th>
        <th class="tc" style="width:60px;">จำนวน</th>
        <th class="tr" style="width:90px;">ราคา/หน่วย</th>
        <th class="tr" style="width:70px;">ส่วนลด</th>
        <th class="tr" style="width:100px;">รวม (฿)</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <!-- Summary -->
  <div class="summary-wrap">
    <div class="summary">
      <div class="row"><span>รวมสินค้า (${items.length} รายการ)</span><span>${fmt(subtotal)}</span></div>
      ${discountTotal > 0 ? `<div class="row"><span>ส่วนลด</span><span style="color:#ef4444;">-${fmt(discountTotal)}</span></div>` : ''}
      ${(shippingCost || 0) > 0 ? `<div class="row"><span>ค่าจัดส่ง</span><span>${fmt(shippingCost || 0)}</span></div>` : ''}
      ${vatAmount > 0 ? `<div class="row"><span>ภาษีมูลค่าเพิ่ม ${vatRate || 7}%</span><span>${fmt(vatAmount)}</span></div>` : ''}
      <div class="row total"><span>ยอดสุทธิ</span><span>฿${fmt(netAmount)}</span></div>
    </div>
  </div>

  <!-- Signatures -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">ผู้ส่งสินค้า</div>
      <div class="sig-date">วันที่ ____/____/____</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-name">ผู้รับสินค้า</div>
      <div class="sig-date">วันที่ ____/____/____</div>
    </div>
  </div>

  <div class="footer">
    <div>${footerText || 'ขอบคุณที่ใช้บริการ'}</div>
    <div style="margin-top:3px;">เอกสารนี้ออกโดยระบบ ${companyName} • พิมพ์เมื่อ ${new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
  </div>
</body>
</html>`

  openPrintWindow(html, receiptNumber)
}

function openPrintWindow(html: string, title: string) {
  const w = window.open('about:blank', '_blank')
  if (!w) { alert('กรุณาอนุญาต popup เพื่อพิมพ์เอกสาร'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  // Only print once via onload
  w.onload = () => { w.focus(); w.print() }
}
