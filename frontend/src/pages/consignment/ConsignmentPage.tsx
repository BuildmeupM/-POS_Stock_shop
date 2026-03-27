import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Text, Group, Table, Badge, Loader, Stack, Button, Modal, TextInput, NumberInput,
  Select, SimpleGrid, SegmentedControl, Textarea, ActionIcon, Tooltip, Alert, Divider,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconContract, IconPackageImport, IconPackageExport, IconCash,
  IconPlus, IconTrash, IconFileInvoice, IconRefresh, IconPrinter,
  IconAlertTriangle, IconEye, IconArrowLeft, IconReceipt,
} from '@tabler/icons-react'
import api from '../../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => n.toLocaleString('th-TH')
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('th-TH') : '—'
const fmtDateTime = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
/** Format Date to local YYYY-MM-DD (avoids UTC timezone shift from toISOString) */
const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const PRINT_STYLE = `@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Sarabun',sans-serif;color:#333;font-size:14px}
.page{max-width:210mm;margin:0 auto;padding:20mm 15mm}
.header{text-align:center;border-bottom:3px solid #4f46e5;padding-bottom:16px;margin-bottom:24px}
.title{font-size:24px;font-weight:700;color:#4f46e5}.title-en{font-size:13px;color:#888;letter-spacing:1px}
.doc-no{font-size:14px;font-weight:600;margin-top:8px}
.doc-date{font-size:12px;color:#888;margin-top:4px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
.info-box{padding:14px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa}
.info-label{font-size:11px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:6px}
.info-row{display:flex;justify-content:space-between;padding:2px 0;font-size:13px}
.info-row .label{color:#666}.info-row .value{font-weight:600}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead th{background:#f5f3ff;padding:10px 6px;font-size:12px;font-weight:700;border-bottom:2px solid #c4b5fd;text-align:left}
thead th.r{text-align:right}
td{padding:8px 6px;border-bottom:1px solid #e5e7eb;font-size:13px}td.r{text-align:right}
.totals{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px}
.total-row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}
.total-row.big{font-size:18px;font-weight:700;color:#4f46e5;border-top:2px solid #c4b5fd;padding-top:10px;margin-top:6px}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px}
.sig-box{text-align:center}.sig-line{border-top:1px solid #333;margin-top:50px;padding-top:6px;font-size:12px}
.sig-date{font-size:11px;color:#888;margin-top:2px}
.note{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px;margin-bottom:20px;font-size:13px}
@media print{@page{size:A4;margin:15mm}.page{padding:0;max-width:none}}`

type Tab = 'agreements' | 'stock' | 'settlements'

