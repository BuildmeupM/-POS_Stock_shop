import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Group, Stack, NumberInput, TextInput, Select,
  Text, ActionIcon, Divider, Collapse
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconReceipt, IconTrash, IconArrowLeft,
  IconFileInvoice, IconChevronDown, IconChevronUp
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt } from '../utils/formatters'

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

export default function ExpenseCreatePage() {
  const navigate = useNavigate()

  const [items, setItems] = useState<ExpenseItem[]>([emptyItem()])
  const [header, setHeader] = useState({
    vendorName: '', taxId: '', contactId: '', expenseDate: new Date().toISOString().split('T')[0],
    dueDate: '', paymentMethod: 'cash', paymentChannelId: null as number | null, paymentStatus: 'paid',
    referenceNumber: '', note: '',
  })
  const [taxInvoice, setTaxInvoice] = useState({ number: '', date: '', period: '' })
  const [showTaxInvoice, setShowTaxInvoice] = useState(false)

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
    createMutation.mutate({
      ...header,
      paymentChannelId: header.paymentChannelId || undefined,
      taxInvoiceNumber: taxInvoice.number || null,
      taxInvoiceDate: taxInvoice.date || null,
      taxPeriod: taxInvoice.period || null,
      status,
      items,
    })
  }, [header, items, taxInvoice, createMutation])

  const totals = useMemo(() => calcTotals(items), [items])

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

      {/* SECTION 1: Document Header */}
      <div className="stat-card">
        <Text fw={700} mb="md" size="sm" c="dimmed">ข้อมูลเอกสาร</Text>
        <Group grow>
          <Select label="ผู้ขาย/ผู้ให้บริการ" placeholder="เลือกหรือพิมพ์ชื่อผู้ขาย" searchable clearable
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
          <TextInput label="เลข Tax ID" placeholder="เลขประจำตัวผู้เสียภาษี"
            value={header.taxId} onChange={(e) => setHeader({ ...header, taxId: e.target.value })} />
        </Group>
        <Group grow mt="md">
          <TextInput type="date" label="วันที่เอกสาร" required
            value={header.expenseDate} onChange={(e) => setHeader({ ...header, expenseDate: e.target.value })} />
          <TextInput type="date" label="วันครบกำหนดชำระ"
            value={header.dueDate} onChange={(e) => setHeader({ ...header, dueDate: e.target.value })} />
          <TextInput label="เลขที่อ้างอิง" placeholder="เลขที่บิลผู้ขาย"
            value={header.referenceNumber} onChange={(e) => setHeader({ ...header, referenceNumber: e.target.value })} />
        </Group>
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
              <Group justify="space-between">
                <Text fw={700} size="md">ยอดชำระสุทธิ</Text>
                <Text size="xl" fw={800} c="var(--app-primary)">฿{fmt(totals.netPayment)}</Text>
              </Group>
            </Stack>
          </Group>
        </div>
      </div>

      {/* SECTION 3: Tax Invoice (collapsible) */}
      <div className="stat-card">
        <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => setShowTaxInvoice(!showTaxInvoice)}>
          <IconFileInvoice size={16} color="var(--app-text-dim)" />
          <Text size="sm" fw={700} c="dimmed">ข้อมูลใบกำกับภาษี</Text>
          {showTaxInvoice ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </Group>
        <Collapse in={showTaxInvoice}>
          <Group grow mt="md">
            <TextInput label="เลขที่ใบกำกับภาษี" placeholder="TI-XXXX"
              value={taxInvoice.number} onChange={(e) => setTaxInvoice({ ...taxInvoice, number: e.target.value })} />
            <TextInput type="date" label="วันที่ใบกำกับภาษี"
              value={taxInvoice.date} onChange={(e) => setTaxInvoice({ ...taxInvoice, date: e.target.value })} />
            <TextInput label="งวดภาษี" placeholder="03/2026"
              value={taxInvoice.period} onChange={(e) => setTaxInvoice({ ...taxInvoice, period: e.target.value })} />
          </Group>
        </Collapse>
      </div>

      {/* SECTION 4: Payment & Notes */}
      <div className="stat-card">
        <Text fw={700} mb="md" size="sm" c="dimmed">การชำระเงิน</Text>
        <Group grow>
          <Select label="ช่องทางชำระ" data={payChannelOptions}
            value={header.paymentChannelId ? String(header.paymentChannelId) : (walletChannels.length > 0 ? null : '_cash')}
            onChange={(v) => {
              if (v && !v.startsWith('_')) {
                const ch = walletChannels.find((c: any) => String(c.id) === v)
                setHeader({ ...header, paymentChannelId: Number(v), paymentMethod: ch?.type === 'bank_account' ? 'transfer' : ch?.type || 'cash' })
              } else {
                const method = v ? v.replace('_', '') : 'cash'
                setHeader({ ...header, paymentChannelId: null, paymentMethod: method })
              }
            }} />
          <Select label="สถานะการชำระ" data={[
            { value: 'paid', label: '✅ จ่ายแล้ว' },
            { value: 'unpaid', label: '⏳ ยังไม่จ่าย (เชื่อ)' },
          ]} value={header.paymentStatus} onChange={(v) => setHeader({ ...header, paymentStatus: v || 'paid' })} />
        </Group>
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
