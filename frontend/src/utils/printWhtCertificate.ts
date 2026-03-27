import { fmt } from './formatters'

interface WhtPrintData {
  // Payer (company) info
  company: {
    name: string
    taxId: string
    address: string
    branch?: string
    phone?: string
  }
  // Payee (vendor/contact) info
  payee: {
    name: string
    taxId?: string
    address?: string
  }
  // Certificate details
  certificateNumber: string
  formType: 'pnd3' | 'pnd53'
  paymentDate: string
  incomeType: string
  incomeDescription?: string
  paidAmount: number
  whtRate: number
  whtAmount: number
  taxMonth: number
  taxYear: number
}

/**
 * Convert number to Thai baht text
 */
function bahtText(amount: number): string {
  const txt = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const pos = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  if (amount === 0) return 'ศูนย์บาทถ้วน'

  const [intPart, decPart] = amount.toFixed(2).split('.')

  function convertGroup(numStr: string): string {
    let result = ''
    const len = numStr.length
    for (let i = 0; i < len; i++) {
      const digit = parseInt(numStr[i])
      const position = len - i - 1
      if (digit === 0) continue
      if (position === 1 && digit === 1) {
        result += 'สิบ'
      } else if (position === 1 && digit === 2) {
        result += 'ยี่สิบ'
      } else if (position === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด'
      } else {
        result += txt[digit] + pos[position]
      }
    }
    return result
  }

  let result = ''
  const intNum = parseInt(intPart)
  if (intNum > 0) {
    // Handle millions recursively
    if (intNum >= 1000000) {
      const millions = Math.floor(intNum / 1000000)
      const remainder = intNum % 1000000
      result += convertGroup(millions.toString()) + 'ล้าน'
      if (remainder > 0) result += convertGroup(remainder.toString())
    } else {
      result += convertGroup(intPart)
    }
    result += 'บาท'
  }

  const decNum = parseInt(decPart)
  if (decNum > 0) {
    result += convertGroup(decPart) + 'สตางค์'
  } else {
    result += 'ถ้วน'
  }

  return result
}