export default function ConsignmentPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('agreements')

  // ── Data queries ──
  const { data: vendors = [] } = useQuery({
    queryKey: ['contacts-vendors'],
    queryFn: () => api.get('/contacts', { params: { type: 'vendor' } }).then(r => r.data),
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-consignment'],
    queryFn: () => api.get('/products').then(r => r.data),
  })
  const { data: agreements = [], isLoading: loadAg } = useQuery({
    queryKey: ['consignment-agreements'],
    queryFn: () => api.get('/consignment/agreements').then(r => r.data),
  })
  const { data: stock = [], isLoading: loadSt } = useQuery({
    queryKey: ['consignment-stock'],
    queryFn: () => api.get('/consignment/stock').then(r => r.data),
    enabled: tab === 'stock',
  })
  const { data: settlements = [], isLoading: loadSet } = useQuery({
    queryKey: ['consignment-settlements'],
    queryFn: () => api.get('/consignment/settlements').then(r => r.data),
    enabled: tab === 'settlements',
  })

  // ── Modal states ──
  const [addAgOpen, setAddAgOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  const [renewOpen, setRenewOpen] = useState(false)
  const [renewAgId, setRenewAgId] = useState<number | null>(null)
  const [renewForm, setRenewForm] = useState({ newEndDate: null as Date | null, commissionType: 'percent', commissionRate: 15, paymentTerms: 30, note: '' })
  const [lastRenewal, setLastRenewal] = useState<any>(null)
  const [settlementDetail, setSettlementDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmPayId, setConfirmPayId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // ── Agreement form ──
  const [agForm, setAgForm] = useState({ contactId: '', startDate: null as Date | null, endDate: null as Date | null, commissionType: 'percent', commissionRate: 15, paymentTerms: 30, note: '' })

  const createAgMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/agreements', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `สร้างสัญญา ${res.data.agreementNumber}`, color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-agreements'] })
      setAddAgOpen(false)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' }),
  })

  // ── Receive form ──
  const [recAgId, setRecAgId] = useState('')
  const [recItems, setRecItems] = useState([{ productId: '', quantity: 1, consignorPrice: 0, sellingPrice: 0 }])

  const receiveMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/stock/receive', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'รับสินค้าฝากขายเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-stock'] })
      queryClient.invalidateQueries({ queryKey: ['consignment-agreements'] })
      setReceiveOpen(false)
      setRecItems([{ productId: '', quantity: 1, consignorPrice: 0, sellingPrice: 0 }])
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถรับสินค้าได้', color: 'red' }),
  })

  // ── Return form ──
  const [retAgId, setRetAgId] = useState('')
  const [retItems, setRetItems] = useState([{ productId: '', quantity: 1 }])

  const returnMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/stock/return', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'คืนสินค้าเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-stock'] })
      setReturnOpen(false)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถคืนได้', color: 'red' }),
  })

  // ── Record sale form (บันทึกยอดขายฝากขาย) ──
  const [saleOpen, setSaleOpen] = useState(false)
  const [saleAgId, setSaleAgId] = useState('')
  const [saleDate, setSaleDate] = useState<Date | null>(new Date())
  const [saleNote, setSaleNote] = useState('')
  const [saleItems, setSaleItems] = useState([{ productId: '', quantity: 1, sellingPrice: 0 }])

  // Filter stock items for the selected agreement
  const saleStockForAg = stock.filter((s: any) => String(s.agreement_id) === saleAgId && parseInt(s.quantity_on_hand) > 0)

  const handleSaleProductChange = useCallback((index: number, productId: string) => {
    const updated = [...saleItems]
    updated[index].productId = productId
    if (productId && saleAgId) {
      const stockItem = stock.find((s: any) => String(s.product_id) === productId && String(s.agreement_id) === saleAgId)
      if (stockItem) {
        updated[index].sellingPrice = parseFloat(stockItem.selling_price) || 0
      }
    }
    setSaleItems(updated)
  }, [saleItems, stock, saleAgId])

  const saleMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/stock/record-sale', data),
    onSuccess: (res) => {
      notifications.show({
        title: 'บันทึกยอดขายสำเร็จ',
        message: `เลขที่ ${res.data.invoiceNumber} — ยอดขาย ฿${fmt(res.data.totalAmount)} | ค่าคอมฯ ฿${fmt(res.data.totalCommission)}`,
        color: 'green',
      })
      queryClient.invalidateQueries({ queryKey: ['consignment-stock'] })
      queryClient.invalidateQueries({ queryKey: ['consignment-settlements'] })
      setSaleOpen(false)
      setSaleItems([{ productId: '', quantity: 1, sellingPrice: 0 }])
      setSaleNote('')
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกยอดขายได้', color: 'red' }),
  })

  // Product options for sale modal (only products in selected agreement's stock)
  const saleProductOptions = saleStockForAg.map((s: any) => ({
    value: String(s.product_id),
    label: `${s.product_name} (${s.sku}) — คงเหลือ ${s.quantity_on_hand}`,
  }))

  // ── Settlement form ──
  const [setAgId, setSetAgId] = useState('')
  const [setPeriod, setSetPeriod] = useState<[Date | null, Date | null]>([
    new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date()
  ])
  const [preview, setPreview] = useState<any>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const handlePreview = async () => {
    if (!setAgId || !setPeriod[0] || !setPeriod[1]) return
    setPreviewLoading(true)
    try {
      const res = await api.post('/consignment/settlements/preview', {
        agreementId: parseInt(setAgId),
        periodFrom: toLocalDateStr(setPeriod[0]),
        periodTo: toLocalDateStr(setPeriod[1]),
      })
      setPreview(res.data)
    } catch {
      setPreview(null)
      notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถดึงข้อมูลได้', color: 'red' })
    } finally {
      setPreviewLoading(false)
    }
  }

  const settleMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/settlements', data),
    onSuccess: (res) => {
      notifications.show({
        title: 'สำเร็จ',
        message: `สร้างใบสรุป ${res.data.settlementNumber} — ยอดจ่าย ฿${fmt(res.data.netPayable)}`,
        color: 'green',
      })
      queryClient.invalidateQueries({ queryKey: ['consignment-settlements'] })
      setSettleOpen(false)
      setPreview(null)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/consignment/settlements/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบใบสรุปสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-settlements'] })
      setConfirmDeleteId(null)
    },
    onError: (err: any) => { notifications.show({ title: 'ลบไม่สำเร็จ', message: err.response?.data?.message || 'ไม่สามารถลบใบสรุปได้ กรุณาลองใหม่', color: 'red' }); setConfirmDeleteId(null) },
  })

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`/consignment/settlements/${id}/pay`, { paymentMethod: 'transfer' }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'บันทึกจ่ายเงินเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-settlements'] })
      setConfirmPayId(null)
    },
    onError: (err: any) => { notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || '', color: 'red' }); setConfirmPayId(null) },
  })

  // ── Renewal mutation ──
  const renewMutation = useMutation({
    mutationFn: (data: { agId: number; body: any }) => api.post(`/consignment/agreements/${data.agId}/renew`, data.body),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `ฝากต่อสำเร็จ สัญญาใหม่: ${res.data.agreement?.agreement_number}`, color: 'green' })
      setLastRenewal(res.data)
      queryClient.invalidateQueries({ queryKey: ['consignment-agreements'] })
      queryClient.invalidateQueries({ queryKey: ['consignment-stock'] })
      setRenewOpen(false)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถฝากต่อได้', color: 'red' }),
  })

  const openRenew = (ag: any) => {
    setRenewAgId(ag.id)
    setRenewForm({
      newEndDate: null,
      commissionType: ag.commission_type || 'percent',
      commissionRate: parseFloat(ag.commission_rate) || 15,
      paymentTerms: ag.payment_terms || 30,
      note: '',
    })
    setRenewOpen(true)
  }

  // ── Auto-fill price when product selected in receive form ──
  const handleRecProductChange = useCallback((index: number, productId: string) => {
    const updated = [...recItems]
    updated[index].productId = productId
    if (productId) {
      const product = products.find((p: any) => String(p.id) === productId)
      if (product) {
        updated[index].consignorPrice = parseFloat(product.cost_price) || 0
        updated[index].sellingPrice = parseFloat(product.selling_price) || 0
      }
      // Also try to fill from existing consignment stock (last known prices)
      if (recAgId) {
        const existing = stock.find((s: any) => String(s.product_id) === productId && String(s.agreement_id) === recAgId)
        if (existing) {
          updated[index].consignorPrice = parseFloat(existing.consignor_price) || updated[index].consignorPrice
          updated[index].sellingPrice = parseFloat(existing.selling_price) || updated[index].sellingPrice
        }
      }
    }
    setRecItems(updated)
  }, [recItems, products, stock, recAgId])

  // ── Settlement detail view ──
  const openSettlementDetail = async (id: number) => {
    setDetailLoading(true)
    try {
      const res = await api.get(`/consignment/settlements/${id}`)
      setSettlementDetail(res.data)
    } catch {
      notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถดึงรายละเอียดได้', color: 'red' })
    } finally {
      setDetailLoading(false)
    }
  }

  // ── Expiring agreements warning ──
  const expiringAgreements = agreements.filter((a: any) => {
    if (a.status !== 'active' || !a.end_date) return false
    const daysLeft = Math.ceil((new Date(a.end_date).getTime() - Date.now()) / 86400000)
    return daysLeft <= 30 && daysLeft >= 0
  })
  const expiredAgreements = agreements.filter((a: any) => {
    if (a.status !== 'active' || !a.end_date) return false
    return new Date(a.end_date).getTime() < Date.now()
  })

  // ══════════════════════════════════════════════════════════
  // PRINT FUNCTIONS
  // ══════════════════════════════════════════════════════════
  const openPrintWindow = (title: string, content: string) => {
    const pw = window.open('', '_blank', 'width=900,height=1200')
    if (!pw) return
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLE}</style></head><body>${content}</body></html>`)
    pw.document.close()
    pw.focus()
    setTimeout(() => pw.print(), 600)
  }

  const printReceive = (agId: string, items: any[]) => {
    const ag = agreements.find((a: any) => String(a.id) === agId)
    if (!ag) return
    const rows = items.filter(i => i.productId).map(i => {
      const p = products.find((pr: any) => String(pr.id) === i.productId)
      return `<tr><td>${p?.sku || ''}</td><td>${p?.name || ''}</td><td class="r">${fmtInt(i.quantity)}</td><td class="r">฿${fmt(i.consignorPrice)}</td><td class="r">฿${fmt(i.sellingPrice)}</td><td class="r">฿${fmt(i.quantity * i.consignorPrice)}</td></tr>`
    }).join('')
    const total = items.filter(i => i.productId).reduce((s, i) => s + i.quantity * i.consignorPrice, 0)
    openPrintWindow(`ใบรับสินค้าฝากขาย`, `<div class="page">
      <div class="header"><div class="title">ใบรับสินค้าฝากขาย</div><div class="title-en">CONSIGNMENT RECEIVING NOTE</div>
        <div class="doc-date">วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">สัญญา</div>
          <div class="info-row"><span class="label">เลขที่</span><span class="value">${ag.agreement_number}</span></div>
          <div class="info-row"><span class="label">ผู้ฝากขาย</span><span class="value">${ag.contact_name}</span></div></div>
        <div class="info-box"><div class="info-label">สรุป</div>
          <div class="info-row"><span class="label">จำนวนรายการ</span><span class="value">${items.filter(i => i.productId).length} รายการ</span></div>
          <div class="info-row"><span class="label">มูลค่ารวม (ราคาผู้ฝาก)</span><span class="value">฿${fmt(total)}</span></div></div>
      </div>
      <table><thead><tr><th>SKU</th><th>สินค้า</th><th class="r">จำนวน</th><th class="r">ราคาผู้ฝาก</th><th class="r">ราคาขาย</th><th class="r">รวม</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sig">
        <div class="sig-box"><div class="sig-line">ผู้ส่งมอบ (ผู้ฝากขาย)</div><div class="sig-date">วันที่ ____/____/________</div></div>
        <div class="sig-box"><div class="sig-line">ผู้รับสินค้า</div><div class="sig-date">วันที่ ____/____/________</div></div>
      </div></div>`)
  }

  const printReturn = (agId: string, items: any[]) => {
    const ag = agreements.find((a: any) => String(a.id) === agId)
    if (!ag) return
    const rows = items.filter(i => i.productId).map(i => {
      const p = products.find((pr: any) => String(pr.id) === i.productId)
      return `<tr><td>${p?.sku || ''}</td><td>${p?.name || ''}</td><td class="r">${fmtInt(i.quantity)}</td></tr>`
    }).join('')
    openPrintWindow(`ใบคืนสินค้าฝากขาย`, `<div class="page">
      <div class="header"><div class="title">ใบคืนสินค้าฝากขาย</div><div class="title-en">CONSIGNMENT RETURN NOTE</div>
        <div class="doc-date">วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">สัญญา</div>
          <div class="info-row"><span class="label">เลขที่</span><span class="value">${ag.agreement_number}</span></div>
          <div class="info-row"><span class="label">ผู้ฝากขาย</span><span class="value">${ag.contact_name}</span></div></div>
        <div class="info-box"><div class="info-label">สรุป</div>
          <div class="info-row"><span class="label">จำนวนรายการ</span><span class="value">${items.filter(i => i.productId).length} รายการ</span></div>
          <div class="info-row"><span class="label">จำนวนรวม</span><span class="value">${fmtInt(items.filter(i => i.productId).reduce((s, i) => s + i.quantity, 0))} ชิ้น</span></div></div>
      </div>
      <table><thead><tr><th>SKU</th><th>สินค้า</th><th class="r">จำนวนที่คืน</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sig">
        <div class="sig-box"><div class="sig-line">ผู้คืนสินค้า</div><div class="sig-date">วันที่ ____/____/________</div></div>
        <div class="sig-box"><div class="sig-line">ผู้รับคืน (ผู้ฝากขาย)</div><div class="sig-date">วันที่ ____/____/________</div></div>
      </div></div>`)
  }

  const printSettlement = (s: any) => {
    const itemRows = (s.items || []).map((i: any) => `<tr>
      <td>${fmtDateTime(i.sale_date || i.created_at)}</td><td>${i.sale_number || '—'}</td>
      <td>${i.product_name}</td><td class="r">${fmtInt(i.quantity)}</td>
      <td class="r">฿${fmt(parseFloat(i.selling_price))}</td>
      <td class="r">฿${fmt(i.quantity * parseFloat(i.selling_price))}</td>
      <td class="r">฿${fmt(parseFloat(i.commission_amount) || 0)}</td></tr>`).join('')
    openPrintWindow(`ใบสรุปยอดฝากขาย ${s.settlement_number}`, `<div class="page">
      <div class="header"><div class="title">ใบสรุปยอดฝากขาย</div><div class="title-en">CONSIGNMENT SETTLEMENT</div>
        <div class="doc-no">เลขที่: ${s.settlement_number}</div>
        <div class="doc-date">วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">ข้อมูลสัญญา</div>
          <div class="info-row"><span class="label">สัญญาเลขที่</span><span class="value">${s.agreement_number}</span></div>
          <div class="info-row"><span class="label">ผู้ฝากขาย</span><span class="value">${s.contact_name}</span></div>
          <div class="info-row"><span class="label">ค่าคอมฯ</span><span class="value">${s.commission_type === 'percent' ? s.commission_rate + '%' : '฿' + fmt(parseFloat(s.commission_rate)) + '/ชิ้น'}</span></div></div>
        <div class="info-box"><div class="info-label">งวดสรุปยอด</div>
          <div class="info-row"><span class="label">ตั้งแต่</span><span class="value">${fmtDate(s.period_from)}</span></div>
          <div class="info-row"><span class="label">ถึง</span><span class="value">${fmtDate(s.period_to)}</span></div>
          <div class="info-row"><span class="label">สถานะ</span><span class="value">${s.status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'}</span></div></div>
      </div>
      <table><thead><tr><th>วันที่ขาย</th><th>เลขบิล</th><th>สินค้า</th><th class="r">จำนวน</th><th class="r">ราคาขาย</th><th class="r">ยอดขาย</th><th class="r">ค่าคอมฯ</th></tr></thead><tbody>${itemRows}</tbody></table>
      <div class="totals">
        <div class="total-row"><span>ยอดขายรวม</span><span>฿${fmt(parseFloat(s.total_sales))}</span></div>
        <div class="total-row"><span>ค่าคอมมิชชั่น</span><span>- ฿${fmt(parseFloat(s.total_commission))}</span></div>
        <div class="total-row big"><span>ยอดจ่ายสุทธิ</span><span>฿${fmt(parseFloat(s.net_payable))}</span></div>
      </div>
      <div class="sig">
        <div class="sig-box"><div class="sig-line">ผู้จัดทำ</div><div class="sig-date">วันที่ ____/____/________</div></div>
        <div class="sig-box"><div class="sig-line">ผู้ฝากขาย (รับทราบ)</div><div class="sig-date">วันที่ ____/____/________</div></div>
      </div></div>`)
  }

  const handlePrintRenewal = (renewal: any) => {
    const origAg = agreements.find((a: any) => a.id === renewAgId)
    openPrintWindow(`ใบฝากต่อ ${renewal.agreement?.agreement_number}`, `<div class="page">
      <div class="header"><div class="title">ใบฝากต่อ</div><div class="title-en">CONSIGNMENT RENEWAL</div>
        <div class="doc-no">เลขที่: ${renewal.agreement?.agreement_number}</div>
        <div class="doc-date">วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">สัญญาเดิม</div>
          <div class="info-row"><span class="label">เลขที่</span><span class="value">${origAg?.agreement_number || renewal.originalAgreement}</span></div>
          <div class="info-row"><span class="label">ผู้ฝากขาย</span><span class="value">${origAg?.contact_name || ''}</span></div>
          <div class="info-row"><span class="label">สถานะ</span><span class="value">หมดอายุ / ฝากต่อแล้ว</span></div></div>
        <div class="info-box"><div class="info-label">สัญญาใหม่</div>
          <div class="info-row"><span class="label">เลขที่</span><span class="value">${renewal.agreement?.agreement_number}</span></div>
          <div class="info-row"><span class="label">ค่าคอมฯ</span><span class="value">${renewForm.commissionType === 'percent' ? renewForm.commissionRate + '%' : '฿' + renewForm.commissionRate + '/ชิ้น'}</span></div>
          <div class="info-row"><span class="label">ระยะจ่ายเงิน</span><span class="value">${renewForm.paymentTerms} วัน</span></div>
          <div class="info-row"><span class="label">สินค้าที่โอน</span><span class="value">${renewal.itemsTransferred} รายการ</span></div></div>
      </div>
      ${renewForm.note ? `<div class="note"><strong>หมายเหตุ:</strong> ${renewForm.note}</div>` : ''}
      <div class="sig">
        <div class="sig-box"><div class="sig-line">ผู้ฝากขาย (Consignor)</div><div class="sig-date">วันที่ ____/____/________</div></div>
        <div class="sig-box"><div class="sig-line">ผู้รับฝากขาย (Consignee)</div><div class="sig-date">วันที่ ____/____/________</div></div>
      </div></div>`)
  }

  // ── Options ──
  const agOptions = agreements.filter((a: any) => a.status === 'active').map((a: any) => ({ value: String(a.id), label: `${a.agreement_number} — ${a.contact_name}` }))
  const vendorOptions = vendors.map((v: any) => ({ value: String(v.id), label: v.name }))
  const productOptions = products.map((p: any) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap={8}>
          <IconContract size={24} color="var(--app-primary)" />
          <Text size="xl" fw={800}>ระบบฝากขาย (Consignment)</Text>
        </Group>
        <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)}
          data={[
            { value: 'agreements', label: 'สัญญา' },
            { value: 'stock', label: 'สต๊อกฝากขาย' },
            { value: 'settlements', label: 'สรุปยอด/จ่ายเงิน' },
          ]} />
      </Group>

      {/* ── แจ้งเตือนสัญญาหมดอายุ ── */}
      {tab === 'agreements' && expiredAgreements.length > 0 && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="สัญญาเลยกำหนด" variant="light">
          {expiredAgreements.map((a: any) => (
            <Text key={a.id} size="sm">{a.agreement_number} — {a.contact_name} (หมดอายุ {fmtDate(a.end_date)})</Text>
          ))}
        </Alert>
      )}
      {tab === 'agreements' && expiringAgreements.length > 0 && (
        <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="สัญญาใกล้หมดอายุ (ภายใน 30 วัน)" variant="light">
          {expiringAgreements.map((a: any) => {
            const days = Math.ceil((new Date(a.end_date).getTime() - Date.now()) / 86400000)
            return <Text key={a.id} size="sm">{a.agreement_number} — {a.contact_name} (เหลือ {days} วัน, หมด {fmtDate(a.end_date)})</Text>
          })}
        </Alert>
      )}

      {/* ══════ Tab: สัญญา ══════ */}
      {tab === 'agreements' && (
        <>
          <Group justify="flex-end">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setAddAgOpen(true)}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างสัญญาฝากขาย
            </Button>
          </Group>
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            {loadAg ? <Loader style={{ margin: '40px auto', display: 'block' }} /> :
              agreements.length === 0 ? <Text ta="center" c="dimmed" py="xl">ยังไม่มีสัญญาฝากขาย</Text> : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>เลขที่</Table.Th>
                      <Table.Th>ผู้ฝากขาย</Table.Th>
                      <Table.Th ta="center">ค่าคอมฯ</Table.Th>
                      <Table.Th ta="center">สินค้าคงเหลือ</Table.Th>
                      <Table.Th>วันเริ่ม</Table.Th>
                      <Table.Th>วันสิ้นสุด</Table.Th>
                      <Table.Th ta="center">สถานะ</Table.Th>
                      <Table.Th ta="center">จัดการ</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {agreements.map((a: any) => {
                      const isExpiringSoon = a.status === 'active' && a.end_date && Math.ceil((new Date(a.end_date).getTime() - Date.now()) / 86400000) <= 30
                      return (
                        <Table.Tr key={a.id} style={isExpiringSoon ? { background: 'rgba(251, 191, 36, 0.08)' } : undefined}>
                          <Table.Td><Text size="sm" ff="monospace" fw={600}>{a.agreement_number}</Text></Table.Td>
                          <Table.Td><Text size="sm" fw={500}>{a.contact_name}</Text></Table.Td>
                          <Table.Td ta="center">
                            <Badge variant="light" color="violet">
                              {a.commission_type === 'percent' ? `${a.commission_rate}%` : `฿${fmt(parseFloat(a.commission_rate))}/ชิ้น`}
                            </Badge>
                          </Table.Td>
                          <Table.Td ta="center"><Text size="sm" fw={600}>{fmtInt(a.total_on_hand || 0)} ชิ้น</Text></Table.Td>
                          <Table.Td><Text size="sm" c="dimmed">{fmtDate(a.start_date)}</Text></Table.Td>
                          <Table.Td><Text size="sm" c={isExpiringSoon ? 'orange' : 'dimmed'} fw={isExpiringSoon ? 600 : 400}>{fmtDate(a.end_date)}</Text></Table.Td>
                          <Table.Td ta="center">
                            <Badge color={a.status === 'active' ? 'green' : a.status === 'expired' ? 'orange' : 'red'} variant="light">
                              {a.status === 'active' ? 'ใช้งาน' : a.status === 'expired' ? 'หมดอายุ' : 'ยกเลิก'}
                            </Badge>
                          </Table.Td>
                          <Table.Td ta="center">
                            {(a.status === 'active' || a.status === 'expired') && parseInt(a.total_on_hand) > 0 && (
                              <Button size="xs" variant="light" color="indigo"
                                leftSection={<IconRefresh size={14} />}
                                onClick={() => openRenew(a)}>
                                ฝากต่อ
                              </Button>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      )
                    })}
                  </Table.Tbody>
                </Table>
              )}
          </Card>
        </>
      )}

      {/* ══════ Tab: สต๊อกฝากขาย ══════ */}
      {tab === 'stock' && (
        <>
          <Group justify="flex-end" gap="sm">
            <Button leftSection={<IconPackageImport size={16} />} color="teal" onClick={() => setReceiveOpen(true)}>รับสินค้าเข้า</Button>
            <Button leftSection={<IconReceipt size={16} />} color="blue" onClick={() => setSaleOpen(true)}>บันทึกยอดขาย</Button>
            <Button leftSection={<IconPackageExport size={16} />} color="orange" variant="light" onClick={() => setReturnOpen(true)}>คืนสินค้า</Button>
          </Group>

          <SimpleGrid cols={3}>
            <Card shadow="xs" padding="md" radius="md" withBorder>
              <Text size="xs" c="dimmed">รายการทั้งหมด</Text>
              <Text size="xl" fw={800}>{stock.length}</Text>
            </Card>
            <Card shadow="xs" padding="md" radius="md" withBorder>
              <Text size="xs" c="dimmed">คงเหลือรวม</Text>
              <Text size="xl" fw={800}>{fmtInt(stock.reduce((s: number, r: any) => s + (parseInt(r.quantity_on_hand) || 0), 0))} ชิ้น</Text>
            </Card>
            <Card shadow="xs" padding="md" radius="md" withBorder>
              <Text size="xs" c="dimmed">มูลค่าขาย (ถ้าขายหมด)</Text>
              <Text size="xl" fw={800} c="green">฿{fmt(stock.reduce((s: number, r: any) => s + (parseInt(r.quantity_on_hand) || 0) * (parseFloat(r.selling_price) || 0), 0))}</Text>
            </Card>
          </SimpleGrid>

          <Card shadow="xs" padding="lg" radius="md" withBorder>
            {loadSt ? <Loader style={{ margin: '40px auto', display: 'block' }} /> :
              stock.length === 0 ? <Text ta="center" c="dimmed" py="xl">ยังไม่มีสินค้าฝากขาย</Text> : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>สินค้า</Table.Th>
                      <Table.Th>สัญญา</Table.Th>
                      <Table.Th ta="right">รับเข้า</Table.Th>
                      <Table.Th ta="right">ขายแล้ว</Table.Th>
                      <Table.Th ta="right">คืนแล้ว</Table.Th>
                      <Table.Th ta="right">คงเหลือ</Table.Th>
                      <Table.Th ta="right">ราคาผู้ฝาก</Table.Th>
                      <Table.Th ta="right">ราคาขาย</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {stock.map((s: any) => (
                      <Table.Tr key={s.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>{s.product_name}</Text>
                          <Text size="xs" c="dimmed" ff="monospace">{s.sku}</Text>
                        </Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{s.agreement_number} — {s.contact_name}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm">{fmtInt(s.quantity_received)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="green">{fmtInt(s.quantity_sold)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="orange">{fmtInt(s.quantity_returned)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={700}>{fmtInt(s.quantity_on_hand)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(parseFloat(s.consignor_price))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(parseFloat(s.selling_price))}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
          </Card>
        </>
      )}

      {/* ══════ Tab: สรุปยอด/จ่ายเงิน ══════ */}
      {tab === 'settlements' && (
        <>
          <Group justify="flex-end">
            <Button leftSection={<IconFileInvoice size={16} />} onClick={() => setSettleOpen(true)}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างใบสรุปยอด
            </Button>
          </Group>
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            {loadSet ? <Loader style={{ margin: '40px auto', display: 'block' }} /> :
              settlements.length === 0 ? <Text ta="center" c="dimmed" py="xl">ยังไม่มีใบสรุป</Text> : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>เลขที่</Table.Th>
                      <Table.Th>สัญญา</Table.Th>
                      <Table.Th>ผู้ฝากขาย</Table.Th>
                      <Table.Th>งวด</Table.Th>
                      <Table.Th ta="right">ยอดขาย</Table.Th>
                      <Table.Th ta="right">ค่าคอมฯ</Table.Th>
                      <Table.Th ta="right">ยอดจ่าย</Table.Th>
                      <Table.Th ta="center">สถานะ</Table.Th>
                      <Table.Th ta="center">จัดการ</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {settlements.map((s: any) => (
                      <Table.Tr key={s.id}>
                        <Table.Td><Text size="sm" ff="monospace" fw={600}>{s.settlement_number}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{s.agreement_number}</Text></Table.Td>
                        <Table.Td><Text size="sm">{s.contact_name}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{fmtDate(s.period_from)} — {fmtDate(s.period_to)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(s.total_sales))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="violet">฿{fmt(parseFloat(s.total_commission))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={700} c="blue">฿{fmt(parseFloat(s.net_payable))}</Text></Table.Td>
                        <Table.Td ta="center">
                          <Badge color={s.status === 'paid' ? 'green' : s.status === 'confirmed' ? 'blue' : 'gray'} variant="light">
                            {s.status === 'paid' ? 'จ่ายแล้ว' : s.status === 'confirmed' ? 'ยืนยัน' : 'ร่าง'}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Group gap={4} justify="center">
                            <ActionIcon size="sm" variant="light" color="blue" loading={detailLoading}
                              onClick={() => openSettlementDetail(s.id)}>
                              <IconEye size={14} />
                            </ActionIcon>
                            {s.status !== 'paid' && parseFloat(s.net_payable) > 0 && (
                              confirmPayId === s.id ? (
                                <Group gap={4}>
                                  <Button size="compact-xs" color="green"
                                    loading={payMutation.isPending}
                                    onClick={() => payMutation.mutate(s.id)}>
                                    ยืนยันจ่าย ฿{fmt(parseFloat(s.net_payable))}
                                  </Button>
                                  <Button size="compact-xs" color="gray" variant="light"
                                    onClick={() => setConfirmPayId(null)}>
                                    ยกเลิก
                                  </Button>
                                </Group>
                              ) : (
                                <Button size="compact-xs" color="green" variant="light"
                                  leftSection={<IconCash size={14} />}
                                  onClick={() => setConfirmPayId(s.id)}>
                                  จ่ายเงิน
                                </Button>
                              )
                            )}
                            {s.status === 'draft' && (
                              confirmDeleteId === s.id ? (
                                <Group gap={4}>
                                  <Button size="compact-xs" color="red"
                                    loading={deleteMutation.isPending}
                                    onClick={() => deleteMutation.mutate(s.id)}>
                                    ยืนยันลบ
                                  </Button>
                                  <Button size="compact-xs" color="gray" variant="light"
                                    onClick={() => setConfirmDeleteId(null)}>
                                    ยกเลิก
                                  </Button>
                                </Group>
                              ) : (
                                <ActionIcon size="sm" variant="light" color="red"
                                  onClick={() => setConfirmDeleteId(s.id)}>
                                  <IconTrash size={14} />
                                </ActionIcon>
                              )
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
          </Card>
        </>
      )}

      {/* ══════ Modal: สร้างสัญญา ══════ */}
      <Modal opened={addAgOpen} onClose={() => setAddAgOpen(false)} title="สร้างสัญญาฝากขาย" centered size="md">
        <Stack gap="md">
          <Select label="ผู้ฝากขาย" required searchable data={vendorOptions}
            value={agForm.contactId} onChange={v => setAgForm({ ...agForm, contactId: v || '' })} />
          <Group grow>
            <DatePickerInput label="วันเริ่ม" required value={agForm.startDate} onChange={v => setAgForm({ ...agForm, startDate: v })} locale="th" valueFormat="DD MMMM YYYY" />
            <DatePickerInput label="วันสิ้นสุด" value={agForm.endDate} onChange={v => setAgForm({ ...agForm, endDate: v })} locale="th" valueFormat="DD MMMM YYYY" clearable />
          </Group>
          <Group grow>
            <Select label="ประเภทค่าคอมฯ" data={[{ value: 'percent', label: '% จากยอดขาย' }, { value: 'fixed', label: 'บาท/ชิ้น' }]}
              value={agForm.commissionType} onChange={v => setAgForm({ ...agForm, commissionType: v || 'percent' })} />
            <NumberInput label={agForm.commissionType === 'percent' ? 'อัตรา (%)' : 'จำนวน (฿/ชิ้น)'}
              min={0} value={agForm.commissionRate} onChange={v => setAgForm({ ...agForm, commissionRate: Number(v) || 0 })} />
          </Group>
          <NumberInput label="ระยะจ่ายเงิน (วัน)" min={0} value={agForm.paymentTerms} onChange={v => setAgForm({ ...agForm, paymentTerms: Number(v) || 30 })} />
          <Textarea label="หมายเหตุ" value={agForm.note} onChange={e => setAgForm({ ...agForm, note: e.target.value })} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setAddAgOpen(false)}>ยกเลิก</Button>
            <Button loading={createAgMutation.isPending} disabled={!agForm.contactId || !agForm.startDate}
              onClick={() => createAgMutation.mutate({
                contactId: parseInt(agForm.contactId), startDate: agForm.startDate ? toLocalDateStr(agForm.startDate) : undefined,
                endDate: agForm.endDate ? toLocalDateStr(agForm.endDate) : null,
                commissionType: agForm.commissionType, commissionRate: agForm.commissionRate,
                paymentTerms: agForm.paymentTerms, note: agForm.note,
              })}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างสัญญา
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: รับสินค้า ══════ */}
      <Modal opened={receiveOpen} onClose={() => setReceiveOpen(false)} title="รับสินค้าฝากขาย" centered size="lg">
        <Stack gap="md">
          <Select label="สัญญาฝากขาย" required searchable data={agOptions}
            value={recAgId} onChange={v => setRecAgId(v || '')} />
          {recItems.map((item, i) => (
            <Group key={i} grow align="end">
              <Select label="สินค้า" searchable data={productOptions} value={item.productId}
                onChange={v => handleRecProductChange(i, v || '')} />
              <NumberInput label="จำนวน" min={1} value={item.quantity}
                onChange={v => { const u = [...recItems]; u[i].quantity = Number(v) || 1; setRecItems(u) }} />
              <NumberInput label="ราคาผู้ฝาก" min={0} decimalScale={2} value={item.consignorPrice}
                onChange={v => { const u = [...recItems]; u[i].consignorPrice = Number(v) || 0; setRecItems(u) }} />
              <NumberInput label="ราคาขาย" min={0} decimalScale={2} value={item.sellingPrice}
                onChange={v => { const u = [...recItems]; u[i].sellingPrice = Number(v) || 0; setRecItems(u) }} />
              {recItems.length > 1 && (
                <ActionIcon color="red" variant="light" onClick={() => setRecItems(recItems.filter((_, j) => j !== i))}>
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          ))}
          <Button variant="light" size="xs" leftSection={<IconPlus size={14} />}
            onClick={() => setRecItems([...recItems, { productId: '', quantity: 1, consignorPrice: 0, sellingPrice: 0 }])}>
            เพิ่มรายการ
          </Button>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setReceiveOpen(false)}>ยกเลิก</Button>
            <Tooltip label="พิมพ์ใบรับสินค้า" disabled={!recAgId || recItems.every(i => !i.productId)}>
              <Button variant="light" leftSection={<IconPrinter size={16} />}
                disabled={!recAgId || recItems.every(i => !i.productId)}
                onClick={() => printReceive(recAgId, recItems)}>
                พิมพ์
              </Button>
            </Tooltip>
            <Button color="teal" loading={receiveMutation.isPending}
              disabled={!recAgId || recItems.every(i => !i.productId)}
              onClick={() => receiveMutation.mutate({
                agreementId: parseInt(recAgId),
                items: recItems.filter(i => i.productId).map(i => ({ ...i, productId: parseInt(i.productId) })),
              })}>
              รับสินค้า
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: คืนสินค้า ══════ */}
      <Modal opened={returnOpen} onClose={() => setReturnOpen(false)} title="คืนสินค้าให้ผู้ฝากขาย" centered>
        <Stack gap="md">
          <Select label="สัญญาฝากขาย" required searchable data={agOptions}
            value={retAgId} onChange={v => setRetAgId(v || '')} />
          {retItems.map((item, i) => (
            <Group key={i} grow align="end">
              <Select label="สินค้า" searchable data={productOptions} value={item.productId}
                onChange={v => { const u = [...retItems]; u[i].productId = v || ''; setRetItems(u) }} />
              <NumberInput label="จำนวน" min={1} value={item.quantity}
                onChange={v => { const u = [...retItems]; u[i].quantity = Number(v) || 1; setRetItems(u) }} />
            </Group>
          ))}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setReturnOpen(false)}>ยกเลิก</Button>
            <Tooltip label="พิมพ์ใบคืนสินค้า" disabled={!retAgId || retItems.every(i => !i.productId)}>
              <Button variant="light" leftSection={<IconPrinter size={16} />}
                disabled={!retAgId || retItems.every(i => !i.productId)}
                onClick={() => printReturn(retAgId, retItems)}>
                พิมพ์
              </Button>
            </Tooltip>
            <Button color="orange" loading={returnMutation.isPending}
              disabled={!retAgId || retItems.every(i => !i.productId)}
              onClick={() => returnMutation.mutate({
                agreementId: parseInt(retAgId),
                items: retItems.filter(i => i.productId).map(i => ({ ...i, productId: parseInt(i.productId) })),
              })}>
              คืนสินค้า
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: ฝากต่อ ══════ */}
      <Modal opened={renewOpen} onClose={() => setRenewOpen(false)} title="ฝากต่อสัญญาฝากขาย" centered size="md">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            สร้างสัญญาใหม่โดยโอนสินค้าคงเหลือจากสัญญาเดิม สัญญาเดิมจะถูกปิดโดยอัตโนมัติ
          </Text>
          <DatePickerInput label="วันสิ้นสุดใหม่" value={renewForm.newEndDate}
            onChange={v => setRenewForm({ ...renewForm, newEndDate: v })} locale="th" valueFormat="DD MMMM YYYY" clearable />
          <Group grow>
            <Select label="ประเภทค่าคอมฯ" data={[{ value: 'percent', label: '% จากยอดขาย' }, { value: 'fixed', label: 'บาท/ชิ้น' }]}
              value={renewForm.commissionType} onChange={v => setRenewForm({ ...renewForm, commissionType: v || 'percent' })} />
            <NumberInput label={renewForm.commissionType === 'percent' ? 'อัตรา (%)' : 'จำนวน (฿/ชิ้น)'}
              min={0} value={renewForm.commissionRate} onChange={v => setRenewForm({ ...renewForm, commissionRate: Number(v) || 0 })} />
          </Group>
          <NumberInput label="ระยะจ่ายเงิน (วัน)" min={0} value={renewForm.paymentTerms}
            onChange={v => setRenewForm({ ...renewForm, paymentTerms: Number(v) || 30 })} />
          <Textarea label="หมายเหตุ" value={renewForm.note} onChange={e => setRenewForm({ ...renewForm, note: e.target.value })} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setRenewOpen(false)}>ยกเลิก</Button>
            <Button loading={renewMutation.isPending} disabled={!renewAgId}
              leftSection={<IconRefresh size={16} />}
              onClick={() => renewAgId && renewMutation.mutate({
                agId: renewAgId,
                body: {
                  newStartDate: toLocalDateStr(new Date()),
                  newEndDate: renewForm.newEndDate ? toLocalDateStr(renewForm.newEndDate) : null,
                  commissionType: renewForm.commissionType,
                  commissionRate: renewForm.commissionRate,
                  paymentTerms: renewForm.paymentTerms,
                  note: renewForm.note,
                },
              })}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              ฝากต่อ
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: สรุปผลฝากต่อ ══════ */}
      <Modal opened={!!lastRenewal} onClose={() => setLastRenewal(null)} title="ฝากต่อสำเร็จ" centered size="sm">
        {lastRenewal && (
          <Stack gap="md">
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12 }}>
              <Text size="sm">สัญญาใหม่: <strong>{lastRenewal.agreement?.agreement_number}</strong></Text>
              <Text size="sm">สัญญาเดิม: <strong>{lastRenewal.originalAgreement}</strong></Text>
              <Text size="sm">สินค้าที่โอน: <strong>{lastRenewal.itemsTransferred} รายการ</strong></Text>
            </div>
            <Group grow gap="sm">
              <Button variant="light" onClick={() => setLastRenewal(null)}>ปิด</Button>
              <Button leftSection={<IconPrinter size={16} />}
                style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}
                onClick={() => handlePrintRenewal(lastRenewal)}>
                พิมพ์ใบฝากต่อ
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* ══════ Modal: บันทึกยอดขาย ══════ */}
      <Modal opened={saleOpen} onClose={() => setSaleOpen(false)} title="บันทึกยอดขายฝากขาย" centered size="lg">
        <Stack gap="md">
          <Alert variant="light" color="blue" icon={<IconReceipt size={18} />}>
            <Text size="sm">บันทึกยอดขายที่ร้านค้ารายงานมา ระบบจะสร้างรายการขายและคำนวณค่าคอมมิชชั่นอัตโนมัติ</Text>
          </Alert>

          <Group grow>
            <Select label="สัญญาฝากขาย" required searchable data={agOptions}
              value={saleAgId} onChange={v => { setSaleAgId(v || ''); setSaleItems([{ productId: '', quantity: 1, sellingPrice: 0 }]) }} />
            <DatePickerInput label="วันที่ขาย" value={saleDate} onChange={setSaleDate} locale="th" valueFormat="DD MMMM YYYY" />
          </Group>

          {saleAgId && saleStockForAg.length === 0 && (
            <Alert color="orange" variant="light">ไม่มีสินค้าคงเหลือในสัญญานี้</Alert>
          )}

          {saleAgId && saleStockForAg.length > 0 && (
            <>
              {saleItems.map((item, i) => {
                const stockItem = stock.find((s: any) => String(s.product_id) === item.productId && String(s.agreement_id) === saleAgId)
                const maxQty = stockItem ? parseInt(stockItem.quantity_on_hand) : 999
                return (
                  <Group key={i} grow align="end">
                    <Select label="สินค้า" searchable data={saleProductOptions} value={item.productId}
                      onChange={v => handleSaleProductChange(i, v || '')} />
                    <NumberInput label="จำนวนที่ขาย" min={1} max={maxQty} value={item.quantity}
                      onChange={v => { const u = [...saleItems]; u[i].quantity = Number(v) || 1; setSaleItems(u) }} />
                    <NumberInput label="ราคาขาย/หน่วย" min={0} decimalScale={2} value={item.sellingPrice}
                      onChange={v => { const u = [...saleItems]; u[i].sellingPrice = Number(v) || 0; setSaleItems(u) }} />
                    {saleItems.length > 1 && (
                      <ActionIcon color="red" variant="light" onClick={() => setSaleItems(saleItems.filter((_, j) => j !== i))}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    )}
                  </Group>
                )
              })}
              <Button variant="light" size="xs" leftSection={<IconPlus size={14} />}
                onClick={() => setSaleItems([...saleItems, { productId: '', quantity: 1, sellingPrice: 0 }])}>
                เพิ่มรายการ
              </Button>

              {/* Summary */}
              {saleItems.some(i => i.productId) && (() => {
                const ag = agreements.find((a: any) => String(a.id) === saleAgId)
                const totalSale = saleItems.filter(i => i.productId).reduce((s, i) => s + (i.sellingPrice * i.quantity), 0)
                let totalComm = 0
                for (const si of saleItems.filter(i => i.productId)) {
                  if (ag?.commission_type === 'percent') {
                    totalComm += (si.sellingPrice * si.quantity) * (parseFloat(ag.commission_rate) / 100)
                  } else if (ag) {
                    totalComm += parseFloat(ag.commission_rate) * si.quantity
                  }
                }
                return (
                  <Card padding="sm" radius="md" withBorder bg="gray.0">
                    <Group justify="space-between">
                      <Text size="sm">ยอดขายรวม</Text>
                      <Text size="sm" fw={700}>฿{fmt(totalSale)}</Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm" c="violet">ค่าคอมมิชชั่น ({ag?.commission_type === 'percent' ? `${ag.commission_rate}%` : `฿${ag?.commission_rate}/ชิ้น`})</Text>
                      <Text size="sm" fw={700} c="violet">฿{fmt(totalComm)}</Text>
                    </Group>
                    <Divider my={4} />
                    <Group justify="space-between">
                      <Text size="sm" fw={700}>ยอดจ่ายผู้ฝากขาย (สุทธิ)</Text>
                      <Text size="lg" fw={800} c="blue">฿{fmt(totalSale - totalComm)}</Text>
                    </Group>
                  </Card>
                )
              })()}
            </>
          )}

          <Textarea label="หมายเหตุ" placeholder="รายละเอียดเพิ่มเติม..." value={saleNote} onChange={e => setSaleNote(e.target.value)} />

          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setSaleOpen(false)}>ยกเลิก</Button>
            <Button loading={saleMutation.isPending}
              disabled={!saleAgId || saleItems.every(i => !i.productId)}
              onClick={() => saleMutation.mutate({
                agreementId: parseInt(saleAgId),
                saleDate: saleDate ? toLocalDateStr(saleDate) : toLocalDateStr(new Date()),
                note: saleNote,
                items: saleItems.filter(i => i.productId).map(i => ({
                  productId: parseInt(i.productId), quantity: i.quantity, sellingPrice: i.sellingPrice,
                })),
              })}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              บันทึกยอดขาย
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: สร้างใบสรุป ══════ */}
      <Modal opened={settleOpen} onClose={() => { setSettleOpen(false); setPreview(null) }} title="สร้างใบสรุปยอดฝากขาย" centered size={preview ? 'xl' : 'md'}>
        <Stack gap="md">
          <Select label="สัญญาฝากขาย" required searchable data={agOptions}
            value={setAgId} onChange={v => { setSetAgId(v || ''); setPreview(null) }} />
          <Group grow>
            <DatePickerInput label="ตั้งแต่" value={setPeriod[0]} onChange={v => { setSetPeriod([v, setPeriod[1]]); setPreview(null) }} locale="th" valueFormat="DD MMMM YYYY" />
            <DatePickerInput label="ถึง" value={setPeriod[1]} onChange={v => { setSetPeriod([setPeriod[0], v]); setPreview(null) }} locale="th" valueFormat="DD MMMM YYYY" />
          </Group>

          {/* Step 1: Preview */}
          {!preview && (
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setSettleOpen(false)}>ยกเลิก</Button>
              <Button loading={previewLoading}
                disabled={!setAgId || !setPeriod[0] || !setPeriod[1]}
                onClick={handlePreview}
                variant="light">
                ดูตัวอย่างยอด
              </Button>
            </Group>
          )}

          {/* Step 2: Show preview results */}
          {preview && (
            <>
              <Divider label="ผลลัพธ์ยอดขายฝากขาย" labelPosition="center" />
              {preview.saleCount === 0 ? (
                <Alert color="orange" icon={<IconAlertTriangle size={18} />} variant="light">
                  <Text size="sm" fw={600}>ไม่พบยอดขายสินค้าฝากขายในช่วงเวลานี้</Text>
                  <Text size="xs" c="dimmed" mt={4}>กรุณาบันทึกยอดขายจากแท็บ "สต็อกฝากขาย" ก่อน</Text>
                </Alert>
              ) : (
                <>
                  <SimpleGrid cols={3}>
                    <Card padding="sm" radius="md" withBorder>
                      <Text size="xs" c="dimmed">ยอดขาย ({preview.saleCount} รายการ)</Text>
                      <Text size="lg" fw={700}>฿{fmt(preview.totalSales)}</Text>
                    </Card>
                    <Card padding="sm" radius="md" withBorder>
                      <Text size="xs" c="dimmed">ค่าคอมมิชชั่น</Text>
                      <Text size="lg" fw={700} c="violet">฿{fmt(preview.totalCommission)}</Text>
                    </Card>
                    <Card padding="sm" radius="md" withBorder>
                      <Text size="xs" c="dimmed">ยอดจ่ายสุทธิ</Text>
                      <Text size="lg" fw={800} c="blue">฿{fmt(preview.netPayable)}</Text>
                    </Card>
                  </SimpleGrid>

                  {preview.items?.length > 0 && (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>วันที่</Table.Th>
                          <Table.Th>เลขบิล</Table.Th>
                          <Table.Th>สินค้า</Table.Th>
                          <Table.Th ta="right">จำนวน</Table.Th>
                          <Table.Th ta="right">ยอดขาย</Table.Th>
                          <Table.Th ta="right">ค่าคอมฯ</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {preview.items.map((item: any, idx: number) => (
                          <Table.Tr key={idx}>
                            <Table.Td><Text size="xs">{fmtDateTime(item.sale_date || item.created_at)}</Text></Table.Td>
                            <Table.Td><Text size="xs" ff="monospace">{item.sale_number || '—'}</Text></Table.Td>
                            <Table.Td><Text size="sm">{item.product_name}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm">{fmtInt(item.quantity)}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm">฿{fmt(item.quantity * parseFloat(item.selling_price))}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm" c="violet">฿{fmt(parseFloat(item.commission_amount) || 0)}</Text></Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </>
              )}

              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => { setSettleOpen(false); setPreview(null) }}>ยกเลิก</Button>
                <Button variant="light" onClick={() => setPreview(null)}>เปลี่ยนช่วงเวลา</Button>
                {preview.saleCount > 0 && (
                  <Button loading={settleMutation.isPending}
                    onClick={() => settleMutation.mutate({
                      agreementId: parseInt(setAgId),
                      periodFrom: setPeriod[0] ? toLocalDateStr(setPeriod[0]) : undefined,
                      periodTo: setPeriod[1] ? toLocalDateStr(setPeriod[1]) : undefined,
                    })}
                    style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
                    ยืนยันสร้างใบสรุป
                  </Button>
                )}
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      {/* ══════ Modal: รายละเอียดใบสรุป ══════ */}
      <Modal opened={!!settlementDetail} onClose={() => setSettlementDetail(null)} title="รายละเอียดใบสรุปยอด" centered size="xl">
        {settlementDetail && (
          <Stack gap="md">
            <SimpleGrid cols={2}>
              <div>
                <Text size="xs" c="dimmed">เลขที่</Text>
                <Text size="lg" fw={700} ff="monospace">{settlementDetail.settlement_number}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">ผู้ฝากขาย</Text>
                <Text size="lg" fw={600}>{settlementDetail.contact_name}</Text>
              </div>
            </SimpleGrid>

            <SimpleGrid cols={3}>
              <Card padding="sm" radius="md" withBorder>
                <Text size="xs" c="dimmed">ยอดขายรวม</Text>
                <Text size="lg" fw={700}>฿{fmt(parseFloat(settlementDetail.total_sales))}</Text>
              </Card>
              <Card padding="sm" radius="md" withBorder>
                <Text size="xs" c="dimmed">ค่าคอมมิชชั่น</Text>
                <Text size="lg" fw={700} c="violet">฿{fmt(parseFloat(settlementDetail.total_commission))}</Text>
              </Card>
              <Card padding="sm" radius="md" withBorder>
                <Text size="xs" c="dimmed">ยอดจ่ายสุทธิ</Text>
                <Text size="lg" fw={800} c="blue">฿{fmt(parseFloat(settlementDetail.net_payable))}</Text>
              </Card>
            </SimpleGrid>

            <Divider label={`รายการขาย (${settlementDetail.items?.length || 0} รายการ)`} labelPosition="center" />

            {settlementDetail.items?.length > 0 ? (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>วันที่ขาย</Table.Th>
                    <Table.Th>เลขบิล</Table.Th>
                    <Table.Th>สินค้า</Table.Th>
                    <Table.Th ta="right">จำนวน</Table.Th>
                    <Table.Th ta="right">ราคาขาย</Table.Th>
                    <Table.Th ta="right">ยอดขาย</Table.Th>
                    <Table.Th ta="right">ค่าคอมฯ</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {settlementDetail.items.map((item: any, idx: number) => (
                    <Table.Tr key={idx}>
                      <Table.Td><Text size="xs">{fmtDateTime(item.sale_date || item.created_at)}</Text></Table.Td>
                      <Table.Td><Text size="xs" ff="monospace">{item.sale_number || '—'}</Text></Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>{item.product_name}</Text>
                        <Text size="xs" c="dimmed">{item.sku}</Text>
                      </Table.Td>
                      <Table.Td ta="right"><Text size="sm">{fmtInt(item.quantity)}</Text></Table.Td>
                      <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(item.selling_price))}</Text></Table.Td>
                      <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(item.quantity * parseFloat(item.selling_price))}</Text></Table.Td>
                      <Table.Td ta="right"><Text size="sm" c="violet">฿{fmt(parseFloat(item.commission_amount) || 0)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text ta="center" c="dimmed" py="md">ไม่มีรายการขายในช่วงเวลานี้</Text>
            )}

            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setSettlementDetail(null)}>ปิด</Button>
              <Button leftSection={<IconPrinter size={16} />}
                style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}
                onClick={() => printSettlement(settlementDetail)}>
                พิมพ์ใบสรุปยอด
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}
