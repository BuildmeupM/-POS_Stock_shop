import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Text, Group, Stack, Badge, Loader, Button, Divider,
  Table, ActionIcon, ThemeIcon, SimpleGrid, Menu,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft, IconPrinter, IconCheck, IconX, IconCash,
  IconFileInvoice, IconFileText, IconReceipt, IconTruck,
  IconCalendar, IconUser, IconBuilding, IconHash, IconTrash,
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt } from '../../utils/formatters'

const DOC_CONFIG: Record<string, { label: string; labelEn: string; color: string; icon: any; gradient: string }> = {
  quotation:   { label: 'ใบเสนอราคา', labelEn: 'QUOTATION', color: 'blue', icon: IconFileText, gradient: 'linear-gradient(135deg, #1e40af, #3b82f6)' },
  invoice:     { label: 'ใบแจ้งหนี้ / บิลขาย', labelEn: 'INVOICE', color: 'indigo', icon: IconFileInvoice, gradient: 'linear-gradient(135deg, #3730a3, #6366f1)' },
  delivery:    { label: 'ใบส่งของ', labelEn: 'DELIVERY NOTE', color: 'cyan', icon: IconTruck, gradient: 'linear-gradient(135deg, #155e75, #06b6d4)' },
  receipt:     { label: 'ใบเสร็จรับเงิน', labelEn: 'RECEIPT', color: 'green', icon: IconReceipt, gradient: 'linear-gradient(135deg, #166534, #22c55e)' },
  receipt_tax: { label: 'ใบเสร็จรับเงิน/ใบกำกับภาษี', labelEn: 'RECEIPT / TAX INVOICE', color: 'violet', icon: IconReceipt, gradient: 'linear-gradient(135deg, #5b21b6, #8b5cf6)' },
  receipt_abb: { label: 'ใบกำกับภาษีอย่างย่อ', labelEn: 'ABBREVIATED TAX INVOICE', color: 'cyan', icon: IconReceipt, gradient: 'linear-gradient(135deg, #0e7490, #06b6d4)' },
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'gray' },
  approved: { label: 'อนุมัติ', color: 'blue' },
  sent: { label: 'ส่งแล้ว', color: 'cyan' },
  accepted: { label: 'ยอมรับ', color: 'green' },
  rejected: { label: 'ปฏิเสธ', color: 'red' },
  voided: { label: 'ยกเลิก', color: 'red' },
}

const PAY_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: 'ยังไม่ชำระ', color: 'yellow' },
  partial: { label: 'ชำระบางส่วน', color: 'orange' },
  paid: { label: 'ชำระแล้ว', color: 'green' },
}

// ─── Thai Baht Text utility ───
function bahtText(num: number): string {
  const thaiDigits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const thaiPlaces = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']

  if (num === 0) return 'ศูนย์บาทถ้วน'

  const toText = (n: number): string => {
    if (n === 0) return ''
    const str = Math.floor(n).toString()
    let result = ''
    const len = str.length
    for (let i = 0; i < len; i++) {
      const digit = parseInt(str[i])
      const place = len - i - 1
      if (digit === 0) continue
      if (place === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด'
      } else if (place === 1 && digit === 2) {
        result += 'ยี่สิบ'
      } else if (place === 1 && digit === 1) {
        result += 'สิบ'
      } else {
        result += thaiDigits[digit] + thaiPlaces[place]
      }
    }
    return result
  }

  const intPart = Math.floor(Math.abs(num))
  const decPart = Math.round((Math.abs(num) - intPart) * 100)

  let result = ''
  if (intPart > 0) {
    if (intPart >= 1000000) {
      result += toText(Math.floor(intPart / 1000000)) + 'ล้าน'
      const remainder = intPart % 1000000
      if (remainder > 0) result += toText(remainder)
    } else {
      result += toText(intPart)
    }
    result += 'บาท'
  }

  if (decPart > 0) {
    result += toText(decPart) + 'สตางค์'
  } else {
    result += 'ถ้วน'
  }

  return result
}

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'

