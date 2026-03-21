import { useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Select, NumberInput, Textarea,
  Card, SimpleGrid, Table, ActionIcon, Divider, Badge, ThemeIcon,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconTrash, IconArrowLeft, IconDeviceFloppy, IconCheck,
  IconFileInvoice, IconFileText, IconReceipt, IconUser, IconCalendar,
  IconPackage, IconCurrencyBaht, IconNote, IconTruck,
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt } from '../utils/formatters'

const DOC_CONFIG: Record<string, { label: string; color: string; icon: any; gradient: string }> = {
  quotation: { label: 'ใบเสนอราคา', color: 'blue', icon: IconFileText, gradient: 'linear-gradient(135deg, #1e40af, #3b82f6)' },
  invoice:   { label: 'ใบแจ้งหนี้ / บิลขาย', color: 'indigo', icon: IconFileInvoice, gradient: 'linear-gradient(135deg, #3730a3, #6366f1)' },
  delivery:  { label: 'ใบส่งของ', color: 'cyan', icon: IconTruck, gradient: 'linear-gradient(135deg, #155e75, #06b6d4)' },
  receipt:   { label: 'ใบเสร็จรับเงิน', color: 'green', icon: IconReceipt, gradient: 'linear-gradient(135deg, #166534, #22c55e)' },
}

