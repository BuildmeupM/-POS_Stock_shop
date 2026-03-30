import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Text, Group, Table, Badge, Loader, Stack, Button, SimpleGrid, Divider,
  ActionIcon, Timeline, ThemeIcon, Modal,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft, IconContract, IconPrinter, IconUser, IconCalendar,
  IconPercentage, IconCash, IconPackage, IconRefresh, IconArrowRight,
  IconPackageImport, IconPackageExport, IconReceipt, IconNote, IconTrash,
} from '@tabler/icons-react'
import api from '../../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => n.toLocaleString('th-TH')
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
const fmtDateTime = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: 'ใช้งาน', color: 'green' },
  expired: { label: 'หมดอายุ', color: 'orange' },
  cancelled: { label: 'ยกเลิก', color: 'red' },
}

const TX_ICON: Record<string, any> = {
  RECEIVE: IconPackageImport,
  SALE: IconReceipt,
  RETURN: IconPackageExport,
}
const TX_COLOR: Record<string, string> = {
  RECEIVE: 'teal',
  SALE: 'blue',
  RETURN: 'orange',
}
const TX_LABEL: Record<string, string> = {
  RECEIVE: 'รับสินค้าเข้า',
  SALE: 'ขายสินค้า',
  RETURN: 'คืนสินค้า',
}

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