const thaiMonths = [
  '', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/**
 * Print WHT Certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย)
 * A4 portrait format following Thai Revenue Department format
 */
export function printWhtCertificate(data: WhtPrintData) {
  const {
    company, payee, certificateNumber, formType,
    paymentDate, incomeType, incomeDescription,
    paidAmount, whtRate, whtAmount, taxMonth, taxYear,
  } = data

  const formTypeLabel = formType === 'pnd3' ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53'
  const isPnd3 = formType === 'pnd3'
  const whtAmountText = bahtText(whtAmount)

  // Format payment date to Thai
  const payDate = new Date(paymentDate)
  const payDateStr = `${payDate.getDate()} ${thaiMonths[payDate.getMonth() + 1]} ${payDate.getFullYear() + 543}`

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>หนังสือรับรองหัก ณ ที่จ่าย ${certificateNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Sarabun',sans-serif; color:#000; padding:30px 40px; font-size:13px; line-height:1.6; }
  .tc { text-align:center; } .tr { text-align:right; } .bold { font-weight:700; }

  .title { font-size:18px; font-weight:800; text-align:center; margin-bottom:4px; }
  .subtitle { font-size:13px; text-align:center; margin-bottom:16px; color:#333; }

  .cert-number { text-align:right; margin-bottom:12px; font-size:13px; }
  .cert-number span { font-family:monospace; font-weight:700; font-size:14px; padding:2px 8px; border:1px solid #000; }

  .section { border:1px solid #000; padding:12px 16px; margin-bottom:12px; position:relative; }
  .section-label { position:absolute; top:-10px; left:12px; background:#fff; padding:0 6px; font-weight:700; font-size:12px; }

  .form-row { display:flex; gap:8px; margin:4px 0; align-items:baseline; }
  .form-row .label { min-width:100px; color:#333; }
  .form-row .value { flex:1; font-weight:600; border-bottom:1px dotted #999; padding-bottom:1px; min-height:18px; }

  .checkbox { display:inline-flex; align-items:center; gap:4px; margin-right:16px; font-size:12px; }
  .checkbox .box { width:14px; height:14px; border:1.5px solid #000; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; }
  .checkbox .box.checked { background:#000; color:#fff; }

  .income-table { width:100%; border-collapse:collapse; margin:8px 0; }
  .income-table th { background:#f5f5f5; border:1px solid #000; padding:6px 8px; font-size:11px; font-weight:700; text-align:center; }
  .income-table td { border:1px solid #000; padding:6px 8px; font-size:12px; }

  .amount-text { margin:8px 0; padding:8px 12px; border:1px solid #ccc; background:#fafafa; font-size:12px; }

  .sig-grid { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:40px; }
  .sig-box { text-align:center; }
  .sig-line { border-top:1px solid #000; width:200px; margin:50px auto 4px; }
  .sig-label { font-size:12px; color:#333; }
  .sig-date { color:#666; font-size:11px; margin-top:2px; }

  .footer { margin-top:30px; border-top:1px solid #ddd; padding-top:8px; text-align:center; color:#999; font-size:9px; }

  @media print { body { padding:15px 25px; } @page { margin:10mm; size:A4 portrait; } }
</style>
</head>
<body>
  <!-- Title -->
  <div class="title">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
  <div class="subtitle">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>

  <!-- Certificate Number & Form Type -->
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
    <div>
      <span class="checkbox"><span class="box ${isPnd3 ? 'checked' : ''}">${isPnd3 ? '/' : ''}</span> ภ.ง.ด.3</span>
      <span class="checkbox"><span class="box ${!isPnd3 ? 'checked' : ''}">${!isPnd3 ? '/' : ''}</span> ภ.ง.ด.53</span>
    </div>
    <div class="cert-number">เลขที่ <span>${certificateNumber}</span></div>
  </div>

  <!-- Section 1: Payer Info (ผู้จ่ายเงิน) -->
  <div class="section">
    <div class="section-label">ส่วนที่ 1 — ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (ผู้จ่ายเงิน)</div>
    <div class="form-row">
      <span class="label">ชื่อ</span>
      <span class="value">${company.name}</span>
    </div>
    <div class="form-row">
      <span class="label">เลขประจำตัวผู้เสียภาษี</span>
      <span class="value">${company.taxId || '-'}</span>
      ${company.branch ? `<span class="label" style="min-width:auto;">สาขา</span><span class="value" style="max-width:120px;">${company.branch}</span>` : ''}
    </div>
    <div class="form-row">
      <span class="label">ที่อยู่</span>
      <span class="value">${company.address || '-'}</span>
    </div>
  </div>

  <!-- Section 2: Payee Info (ผู้ถูกหักภาษี) -->
  <div class="section">
    <div class="section-label">ส่วนที่ 2 — ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับเงิน)</div>
    <div class="form-row">
      <span class="label">ชื่อ</span>
      <span class="value">${payee.name}</span>
    </div>
    <div class="form-row">
      <span class="label">เลขประจำตัวผู้เสียภาษี</span>
      <span class="value">${payee.taxId || '-'}</span>
    </div>
    <div class="form-row">
      <span class="label">ที่อยู่</span>
      <span class="value">${payee.address || '-'}</span>
    </div>
  </div>

  <!-- Section 3: Income Details -->
  <div class="section">
    <div class="section-label">ส่วนที่ 3 — รายละเอียดเงินได้ที่จ่ายและภาษีที่หัก ณ ที่จ่าย</div>

    <div style="margin:4px 0 8px;">
      <span class="checkbox"><span class="box checked">/</span> หักภาษี ณ ที่จ่าย</span>
      <span style="font-size:12px; color:#333;">เดือนภาษี: ${thaiMonths[taxMonth]} พ.ศ. ${taxYear + 543}</span>
    </div>

    <table class="income-table">
      <thead>
        <tr>
          <th style="width:40px;">ลำดับ</th>
          <th>ประเภทเงินได้</th>
          <th style="width:130px;">จำนวนเงินที่จ่าย</th>
          <th style="width:80px;">อัตราภาษี</th>
          <th style="width:130px;">ภาษีที่หักไว้</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="tc">1</td>
          <td>${incomeType}${incomeDescription ? ` — ${incomeDescription}` : ''}</td>
          <td class="tr bold">${fmt(paidAmount)}</td>
          <td class="tc">${whtRate}%</td>
          <td class="tr bold">${fmt(whtAmount)}</td>
        </tr>
        <tr style="font-weight:700; background:#f9f9f9;">
          <td></td>
          <td class="tr">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
          <td class="tr" style="font-size:14px;">${fmt(paidAmount)}</td>
          <td></td>
          <td class="tr" style="font-size:14px;">${fmt(whtAmount)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Section 4: Amount in Words -->
  <div class="amount-text">
    <span class="bold">จำนวนภาษีที่หักไว้ (ตัวอักษร):</span> ${whtAmountText}
  </div>

  <!-- Payment Date -->
  <div style="margin:8px 0; font-size:12px;">
    <span class="bold">วันที่จ่ายเงิน:</span> ${payDateStr}
    &nbsp;&nbsp;&nbsp;
    <span class="bold">แบบยื่น:</span> ${formTypeLabel}
  </div>

  <!-- Signatures -->
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label bold">ผู้จ่ายเงิน (ผู้หักภาษี ณ ที่จ่าย)</div>
      <div class="sig-date">${company.name}</div>
      <div class="sig-date">วันที่ ____/____/____</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label bold">ผู้รับเงิน (ผู้ถูกหักภาษี ณ ที่จ่าย)</div>
      <div class="sig-date">${payee.name}</div>
      <div class="sig-date">วันที่ ____/____/____</div>
    </div>
  </div>

  <div class="footer">
    <div>เอกสารนี้ออกโดยระบบ ${company.name} | พิมพ์เมื่อ ${new Date().toLocaleDateString('th-TH', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
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
