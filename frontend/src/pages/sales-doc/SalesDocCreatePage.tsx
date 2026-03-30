import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Select, NumberInput, Textarea,
  Card, SimpleGrid, Table, ActionIcon, Divider, Badge, ThemeIcon, Modal, SegmentedControl,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconTrash, IconArrowLeft, IconDeviceFloppy, IconCheck,
  IconFileInvoice, IconFileText, IconReceipt, IconUser, IconCalendar,
  IconPackage, IconCurrencyBaht, IconNote, IconTruck, IconAlertTriangle,
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt } from '../../utils/formatters'

const TYPE_COLORS: Record<string, string> = {
  cash: '#059669', transfer: '#3b82f6', credit_card: '#8b5cf6', qr_code: '#06b6d4',
}
const TYPE_LABELS: Record<string, string> = {
  cash: 'เงินสด', transfer: 'โอนเงิน', credit_card: 'บัตรเครดิต', qr_code: 'QR Code',
}
const TYPE_ICONS: Record<string, string> = {
  cash: '฿', transfer: '🏦', credit_card: '💳', qr_code: '📱',
}

const DOC_CONFIG: Record<string, { label: string; color: string; icon: any; gradient: string }> = {
  quotation: { label: 'ใบเสนอราคา', color: 'blue', icon: IconFileText, gradient: 'linear-gradient(135deg, #1e40af, #3b82f6)' },
  invoice:   { label: 'ใบแจ้งหนี้ / บิลขาย', color: 'indigo', icon: IconFileInvoice, gradient: 'linear-gradient(135deg, #3730a3, #6366f1)' },
  delivery:  { label: 'ใบส่งของ', color: 'cyan', icon: IconTruck, gradient: 'linear-gradient(135deg, #155e75, #06b6d4)' },
  receipt:   { label: 'ใบเสร็จรับเงิน', color: 'green', icon: IconReceipt, gradient: 'linear-gradient(135deg, #166534, #22c55e)' },
  receipt_tax: { label: 'ใบเสร็จรับเงิน/ใบกำกับภาษี', color: 'violet', icon: IconReceipt, gradient: 'linear-gradient(135deg, #5b21b6, #8b5cf6)' },
  receipt_abb: { label: 'ใบกำกับภาษีอย่างย่อ', color: 'cyan', icon: IconReceipt, gradient: 'linear-gradient(135deg, #0e7490, #06b6d4)' },
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
  const { data: paymentChannels = [] } = useQuery({
    queryKey: ['payment-channels'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
  })

  // Determine which source doc type this doc can reference
  const REF_DOC_MAP: Record<string, { sourceType: string; sourceLabel: string; sourceStatuses: string[] }> = {
    invoice:  { sourceType: 'quotation', sourceLabel: 'ใบเสนอราคา', sourceStatuses: ['approved'] },
    delivery: { sourceType: 'invoice',   sourceLabel: 'ใบแจ้งหนี้ / บิลขาย', sourceStatuses: ['approved'] },
    receipt:  { sourceType: 'invoice',   sourceLabel: 'ใบแจ้งหนี้ / บิลขาย', sourceStatuses: ['approved'] },
  }
  const refDocConfig = REF_DOC_MAP[docType] || null
  const canLinkDoc = !!refDocConfig

  const { data: refDocOptions = [] } = useQuery({
    queryKey: ['ref-doc-options', refDocConfig?.sourceType],
    queryFn: () => api.get('/sales-doc', { params: { docType: refDocConfig!.sourceType, status: refDocConfig!.sourceStatuses[0] } }).then(r => r.data),
    enabled: canLinkDoc,
  })

  const settings = company?.settings || {}
  const vatEnabled = settings.vat_enabled !== false
  const vatRate = vatEnabled ? (settings.vat_rate || 7) : 0

  // Form state
  const [refDocId, setRefDocId] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerTaxId, setCustomerTaxId] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const getDefaultDueDate = (base: Date | null) => {
    if (!base) return null
    const d = new Date(base)
    d.setDate(d.getDate() + 7)
    return d
  }
  const [docDate, setDocDate] = useState<Date | null>(new Date())
  const [dueDate, setDueDate] = useState<Date | null>(docType === 'quotation' ? getDefaultDueDate(new Date()) : null)

  const handleDocDateChange = (date: Date | null) => {
    setDocDate(date)
    if (docType === 'quotation') setDueDate(getDefaultDueDate(date))
  }
  const [reference, setReference] = useState('')
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [payChannelId, setPayChannelId] = useState<string | null>(null)
  const [priceType, setPriceType] = useState(vatEnabled ? 'include_vat' : 'no_vat')
  const [discountAmount, setDiscountAmount] = useState(0)
  const [discountType, setDiscountType] = useState<'baht' | 'percent'>('baht')
  const [note, setNote] = useState('')
  const [items, setItems] = useState([
    { productId: '', description: '', quantity: 1, unit: 'ชิ้น', unitPrice: 0, discountPerUnit: 0, discountType: 'baht' as const, vatType: (vatEnabled ? 'vat7' : 'no_vat') as 'vat7' | 'vat0' | 'no_vat' },
  ])

  // === Prefill from refDocId query param (from detail page "สร้างเอกสารต่อ" button) ===
  const refDocIdParam = searchParams.get('refDocId')
  const [refDocPrefilled, setRefDocPrefilled] = useState(false)
  useEffect(() => {
    if (refDocIdParam && !refDocPrefilled && canLinkDoc) {
      setRefDocPrefilled(true)
      handleRefDocSelect(refDocIdParam)
    }
  }, [refDocIdParam, refDocPrefilled, canLinkDoc])

  // === Prefill from saleId ===
  const saleId = searchParams.get('saleId')
  const { data: saleData } = useQuery({
    queryKey: ['sale-detail', saleId],
    queryFn: () => api.get(`/sales/${saleId}`).then(r => r.data),
    enabled: !!saleId,
  })

  // Prefill when saleData loads
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (saleData && !prefilled) {
      setPrefilled(true)
      if (saleData.customer_name) setCustomerName(saleData.customer_name)
      if (saleData.customer_id) setCustomerId(String(saleData.customer_id))
      if (saleData.invoice_number) setReference(`POS: ${saleData.invoice_number}`)
      if (saleData.items?.length > 0) {
        setItems(saleData.items.map((item: any) => {
          const qty = parseInt(item.quantity) || 1
          const totalDiscount = parseFloat(item.discount) || 0
          // POS discount is total per line — convert to per-unit for sales doc
          const discPerUnit = qty > 0 ? totalDiscount / qty : 0
          return {
            productId: item.product_id ? String(item.product_id) : '',
            description: item.product_name || item.service_name || '',
            quantity: qty,
            unit: 'ชิ้น',
            unitPrice: parseFloat(item.unit_price) || 0,
            discountPerUnit: Math.round(discPerUnit * 100) / 100,
            discountType: 'baht' as const,
            vatType: (vatEnabled ? 'vat7' : 'no_vat') as 'vat7' | 'vat0' | 'no_vat',
          }
        }))
      }
    }
  }, [saleData, prefilled])

  // === Select source document to link ===
  const handleRefDocSelect = async (refId: string | null) => {
    setRefDocId(refId)
    if (!refId) return
    try {
      const res = await api.get(`/sales-doc/${refId}`)
      const doc = res.data
      if (doc.customer_id) setCustomerId(String(doc.customer_id))
      if (doc.customer_name) setCustomerName(doc.customer_name)
      if (doc.customer_address) setCustomerAddress(doc.customer_address || '')
      if (doc.customer_tax_id) setCustomerTaxId(doc.customer_tax_id || '')
      if (doc.customer_phone) setCustomerPhone(doc.customer_phone || '')
      if (doc.price_type) setPriceType(doc.price_type)
      if (doc.discount_amount) setDiscountAmount(parseFloat(doc.discount_amount) || 0)
      if (doc.note) setNote(doc.note)
      setReference(`อ้างอิง ${doc.doc_number}`)
      if (doc.items?.length > 0) {
        setItems(doc.items.map((item: any) => ({
          productId: item.product_id ? String(item.product_id) : '',
          description: item.description || '',
          quantity: parseInt(item.quantity) || 1,
          unit: item.unit || 'ชิ้น',
          unitPrice: parseFloat(item.unit_price) || 0,
          discountPerUnit: parseFloat(item.discount_per_unit) || 0,
          discountType: (item.discount_type || 'baht') as 'baht' | 'percent',
          vatType: (item.vat_type || 'vat7') as 'vat7' | 'vat0' | 'no_vat',
        })))
      }
      notifications.show({ title: 'โหลดข้อมูล', message: `ดึงข้อมูลจาก ${doc.doc_number} สำเร็จ`, color: 'blue' })
    } catch {
      notifications.show({ title: 'ผิดพลาด', message: `ไม่สามารถดึงข้อมูล${refDocConfig?.sourceLabel || 'เอกสาร'}ได้`, color: 'red' })
    }
  }

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
  const updateItem = (idx: number, key: string, val: any) => {
    const u = [...items]
    ;(u[idx] as any)[key] = val

    // Auto-snap to min_selling_price
    const prod = products.find((p: any) => String(p.id) === u[idx].productId)
    const minPrice = prod ? (parseFloat(prod.min_selling_price) || 0) : 0
    if (minPrice > 0) {
      const currentDisc = (u[idx].discountType as string) === 'percent'
        ? u[idx].unitPrice * (u[idx].discountPerUnit || 0) / 100
        : (u[idx].discountPerUnit || 0)

      if (key === 'unitPrice') {
        // ราคาต่อหน่วยต้องไม่ต่ำกว่าขั้นต่ำ (+ discount ที่มีอยู่)
        const minWithDisc = minPrice + currentDisc
        if (val < minWithDisc) {
          u[idx].unitPrice = parseFloat(minWithDisc.toFixed(2))
          notifications.show({
            title: '🔒 ปรับราคาเป็นขั้นต่ำ',
            message: `ราคาถูกปรับจาก ฿${Number(val).toFixed(2)} → ฿${minWithDisc.toFixed(2)} (ราคาขั้นต่ำ)`,
            color: 'orange', autoClose: 3000,
          })
        }
      } else if (key === 'discountPerUnit') {
        // ลดส่วนลดไม่ให้ effective price ต่ำกว่าขั้นต่ำ
        const discVal = (u[idx].discountType as string) === 'percent'
          ? u[idx].unitPrice * (val || 0) / 100
          : (val || 0)
        const maxDisc = u[idx].unitPrice - minPrice
        if (discVal > maxDisc) {
          // cap discount
          if ((u[idx].discountType as string) === 'percent') {
            u[idx].discountPerUnit = parseFloat((maxDisc / u[idx].unitPrice * 100).toFixed(4))
          } else {
            u[idx].discountPerUnit = parseFloat(maxDisc.toFixed(2))
          }
          notifications.show({
            title: '🔒 จำกัดส่วนลด',
            message: `ส่วนลดสูงสุด ฿${maxDisc.toFixed(2)} (ราคาขั้นต่ำ ฿${minPrice.toFixed(2)})`,
            color: 'orange', autoClose: 3000,
          })
        }
      }
    }

    setItems(u)
  }

  // Calculations
  const calc = useMemo(() => {
    let subtotal = 0, totalVat = 0
    const rows = items.map(item => {
      const qty = item.quantity || 0, price = item.unitPrice || 0
      const disc = (item.discountType as string) === 'percent' ? (price * (item.discountPerUnit || 0) / 100) : (item.discountPerUnit || 0)
      const lineTotal = qty * (price - disc)
      let lineVat = 0
      if (item.vatType === 'vat7' && vatRate > 0) {
        lineVat = priceType === 'exclude_vat' ? lineTotal * vatRate / 100 : priceType === 'include_vat' ? lineTotal - lineTotal / (1 + vatRate / 100) : 0
      }
      subtotal += lineTotal; totalVat += lineVat
      return { lineTotal, lineVat }
    })
    const disc = discountType === 'percent' ? subtotal * (discountAmount || 0) / 100 : (discountAmount || 0)
    const amtBeforeVat = priceType === 'include_vat' ? subtotal - totalVat - disc : subtotal - disc
    const fVat = priceType === 'no_vat' ? 0 : totalVat
    return { rows, subtotal, totalVat: fVat, amtBeforeVat, discount: disc, total: amtBeforeVat + fVat }
  }, [items, discountAmount, discountType, priceType, vatRate])

  // Submit
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/sales-doc', data),
    onSuccess: (res) => { notifications.show({ title: 'สำเร็จ', message: `สร้าง ${config.label} ${res.data.docNumber}`, color: 'green' }); navigate('/sales-doc') },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' }),
  })

  const handleSubmit = (status: 'draft' | 'approved') => {
    if (!docDate) {
      notifications.show({ title: 'ผิดพลาด', message: 'กรุณาระบุวันที่ออกเอกสาร', color: 'red' }); return
    }
    if (items.filter(i => i.productId || i.description).length === 0) {
      notifications.show({ title: 'ผิดพลาด', message: 'กรุณาเพิ่มรายการอย่างน้อย 1 รายการ', color: 'red' }); return
    }
    if (status === 'approved') {
      setApproveModalOpen(true)
      return
    }
    doCreate('draft', false)
  }

  const doCreate = (status: 'draft' | 'approved', payNow: boolean) => {
    const channel = paymentChannels.find((c: any) => String(c.id) === payChannelId)
    createMutation.mutate({
      docType, reference, refDocId: refDocId ? parseInt(refDocId) : null, saleId: saleId ? parseInt(saleId) : null,
      customerId: customerId && !customerId.startsWith('ct_') ? parseInt(customerId) : null,
      customerName, customerAddress, customerTaxId, customerPhone,
      docDate: docDate?.toISOString().split('T')[0], dueDate: dueDate?.toISOString().split('T')[0] || null,
      priceType, discountAmount: calc.discount, note, status,
      payNow, paymentMethod: channel?.type || 'cash', paymentChannelId: channel?.id || null,
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

  // === Min price per item ===
  const getMinPriceWarning = (item: typeof items[0]) => {
    if (!item.productId) return null
    const prod = products.find((p: any) => String(p.id) === item.productId)
    if (!prod) return null
    const minPrice = parseFloat(prod.min_selling_price) || 0
    if (minPrice <= 0) return null
    const disc = (item.discountType as string) === 'percent'
      ? item.unitPrice * (item.discountPerUnit || 0) / 100
      : (item.discountPerUnit || 0)
    const effectivePrice = item.unitPrice - disc
    if (effectivePrice < minPrice) {
      return { minPrice, effectivePrice, productName: prod.name }
    }
    return null
  }
  const minPriceWarnings = items.map(getMinPriceWarning)
  const warningCount = minPriceWarnings.filter(Boolean).length

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

      {/* ═══ อ้างอิงเอกสารต้นทาง ═══ */}
      {canLinkDoc && refDocConfig && (
        <Card shadow="xs" padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(99,102,241,0.04))',
            borderBottom: '1px solid var(--app-border)',
          }}>
            <Group gap={10}>
              <ThemeIcon size={28} variant="gradient" gradient={{ from: 'blue', to: 'indigo' }} radius="md">
                <IconFileText size={15} />
              </ThemeIcon>
              <div>
                <Text fw={700} size="sm">อ้างอิงจาก{refDocConfig.sourceLabel}</Text>
                <Text size="xs" c="dimmed">เลือก{refDocConfig.sourceLabel}เพื่อดึงข้อมูลลูกค้าและรายการสินค้ามาใช้</Text>
              </div>
            </Group>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <Select size="sm" searchable clearable placeholder={`เลือก${refDocConfig.sourceLabel}ที่อนุมัติแล้ว...`}
              value={refDocId} onChange={handleRefDocSelect}
              data={(Array.isArray(refDocOptions) ? refDocOptions : refDocOptions.data || []).map((q: any) => ({
                value: String(q.id),
                label: `${q.doc_number} — ${q.customer_name || 'ไม่ระบุลูกค้า'} (฿${fmt(parseFloat(q.total_amount) || 0)})`,
              }))}
              nothingFoundMessage={`ไม่มี${refDocConfig.sourceLabel}ที่อนุมัติแล้ว`} />
            {refDocId && (() => {
              const src = (Array.isArray(refDocOptions) ? refDocOptions : refDocOptions.data || []).find((q: any) => String(q.id) === refDocId)
              return src ? (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <Text size="sm" fw={600} c="blue">{src.doc_number}</Text>
                    <Text size="xs" c="dimmed">{src.customer_name} {src.doc_date ? `· ${new Date(src.doc_date).toLocaleDateString('th-TH')}` : ''}</Text>
                  </div>
                  <Badge size="lg" variant="light" color="blue">฿{fmt(parseFloat(src.total_amount) || 0)}</Badge>
                </div>
              ) : null
            })()}
          </div>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* ═══ Left: ข้อมูลเอกสาร ═══ */}
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Group gap={8} mb="md">
            <ThemeIcon size="sm" variant="light" color={config.color} radius="xl"><IconCalendar size={14} /></ThemeIcon>
            <Text fw={700} size="sm">ข้อมูลเอกสาร</Text>
          </Group>
          <Stack gap="sm">
            <SimpleGrid cols={2}>
              <DatePickerInput label="วันที่ออก" required size="sm" value={docDate} onChange={handleDocDateChange}
                locale="th" valueFormat="DD MMMM YYYY" />
              <DatePickerInput label={docType === 'quotation' ? 'ใช้ได้ถึง' : 'ครบกำหนด'} size="sm"
                value={dueDate} onChange={setDueDate} clearable locale="th" valueFormat="DD MMMM YYYY" />
            </SimpleGrid>
            <SimpleGrid cols={vatEnabled ? 2 : 1}>
              {vatEnabled && (
                <Select label="ประเภทราคา" size="sm" value={priceType} onChange={v => setPriceType(v || 'include_vat')}
                  data={[
                    { value: 'include_vat', label: 'ราคารวม VAT' },
                    { value: 'exclude_vat', label: 'ราคาแยก VAT' },
                    { value: 'no_vat', label: 'ไม่มี VAT' },
                  ]} />
              )}
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
            {!customerId && (
              <TextInput label="ชื่อลูกค้า" size="sm" placeholder="ชื่อบริษัท/บุคคล"
                value={customerName} onChange={e => setCustomerName(e.target.value)} />
            )}
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
      <Card shadow="xs" padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
        {/* Table Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.05))',
          padding: '14px 20px',
          borderBottom: '1px solid var(--app-border)',
        }}>
          <Group justify="space-between">
            <Group gap={10}>
              <ThemeIcon size={32} variant="gradient" gradient={{ from: 'violet', to: 'indigo' }} radius="md">
                <IconPackage size={17} />
              </ThemeIcon>
              <div>
                <Text fw={700} size="sm">รายการสินค้า / บริการ</Text>
                <Text size="xs" c="dimmed">{itemCount > 0 ? `${itemCount} รายการ` : 'ยังไม่มีรายการ'}</Text>
              </div>
              {warningCount > 0 && (
                <Badge variant="filled" color="orange" size="sm" leftSection={<IconAlertTriangle size={11} />}>
                  {warningCount} รายการต่ำกว่าขั้นต่ำ
                </Badge>
              )}
            </Group>
            <Button variant="light" size="xs" color="violet" leftSection={<IconPlus size={14} />} onClick={addItem}
              style={{ fontWeight: 600 }}>
              เพิ่มรายการ
            </Button>
          </Group>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'flex', gap: 10, padding: '10px 20px',
          background: 'rgba(99,102,241,0.03)',
          borderBottom: '2px solid rgba(99,102,241,0.12)',
        }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>#</Text>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ flex: 2, minWidth: 180 }}>สินค้า/บริการ</Text>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ width: 85, textAlign: 'center' }}>จำนวน</Text>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ width: 120, textAlign: 'center' }}>ราคา/หน่วย</Text>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ width: 160, textAlign: 'center' }}>ส่วนลด/หน่วย</Text>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ width: 90, textAlign: 'center' }}>ภาษี</Text>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ width: 100, textAlign: 'right', flexShrink: 0 }}>มูลค่า</Text>
          <div style={{ width: 30, flexShrink: 0 }}></div>
        </div>

        {/* Item rows */}
        <div style={{ padding: '0 12px' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              margin: '8px 0',
              padding: '12px',
              borderRadius: 10,
              border: '1px solid var(--app-border)',
              background: item.productId ? 'rgba(99,102,241,0.02)' : 'var(--app-surface)',
              transition: 'all 0.15s ease',
            }}>
              {/* Row 1: product select + numbers */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: item.productId ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99,102,241,0.1)',
                  color: item.productId ? '#fff' : '#a5b4fc',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 800, marginTop: 2,
                  transition: 'all 0.2s',
                }}>{i + 1}</div>
                <div style={{ flex: 2, minWidth: 180 }}>
                  <Select size="sm" searchable clearable placeholder="เลือกสินค้า/บริการ"
                    data={productOptions} value={item.productId}
                    onChange={v => handleProductSelect(i, v || '')} />
                </div>
                <NumberInput size="sm" min={1} value={item.quantity} style={{ width: 85 }}
                  styles={{ input: { textAlign: 'center', fontWeight: 600 } }}
                  onChange={v => updateItem(i, 'quantity', Number(v) || 1)} />
                <NumberInput size="sm" min={0} value={item.unitPrice} decimalScale={2} fixedDecimalScale
                  thousandSeparator="," style={{ width: 120 }}
                  styles={{ input: { textAlign: 'right', fontWeight: 600 } }}
                  onChange={v => updateItem(i, 'unitPrice', Number(v) || 0)} />
                <div style={{ width: 160, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <SegmentedControl size="xs" value={item.discountType}
                    onChange={v => { updateItem(i, 'discountType', v); updateItem(i, 'discountPerUnit', 0) }}
                    data={[{ value: 'baht', label: '฿' }, { value: 'percent', label: '%' }]}
                    style={{ flexShrink: 0 }} />
                  <NumberInput size="sm" min={0} max={item.discountType === 'percent' ? 100 : undefined}
                    value={item.discountPerUnit} decimalScale={2}
                    style={{ flex: 1 }}
                    styles={{ input: { textAlign: 'right' } }} hideControls
                    rightSection={item.discountType === 'percent' ? <Text size="xs" c="dimmed" mr={8}>%</Text> : null}
                    onChange={v => updateItem(i, 'discountPerUnit', Number(v) || 0)} />
                </div>
                <Select size="sm" value={vatEnabled ? item.vatType : 'no_vat'} style={{ width: 90 }}
                  disabled={!vatEnabled}
                  data={[
                    { value: 'no_vat', label: 'ไม่มี' },
                    { value: 'vat0', label: '0%' },
                    { value: 'vat7', label: `${vatRate}%` },
                  ]}
                  onChange={v => updateItem(i, 'vatType', v || 'no_vat')} />
                <div style={{
                  width: 100, flexShrink: 0, paddingTop: 4, textAlign: 'right',
                }}>
                  <Text size="sm" fw={800} c={config.color} style={{ lineHeight: 1 }}>
                    ฿{fmt(calc.rows[i]?.lineTotal || 0)}
                  </Text>
                  {item.discountPerUnit > 0 && (
                    <Text size="xs" c="red" mt={2} style={{ lineHeight: 1 }}>
                      -{item.discountType === 'percent' ? `${item.discountPerUnit}%` : `฿${fmt(item.discountPerUnit)}`}
                    </Text>
                  )}
                </div>
                <ActionIcon size="sm" variant="subtle" color="red" radius="md"
                  style={{ flexShrink: 0, marginTop: 4 }}
                  disabled={items.length <= 1} onClick={() => removeItem(i)}>
                  <IconTrash size={15} />
                </ActionIcon>
              </div>
              {/* Row 2: description + min price warning */}
              <div style={{ paddingLeft: 42, paddingTop: 8 }}>
                <TextInput size="sm" variant="unstyled" placeholder="พิมพ์คำอธิบายรายการ ไม่เกิน 1,000 ตัวอักษร"
                  value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                  styles={{
                    input: {
                      background: 'rgba(99,102,241,0.04)',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 13,
                      border: '1px dashed rgba(99,102,241,0.12)',
                      transition: 'border-color 0.2s',
                    },
                  }} />
                {minPriceWarnings[i] && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    marginTop: 8, padding: '8px 12px',
                    background: 'rgba(249,115,22,0.08)',
                    border: '1px solid rgba(249,115,22,0.25)',
                    borderRadius: 8, fontSize: 12, color: '#ea580c', fontWeight: 600,
                  }}>
                    <IconAlertTriangle size={14} stroke={2} />
                    ราคาขั้นต่ำสุด: ฿{fmt(minPriceWarnings[i]!.minPrice)}
                    <span style={{ fontWeight: 400, color: '#9a3412' }}>
                      &nbsp;— ราคาที่เลือก ฿{fmt(minPriceWarnings[i]!.effectivePrice)} ต่ำกว่าขั้นต่ำ
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add button footer */}
        <div style={{
          padding: '12px 20px 16px',
          borderTop: '1px dashed var(--app-border)',
          background: 'rgba(139,92,246,0.02)',
        }}>
          <Button variant="subtle" size="sm" color="violet" leftSection={<IconPlus size={15} />} onClick={addItem}
            style={{ fontWeight: 600 }}>
            เพิ่มรายการใหม่
          </Button>
        </div>
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

        <Card shadow="xs" padding={0} radius="md" withBorder style={{ overflow: 'hidden' }}>
          {/* Summary header */}
          <div style={{
            padding: '12px 20px',
            background: 'linear-gradient(135deg, rgba(5,150,105,0.08), rgba(16,185,129,0.04))',
            borderBottom: '1px solid var(--app-border)',
          }}>
            <Group gap={8}>
              <ThemeIcon size={28} variant="gradient" gradient={{ from: 'green', to: 'teal' }} radius="md">
                <IconCurrencyBaht size={15} />
              </ThemeIcon>
              <Text fw={700} size="sm">สรุปยอด</Text>
            </Group>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <Stack gap={8}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">รวมสินค้า ({itemCount} รายการ)</Text>
                <Text size="sm" fw={600}>฿{fmt(calc.subtotal)}</Text>
              </Group>
              <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">ส่วนลดรวม</Text>
                <Group gap={4}>
                  <SegmentedControl size="xs" value={discountType}
                    onChange={v => { setDiscountType(v as 'baht' | 'percent'); setDiscountAmount(0) }}
                    data={[{ value: 'baht', label: '฿' }, { value: 'percent', label: '%' }]}
                    style={{ flexShrink: 0 }} />
                  <NumberInput size="xs" min={0} max={discountType === 'percent' ? 100 : undefined}
                    value={discountAmount} style={{ width: 90 }}
                    onChange={v => setDiscountAmount(Number(v) || 0)} hideControls decimalScale={2}
                    rightSection={discountType === 'percent' ? <Text size="xs" c="dimmed" mr={6}>%</Text> : null} />
                </Group>
              </Group>
              {discountType === 'percent' && calc.discount > 0 && (
                <Group justify="flex-end">
                  <Text size="xs" c="red" fw={600}>-฿{fmt(calc.discount)}</Text>
                </Group>
              )}
              {priceType !== 'no_vat' && (
                <>
                  <Divider variant="dashed" my={4} />
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">มูลค่าก่อน VAT</Text>
                    <Text size="sm" fw={500}>฿{fmt(calc.amtBeforeVat)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">VAT {vatRate}%</Text>
                    <Text size="sm" fw={500}>฿{fmt(calc.totalVat)}</Text>
                  </Group>
                </>
              )}
              {/* Grand total */}
              <div style={{
                margin: '8px -20px -16px',
                padding: '16px 20px',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                borderRadius: '0 0 8px 8px',
              }}>
                <Group justify="space-between">
                  <Text size="md" fw={700} c="white">ยอดรวมทั้งสิ้น</Text>
                  <Text size="xl" fw={900} c="white" ff="monospace">฿{fmt(calc.total)}</Text>
                </Group>
              </div>
            </Stack>
          </div>
        </Card>
      </SimpleGrid>

      {/* ═══ Bottom Actions ═══ */}
      <Card shadow="xs" padding="md" radius="md" withBorder>
        <Group justify="space-between">
          <Button variant="subtle" color="gray" onClick={() => navigate('/sales-doc')}>
            ยกเลิก
          </Button>
          <Group gap="sm">
            <Button variant="light" leftSection={<IconDeviceFloppy size={16} />}
              loading={createMutation.isPending} onClick={() => handleSubmit('draft')}
              style={{ fontWeight: 600 }}>
              บันทึกร่าง
            </Button>
            <Button size="md" leftSection={<IconCheck size={18} />}
              loading={createMutation.isPending} onClick={() => handleSubmit('approved')}
              style={{ background: config.gradient, fontWeight: 700, paddingLeft: 20, paddingRight: 24 }}>
              อนุมัติ{config.label}
            </Button>
          </Group>
        </Group>
      </Card>

      {/* ═══ Approve + Payment Modal ═══ */}
      <Modal opened={approveModalOpen} onClose={() => setApproveModalOpen(false)}
        title={`อนุมัติ${config.label}`} size="lg" centered>
        <Stack gap="md">
          <Card padding="md" radius="md" withBorder
            style={{ background: config.gradient, border: 'none' }}>
            <Group justify="space-between">
              <Text size="sm" c="rgba(255,255,255,0.8)" fw={600}>ยอดที่ต้องชำระ</Text>
              <Text size="xl" fw={800} c="white">฿{fmt(calc.total)}</Text>
            </Group>
          </Card>

          <div>
            <Text size="sm" fw={600} mb={8}>เลือกช่องทางชำระเงิน</Text>
            {paymentChannels.length === 0 ? (
              <Card padding="md" radius="md" withBorder>
                <Text ta="center" c="dimmed" size="sm">ยังไม่มีช่องทางชำระเงิน — กรุณาเพิ่มในหน้า "กระเป๋าเงิน" ก่อน</Text>
              </Card>
            ) : (
              <SimpleGrid cols={2} spacing="sm">
                {paymentChannels.map((ch: any) => {
                  const isSelected = payChannelId === String(ch.id)
                  const color = TYPE_COLORS[ch.type] || '#6b7280'
                  return (
                    <Card key={ch.id} padding="sm" radius="md" withBorder
                      onClick={() => setPayChannelId(String(ch.id))}
                      style={{
                        cursor: 'pointer',
                        border: isSelected ? `2px solid ${color}` : '1px solid var(--app-border)',
                        background: isSelected ? `${color}08` : 'var(--app-surface)',
                        transition: 'all 0.2s',
                      }}>
                      <Group gap={10} wrap="nowrap">
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                          background: isSelected ? color : `${color}20`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isSelected ? '#fff' : color, fontWeight: 800, fontSize: 14,
                          transition: 'all 0.2s',
                        }}>
                          {TYPE_ICONS[ch.type] || '💰'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={700} lineClamp={1}>{ch.name}</Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {ch.bank_name || TYPE_LABELS[ch.type] || ch.type}
                            {ch.account_number ? ` • ${ch.account_number}` : ''}
                          </Text>
                        </div>
                        {isSelected && (
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <IconCheck size={14} color="#fff" />
                          </div>
                        )}
                      </Group>
                    </Card>
                  )
                })}
              </SimpleGrid>
            )}
          </div>

          <Group grow mt="sm">
            <Button variant="light" color="gray"
              loading={createMutation.isPending}
              onClick={() => { setApproveModalOpen(false); doCreate('approved', false) }}>
              อนุมัติ (ยังไม่ชำระ)
            </Button>
            <Button color="green" disabled={!payChannelId}
              loading={createMutation.isPending}
              onClick={() => { setApproveModalOpen(false); doCreate('approved', true) }}
              leftSection={<IconCheck size={16} />}>
              อนุมัติ + ชำระเลย
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