export default function SalesDocCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const docType = searchParams.get('type') || 'invoice'
  const config = DOC_CONFIG[docType] || DOC_CONFIG.invoice
  const DocIcon = config.icon

  // Queries
  const { data: company } = useQuery({ queryKey: ['company-current'], queryFn: () => api.get('/companies/current').then(r => r.data) })
  const { data: products = [] } = useQuery({ queryKey: ['products-for-doc'], queryFn: () => api.get('/products').then(r => r.data) })

  const [customerSearch, setCustomerSearch] = useState('')
  const { data: customers = [] } = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => api.get('/sales/customers/search', { params: { q: customerSearch || '' } }).then(r => r.data),
  })

  const settings = company?.settings || {}
  const vatEnabled = settings.vat_enabled !== false
  const vatRate = vatEnabled ? (settings.vat_rate || 7) : 0

  // Form state
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerTaxId, setCustomerTaxId] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [docDate, setDocDate] = useState<Date | null>(new Date())
  const [dueDate, setDueDate] = useState<Date | null>(null)
  const [reference, setReference] = useState('')
  const [priceType, setPriceType] = useState('include_vat')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [note, setNote] = useState('')
  const [items, setItems] = useState([
    { productId: '', description: '', quantity: 1, unit: 'ชิ้น', unitPrice: 0, discountPerUnit: 0, discountType: 'baht' as const, vatType: (vatEnabled ? 'vat7' : 'no_vat') as 'vat7' | 'vat0' | 'no_vat' },
  ])

  const handleCustomerSelect = (id: string | null) => {
    setCustomerId(id)
    if (id) {
      const c = customers.find((c: any) => String(c.id) === id)
      if (c) { setCustomerName(c.name || ''); setCustomerAddress(c.address || ''); setCustomerTaxId(c.tax_id || ''); setCustomerPhone(c.phone || '') }
    } else { setCustomerName(''); setCustomerAddress(''); setCustomerTaxId(''); setCustomerPhone('') }
  }

  const handleProductSelect = (idx: number, productId: string) => {
    const p = products.find((p: any) => String(p.id) === productId)
    const u = [...items]; u[idx].productId = productId
    if (p) { u[idx].description = p.name; u[idx].unitPrice = parseFloat(p.selling_price) || 0; u[idx].unit = p.unit || 'ชิ้น' }
    setItems(u)
  }

  const addItem = () => setItems([...items, { productId: '', description: '', quantity: 1, unit: 'ชิ้น', unitPrice: 0, discountPerUnit: 0, discountType: 'baht', vatType: 'vat7' }])
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx: number, key: string, val: any) => { const u = [...items]; (u[idx] as any)[key] = val; setItems(u) }

  // Calculations
  const calc = useMemo(() => {
    let subtotal = 0, totalVat = 0
    const rows = items.map(item => {
      const qty = item.quantity || 0, price = item.unitPrice || 0
      const disc = item.discountType === 'percent' ? (price * (item.discountPerUnit || 0) / 100) : (item.discountPerUnit || 0)
      const lineTotal = qty * (price - disc)
      let lineVat = 0
      if (item.vatType === 'vat7' && vatRate > 0) {
        lineVat = priceType === 'exclude_vat' ? lineTotal * vatRate / 100 : priceType === 'include_vat' ? lineTotal - lineTotal / (1 + vatRate / 100) : 0
      }
      subtotal += lineTotal; totalVat += lineVat
      return { lineTotal, lineVat }
    })
    const disc = discountAmount || 0
    const amtBeforeVat = priceType === 'include_vat' ? subtotal - totalVat - disc : subtotal - disc
    const fVat = priceType === 'no_vat' ? 0 : totalVat
    return { rows, subtotal, totalVat: fVat, amtBeforeVat, discount: disc, total: amtBeforeVat + fVat }
  }, [items, discountAmount, priceType, vatRate])

  // Submit
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/sales-doc', data),
    onSuccess: (res) => { notifications.show({ title: 'สำเร็จ', message: `สร้าง ${config.label} ${res.data.docNumber}`, color: 'green' }); navigate('/sales-doc') },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' }),
  })

  const handleSubmit = (status: 'draft' | 'approved') => {
    if (items.filter(i => i.productId || i.description).length === 0) {
      notifications.show({ title: 'ผิดพลาด', message: 'กรุณาเพิ่มรายการอย่างน้อย 1 รายการ', color: 'red' }); return
    }
    createMutation.mutate({
      docType, reference, customerId: customerId && !customerId.startsWith('ct_') ? parseInt(customerId) : null,
      customerName, customerAddress, customerTaxId, customerPhone,
      docDate: docDate?.toISOString().split('T')[0], dueDate: dueDate?.toISOString().split('T')[0] || null,
      priceType, discountAmount, note, status,
      items: items.filter(i => i.productId || i.description).map(i => ({
        productId: i.productId && !i.productId.startsWith('ct_') ? parseInt(i.productId) : null,
        description: i.description, quantity: i.quantity, unit: i.unit,
        unitPrice: i.unitPrice, discountPerUnit: i.discountPerUnit, discountType: i.discountType, vatType: i.vatType,
      })),
    })
  }

  const productOptions = products.map((p: any) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))
  const customerOptions = customers.map((c: any) => ({ value: String(c.id), label: `${c.name}${c.phone ? ` (${c.phone})` : ''}` }))
  const itemCount = items.filter(i => i.productId || i.description).length

  return (
    <Stack gap="lg">
      {/* ═══ Header ═══ */}
      <Card shadow="sm" padding="lg" radius="md" style={{ background: config.gradient, border: 'none' }}>
        <Group justify="space-between">
          <Group gap="md">
            <ActionIcon variant="white" size="lg" radius="xl" color="dark" onClick={() => navigate('/sales-doc')}>
              <IconArrowLeft size={20} />
            </ActionIcon>
            <div>
              <Group gap={8}>
                <DocIcon size={22} color="rgba(255,255,255,0.8)" />
                <Text size="xl" fw={800} c="white">สร้าง{config.label}</Text>
              </Group>
              <Text size="xs" c="rgba(255,255,255,0.6)" mt={2}>กรอกข้อมูลแล้วกดบันทึกหรืออนุมัติ</Text>
            </div>
          </Group>
          <Group gap="sm">
            <Button variant="white" color="dark" leftSection={<IconDeviceFloppy size={16} />}
              loading={createMutation.isPending} onClick={() => handleSubmit('draft')}>
              บันทึกร่าง
            </Button>
            <Button color="white" variant="filled" leftSection={<IconCheck size={16} />}
              loading={createMutation.isPending} onClick={() => handleSubmit('approved')}
              style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)' }}>
              อนุมัติ
            </Button>
          </Group>
        </Group>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* ═══ Left: ข้อมูลเอกสาร ═══ */}
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color={config.color} radius="xl"><IconCalendar size={14} /></ThemeIcon>
            <Text fw={700} size="sm">ข้อมูลเอกสาร</Text>
          </Group>
          <Stack gap="sm">
            <SimpleGrid cols={2}>
              <DatePickerInput label="วันที่ออก" required size="sm" value={docDate} onChange={setDocDate}
                locale="th" valueFormat="DD MMMM YYYY" />
              <DatePickerInput label={docType === 'quotation' ? 'ใช้ได้ถึง' : 'ครบกำหนด'} size="sm"
                value={dueDate} onChange={setDueDate} clearable locale="th" valueFormat="DD MMMM YYYY" />
            </SimpleGrid>
            <SimpleGrid cols={2}>
              <Select label="ประเภทราคา" size="sm" value={priceType} onChange={v => setPriceType(v || 'include_vat')}
                data={[
                  { value: 'include_vat', label: 'ราคารวม VAT' },
                  { value: 'exclude_vat', label: 'ราคาแยก VAT' },
                  { value: 'no_vat', label: 'ไม่มี VAT' },
                ]} />
              <TextInput label="อ้างอิง" size="sm" placeholder="PO ลูกค้า, เลขที่เดิม ฯลฯ"
                value={reference} onChange={e => setReference(e.target.value)} />
            </SimpleGrid>
          </Stack>
        </Card>

        {/* ═══ Right: ข้อมูลลูกค้า ═══ */}
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color="orange" radius="xl"><IconUser size={14} /></ThemeIcon>
            <Text fw={700} size="sm">ข้อมูลลูกค้า</Text>
          </Group>
          <Stack gap="sm">
            <Select label="เลือกลูกค้า" size="sm" searchable clearable
              data={customerOptions} value={customerId} onChange={handleCustomerSelect}
              onSearchChange={setCustomerSearch} searchValue={customerSearch}
              filter={({ options }) => options}
              placeholder="พิมพ์ชื่อ, เบอร์โทร, เลขภาษี..."
              nothingFoundMessage={customerSearch ? 'ไม่พบลูกค้า' : 'พิมพ์เพื่อค้นหา'}
              description={!customerSearch ? 'แสดง 5 รายการล่าสุด' : undefined} />
            <TextInput label="ชื่อลูกค้า" size="sm" placeholder="ชื่อบริษัท/บุคคล"
              value={customerName} onChange={e => setCustomerName(e.target.value)} />
            <SimpleGrid cols={2}>
              <TextInput label="เบอร์โทร" size="sm" placeholder="08x-xxx-xxxx"
                value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              <TextInput label="เลขผู้เสียภาษี" size="sm" placeholder="13 หลัก"
                value={customerTaxId} onChange={e => setCustomerTaxId(e.target.value)} />
            </SimpleGrid>
            <TextInput label="ที่อยู่" size="sm" placeholder="ที่อยู่สำหรับออกเอกสาร"
              value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} />
          </Stack>
        </Card>
      </SimpleGrid>

      {/* ═══ Items Table ═══ */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group justify="space-between" mb="md">
          <Group gap={8}>
            <ThemeIcon size="sm" variant="light" color="violet" radius="xl"><IconPackage size={14} /></ThemeIcon>
            <Text fw={700} size="sm">รายการสินค้า / บริการ</Text>
            {itemCount > 0 && <Badge variant="light" color="violet" size="sm">{itemCount} รายการ</Badge>}
          </Group>
          <Button variant="light" size="xs" color="violet" leftSection={<IconPlus size={14} />} onClick={addItem}>
            เพิ่มรายการ
          </Button>
        </Group>

        {/* Column headers */}
        <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '2px solid var(--app-border)' }}>
          <Text size="xs" c="dimmed" fw={700} style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>#</Text>
          <Text size="xs" c="dimmed" fw={700} style={{ flex: 2, minWidth: 180 }}>สินค้า/บริการ</Text>
          <Text size="xs" c="dimmed" fw={700} style={{ width: 85, textAlign: 'center' }}>จำนวน</Text>
          <Text size="xs" c="dimmed" fw={700} style={{ width: 120, textAlign: 'center' }}>ราคา/หน่วย</Text>
          <Text size="xs" c="dimmed" fw={700} style={{ width: 110, textAlign: 'center' }}>ส่วนลด/หน่วย</Text>
          <Text size="xs" c="dimmed" fw={700} style={{ width: 90, textAlign: 'center' }}>ภาษี</Text>
          <Text size="xs" c="dimmed" fw={700} style={{ width: 100, textAlign: 'right', flexShrink: 0 }}>มูลค่า</Text>
          <div style={{ width: 30, flexShrink: 0 }}></div>
        </div>

        {/* Item rows */}
        <Stack gap={0}>
          {items.map((item, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--app-border)' }}>
              {/* Row 1: product select + numbers */}
              <div style={{ display: 'flex', gap: 10, padding: '12px 0 6px', alignItems: 'flex-start' }}>
                <Text size="sm" c="dimmed" fw={600} style={{ width: 28, paddingTop: 8, textAlign: 'center', flexShrink: 0 }}>{i + 1}</Text>
                <div style={{ flex: 2, minWidth: 180 }}>
                  <Select size="sm" searchable clearable placeholder="เลือกสินค้า/บริการ"
                    data={productOptions} value={item.productId}
                    onChange={v => handleProductSelect(i, v || '')} />
                </div>
                <NumberInput size="sm" min={1} value={item.quantity} style={{ width: 85 }}
                  styles={{ input: { textAlign: 'center' } }}
                  onChange={v => updateItem(i, 'quantity', Number(v) || 1)} />
                <NumberInput size="sm" min={0} value={item.unitPrice} decimalScale={2} fixedDecimalScale
                  thousandSeparator="," style={{ width: 120 }}
                  styles={{ input: { textAlign: 'right' } }}
                  onChange={v => updateItem(i, 'unitPrice', Number(v) || 0)} />
                <NumberInput size="sm" min={0} value={item.discountPerUnit} decimalScale={2} fixedDecimalScale
                  thousandSeparator="," style={{ width: 110 }}
                  styles={{ input: { textAlign: 'right' } }}
                  onChange={v => updateItem(i, 'discountPerUnit', Number(v) || 0)} />
                <Select size="sm" value={vatEnabled ? item.vatType : 'no_vat'} style={{ width: 90 }}
                  disabled={!vatEnabled}
                  data={[
                    { value: 'no_vat', label: 'ไม่มี' },
                    { value: 'vat0', label: '0%' },
                    { value: 'vat7', label: `${vatRate}%` },
                  ]}
                  onChange={v => updateItem(i, 'vatType', v || 'no_vat')} />
                <Text size="sm" fw={700} c={config.color} style={{ width: 100, textAlign: 'right', paddingTop: 8, flexShrink: 0 }}>
                  {fmt(calc.rows[i]?.lineTotal || 0)}
                </Text>
                <ActionIcon size="sm" variant="subtle" color="red" style={{ flexShrink: 0, marginTop: 6 }}
                  disabled={items.length <= 1} onClick={() => removeItem(i)}>
                  <IconTrash size={15} />
                </ActionIcon>
              </div>
              {/* Row 2: description */}
              <div style={{ paddingLeft: 38, paddingBottom: 12 }}>
                <TextInput size="sm" variant="unstyled" placeholder="พิมพ์คำอธิบายรายการ ไม่เกิน 1,000 ตัวอักษร"
                  value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                  style={{ background: 'rgba(99,102,241,0.04)', borderRadius: 6, padding: '6px 12px' }} />
              </div>
            </div>
          ))}
        </Stack>

        {/* Add buttons */}
        <Group gap="sm" mt="md">
          <Button variant="light" size="xs" color="violet" leftSection={<IconPlus size={14} />} onClick={addItem}>
            เพิ่มรายการใหม่
          </Button>
        </Group>
      </Card>

      {/* ═══ Note + Summary ═══ */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color="gray" radius="xl"><IconNote size={14} /></ThemeIcon>
            <Text fw={700} size="sm">หมายเหตุ</Text>
          </Group>
          <Textarea placeholder="หมายเหตุสำหรับลูกค้า เช่น เงื่อนไขการชำระ, ระยะเวลาจัดส่ง" autosize minRows={3}
            value={note} onChange={e => setNote(e.target.value)} />
        </Card>

        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color="green" radius="xl"><IconCurrencyBaht size={14} /></ThemeIcon>
            <Text fw={700} size="sm">สรุปยอด</Text>
          </Group>
          <Stack gap={6}>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">รวมสินค้า ({itemCount} รายการ)</Text>
              <Text size="sm" fw={600}>฿{fmt(calc.subtotal)}</Text>
            </Group>
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">ส่วนลดรวม</Text>
              <NumberInput size="xs" min={0} value={discountAmount} style={{ width: 110 }}
                onChange={v => setDiscountAmount(Number(v) || 0)} hideControls decimalScale={2}
                leftSection={<Text size="xs" c="dimmed">฿</Text>} />
            </Group>
            {priceType !== 'no_vat' && (
              <>
                <Divider variant="dashed" my={4} />
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">มูลค่าก่อน VAT</Text>
                  <Text size="sm">฿{fmt(calc.amtBeforeVat)}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">VAT {vatRate}%</Text>
                  <Text size="sm">฿{fmt(calc.totalVat)}</Text>
                </Group>
              </>
            )}
            <Divider my={4} />
            <Group justify="space-between">
              <Text size="lg" fw={800}>ยอดรวมทั้งสิ้น</Text>
              <Text size="xl" fw={800} c="green">฿{fmt(calc.total)}</Text>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* ═══ Bottom Actions (mobile) ═══ */}
      <Group justify="flex-end" pb="xl">
        <Button variant="light" color="gray" onClick={() => navigate('/sales-doc')}>ยกเลิก</Button>
        <Button variant="light" leftSection={<IconDeviceFloppy size={16} />}
          loading={createMutation.isPending} onClick={() => handleSubmit('draft')}>
          บันทึกร่าง
        </Button>
        <Button leftSection={<IconCheck size={16} />}
          loading={createMutation.isPending} onClick={() => handleSubmit('approved')}
          style={{ background: config.gradient }}>
          อนุมัติ{config.label}
        </Button>
      </Group>
    </Stack>
  )
}
