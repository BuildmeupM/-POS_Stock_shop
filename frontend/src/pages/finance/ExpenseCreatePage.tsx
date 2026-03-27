import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Group, Stack, NumberInput, TextInput, Select,
  Text, ActionIcon, Divider, Collapse, Badge, Progress
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconReceipt, IconTrash, IconArrowLeft,
  IconFileInvoice, IconChevronDown, IconChevronUp,
  IconCash, IconClockPause, IconAdjustments, IconCircleCheck
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt } from '../../utils/formatters'

// --- Types ---
interface ExpenseItem {
  accountId: string
  description: string
  quantity: number
  unitPrice: number
  vatType: 'none' | 'include' | 'exclude'
  vatRate: number
  whtRate: number
}

interface AdjustmentItem {
  accountId: string
  description: string
  amount: number
}

interface PaymentLine {
  channelId: string
  amount: number
}

const emptyItem = (): ExpenseItem => ({
  accountId: '', description: '', quantity: 1, unitPrice: 0,
  vatType: 'none', vatRate: 7, whtRate: 0
})

const whtRateOptions = [
  { value: '0', label: 'ไม่หัก' },
  { value: '1', label: '1% ค่าขนส่ง' },
  { value: '2', label: '2% ค่าโฆษณา' },
  { value: '3', label: '3% ค่าบริการ/ค่าจ้าง' },
  { value: '5', label: '5% ค่าเช่า' },
  { value: '10', label: '10% อื่นๆ' },
]

// --- Calc helpers ---
function calcItem(item: ExpenseItem) {
  const qty = item.quantity || 0
  const unitPrice = item.unitPrice || 0
  let amount = qty * unitPrice
  let vatAmount = 0
  let whtAmount = 0

  if (item.vatType === 'exclude') {
    vatAmount = amount * (item.vatRate / 100)
  } else if (item.vatType === 'include') {
    const rate = item.vatRate / 100
    vatAmount = amount - (amount / (1 + rate))
    amount = amount - vatAmount
  }

  if (item.whtRate > 0) {
    whtAmount = amount * (item.whtRate / 100)
  }

  return { amount, vatAmount, whtAmount }
}

function calcTotals(items: ExpenseItem[]) {
  let subtotal = 0, totalVat = 0, totalWht = 0
  items.forEach(item => {
    const c = calcItem(item)
    subtotal += c.amount
    totalVat += c.vatAmount
    totalWht += c.whtAmount
  })
  return { subtotal, totalVat, totalWht, grandTotal: subtotal + totalVat, netPayment: subtotal + totalVat - totalWht }
}

function calcAdjustmentTotal(adjustments: AdjustmentItem[]) {
  let total = 0
  adjustments.forEach(a => {
    total += a.amount || 0
  })
  return { total }
}

