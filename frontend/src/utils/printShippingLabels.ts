/**
 * Print shipping labels — A4 paper, 4 labels per page
 * Each label = A6 size (105mm x 148mm)
 */

interface LabelOrder {
  orderNumber: string
  customerName: string
  customerPhone?: string
  shippingAddress?: string
  platform?: string
  trackingNumber?: string
  shippingProvider?: string
  items?: { name: string; qty: number }[]
  totalAmount?: number
  note?: string
}

interface LabelOptions {
  companyName: string
  companyPhone?: string
  companyAddress?: string
  orders: LabelOrder[]
}

export function printShippingLabels(opts: LabelOptions) {
  const { companyName, companyPhone, companyAddress, orders } = opts

  if (orders.length === 0) {
    alert('ไม่มีออเดอร์ที่จะพิมพ์')
    return
  }

  const labelHtml = orders.map((o, idx) => {
    const itemList = (o.items || []).map(i => `<div class="item-row">${i.name} <span class="item-qty">x${i.qty}</span></div>`).join('')

    return `
      <div class="label">
        <!-- Header: brand + order number -->
        <div class="label-header">
          <div class="label-brand">${companyName}</div>
          <div class="label-order-num">${o.orderNumber}</div>
        </div>

        <div class="label-divider"></div>

        <!-- Body: 2 columns -->
        <div class="label-body">
          <!-- Left: ผู้ส่ง (บน) + ผู้รับ (ล่าง) -->
          <div class="label-left">
            <div class="label-section sender">
              <div class="label-section-title">ผู้ส่ง</div>
              <div class="label-sender-name">${companyName}</div>
              ${companyPhone ? `<div class="label-sender-detail">${companyPhone}</div>` : ''}
              ${companyAddress ? `<div class="label-sender-detail addr">${companyAddress}</div>` : ''}
            </div>

            <div class="label-divider-dashed"></div>

            <div class="label-section">
              <div class="label-section-title">ผู้รับ</div>
              <div class="label-name">${o.customerName || 'ไม่ระบุชื่อ'}</div>
              ${o.customerPhone ? `<div class="label-phone">${o.customerPhone}</div>` : ''}
              ${o.shippingAddress ? `<div class="label-address">${o.shippingAddress}</div>` : ''}
            </div>
          </div>

          <!-- Right: รายการ + ขนส่ง -->
          <div class="label-right">
            <div class="label-section-title">รายการ (${(o.items || []).length} ชิ้น)</div>
            <div class="label-items-list">${itemList || '-'}</div>

            <div class="label-footer">
              <div class="label-footer-left">
                ${o.shippingProvider ? `<span class="label-carrier">${o.shippingProvider}</span>` : ''}
                ${o.platform ? `<span class="label-platform">${o.platform}</span>` : ''}
              </div>
              ${o.trackingNumber ? `<div class="label-tracking">${o.trackingNumber}</div>` : ''}
            </div>
          </div>
        </div>
      </div>
    `
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title> </title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Sarabun',sans-serif; color:#1a1a2e; }

  .labels-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
    width: 297mm;
    padding: 3mm;
  }

  .label {
    width: auto;
    height: 100mm;
    padding: 4mm 5mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    page-break-inside: avoid;
    border: 1px solid #ddd;
    border-radius: 3mm;
  }

  .label-body {
    display: flex;
    gap: 3mm;
    flex: 1;
    overflow: hidden;
  }
  .label-left {
    flex: 1.2;
    display: flex;
    flex-direction: column;
    border-right: 1px dashed #d1d5db;
    padding-right: 3mm;
    overflow: hidden;
  }
  .label-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .item-row {
    font-size: 10px;
    padding: 1px 0;
    display: flex;
    justify-content: space-between;
    border-bottom: 1px dotted #e5e7eb;
  }
  .item-qty {
    font-weight: 700;
    color: #4f46e5;
    flex-shrink: 0;
    margin-left: 4px;
  }

  .label-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1mm;
  }
  .label-brand {
    font-size: 13px;
    font-weight: 800;
    color: #1a1a2e;
  }
  .label-order-num {
    font-family: monospace;
    font-size: 10px;
    font-weight: 700;
    color: #4f46e5;
    background: #eef2ff;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .label-divider {
    border-top: 2px solid #1a1a2e;
    margin: 2mm 0;
  }
  .label-divider-dashed {
    border-top: 1px dashed #d1d5db;
    margin: 2mm 0;
  }

  .label-section { margin-bottom: 1mm; }
  .label-section-title {
    font-size: 9px;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 1mm;
  }
  .label-name {
    font-size: 14px;
    font-weight: 800;
    line-height: 1.2;
  }
  .label-phone {
    font-size: 12px;
    font-weight: 600;
    margin-top: 0.5mm;
  }
  .label-address {
    font-size: 10px;
    color: #374151;
    margin-top: 0.5mm;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .addr {
    -webkit-line-clamp: 2;
  }

  .sender {
    background: #f9fafb;
    padding: 2mm 3mm;
    border-radius: 2mm;
  }
  .label-sender-name {
    font-size: 12px;
    font-weight: 700;
  }
  .label-sender-detail {
    font-size: 10px;
    color: #6b7280;
  }

  .label-items-list {
    flex: 1;
    overflow: hidden;
  }

  .label-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #e5e7eb;
    padding-top: 2mm;
    margin-top: auto;
    flex-wrap: wrap;
    gap: 2px;
  }
  .label-footer-left {
    display: flex;
    gap: 4px;
  }
  .label-carrier {
    font-size: 9px;
    font-weight: 700;
    background: #1a1a2e;
    color: #fff;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .label-platform {
    font-size: 9px;
    font-weight: 600;
    background: #e0e7ff;
    color: #4338ca;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .label-tracking {
    font-family: monospace;
    font-size: 11px;
    font-weight: 700;
    color: #4f46e5;
  }

  @media print {
    body { padding: 0; }
    @page { margin: 0; size: A4 landscape; }
    .labels-grid { padding: 3mm; }
    .label { border: 1px solid #ddd; }
  }

  /* Page break every 4 labels */
  .label:nth-child(4n+1) { grid-column: 1; grid-row-start: auto; }
</style>
</head>
<body>
  <div class="labels-grid">
    ${labelHtml}
  </div>
</body>
</html>`

  const w = window.open('about:blank', '_blank')
  if (!w) { alert('กรุณาอนุญาต popup เพื่อพิมพ์'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.onload = () => { w.focus(); w.print() }
}