export default function ConsignmentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const { data: agreement, isLoading } = useQuery({
    queryKey: ['consignment-agreement', id],
    queryFn: () => api.get(`/consignment/agreements/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: transactions = [] } = useQuery({
    queryKey: ['consignment-transactions', id],
    queryFn: () => api.get(`/consignment/agreements/${id}/transactions`).then(r => r.data).catch(() => []),
    enabled: !!id,
  })

  // Parse original agreement number from note (e.g. "ฝากต่อจากสัญญา CSA-25690328-00002")
  const origAgNumber = agreement?.note?.match(/ฝากต่อจากสัญญา\s+(CSA-[\d-]+)/)?.[1] || null

  // Fetch all agreements to find the original one
  const { data: allAgreements = [] } = useQuery({
    queryKey: ['consignment-agreements'],
    queryFn: () => api.get('/consignment/agreements').then(r => r.data),
    enabled: !!origAgNumber,
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/consignment/agreements/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบสัญญาฝากขายสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-agreements'] })
      navigate('/consignment')
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' })
      setDeleteConfirm(false)
    },
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />
  if (!agreement) return <Text ta="center" c="dimmed" py="xl">ไม่พบสัญญาฝากขาย</Text>

  const ag = agreement
  const origAg = origAgNumber ? allAgreements.find((a: any) => a.agreement_number === origAgNumber) : null
  const st = STATUS_MAP[ag.status] || { label: ag.status, color: 'gray' }
  const stockItems = ag.stock || []
  const totalOnHand = stockItems.reduce((s: number, i: any) => s + (parseInt(i.quantity_on_hand) || 0), 0)
  const totalReceived = stockItems.reduce((s: number, i: any) => s + (parseInt(i.quantity_received) || 0), 0)
  const totalSold = stockItems.reduce((s: number, i: any) => s + (parseInt(i.quantity_sold) || 0), 0)
  const totalReturned = stockItems.reduce((s: number, i: any) => s + (parseInt(i.quantity_returned) || 0), 0)
  const retailValue = stockItems.reduce((s: number, i: any) => s + (parseInt(i.quantity_on_hand) || 0) * (parseFloat(i.selling_price) || 0), 0)
  // consignorValue removed — not used in calculation

  const isRenewal = ag.note && ag.note.includes('ฝากต่อจาก')

  const openPrintWindow = (title: string, html: string) => {
    const pw = window.open('', '_blank', 'width=900,height=1200')
    if (!pw) return
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_STYLE}</style></head><body>${html}</body></html>`)
    pw.document.close()
    pw.focus()
    setTimeout(() => pw.print(), 600)
  }

  const handlePrintRenewal = () => {
    const stockRows = stockItems.map((s: any) =>
      `<tr><td>${s.sku || ''}</td><td>${s.product_name}</td>
       <td class="r">${fmtInt(parseInt(s.quantity_received))}</td>
       <td class="r">฿${fmt(parseFloat(s.selling_price))}</td>
       <td class="r">฿${fmt(parseInt(s.quantity_received) * parseFloat(s.selling_price))}</td></tr>`
    ).join('')
    const totalTransferred = stockItems.reduce((s: number, i: any) => s + (parseInt(i.quantity_received) || 0), 0)
    const totalRetail = stockItems.reduce((s: number, i: any) => s + (parseInt(i.quantity_received) || 0) * (parseFloat(i.selling_price) || 0), 0)

    openPrintWindow(`ใบฝากต่อ ${ag.agreement_number}`, `<div class="page">
      <div class="header">
        <div class="title">ใบฝากต่อ</div>
        <div class="title-en">CONSIGNMENT RENEWAL</div>
        <div class="doc-no">เลขที่: ${ag.agreement_number}</div>
        <div class="doc-date">วันที่: ${fmtDate(ag.created_at)}</div>
      </div>

      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">สัญญาเดิม</div>
          <div class="info-row"><span class="label">เลขที่</span><span class="value">${origAgNumber || '—'}</span></div>
          <div class="info-row"><span class="label">ผู้ฝากขาย</span><span class="value">${ag.contact_name}</span></div>
          ${origAg ? `<div class="info-row"><span class="label">วันเริ่ม</span><span class="value">${fmtDate(origAg.start_date)}</span></div>
          <div class="info-row"><span class="label">วันสิ้นสุด</span><span class="value">${fmtDate(origAg.end_date)}</span></div>` : ''}
          <div class="info-row"><span class="label">สถานะ</span><span class="value">หมดอายุ / ฝากต่อแล้ว</span></div>
        </div>
        <div class="info-box">
          <div class="info-label">สัญญาใหม่</div>
          <div class="info-row"><span class="label">เลขที่</span><span class="value">${ag.agreement_number}</span></div>
          <div class="info-row"><span class="label">วันเริ่ม</span><span class="value">${fmtDate(ag.start_date)}</span></div>
          <div class="info-row"><span class="label">วันสิ้นสุด</span><span class="value">${fmtDate(ag.end_date)}</span></div>
          <div class="info-row"><span class="label">ค่าคอมฯ</span><span class="value">${ag.commission_type === 'percent' ? ag.commission_rate + '%' : '฿' + fmt(parseFloat(ag.commission_rate)) + '/ชิ้น'}</span></div>
          <div class="info-row"><span class="label">ระยะจ่ายเงิน</span><span class="value">${ag.payment_terms} วัน</span></div>
          <div class="info-row"><span class="label">สินค้าที่โอน</span><span class="value">${stockItems.length} รายการ</span></div>
        </div>
      </div>

      ${stockItems.length > 0 ? `
      <table>
        <thead><tr><th>SKU</th><th>สินค้า</th><th class="r">จำนวนที่โอน</th><th class="r">ราคาขาย</th><th class="r">มูลค่า</th></tr></thead>
        <tbody>${stockRows}</tbody>
      </table>
      <div class="totals">
        <div class="total-row"><span>จำนวนสินค้าที่โอน</span><span>${fmtInt(totalTransferred)} ชิ้น</span></div>
        <div class="total-row big"><span>มูลค่ารวม</span><span>฿${fmt(totalRetail)}</span></div>
      </div>` : ''}

      ${ag.note ? `<div class="note"><strong>หมายเหตุ:</strong> ${ag.note}</div>` : ''}

      <div class="sig">
        <div class="sig-box"><div class="sig-line">ผู้ฝากขาย (Consignor)</div><div class="sig-date">วันที่ ____/____/________</div></div>
        <div class="sig-box"><div class="sig-line">ผู้รับฝากขาย (Consignee)</div><div class="sig-date">วันที่ ____/____/________</div></div>
      </div>
    </div>`)
  }

  const handlePrint = () => {
    const stockRows = stockItems.map((s: any) =>
      `<tr><td>${s.sku || ''}</td><td>${s.product_name}</td>
       <td class="r">${fmtInt(parseInt(s.quantity_received))}</td>
       <td class="r">${fmtInt(parseInt(s.quantity_sold))}</td>
       <td class="r">${fmtInt(parseInt(s.quantity_returned))}</td>
       <td class="r"><strong>${fmtInt(parseInt(s.quantity_on_hand))}</strong></td>
       <td class="r">฿${fmt(parseFloat(s.selling_price))}</td></tr>`
    ).join('')

    openPrintWindow(`สัญญาฝากขาย ${ag.agreement_number}`, `<div class="page">
      <div class="header">
        <div class="title">สัญญาฝากขาย</div>
        <div class="title-en">CONSIGNMENT AGREEMENT</div>
        <div class="doc-no">เลขที่: ${ag.agreement_number}</div>
        <div class="doc-date">วันที่: ${fmtDate(ag.created_at)}</div>
      </div>
      <div class="info-grid">
        <div class="info-box">
          <div class="info-label">ข้อมูลสัญญา</div>
          <div class="info-row"><span class="label">ผู้ฝากขาย</span><span class="value">${ag.contact_name}</span></div>
          ${ag.contact_phone ? `<div class="info-row"><span class="label">โทรศัพท์</span><span class="value">${ag.contact_phone}</span></div>` : ''}
          <div class="info-row"><span class="label">วันเริ่มต้น</span><span class="value">${fmtDate(ag.start_date)}</span></div>
          <div class="info-row"><span class="label">วันสิ้นสุด</span><span class="value">${fmtDate(ag.end_date)}</span></div>
        </div>
        <div class="info-box">
          <div class="info-label">เงื่อนไข</div>
          <div class="info-row"><span class="label">ค่าคอมมิชชัน</span><span class="value">${ag.commission_type === 'percent' ? ag.commission_rate + '%' : '฿' + fmt(parseFloat(ag.commission_rate)) + '/ชิ้น'}</span></div>
          <div class="info-row"><span class="label">ระยะจ่ายเงิน</span><span class="value">${ag.payment_terms} วัน</span></div>
          <div class="info-row"><span class="label">สถานะ</span><span class="value">${st.label}</span></div>
          <div class="info-row"><span class="label">สินค้าคงเหลือ</span><span class="value">${fmtInt(totalOnHand)} ชิ้น</span></div>
        </div>
      </div>
      ${ag.note ? `<div class="note"><strong>หมายเหตุ:</strong> ${ag.note}</div>` : ''}
      ${stockItems.length > 0 ? `
      <table>
        <thead><tr><th>SKU</th><th>สินค้า</th><th class="r">รับเข้า</th><th class="r">ขาย</th><th class="r">คืน</th><th class="r">คงเหลือ</th><th class="r">ราคาขาย</th></tr></thead>
        <tbody>${stockRows}</tbody>
      </table>
      <div class="totals">
        <div class="total-row"><span>มูลค่าคงเหลือ</span><span>฿${fmt(retailValue)}</span></div>
        <div class="total-row big"><span>สินค้าคงเหลือรวม</span><span>${fmtInt(totalOnHand)} ชิ้น</span></div>
      </div>` : ''}
      <div class="sig">
        <div class="sig-box"><div class="sig-line">ผู้ฝากขาย (Consignor)</div><div class="sig-date">วันที่ ____/____/________</div></div>
        <div class="sig-box"><div class="sig-line">ผู้รับฝากขาย (Consignee)</div><div class="sig-date">วันที่ ____/____/________</div></div>
      </div>
    </div>`)
  }

  return (
    <Stack gap="lg">
      {/* ═══ Header ═══ */}
      <Card shadow="sm" padding="lg" radius="md"
        style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)', border: 'none' }}>
        <Group justify="space-between">
          <Group gap="md">
            <ActionIcon variant="white" size="lg" radius="xl" color="dark"
              onClick={() => navigate('/consignment')}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Group gap={8}>
                <IconContract size={22} color="rgba(255,255,255,0.8)" />
                <Text size="xl" fw={800} c="white">
                  {isRenewal ? 'ใบฝากต่อ' : 'สัญญาฝากขาย'}
                </Text>
                <Badge size="lg" variant="white" color={st.color}>{st.label}</Badge>
              </Group>
              <Text size="sm" c="rgba(255,255,255,0.7)" mt={2} ff="monospace">{ag.agreement_number}</Text>
            </div>
          </Group>
          <Group gap="sm">
            {isRenewal && (
              <Button variant="white" color="dark" leftSection={<IconRefresh size={16} />}
                onClick={handlePrintRenewal}>
                พิมพ์ใบฝากต่อ
              </Button>
            )}
            <Button variant="white" color="dark" leftSection={<IconPrinter size={16} />}
              onClick={handlePrint}>
              พิมพ์สัญญา
            </Button>
            <ActionIcon variant="white" size="lg" color="red" radius="md"
              onClick={() => setDeleteConfirm(true)}>
              <IconTrash size={18} />
            </ActionIcon>
          </Group>
        </Group>
      </Card>

      {/* ═══ Renewal Banner ═══ */}
      {isRenewal && (
        <Card shadow="xs" padding="md" radius="md" withBorder
          style={{ border: '2px solid #c4b5fd', background: 'rgba(139,92,246,0.04)' }}>
          <Group justify="space-between">
            <Group gap="md">
              <ThemeIcon size={36} radius="xl" color="violet" variant="light"><IconRefresh size={20} /></ThemeIcon>
              <div>
                <Text size="sm" fw={700}>ฝากต่อจากสัญญาเดิม</Text>
                <Group gap={8} mt={2}>
                  <Text size="sm" ff="monospace" c="dimmed">{origAgNumber}</Text>
                  <IconArrowRight size={14} color="gray" />
                  <Text size="sm" ff="monospace" fw={700} c="indigo">{ag.agreement_number}</Text>
                </Group>
              </div>
            </Group>
            {origAg && (
              <Button size="xs" variant="light" color="violet"
                onClick={() => navigate(`/consignment/${origAg.id}`)}>
                ดูสัญญาเดิม
              </Button>
            )}
          </Group>
        </Card>
      )}

      {/* ═══ Info Cards ═══ */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* ── ข้อมูลสัญญา ── */}
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color="indigo" radius="xl"><IconUser size={14} /></ThemeIcon>
            <Text fw={700} size="sm">ข้อมูลสัญญา</Text>
          </Group>
          <Stack gap={8}>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">ผู้ฝากขาย</Text>
              <Text size="sm" fw={600}>{ag.contact_name}</Text>
            </Group>
            {ag.contact_phone && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">โทรศัพท์</Text>
                <Text size="sm">{ag.contact_phone}</Text>
              </Group>
            )}
            {ag.contact_address && (
              <Group justify="space-between" align="flex-start">
                <Text size="sm" c="dimmed">ที่อยู่</Text>
                <Text size="sm" ta="right" style={{ maxWidth: 200 }}>{ag.contact_address}</Text>
              </Group>
            )}
            <Divider variant="dashed" />
            <Group justify="space-between">
              <Text size="sm" c="dimmed">วันเริ่มต้น</Text>
              <Group gap={6}><IconCalendar size={14} color="gray" /><Text size="sm">{fmtDate(ag.start_date)}</Text></Group>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">วันสิ้นสุด</Text>
              <Group gap={6}><IconCalendar size={14} color="gray" /><Text size="sm">{fmtDate(ag.end_date)}</Text></Group>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">สร้างเมื่อ</Text>
              <Text size="sm" c="dimmed">{fmtDateTime(ag.created_at)}</Text>
            </Group>
          </Stack>
        </Card>

        {/* ── เงื่อนไข ── */}
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color="violet" radius="xl"><IconPercentage size={14} /></ThemeIcon>
            <Text fw={700} size="sm">เงื่อนไขการฝากขาย</Text>
          </Group>
          <Stack gap={8}>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">ประเภทค่าคอมฯ</Text>
              <Badge variant="light" color="violet">
                {ag.commission_type === 'percent' ? `${ag.commission_rate}% จากยอดขาย` : `฿${fmt(parseFloat(ag.commission_rate))}/ชิ้น`}
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">ระยะจ่ายเงิน</Text>
              <Text size="sm" fw={600}>{ag.payment_terms} วัน</Text>
            </Group>
            <Divider variant="dashed" />
            {ag.note && (
              <div>
                <Group gap={6} mb={4}><IconNote size={14} color="gray" /><Text size="xs" c="dimmed" fw={600}>หมายเหตุ</Text></Group>
                <Text size="sm" style={{ background: 'rgba(99,102,241,0.04)', padding: '8px 12px', borderRadius: 6 }}>
                  {ag.note}
                </Text>
              </div>
            )}
          </Stack>
        </Card>
      </SimpleGrid>

      {/* ═══ KPI Summary ═══ */}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconPackageImport size={16} color="teal" />
            <Text size="xs" c="dimmed" fw={600}>รับเข้าทั้งหมด</Text>
          </Group>
          <Text size="xl" fw={800} c="teal">{fmtInt(totalReceived)} ชิ้น</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconReceipt size={16} color="blue" />
            <Text size="xs" c="dimmed" fw={600}>ขายแล้ว</Text>
          </Group>
          <Text size="xl" fw={800} c="blue">{fmtInt(totalSold)} ชิ้น</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconPackageExport size={16} color="orange" />
            <Text size="xs" c="dimmed" fw={600}>คืนแล้ว</Text>
          </Group>
          <Text size="xl" fw={800} c="orange">{fmtInt(totalReturned)} ชิ้น</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder
          style={{ border: '2px solid var(--app-primary)', background: 'rgba(99,102,241,0.03)' }}>
          <Group gap={8} mb={4}>
            <IconPackage size={16} color="var(--app-primary)" />
            <Text size="xs" c="dimmed" fw={600}>คงเหลือ</Text>
          </Group>
          <Text size="xl" fw={800} c="indigo">{fmtInt(totalOnHand)} ชิ้น</Text>
          <Text size="xs" c="dimmed" mt={2}>มูลค่า ฿{fmt(retailValue)}</Text>
        </Card>
      </SimpleGrid>

      {/* ═══ Stock Table ═══ */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="indigo" variant="filled" size="lg">สินค้าในสัญญา</Badge>
          <Text size="sm" c="dimmed">{stockItems.length} รายการ</Text>
        </Group>
        {stockItems.length === 0 ? (
          <Text ta="center" c="dimmed" py="xl">ยังไม่มีสินค้าในสัญญานี้</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>SKU</Table.Th>
                <Table.Th>สินค้า</Table.Th>
                <Table.Th ta="right">รับเข้า</Table.Th>
                <Table.Th ta="right">ขายแล้ว</Table.Th>
                <Table.Th ta="right">คืนแล้ว</Table.Th>
                <Table.Th ta="right">คงเหลือ</Table.Th>
                <Table.Th ta="right">ราคาขาย</Table.Th>
                <Table.Th ta="right">มูลค่าคงเหลือ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {stockItems.map((s: any) => {
                const onHand = parseInt(s.quantity_on_hand) || 0
                const sellPrice = parseFloat(s.selling_price) || 0
                return (
                  <Table.Tr key={s.id}>
                    <Table.Td><Text size="sm" ff="monospace" c="dimmed">{s.sku}</Text></Table.Td>
                    <Table.Td><Text size="sm" fw={500}>{s.product_name}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm">{fmtInt(parseInt(s.quantity_received))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" c="green">{fmtInt(parseInt(s.quantity_sold))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" c="orange">{fmtInt(parseInt(s.quantity_returned))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" fw={700}>{fmtInt(onHand)}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(sellPrice)}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" fw={600} c="blue">฿{fmt(onHand * sellPrice)}</Text></Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr style={{ borderTop: '2px solid var(--app-border)' }}>
                <Table.Th colSpan={5}><Text fw={700}>รวม</Text></Table.Th>
                <Table.Th ta="right"><Text fw={700}>{fmtInt(totalOnHand)}</Text></Table.Th>
                <Table.Th ta="right"></Table.Th>
                <Table.Th ta="right"><Text fw={700} c="blue">฿{fmt(retailValue)}</Text></Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        )}
      </Card>

      {/* ═══ Transaction History ═══ */}
      {transactions.length > 0 && (
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <Badge color="gray" variant="filled" size="lg">ประวัติการเคลื่อนไหว</Badge>
            <Text size="sm" c="dimmed">{transactions.length} รายการ</Text>
          </Group>
          <Timeline active={transactions.length} bulletSize={28} lineWidth={2}>
            {transactions.map((tx: any, i: number) => {
              const TxIcon = TX_ICON[tx.type] || IconArrowRight
              const color = TX_COLOR[tx.type] || 'gray'
              const label = TX_LABEL[tx.type] || tx.type
              return (
                <Timeline.Item key={i}
                  bullet={<ThemeIcon size={28} radius="xl" color={color} variant="filled"><TxIcon size={14} /></ThemeIcon>}
                  title={
                    <Group gap={8}>
                      <Text size="sm" fw={600}>{label}</Text>
                      <Badge size="xs" variant="light" color={color}>{tx.type}</Badge>
                      {tx.sale_number && <Text size="xs" c="dimmed" ff="monospace">{tx.sale_number}</Text>}
                    </Group>
                  }>
                  <Text size="sm" mt={4}>
                    {tx.product_name} x {fmtInt(tx.quantity)}
                    {' '}— ราคาขาย ฿{fmt(parseFloat(tx.selling_price))}
                    {parseFloat(tx.commission_amount) > 0 && ` | คอมฯ ฿${fmt(parseFloat(tx.commission_amount))}`}
                  </Text>
                  <Text size="xs" c="dimmed" mt={2}>{fmtDateTime(tx.created_at)}</Text>
                </Timeline.Item>
              )
            })}
          </Timeline>
        </Card>
      )}

      {/* ═══ Modal ยืนยันลบ ═══ */}
      <Modal opened={deleteConfirm} onClose={() => setDeleteConfirm(false)}
        title="ยืนยันลบสัญญาฝากขาย" centered size="sm">
        <Stack gap="md">
          <Card padding="md" radius="md" withBorder style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Text size="sm" fw={600} c="red">ข้อมูลที่จะถูกลบทั้งหมด:</Text>
            <Text size="sm" mt={4}>สัญญา: <strong>{ag.agreement_number}</strong></Text>
            <Text size="sm">สินค้าในสัญญา: <strong>{stockItems.length} รายการ</strong></Text>
            <Text size="sm">ประวัติธุรกรรม: <strong>{transactions.length} รายการ</strong></Text>
          </Card>
          <Text size="xs" c="dimmed">การลบไม่สามารถกู้คืนได้</Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleteConfirm(false)}>ยกเลิก</Button>
            <Button color="red" leftSection={<IconTrash size={16} />}
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}>
              ยืนยันลบ
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
