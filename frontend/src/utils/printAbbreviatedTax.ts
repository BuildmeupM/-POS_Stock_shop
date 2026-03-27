import { fmt } from './formatters'

interface AbbreviatedTaxData {
  company: {
    name: string
    taxId: string
    address: string
    branch?: string
    phone?: string
  }
  docNumber: string
  date: string
  items: Array<{ name: string; qty: number; amount: number }>
  totalAmount: number
  vatAmount: number
  netAmount: number
  vatRate?: number
  cashierName?: string
  footerText?: string
}

/**
 * Print Abbreviated Tax Invoice (ใบกำกับภาษีอย่างย่อ)
 * 80mm thermal receipt format — no buyer details required
 */
export function printAbbreviatedTaxInvoice(data: AbbreviatedTaxData) {
  const {
    company, docNumber, date, items,
    totalAmount, vatAmount, netAmount,
    vatRate = 7, cashierName, footerText,
  } = data

  const itemRows = items.map(item => `
    <tr>
      <td style="text-align:left; padding:2px 0;">${item.name}</td>
      <td style="text-align:center; padding:2px 4px;">${item.qty}</td>
      <td style="text-align:right; padding:2px 0;">${fmt(item.amount)}</td>
    </tr>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>ใบกำกับภาษีอย่างย่อ ${docNumber}</title>
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
    <div class="big">${company.name}</div>
    ${company.address ? `<div style="font-size:11px; color:#555; margin-top:2px;">${company.address}</div>` : ''}
    ${company.branch ? `<div style="font-size:11px; color:#555;">สาขา: ${company.branch}</div>` : ''}
    ${company.phone ? `<div style="font-size:11px; color:#555;">Tel: ${company.phone}</div>` : ''}
    <div style="font-size:11px; color:#555;">เลขประจำตัวผู้เสียภาษี: ${company.taxId}</div>
  </div>

  <div class="divider-thick"></div>

  <!-- Document title -->
  <div class="center bold" style="font-size:15px; margin:6px 0; padding:4px 0; border:1px solid #000; border-radius:2px;">
    ใบกำกับภาษีอย่างย่อ
  </div>

  <!-- Doc info -->
  <div style="font-size:12px; margin:4px 0;">
    <table>
      <tr><td>เลขที่:</td><td class="right" style="font-family:monospace; font-weight:700;">${docNumber}</td></tr>
      <tr><td>วันที่:</td><td class="right">${date}</td></tr>
      ${cashierName ? `<tr><td>พนักงาน:</td><td class="right">${cashierName}</td></tr>` : ''}
    </table>
  </div>

  <div class="divider"></div>

  <!-- Items (price includes VAT) -->
  <table>
    <thead>
      <tr style="border-bottom:1px solid #000; font-size:12px; font-weight:700;">
        <th style="text-align:left; padding:3px 0;">รายการ</th>
        <th style="text-align:center; padding:3px 4px;">จำนวน</th>
        <th style="text-align:right; padding:3px 0;">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="divider"></div>

  <!-- Summary -->
  <table class="summary">
    <tr><td>รวมรายการ (รวม VAT)</td><td class="right">${fmt(totalAmount)}</td></tr>
    <tr style="font-size:11px; color:#666;"><td>ภาษีมูลค่าเพิ่ม ${vatRate}% (รวมอยู่ในราคาแล้ว)</td><td class="right">${fmt(vatAmount)}</td></tr>
  </table>

  <table>
    <tr class="total-row">
      <td>ยอดรวมทั้งสิ้น</td>
      <td class="right">${fmt(netAmount)}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <!-- Legal note -->
  <div class="center" style="margin-top:6px; font-size:10px; color:#555; line-height:1.4;">
    <div>* ราคาสินค้ารวมภาษีมูลค่าเพิ่มแล้ว</div>
    <div>* เอกสารนี้เป็นใบกำกับภาษีอย่างย่อ</div>
    <div>* ตามมาตรา 86/6 แห่งประมวลรัษฎากร</div>
  </div>

  <div class="divider"></div>

  <!-- Footer -->
  <div class="center" style="margin-top:4px; font-size:11px; color:#666;">
    <div>${footerText || 'ขอบคุณที่ใช้บริการ'}</div>
    <div style="margin-top:4px; font-size:10px; color:#aaa;">-- ${company.name} --</div>
  </div>
</body>
</html>`

  const w = window.open('about:blank', '_blank')
  if (!w) { alert('กรุณาอนุญาต popup เพื่อพิมพ์เอกสาร'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.onload = () => { w.focus(); w.print() }
}