export default function SalesDocDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: doc, isLoading } = useQuery({
    queryKey: ['sales-doc-detail', id],
    queryFn: () => api.get(`/sales-doc/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const approveMutation = useMutation({
    mutationFn: () => api.put(`/sales-doc/${id}/approve`),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'อนุมัติเอกสาร', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-doc-detail', id] }) },
  })

  const voidMutation = useMutation({
    mutationFn: () => api.put(`/sales-doc/${id}/void`),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกเอกสาร', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-doc-detail', id] }) },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/sales-doc/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบเอกสารแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['sales-docs'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      navigate('/sales-doc')
    },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'ไม่สามารถลบเอกสารได้', color: 'red' }),
  })

  if (isLoading) return <Loader style={{ margin: '100px auto', display: 'block' }} />
  if (!doc) return <Text ta="center" py="xl" c="dimmed">ไม่พบเอกสาร</Text>

  const config = DOC_CONFIG[doc.doc_type] || DOC_CONFIG.invoice
  const DocIcon = config.icon
  const status = STATUS_MAP[doc.status] || STATUS_MAP.draft
  const payStatus = PAY_MAP[doc.payment_status] || PAY_MAP.unpaid
  const isTaxInvoice = doc.doc_type === 'receipt_tax' || doc.doc_type === 'receipt_abb'
  const vatAmount = parseFloat(doc.vat_amount) || 0
  const totalAmount = parseFloat(doc.total_amount) || 0

  const companyName = company?.company_name || 'บริษัท'
  const companyAddress = company?.address || ''
  const companyTaxId = company?.tax_id || ''
  const companyBranch = company?.branch || 'สำนักงานใหญ่'

  // ─── Print Function ───
  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1200')
    if (!printWindow) return

    const items = doc.items || []
    const itemRows = items.map((item: any, i: number) => `
      <tr>
        <td style="text-align:center;padding:8px 6px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #e5e7eb">
          <div style="font-weight:600">${item.product_name || item.description || '-'}</div>
          ${item.sku ? `<div style="font-size:11px;color:#888">${item.sku}</div>` : ''}
          ${item.description && item.product_name ? `<div style="font-size:11px;color:#666">${item.description}</div>` : ''}
        </td>
        <td style="text-align:center;padding:8px 6px;border-bottom:1px solid #e5e7eb">${parseFloat(item.quantity).toLocaleString()}</td>
        <td style="text-align:center;padding:8px 6px;border-bottom:1px solid #e5e7eb">${item.unit || 'ชิ้น'}</td>
        <td style="text-align:right;padding:8px 6px;border-bottom:1px solid #e5e7eb">${parseFloat(item.unit_price).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right;padding:8px 6px;border-bottom:1px solid #e5e7eb">${parseFloat(item.subtotal).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
      </tr>
    `).join('')

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${config.label} ${doc.doc_number}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Sarabun', sans-serif; color: #333; font-size: 14px; }
  .page { max-width: 210mm; margin: 0 auto; padding: 20mm 15mm; }
  .header { display: flex; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid ${isTaxInvoice ? '#7c3aed' : '#16a34a'}; }
  .company-info { flex: 1; }
  .company-name { font-size: 22px; font-weight: 700; color: #111; }
  .company-detail { font-size: 12px; color: #555; margin-top: 4px; }
  .doc-title-box { text-align: right; }
  .doc-title { font-size: 20px; font-weight: 700; color: ${isTaxInvoice ? '#7c3aed' : '#16a34a'}; }
  .doc-title-en { font-size: 12px; color: #888; letter-spacing: 1px; }
  .doc-number { font-size: 14px; font-weight: 600; margin-top: 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .info-box { padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fafafa; }
  .info-label { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; margin-bottom: 6px; }
  .info-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 13px; }
  .info-row .label { color: #666; }
  .info-row .value { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead th { background: ${isTaxInvoice ? '#f5f3ff' : '#f0fdf4'}; padding: 10px 6px; font-size: 12px; font-weight: 700; color: #333; border-bottom: 2px solid ${isTaxInvoice ? '#c4b5fd' : '#86efac'}; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { width: 300px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .total-row.grand { font-size: 18px; font-weight: 700; border-top: 2px solid #333; padding-top: 10px; margin-top: 6px; }
  .baht-text { background: #f8f9fa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 13px; }
  .baht-text .label { font-size: 11px; color: #888; font-weight: 600; }
  .baht-text .text { font-weight: 600; color: #333; margin-top: 2px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 60px; padding-top: 20px; }
  .sig-box { text-align: center; }
  .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 6px; font-size: 12px; }
  .sig-date { font-size: 11px; color: #888; margin-top: 2px; }
  @media print { @page { size: A4; margin: 15mm; } .page { padding: 0; max-width: none; } }
</style>
</head><body>
<div class="page">
  <div class="header">
    <div class="company-info">
      <div class="company-name">${companyName}</div>
      ${companyAddress ? `<div class="company-detail">${companyAddress}</div>` : ''}
      ${isTaxInvoice && companyTaxId ? `<div class="company-detail">เลขประจำตัวผู้เสียภาษี: <strong>${companyTaxId}</strong></div>` : ''}
      ${isTaxInvoice ? `<div class="company-detail">${companyBranch}</div>` : ''}
    </div>
    <div class="doc-title-box">
      <div class="doc-title">${config.label}</div>
      <div class="doc-title-en">${config.labelEn}</div>
      <div class="doc-number">เลขที่: ${doc.doc_number}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-label">ข้อมูลลูกค้า</div>
      <div class="info-row"><span class="label">ชื่อ</span><span class="value">${doc.customer_name || doc.customer_name_ref || 'ลูกค้าทั่วไป'}</span></div>
      ${doc.customer_address ? `<div class="info-row"><span class="label">ที่อยู่</span><span class="value">${doc.customer_address}</span></div>` : ''}
      ${isTaxInvoice && doc.customer_tax_id ? `<div class="info-row"><span class="label">เลขผู้เสียภาษี</span><span class="value">${doc.customer_tax_id}</span></div>` : ''}
      ${doc.customer_phone ? `<div class="info-row"><span class="label">โทรศัพท์</span><span class="value">${doc.customer_phone}</span></div>` : ''}
    </div>
    <div class="info-box">
      <div class="info-label">ข้อมูลเอกสาร</div>
      <div class="info-row"><span class="label">วันที่</span><span class="value">${fmtDate(doc.doc_date)}</span></div>
      ${doc.due_date ? `<div class="info-row"><span class="label">ครบกำหนด</span><span class="value">${fmtDate(doc.due_date)}</span></div>` : ''}
      ${doc.reference ? `<div class="info-row"><span class="label">อ้างอิง</span><span class="value">${doc.reference}</span></div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center">#</th>
        <th style="text-align:left">รายการ</th>
        <th style="width:70px;text-align:center">จำนวน</th>
        <th style="width:60px;text-align:center">หน่วย</th>
        <th style="width:100px;text-align:right">ราคา/หน่วย</th>
        <th style="width:110px;text-align:right">จำนวนเงิน</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="total-row"><span>รวม</span><span>${parseFloat(doc.subtotal).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
      ${parseFloat(doc.discount_amount) > 0 ? `<div class="total-row"><span>ส่วนลด</span><span style="color:#dc2626">-${parseFloat(doc.discount_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>` : ''}
      ${vatAmount > 0 ? `<div class="total-row"><span>มูลค่าก่อน VAT</span><span>${parseFloat(doc.amount_before_vat).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>` : ''}
      ${vatAmount > 0 ? `<div class="total-row"><span>VAT ${doc.vat_rate || 7}%</span><span>${vatAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>` : ''}
      <div class="total-row grand"><span>ยอดรวมทั้งสิ้น</span><span>${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span></div>
    </div>
  </div>

  <div class="baht-text">
    <div class="label">จำนวนเงิน (ตัวอักษร)</div>
    <div class="text">(${bahtText(totalAmount)})</div>
  </div>

  ${doc.note ? `<div style="margin-bottom:20px;font-size:13px"><strong>หมายเหตุ:</strong> ${doc.note}</div>` : ''}

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-line">ผู้รับเงิน / Authorized Signature</div>
      <div class="sig-date">วันที่ ____/____/________</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">ผู้จ่ายเงิน / Customer Signature</div>
      <div class="sig-date">วันที่ ____/____/________</div>
    </div>
  </div>
</div>
</body></html>`

    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 600)
  }

  return (
    <Stack gap="lg">
      {/* Header */}
      <Card shadow="sm" padding="lg" radius="md" style={{ background: config.gradient, border: 'none' }}>
        <Group justify="space-between">
          <Group gap="md">
            <ActionIcon variant="white" size="lg" radius="xl" color="dark" onClick={() => navigate('/sales-doc')}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Group gap={8}>
                <DocIcon size={22} color="rgba(255,255,255,0.8)" />
                <Text size="xl" fw={800} c="white">{config.label}</Text>
              </Group>
              <Text size="sm" c="rgba(255,255,255,0.7)" ff="monospace" fw={600}>{doc.doc_number}</Text>
            </div>
          </Group>
          <Group gap="sm">
            <Badge color={status.color} variant="white" size="lg">{status.label}</Badge>
            {doc.doc_type !== 'quotation' && (
              <Badge color={payStatus.color} variant="white" size="lg">{payStatus.label}</Badge>
            )}
            <Button variant="white" color="dark" leftSection={<IconPrinter size={16} />} onClick={handlePrint}>
              พิมพ์เอกสาร
            </Button>
          </Group>
        </Group>
      </Card>

      {/* Document Info */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color={config.color} radius="xl"><IconCalendar size={14} /></ThemeIcon>
            <Text fw={700} size="sm">ข้อมูลเอกสาร</Text>
          </Group>
          <Stack gap={4}>
            <Group justify="space-between"><Text size="sm" c="dimmed">เลขที่</Text><Text size="sm" fw={600} ff="monospace">{doc.doc_number}</Text></Group>
            <Group justify="space-between"><Text size="sm" c="dimmed">วันที่</Text><Text size="sm">{fmtDate(doc.doc_date)}</Text></Group>
            {doc.due_date && <Group justify="space-between"><Text size="sm" c="dimmed">ครบกำหนด</Text><Text size="sm">{fmtDate(doc.due_date)}</Text></Group>}
            {doc.reference && <Group justify="space-between"><Text size="sm" c="dimmed">อ้างอิง</Text><Text size="sm">{doc.reference}</Text></Group>}
            {doc.price_type && (
              <Group justify="space-between"><Text size="sm" c="dimmed">ประเภทราคา</Text>
                <Badge variant="light" size="sm" color="gray">
                  {{ include_vat: 'รวม VAT', exclude_vat: 'แยก VAT', no_vat: 'ไม่มี VAT' }[doc.price_type as string] || doc.price_type}
                </Badge>
              </Group>
            )}
          </Stack>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color="orange" radius="xl"><IconUser size={14} /></ThemeIcon>
            <Text fw={700} size="sm">ข้อมูลลูกค้า</Text>
          </Group>
          <Stack gap={4}>
            <Group justify="space-between"><Text size="sm" c="dimmed">ชื่อ</Text><Text size="sm" fw={600}>{doc.customer_name || doc.customer_name_ref || 'ลูกค้าทั่วไป'}</Text></Group>
            {doc.customer_phone && <Group justify="space-between"><Text size="sm" c="dimmed">โทรศัพท์</Text><Text size="sm">{doc.customer_phone}</Text></Group>}
            {isTaxInvoice && doc.customer_tax_id && (
              <Group justify="space-between"><Text size="sm" c="dimmed">เลขผู้เสียภาษี</Text><Text size="sm" fw={600} ff="monospace">{doc.customer_tax_id}</Text></Group>
            )}
            {doc.customer_address && <Group justify="space-between"><Text size="sm" c="dimmed">ที่อยู่</Text><Text size="sm" style={{ maxWidth: 250, textAlign: 'right' }}>{doc.customer_address}</Text></Group>}
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Items Table */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <ThemeIcon size="sm" variant="light" color="violet" radius="xl"><IconHash size={14} /></ThemeIcon>
          <Text fw={700} size="sm">รายการสินค้า / บริการ</Text>
          <Badge variant="light" color="violet" size="sm">{doc.items?.length || 0} รายการ</Badge>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 40, textAlign: 'center' }}>#</Table.Th>
              <Table.Th>รายการ</Table.Th>
              <Table.Th ta="center" style={{ width: 80 }}>จำนวน</Table.Th>
              <Table.Th ta="center" style={{ width: 60 }}>หน่วย</Table.Th>
              <Table.Th ta="right" style={{ width: 110 }}>ราคา/หน่วย</Table.Th>
              <Table.Th ta="right" style={{ width: 120 }}>จำนวนเงิน</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {doc.items?.map((item: any, i: number) => (
              <Table.Tr key={item.id}>
                <Table.Td ta="center"><Text size="sm" c="dimmed">{i + 1}</Text></Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>{item.product_name || item.description || '-'}</Text>
                  {item.sku && <Text size="xs" c="dimmed" ff="monospace">{item.sku}</Text>}
                </Table.Td>
                <Table.Td ta="center"><Text size="sm">{parseFloat(item.quantity).toLocaleString()}</Text></Table.Td>
                <Table.Td ta="center"><Text size="sm" c="dimmed">{item.unit || 'ชิ้น'}</Text></Table.Td>
                <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(item.unit_price))}</Text></Table.Td>
                <Table.Td ta="right"><Text size="sm" fw={700} c={config.color}>฿{fmt(parseFloat(item.subtotal))}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Summary + Note */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Text fw={700} size="sm" mb="md">หมายเหตุ</Text>
          <Text size="sm" c={doc.note ? undefined : 'dimmed'}>{doc.note || 'ไม่มีหมายเหตุ'}</Text>
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Text fw={700} size="sm" mb="md">สรุปยอด</Text>
          <Stack gap={6}>
            <Group justify="space-between"><Text size="sm" c="dimmed">รวมสินค้า</Text><Text size="sm">฿{fmt(parseFloat(doc.subtotal))}</Text></Group>
            {parseFloat(doc.discount_amount) > 0 && (
              <Group justify="space-between"><Text size="sm" c="dimmed">ส่วนลด</Text><Text size="sm" c="red">-฿{fmt(parseFloat(doc.discount_amount))}</Text></Group>
            )}
            {vatAmount > 0 && (
              <>
                <Divider variant="dashed" my={4} />
                <Group justify="space-between"><Text size="sm" c="dimmed">มูลค่าก่อน VAT</Text><Text size="sm">฿{fmt(parseFloat(doc.amount_before_vat))}</Text></Group>
                <Group justify="space-between"><Text size="sm" c="dimmed">VAT {doc.vat_rate || 7}%</Text><Text size="sm">฿{fmt(vatAmount)}</Text></Group>
              </>
            )}
            <Divider my={4} />
            <Group justify="space-between">
              <Text size="lg" fw={800}>ยอดรวมทั้งสิ้น</Text>
              <Text size="xl" fw={800} c="green">฿{fmt(totalAmount)}</Text>
            </Group>
            <Text size="xs" c="dimmed" ta="right">({bahtText(totalAmount)})</Text>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Actions */}
      <Group justify="flex-end" pb="xl" gap="sm">
        <Button variant="light" color="gray" onClick={() => navigate('/sales-doc')}>กลับ</Button>
        {doc.status === 'draft' && (
          <Button color="blue" leftSection={<IconCheck size={16} />}
            loading={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
            อนุมัติ
          </Button>
        )}
        {doc.status !== 'voided' && (
          <Button color="red" variant="light" leftSection={<IconX size={16} />}
            loading={voidMutation.isPending}
            onClick={() => { if (confirm('ยกเลิกเอกสาร?')) voidMutation.mutate() }}>
            ยกเลิก
          </Button>
        )}
        {(doc.status === 'draft' || doc.status === 'voided') && (
          <Button color="red" variant="filled" leftSection={<IconTrash size={16} />}
            loading={deleteMutation.isPending}
            onClick={() => { if (confirm('ลบเอกสารนี้ถาวร? ข้อมูลจะไม่สามารถกู้คืนได้')) deleteMutation.mutate() }}>
            ลบเอกสาร
          </Button>
        )}
        <Button leftSection={<IconPrinter size={16} />} style={{ background: config.gradient }}
          onClick={handlePrint}>
          พิมพ์เอกสาร
        </Button>
      </Group>
    </Stack>
  )
}