export default function ExpenseCreatePage() {
  const navigate = useNavigate()

  const [items, setItems] = useState<ExpenseItem[]>([emptyItem()])
  const [header, setHeader] = useState({
    vendorName: '', taxId: '', contactId: '', expenseDate: new Date().toISOString().split('T')[0],
    dueDate: '', paymentStatus: 'paid',
    referenceNumber: '', note: '',
  })
  const [taxInvoice, setTaxInvoice] = useState({ number: '', date: '', period: '' })
  const [showTaxInvoice, setShowTaxInvoice] = useState(false)
  const [adjustments, setAdjustments] = useState<AdjustmentItem[]>([])
  const [showAdjustments, setShowAdjustments] = useState(false)
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ channelId: '', amount: 0 }])

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const { data: contacts } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts', { params: { type: 'vendor' } }).then(r => r.data),
  })

  const { data: walletChannels = [] } = useQuery({
    queryKey: ['wallet-channels-active'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const payChannelOptions = walletChannels.length > 0
    ? walletChannels.map((ch: any) => ({
        value: String(ch.id),
        label: `${ch.type === 'cash' ? '💵' : ch.type === 'bank_account' ? '🏦' : ch.type === 'promptpay' ? '📱' : ch.type === 'credit_card' ? '💳' : '📋'} ${ch.name}`,
      }))
    : [
        { value: '_cash', label: '💵 เงินสด' },
        { value: '_transfer', label: '🏦 โอนเงิน' },
        { value: '_credit_card', label: '💳 บัตรเครดิต' },
      ]

  const contactOptions = (contacts || []).map((c: any) => ({
    value: String(c.id),
    label: c.name + (c.tax_id ? ` (${c.tax_id})` : ''),
  }))

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/accounting/expenses', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `บันทึกค่าใช้จ่าย ${res.data.expenseNumber}`, color: 'green' })
      navigate('/expenses')
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })


  const expenseAccounts = accounts?.filter((a: any) => a.account_type === 'expense') || []

  const updateItem = useCallback((idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }, [])

  const addItem = useCallback(() => {
    setItems(prev => [...prev, emptyItem()])
  }, [])

  const removeItem = useCallback((idx: number) => {
    setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }, [])

  const handleSubmit = useCallback((status: 'draft' | 'approved') => {
    const hasEmptyAccount = items.some(i => !i.accountId)
    const hasZeroAmount = items.some(i => !i.unitPrice || i.unitPrice <= 0)
    if (hasEmptyAccount) {
      notifications.show({ title: 'ข้อมูลไม่ครบ', message: 'กรุณาเลือกบัญชีค่าใช้จ่ายให้ครบทุกรายการ', color: 'orange' })
      return
    }
    if (hasZeroAmount) {
      notifications.show({ title: 'ข้อมูลไม่ครบ', message: 'กรุณากรอกจำนวนเงินให้ครบทุกรายการ', color: 'orange' })
      return
    }
    // Validate adjustments
    const validAdjustments = adjustments.filter(a => a.accountId && a.amount > 0)

    // Build payment data from payment lines
    const validPaymentLines = header.paymentStatus === 'paid'
      ? paymentLines.filter(pl => pl.amount > 0)
      : []

    // First payment line determines primary payment method
    const firstLine = validPaymentLines[0]
    let paymentMethod = 'cash'
    let paymentChannelId: number | null = null
    if (firstLine && firstLine.channelId && !firstLine.channelId.startsWith('_')) {
      paymentChannelId = Number(firstLine.channelId)
      const ch = walletChannels.find((c: any) => String(c.id) === firstLine.channelId)
      paymentMethod = ch?.type === 'bank_account' ? 'transfer' : ch?.type || 'cash'
    } else if (firstLine?.channelId) {
      paymentMethod = firstLine.channelId.replace('_', '')
    }

    createMutation.mutate({
      ...header,
      paymentMethod,
      paymentChannelId: paymentChannelId || undefined,
      paymentLines: validPaymentLines.length > 0 ? validPaymentLines : undefined,
      taxInvoiceNumber: taxInvoice.number || null,
      taxInvoiceDate: taxInvoice.date || null,
      taxPeriod: taxInvoice.period || null,
      status,
      items,
      adjustments: validAdjustments.length > 0 ? validAdjustments : undefined,
    })
  }, [header, items, taxInvoice, adjustments, paymentLines, walletChannels, createMutation])

  const totals = useMemo(() => calcTotals(items), [items])
  const adjTotals = useMemo(() => calcAdjustmentTotal(adjustments), [adjustments])
  const allAccounts = accounts || []

  // Net payment total (including adjustments)
  const netPaymentTotal = totals.netPayment - adjTotals.total
  const totalPaid = paymentLines.reduce((sum, pl) => sum + (pl.amount || 0), 0)
  const remaining = netPaymentTotal - totalPaid

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="sm">
          <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => navigate('/expenses')}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <Text size="xl" fw={800}>📝 บันทึกค่าใช้จ่ายใหม่</Text>
        </Group>
        <Group>
          <Button variant="outline" color="gray" radius="md"
            loading={createMutation.isPending}
            onClick={() => handleSubmit('draft')}>
            📄 บันทึกร่าง
          </Button>
          <Button variant="gradient" gradient={{ from: 'indigo', to: 'violet' }} radius="md"
            loading={createMutation.isPending}
            onClick={() => handleSubmit('approved')}>
            <IconReceipt size={18} style={{ marginRight: 8 }} /> อนุมัติและบันทึก
          </Button>
        </Group>
      </Group>

      {/* SECTION 1: Document Header — PEAK-style layout */}
      <div className="stat-card" style={{ padding: 0, overflow: 'visible' }}>
        {/* Row 1: Title + Tax Invoice No. + Document No. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--app-border-light)' }}>
          <Text size="lg" fw={800} c="var(--app-primary)">บันทึกค่าใช้จ่าย</Text>
          <Group gap="sm">
            <TextInput size="xs" label="เลขที่ใบกำกับภาษี" placeholder="ระบุเลขที่ใบกำกับภาษี"
              value={taxInvoice.number} onChange={(e) => setTaxInvoice({ ...taxInvoice, number: e.target.value })}
              styles={{ root: { minWidth: 200 } }} />
            <TextInput size="xs" label="เลขที่เอกสาร" placeholder="EXP-XXXXXXXXXX" readOnly
              value={header.referenceNumber}
              styles={{ root: { minWidth: 180 }, input: { background: 'var(--app-surface-light)', fontWeight: 600 } }} />
          </Group>
        </div>

        {/* Row 2: ข้อมูลผู้ขาย */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--app-border-light)' }}>
          <Group gap={6} style={{ minWidth: 120, paddingTop: 24, flexShrink: 0 }}>
            <IconCircleCheck size={18} color="var(--app-primary)" />
            <Text size="sm" fw={700} c="dimmed">ข้อมูลผู้ขาย</Text>
          </Group>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <Select label="ชื่อผู้ขาย" placeholder="พิมพ์เพื่อค้นหาผู้ติดต่อ หรือสร้างผู้ติดต่อใหม่" searchable clearable size="sm"
              data={contactOptions}
              value={header.contactId || null}
              onChange={(v) => {
                if (v) {
                  const contact = (contacts || []).find((c: any) => String(c.id) === v)
                  if (contact) {
                    setHeader({ ...header, contactId: v, vendorName: contact.name, taxId: contact.tax_id || '' })
                  }
                } else {
                  setHeader({ ...header, contactId: '', vendorName: '', taxId: '' })
                }
              }} />
            <TextInput type="date" label="วันที่ออก" required size="sm"
              value={header.expenseDate} onChange={(e) => setHeader({ ...header, expenseDate: e.target.value })} />
            <TextInput type="date" label="วันที่ครบกำหนด" size="sm"
              value={header.dueDate} onChange={(e) => setHeader({ ...header, dueDate: e.target.value })} />
          </div>
        </div>

        {/* Row 3: ที่อยู่ + Tax ID (read-only from contact) */}
        {header.contactId && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '10px 20px 10px 156px', borderBottom: '1px solid var(--app-border-light)' }}>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div>
              <Text size="xs" fw={600} c="dimmed" mb={4}>ที่อยู่</Text>
              <Text size="sm" c={(() => { const ct = (contacts || []).find((c: any) => String(c.id) === header.contactId); return ct?.address ? undefined : 'dimmed'; })()} fs={(() => { const ct = (contacts || []).find((c: any) => String(c.id) === header.contactId); return ct?.address ? undefined : 'italic'; })()}>
                {(() => { const ct = (contacts || []).find((c: any) => String(c.id) === header.contactId); return ct?.address || '—'; })()}
              </Text>
            </div>
            <div>
              <Text size="xs" fw={600} c="dimmed" mb={4}>เลข Tax ID</Text>
              <Text size="sm" c={header.taxId ? undefined : 'dimmed'} fs={header.taxId ? undefined : 'italic'}>
                {header.taxId || '—'}
              </Text>
            </div>
          </div>
        </div>
        )}

        {/* Row 4: ข้อมูลราคาและภาษี */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 20px', borderBottom: showTaxInvoice ? '1px solid var(--app-border-light)' : 'none' }}>
          <Group gap={6} style={{ minWidth: 120, paddingTop: 24, flexShrink: 0 }}>
            <IconCircleCheck size={18} color="var(--app-primary)" />
            <Text size="sm" fw={700} c="dimmed">ข้อมูลภาษี</Text>
          </Group>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <TextInput type="date" label="วันที่ใบกำกับภาษี" size="sm"
              value={taxInvoice.date} onChange={(e) => setTaxInvoice({ ...taxInvoice, date: e.target.value })} />
            <TextInput label="งวดภาษี" placeholder="03/2026" size="sm"
              value={taxInvoice.period} onChange={(e) => setTaxInvoice({ ...taxInvoice, period: e.target.value })} />
            <TextInput label="เลขที่อ้างอิง" placeholder="เลขที่บิลผู้ขาย" size="sm"
              value={header.referenceNumber} onChange={(e) => setHeader({ ...header, referenceNumber: e.target.value })} />
          </div>
        </div>
      </div>

      {/* SECTION 2: Line Items */}
      <div className="stat-card">
        <Group justify="space-between" mb="md">
          <Text fw={700} size="sm" c="dimmed">รายการค่าใช้จ่าย</Text>
          <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={addItem}>
            เพิ่มรายการ
          </Button>
        </Group>

        <div style={{ overflowX: 'auto' }}>
          <Table withColumnBorders>
            <Table.Thead>
              <Table.Tr style={{ background: 'var(--app-surface-light)' }}>
                <Table.Th style={{ width: 40 }} ta="center">#</Table.Th>
                <Table.Th style={{ minWidth: 200 }}>บัญชี *</Table.Th>
                <Table.Th style={{ minWidth: 200 }}>รายละเอียด</Table.Th>
                <Table.Th style={{ width: 90 }} ta="center">จำนวน</Table.Th>
                <Table.Th style={{ width: 140 }} ta="right">ราคา/หน่วย *</Table.Th>
                <Table.Th style={{ width: 130 }} ta="center">VAT</Table.Th>
                <Table.Th style={{ width: 140 }} ta="center">หัก ณ ที่จ่าย</Table.Th>
                <Table.Th style={{ width: 130 }} ta="right">รวม</Table.Th>
                <Table.Th style={{ width: 44 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item, idx) => {
                const c = calcItem(item)
                return (
                  <Table.Tr key={idx}>
                    <Table.Td ta="center"><Text size="sm" c="dimmed">{idx + 1}</Text></Table.Td>
                    <Table.Td>
                      <Select size="xs" searchable placeholder="เลือกบัญชี"
                        data={expenseAccounts.map((a: any) => ({ value: String(a.id), label: `${a.account_code} - ${a.name}` }))}
                        value={item.accountId} onChange={(v) => updateItem(idx, 'accountId', v || '')} />
                    </Table.Td>
                    <Table.Td>
                      <TextInput size="xs" placeholder="รายละเอียด"
                        value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" min={1} value={item.quantity}
                        onChange={(v) => updateItem(idx, 'quantity', Number(v))} styles={{ input: { textAlign: 'center' } }} />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" min={0} decimalScale={2} thousandSeparator="," placeholder="0.00"
                        value={item.unitPrice} onChange={(v) => updateItem(idx, 'unitPrice', Number(v))}
                        styles={{ input: { textAlign: 'right' } }} />
                    </Table.Td>
                    <Table.Td>
                      <Select size="xs" value={item.vatType}
                        data={[
                          { value: 'none', label: 'ไม่มี VAT' },
                          { value: 'exclude', label: 'แยก VAT 7%' },
                          { value: 'include', label: 'รวม VAT 7%' },
                        ]}
                        onChange={(v) => updateItem(idx, 'vatType', v || 'none')} />
                    </Table.Td>
                    <Table.Td>
                      <Select size="xs" value={String(item.whtRate)} data={whtRateOptions}
                        onChange={(v) => updateItem(idx, 'whtRate', parseFloat(v || '0'))} />
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600}>฿{fmt(c.amount + c.vatAmount)}</Text>
                      {c.whtAmount > 0 && <Text size="xs" c="orange">-฿{fmt(c.whtAmount)}</Text>}
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="red" size="sm"
                        onClick={() => removeItem(idx)} disabled={items.length <= 1}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>

        {/* Summary */}
        <div style={{ marginTop: 16, padding: 16, background: 'var(--app-surface-light)', borderRadius: 8 }}>
          <Group justify="flex-end" gap="xl">
            <Stack gap={4} style={{ textAlign: 'right', minWidth: 280 }}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">ยอดรวมก่อน VAT</Text>
                <Text size="sm" fw={600}>฿{fmt(totals.subtotal)}</Text>
              </Group>
              {totals.totalVat > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="cyan">ภาษีมูลค่าเพิ่ม (VAT)</Text>
                  <Text size="sm" fw={600} c="cyan">฿{fmt(totals.totalVat)}</Text>
                </Group>
              )}
              {totals.totalWht > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="orange">หัก ณ ที่จ่าย (WHT)</Text>
                  <Text size="sm" fw={600} c="orange">-฿{fmt(totals.totalWht)}</Text>
                </Group>
              )}
              <Divider my={4} />
              {adjTotals.total > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="teal">ปรับปรุงรายการ (เครดิต)</Text>
                  <Text size="sm" fw={600} c="teal">-฿{fmt(adjTotals.total)}</Text>
                </Group>
              )}
              <Group justify="space-between">
                <Text fw={700} size="md">ยอดชำระสุทธิ</Text>
                <Text size="xl" fw={800} c="var(--app-primary)">฿{fmt(totals.netPayment - adjTotals.total)}</Text>
              </Group>
            </Stack>
          </Group>
        </div>
      </div>



      {/* SECTION 4: Payment & Notes */}
      <div className="stat-card" style={{ border: '1.5px solid #333' }}>
        <Text fw={700} mb="md" size="sm" c="dimmed">การชำระเงิน</Text>

        {/* Payment summary card */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08))',
          borderRadius: 10, padding: 16, marginBottom: 16,
          border: '1px solid rgba(99, 102, 241, 0.15)',
        }}>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed">ยอดที่ต้องชำระ</Text>
            <Text size="xl" fw={800} c="var(--app-primary)">฿{fmt(netPaymentTotal)}</Text>
          </Group>
          {header.paymentStatus === 'paid' && totalPaid > 0 && (
            <>
              <Progress.Root size="sm" radius="xl" mb={8}>
                <Progress.Section
                  value={netPaymentTotal > 0 ? Math.min((totalPaid / netPaymentTotal) * 100, 100) : 0}
                  color={remaining <= 0 ? 'green' : 'indigo'}
                />
              </Progress.Root>
              <Group justify="space-between">
                <Group gap={6}>
                  <Text size="xs" c="dimmed">ชำระแล้ว</Text>
                  <Badge size="sm" color="green" variant="light">฿{fmt(totalPaid)}</Badge>
                </Group>
                <Group gap={6}>
                  <Text size="xs" c="dimmed">คงเหลือ</Text>
                  <Badge size="sm" color={remaining <= 0 ? 'green' : 'red'} variant="light">
                    ฿{fmt(Math.abs(remaining))}
                    {remaining < 0 && ' (เกิน)'}
                  </Badge>
                </Group>
              </Group>
            </>
          )}
        </div>

        <Group justify="flex-end" mb="md">
        <Button
          variant="filled"
          color={header.paymentStatus === 'paid' ? 'green' : 'orange'}
          size="xs"
          radius="xl"
          leftSection={header.paymentStatus === 'paid' ? <IconCash size={14} /> : <IconClockPause size={14} />}
          onClick={() => {
            if (header.paymentStatus === 'paid') {
              // Toggle to unpaid
              setHeader({ ...header, paymentStatus: 'unpaid' })
              setPaymentLines([{ channelId: '', amount: 0 }])
            } else {
              // Toggle to paid
              setHeader({ ...header, paymentStatus: 'paid' })
              if (paymentLines.length === 1 && paymentLines[0].amount === 0) {
                setPaymentLines([{ channelId: paymentLines[0].channelId, amount: netPaymentTotal > 0 ? Math.round(netPaymentTotal * 100) / 100 : 0 }])
              }
            }
          }}
          styles={{
            root: header.paymentStatus === 'paid' ? {
              background: 'linear-gradient(135deg, #059669, #047857)',
              boxShadow: '0 4px 14px rgba(5, 150, 105, 0.25)',
            } : {
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              boxShadow: '0 4px 14px rgba(217, 119, 6, 0.25)',
            }
          }}>
          {header.paymentStatus === 'paid' ? '💰 ชำระเงิน' : '⏳ ยังไม่ชำระเงิน'}
        </Button>
        </Group>
        <Collapse in={header.paymentStatus === 'paid'}>
          {/* Payment lines */}
          <Stack gap="xs">
            {paymentLines.map((pl, idx) => {
              const lineRemaining = netPaymentTotal - paymentLines.slice(0, idx).reduce((s, p) => s + (p.amount || 0), 0)
              return (
                <Group key={idx} gap="xs" align="flex-end" style={{
                  background: 'var(--app-surface-light)', borderRadius: 8, padding: '10px 12px',
                  border: '1px solid var(--app-border-light)',
                }}>
                  <div style={{ flex: 1 }}>
                    {idx === 0 && <Text size="xs" fw={500} mb={4}>ช่องทางชำระ</Text>}
                    <Select size="sm" placeholder="เลือกช่องทาง" data={payChannelOptions}
                      value={pl.channelId || null}
                      onChange={(v) => {
                        const updated = [...paymentLines]
                        updated[idx] = { ...updated[idx], channelId: v || '' }
                        setPaymentLines(updated)
                      }} />
                  </div>
                  <div style={{ width: 180 }}>
                    {idx === 0 && <Text size="xs" fw={500} mb={4}>จำนวนเงิน</Text>}
                    <NumberInput size="sm" min={0} decimalScale={2} thousandSeparator="," placeholder="0.00"
                      value={pl.amount || ''}
                      onChange={(v) => {
                        const updated = [...paymentLines]
                        updated[idx] = { ...updated[idx], amount: Number(v) || 0 }
                        setPaymentLines(updated)
                      }}
                      styles={{ input: { textAlign: 'right', fontWeight: 600 } }}
                      rightSection={<Text size="xs" c="dimmed" mr={4}>฿</Text>} />
                  </div>
                  <div style={{ width: 100 }}>
                    {idx === 0 && <Text size="xs" fw={500} mb={4}>คงเหลือ</Text>}
                    <Text size="sm" fw={600}
                      c={lineRemaining - (pl.amount || 0) <= 0 ? 'green' : 'orange'}
                      style={{ lineHeight: '36px', textAlign: 'right' }}>
                      ฿{fmt(Math.max(lineRemaining - (pl.amount || 0), 0))}
                    </Text>
                  </div>
                  {paymentLines.length > 1 && (
                    <ActionIcon variant="subtle" color="red" size="sm"
                      onClick={() => setPaymentLines(prev => prev.filter((_, i) => i !== idx))}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
              )
            })}
            <Button variant="light" size="xs" color="indigo" radius="md"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                const currentRemaining = netPaymentTotal - totalPaid
                setPaymentLines(prev => [...prev, { channelId: '', amount: currentRemaining > 0 ? Math.round(currentRemaining * 100) / 100 : 0 }])
              }}>
              เพิ่มช่องทางชำระ
            </Button>
          </Stack>

          {/* Adjustment Items (ปรับปรุงรายการ) */}
          <div style={{ marginTop: 16 }}>
            <Group gap={6} style={{ cursor: 'pointer' }} onClick={() => setShowAdjustments(!showAdjustments)} mb="xs">
              <IconAdjustments size={16} color="var(--mantine-color-indigo-6)" />
              <Text size="sm" fw={600} c="indigo">ปรับปรุงรายการ</Text>
              {showAdjustments ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              {adjustments.length > 0 && (
                <Text size="xs" c="dimmed">({adjustments.length} รายการ)</Text>
              )}
            </Group>
            <Collapse in={showAdjustments}>
              <Stack gap="xs" style={{
                background: 'var(--app-surface-light)', borderRadius: 8, padding: 14,
                border: '1.5px solid #333',
                marginTop: 6,
              }}>
                <Text size="xs" c="dimmed">
                  เพิ่มรายการบัญชีเสริม เช่น ค่าธรรมเนียมธนาคาร, ส่วนลดรับ, ผลต่างอัตราแลกเปลี่ยน
                </Text>
                {/* Preset quick-add buttons */}
                <Group gap="xs">
                  {[
                    { label: '🏦 ค่าธรรมเนียมธนาคาร', desc: 'ค่าธรรมเนียมธนาคาร' },
                    { label: '💸 ส่วนลดรับ', desc: 'ส่วนลดรับ' },
                    { label: '🔄 ปัดเศษ', desc: 'ปัดเศษ' },
                  ].map(preset => (
                    <Button key={preset.label} variant="outline" size="xs" radius="xl" color="gray"
                      onClick={() => setAdjustments(prev => [...prev, {
                        accountId: '', description: preset.desc, amount: 0
                      }])}>
                      {preset.label}
                    </Button>
                  ))}
                  <Button variant="light" size="xs" radius="xl" color="indigo"
                    leftSection={<IconPlus size={12} />}
                    onClick={() => setAdjustments(prev => [...prev, {
                      accountId: '', description: '', amount: 0
                    }])}>
                    เพิ่มรายการ
                  </Button>
                </Group>
                {/* Adjustment line items */}
                {adjustments.map((adj, idx) => (
                  <Group key={idx} gap="xs" align="flex-end" style={{ background: 'white', borderRadius: 6, padding: '8px 10px', border: '1px solid var(--app-border-light)' }}>
                    <Select size="xs" placeholder="เลือกบัญชี" searchable style={{ flex: 2 }}
                      label={idx === 0 ? 'บัญชี' : undefined}
                      data={allAccounts.map((a: any) => ({ value: String(a.id), label: `${a.account_code} - ${a.name}` }))}
                      value={adj.accountId}
                      onChange={(v) => {
                        const updated = [...adjustments]
                        updated[idx] = { ...updated[idx], accountId: v || '' }
                        setAdjustments(updated)
                      }} />
                    <TextInput size="xs" placeholder="รายละเอียด" style={{ flex: 2 }}
                      label={idx === 0 ? 'รายละเอียด' : undefined}
                      value={adj.description}
                      onChange={(e) => {
                        const updated = [...adjustments]
                        updated[idx] = { ...updated[idx], description: e.target.value }
                        setAdjustments(updated)
                      }} />
                    <NumberInput size="xs" min={0} decimalScale={2} thousandSeparator="," placeholder="0.00" style={{ width: 140 }}
                      label={idx === 0 ? 'จำนวนเงิน (เครดิต)' : undefined}
                      value={adj.amount || ''}
                      onChange={(v) => {
                        const updated = [...adjustments]
                        updated[idx] = { ...updated[idx], amount: Number(v) || 0 }
                        setAdjustments(updated)
                      }}
                      styles={{ input: { textAlign: 'right' } }} />
                    <ActionIcon variant="subtle" color="red" size="sm"
                      onClick={() => setAdjustments(prev => prev.filter((_, i) => i !== idx))}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            </Collapse>
          </div>
        </Collapse>
        <TextInput label="หมายเหตุ" placeholder="หมายเหตุภายใน (ไม่แสดงบนเอกสาร)" mt="md"
          value={header.note} onChange={(e) => setHeader({ ...header, note: e.target.value })} />
      </div>

      {/* Bottom Action Buttons (sticky feel) */}
      <div className="stat-card" style={{ position: 'sticky', bottom: 0, zIndex: 10, borderColor: 'var(--app-primary)', borderWidth: 2 }}>
        <Group justify="space-between">
          <Button variant="subtle" color="gray" onClick={() => navigate('/expenses')}
            leftSection={<IconArrowLeft size={16} />}>
            กลับ
          </Button>
          <Group>
            <Button variant="outline" color="gray" size="md" radius="md"
              loading={createMutation.isPending}
              onClick={() => handleSubmit('draft')}>
              📄 บันทึกร่าง
            </Button>
            <Button variant="gradient" gradient={{ from: 'indigo', to: 'violet' }} size="md" radius="md"
              loading={createMutation.isPending}
              onClick={() => handleSubmit('approved')}>
              <IconReceipt size={18} style={{ marginRight: 8 }} /> อนุมัติและบันทึก
            </Button>
          </Group>
        </Group>
      </div>
    </Stack>
  )
}
