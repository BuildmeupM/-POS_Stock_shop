import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Select, Card,
  Table, ActionIcon, Tooltip, Divider, SimpleGrid, NumberInput,
  Textarea, Badge
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft, IconPlus, IconTrash, IconDeviceFloppy,
  IconPackage, IconUser, IconMapPin, IconTruck, IconCash,
  IconFileInvoice, IconWand
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt } from '../utils/formatters'
import { PLATFORM_OPTIONS as platformOptions } from '../utils/constants'

interface OrderItem {
  productId: string
  quantity: number
  unitPrice: number
  discount: number
}

const shippingProviders = [
  'ไปรษณีย์ไทย', 'Kerry', 'Flash Express', 'J&T Express',
  'Shopee Express', 'Lazada Express', 'NIM Express', 'DHL', 'อื่นๆ',
]

export default function OrderCreatePage() {
  const navigate = useNavigate()

  // === Form State ===
  const [form, setForm] = useState({
    platform: 'facebook',
    paymentMethod: 'transfer',
    paymentChannelId: null as number | null,
    customerName: '',
    customerPhone: '',
    addrHouseNo: '', addrVillage: '', addrStreet: '', addrSubdistrict: '', addrDistrict: '',
    addrProvince: '', addrZipCode: '',
    shippingCost: 0,
    shippingPaidBy: 'customer' as 'customer' | 'seller',
    shippingProvider: '',
    discountAmount: 0,
    note: '',
  })

  // Items state
  const [items, setItems] = useState<OrderItem[]>([
    { productId: '', quantity: 1, unitPrice: 0, discount: 0 }
  ])
  const [rawAddress, setRawAddress] = useState('')

  // Queries
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-orders'],
    queryFn: () => api.get('/products', { params: { active: 'true' } }).then(r => r.data),
  })

  const { data: walletChannels = [] } = useQuery({
    queryKey: ['wallet-channels-active'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const paymentChannelOptions = walletChannels.length > 0
    ? walletChannels.map((ch: any) => ({
        value: String(ch.id),
        label: `${ch.type === 'cash' ? '💵' : ch.type === 'bank_account' ? '🏦' : ch.type === 'promptpay' ? '📱' : ch.type === 'credit_card' ? '💳' : ch.type === 'e_wallet' ? '👛' : '📋'} ${ch.name}`,
      }))
    : [
        { value: '_transfer', label: '🏦 โอนเงิน' },
        { value: '_cod', label: '📦 เก็บปลายทาง (COD)' },
        { value: '_credit_card', label: '💳 บัตรเครดิต' },
        { value: '_qr_code', label: '📱 QR Code' },
      ]



  // Address
  const buildAddress = () => {
    const parts = [
      form.addrHouseNo,
      form.addrVillage ? `หมู่บ้าน${form.addrVillage}` : '',
      form.addrStreet,
      form.addrSubdistrict ? `ต.${form.addrSubdistrict}` : '',
      form.addrDistrict ? `อ.${form.addrDistrict}` : '',
      form.addrProvince ? `จ.${form.addrProvince}` : '',
      form.addrZipCode,
    ].filter(Boolean)
    return parts.join(' ')
  }

  const parseAndFillAddress = () => {
    if (!rawAddress.trim()) return
    const addr = rawAddress.trim()

    // Extract zip code (5 digits)
    const zipMatch = addr.match(/(\d{5})/)
    const zip = zipMatch ? zipMatch[1] : ''

    // Extract province
    let province = ''
    const provMatch = addr.match(/จ(?:\.|ังหวัด)\s*([^\s,]+)/)
    if (provMatch) province = provMatch[1]
    else if (/กรุงเทพ/.test(addr)) province = 'กรุงเทพมหานคร'

    // Extract district
    let district = ''
    const distMatch = addr.match(/(?:อำเภอ|อ\.|\u0e40ขต)\s*([^\s,]+)/)
    if (distMatch) district = distMatch[1]

    // Extract sub-district
    let subdistrict = ''
    const subMatch = addr.match(/(?:ตำบล|ต\.|\u0e41ขวง)\s*([^\s,]+)/)
    if (subMatch) subdistrict = subMatch[1]

    // Extract village (หมู่บ้าน XXX until ถนน/ถ./ซอย/ซ./ต./ตำบล/อ./อำเภอ or end)
    let village = ''
    const villageMatch = addr.match(/หมู่บ้าน\s*(.+?)(?=\s*(?:ถนน|ถ\.|\u0e0bอย|ซ\.|\u0e15ำบล|ต\.|\u0e2dำเภอ|อ\.|\u0e41ขวง|\u0e40ขต|จ\.|\u0e08ังหวัด|\d{5}|$))/)
    if (villageMatch) village = villageMatch[1].trim()

    // Extract street (ถนนXXX or ถ.XXX or ซอยXXX or ซ.XXX)
    let street = ''
    const streetMatch = addr.match(/(?:ถนน|ถ\.)\s*([^\s,]*(?:[\-][^\s,]*)*)/)
    if (streetMatch) street = 'ถนน' + streetMatch[1]
    else {
      const soiMatch = addr.match(/(?:ซอย|ซ\.)\s*([^\s,]+)/)
      if (soiMatch) street = 'ซอย' + soiMatch[1]
    }

    // Remove all parsed parts to find house number
    let remaining = addr
      .replace(/(\d{5})/, '')
      .replace(/จ(?:\.|ังหวัด)\s*[^\s,]+/, '')
      .replace(/(?:อำเภอ|อ\.|\u0e40ขต)\s*[^\s,]+/, '')
      .replace(/(?:ตำบล|ต\.|\u0e41ขวง)\s*[^\s,]+/, '')
      .replace(/หมู่บ้าน\s*.+?(?=\s*(?:ถนน|ถ\.|\u0e0bอย|ซ\.|\u0e15ำบล|ต\.|\u0e2dำเภอ|อ\.|\u0e41ขวง|\u0e40ขต|จ\.|\u0e08ังหวัด|\d{5}|$))/, '')
      .replace(/(?:ถนน|ถ\.)\s*[^\s,]*(?:[\-][^\s,]*)*/, '')
      .replace(/(?:ซอย|ซ\.)\s*[^\s,]+/, '')
      .replace(/กรุงเทพมหานคร/, '').replace(/กรุงเทพฯ/, '')
      .replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim()

    const houseNo = remaining || ''

    setForm(prev => ({
      ...prev,
      addrHouseNo: houseNo,
      addrVillage: village,
      addrStreet: street,
      addrSubdistrict: subdistrict,
      addrDistrict: district,
      addrProvince: province,
      addrZipCode: zip,
    }))
    notifications.show({ title: '✅ กระจายที่อยู่สำเร็จ', message: 'ตรวจสอบและแก้ไขได้ที่ช่องด้านล่าง', color: 'teal', autoClose: 2000 })
  }

  // Product helpers
  const productOptions = products
    .map((p: any) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))

  const addItem = () => setItems(prev => [...prev, { productId: '', quantity: 1, unitPrice: 0, discount: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx: number, updates: Partial<OrderItem>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item))
  }

  // Calculations
  const itemsTotal = items.reduce((s, i) => s + (i.unitPrice * i.quantity - i.discount), 0)
  const itemCount = items.filter(i => i.productId).length
  const shippingForCustomer = form.shippingPaidBy === 'customer' ? form.shippingCost : 0
  const netAmount = itemsTotal + shippingForCustomer - form.discountAmount

  // Submit
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/orders', data),
    onSuccess: (res) => {
      notifications.show({ title: '✅ สร้างออเดอร์สำเร็จ', message: `เลขที่ ${res.data.orderNumber}`, color: 'green' })
      navigate('/orders')
    },
    onError: () => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถสร้างออเดอร์ได้', color: 'red' })
    },
  })

  const handleSubmit = () => {
    if (!items.some(i => i.productId && i.quantity > 0)) {
      notifications.show({ title: '⚠️ กรุณาเพิ่มสินค้า', message: 'ต้องเลือกสินค้าอย่างน้อย 1 รายการ', color: 'yellow' })
      return
    }
    if (!form.customerName.trim()) {
      notifications.show({ title: '⚠️ กรุณากรอกชื่อลูกค้า', message: '', color: 'yellow' })
      return
    }
    createMutation.mutate({
      ...form,
      paymentChannelId: form.paymentChannelId || undefined,
      shippingAddress: buildAddress(),
      shippingCost: form.shippingCost,
      discountAmount: form.discountAmount,
      items: items.filter(i => i.productId).map(i => ({
        productId: Number(i.productId), unitPrice: i.unitPrice,
        quantity: i.quantity, discount: i.discount,
      })),
    })
  }

  return (
    <Stack gap="lg">
      {/* === Header === */}
      <Group justify="space-between">
        <Group gap="sm">
          <ActionIcon variant="light" size="lg" onClick={() => navigate('/orders')}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <div>
            <Text size="xl" fw={800}>📝 สร้างออเดอร์ออนไลน์</Text>
            <Text size="xs" c="dimmed">กรอกข้อมูลเพื่อเปิดบิลออเดอร์ใหม่</Text>
          </div>
        </Group>
        <Group gap="sm">
          <Button variant="light" onClick={() => navigate('/orders')}>ยกเลิก</Button>
          <Button leftSection={<IconDeviceFloppy size={16} />}
            loading={createMutation.isPending} onClick={handleSubmit}
            disabled={items.length === 0}
            style={{ background: items.length > 0 ? 'linear-gradient(135deg, #4f46e5, #3730a3)' : undefined }}>
            บันทึกออเดอร์
          </Button>
        </Group>
      </Group>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }}>
        {/* === Left Column: Main Form === */}
        <Stack gap="md">

          {/* Section 1: Document Info */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap={8} mb="md">
              <IconFileInvoice size={18} color="var(--app-primary)" />
              <Text fw={700}>ข้อมูลเอกสาร</Text>
            </Group>
            <SimpleGrid cols={3}>
              <Select label="ช่องทาง" size="sm" required data={platformOptions}
                value={form.platform} onChange={(v) => setForm({ ...form, platform: v || 'facebook' })} />
              <Select label="การชำระเงิน" size="sm" data={paymentChannelOptions}
                value={form.paymentChannelId ? String(form.paymentChannelId) : (walletChannels.length > 0 ? null : '_transfer')}
                onChange={(v) => {
                  if (v && !v.startsWith('_')) {
                    const ch = walletChannels.find((c: any) => String(c.id) === v)
                    setForm({ ...form, paymentChannelId: Number(v), paymentMethod: ch?.type === 'bank_account' ? 'transfer' : ch?.type === 'promptpay' ? 'qr_code' : ch?.type || 'transfer' })
                  } else {
                    const method = v ? v.replace('_', '') : 'transfer'
                    setForm({ ...form, paymentChannelId: null, paymentMethod: method })
                  }
                }} />
              <Select label="ขนส่ง" size="sm" clearable placeholder="เลือกขนส่ง"
                data={shippingProviders}
                value={form.shippingProvider} onChange={(v) => setForm({ ...form, shippingProvider: v || '' })} />
            </SimpleGrid>
          </Card>

          {/* Section 2: Customer */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap={8} mb="md">
              <IconUser size={18} color="#7c3aed" />
              <Text fw={700}>ข้อมูลลูกค้า</Text>
            </Group>
            <SimpleGrid cols={2}>
              <TextInput label="ชื่อลูกค้า" size="sm" required placeholder="ชื่อ-นามสกุล"
                value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
              <TextInput label="เบอร์โทร" size="sm" placeholder="08x-xxx-xxxx"
                value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            </SimpleGrid>
          </Card>

          {/* Section 3: Address */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap={8} mb="md">
              <IconMapPin size={18} color="#0891b2" />
              <Text fw={700}>ที่อยู่จัดส่ง</Text>
            </Group>

            {/* Paste & Parse address */}
            <Group gap="sm" align="end" mb="md">
              <Textarea size="sm" placeholder="วางที่อยู่แบบเต็ม เช่น: 123/45 ถ.สุขุมวิท ต.คลองเตย อ.คลองเตย กรุงเทพฯ 10110"
                style={{ flex: 1 }} autosize minRows={1} maxRows={3}
                value={rawAddress} onChange={(e) => setRawAddress(e.target.value)} />
              <Button size="sm" variant="light" color="teal" leftSection={<IconWand size={14} />}
                disabled={!rawAddress.trim()} onClick={parseAndFillAddress}>
                กระจายที่อยู่
              </Button>
            </Group>
            <SimpleGrid cols={3}>
              <TextInput label="บ้านเลขที่" size="sm" placeholder="123/45"
                value={form.addrHouseNo} onChange={(e) => setForm({ ...form, addrHouseNo: e.target.value })} />
              <TextInput label="หมู่บ้าน / คอนโด" size="sm" placeholder="คุณาลัย คอร์ทยาร์ด"
                value={form.addrVillage} onChange={(e) => setForm({ ...form, addrVillage: e.target.value })} />
              <TextInput label="ถนน / ซอย" size="sm" placeholder="ถนนสุขุมวิท ซอย 1"
                value={form.addrStreet} onChange={(e) => setForm({ ...form, addrStreet: e.target.value })} />
            </SimpleGrid>
            <SimpleGrid cols={2} mt="sm">
              <TextInput label="ตำบล / แขวง" size="sm" placeholder="คลองเตย"
                value={form.addrSubdistrict} onChange={(e) => setForm({ ...form, addrSubdistrict: e.target.value })} />
              <TextInput label="อำเภอ / เขต" size="sm" placeholder="คลองเตย"
                value={form.addrDistrict} onChange={(e) => setForm({ ...form, addrDistrict: e.target.value })} />
            </SimpleGrid>
            <SimpleGrid cols={2} mt="sm">
              <TextInput label="จังหวัด" size="sm" placeholder="กรุงเทพมหานคร"
                value={form.addrProvince} onChange={(e) => setForm({ ...form, addrProvince: e.target.value })} />
              <TextInput label="รหัสไปรษณีย์" size="sm" placeholder="10110"
                value={form.addrZipCode} onChange={(e) => setForm({ ...form, addrZipCode: e.target.value })} />
            </SimpleGrid>
          </Card>

          {/* Section 4: Items — Purchase-page style */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap={8} mb="md">
              <IconPackage size={18} color="var(--app-success)" />
              <Text fw={700}>รายการสินค้า ({itemCount} รายการ)</Text>
            </Group>

            <div style={{ overflow: 'auto' }}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 50 }} ta="center">#</Table.Th>
                    <Table.Th style={{ minWidth: 280 }}>สินค้า</Table.Th>
                    <Table.Th ta="center" style={{ width: 110 }}>จำนวน</Table.Th>
                    <Table.Th ta="center" style={{ width: 140 }}>ราคาขาย/หน่วย</Table.Th>
                    <Table.Th ta="center" style={{ width: 130 }}>ส่วนลด (฿)</Table.Th>
                    <Table.Th ta="right" style={{ width: 130 }}>รวม</Table.Th>
                    <Table.Th ta="center" style={{ width: 50 }}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {items.map((item, idx) => {
                    const lineTotal = item.unitPrice * item.quantity - item.discount
                    return (
                      <Table.Tr key={idx}>
                        <Table.Td ta="center">
                          <Text size="sm" c="dimmed">{idx + 1}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Select data={productOptions} value={item.productId} searchable
                            placeholder="🔍 ค้นหาหรือเลือกสินค้า" size="sm"
                            nothingFoundMessage="ไม่พบสินค้า"
                            onChange={(v) => {
                              const prod = products?.find((p: any) => String(p.id) === v)
                              updateItem(idx, {
                                productId: v || '',
                                unitPrice: prod ? parseFloat(prod.selling_price) : 0
                              })
                            }} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput min={1} value={item.quantity} hideControls size="sm"
                            onChange={(v) => updateItem(idx, { quantity: Number(v) || 1 })}
                            styles={{ input: { textAlign: 'center' } }} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput min={0} decimalScale={2} value={item.unitPrice} hideControls size="sm"
                            thousandSeparator=","
                            onChange={(v) => updateItem(idx, { unitPrice: Number(v) || 0 })}
                            styles={{ input: { textAlign: 'center' } }} />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput min={0} decimalScale={2} value={item.discount} hideControls size="sm"
                            thousandSeparator=","
                            onChange={(v) => updateItem(idx, { discount: Number(v) || 0 })}
                            styles={{ input: { textAlign: 'center' } }} />
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text fw={600}>฿{fmt(lineTotal)}</Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          {items.length > 1 && (
                            <ActionIcon size="sm" variant="light" color="red" onClick={() => removeItem(idx)}>
                              <IconTrash size={14} />
                            </ActionIcon>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            </div>

            <Button variant="subtle" size="xs" mt="sm" leftSection={<IconPlus size={14} />} onClick={addItem}
              style={{ alignSelf: 'flex-start' }}>
              เพิ่มรายการ
            </Button>
          </Card>

          {/* Section 5: Note */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Text fw={700} mb="sm">📝 หมายเหตุ</Text>
            <Textarea size="sm" placeholder="หมายเหตุ (ไม่บังคับ)" autosize minRows={2}
              value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Card>
        </Stack>

        {/* === Right Column: Summary === */}
        <Stack gap="md" style={{ position: 'sticky', top: 16 }}>

          {/* Shipping & Discount */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap={8} mb="md">
              <IconTruck size={18} color="var(--app-primary)" />
              <Text fw={700}>ค่าจัดส่งและส่วนลด</Text>
            </Group>
            <Stack gap="sm">
              <NumberInput label="ค่าจัดส่ง (บาท)" size="sm" min={0} step={10}
                thousandSeparator=","
                value={form.shippingCost}
                onChange={(v) => setForm({ ...form, shippingCost: Number(v) || 0 })} />
              <Select label="ผู้รับผิดชอบค่าขนส่ง" size="sm"
                data={[
                  { value: 'customer', label: '👤 ลูกค้าจ่าย' },
                  { value: 'seller', label: '🏪 ผู้ขายจ่าย (ส่งฟรี)' },
                ]}
                value={form.shippingPaidBy}
                onChange={(v) => setForm({ ...form, shippingPaidBy: (v as 'customer' | 'seller') || 'customer' })} />
              <NumberInput label="ส่วนลดรวม (บาท)" size="sm" min={0} step={10}
                thousandSeparator=","
                value={form.discountAmount}
                onChange={(v) => setForm({ ...form, discountAmount: Number(v) || 0 })} />
            </Stack>
          </Card>

          {/* Order Summary */}
          <Card shadow="xs" padding="lg" radius="md" withBorder
            style={{ border: '2px solid var(--app-primary)' }}>
            <Group gap={8} mb="md">
              <IconCash size={18} color="var(--app-success)" />
              <Text fw={700}>สรุปยอด</Text>
            </Group>
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">ยอดสินค้า ({items.reduce((s, i) => s + i.quantity, 0)} ชิ้น)</Text>
                <Text size="sm">฿{fmt(itemsTotal)}</Text>
              </Group>
              {form.shippingCost > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    ค่าจัดส่ง {form.shippingPaidBy === 'seller' && (
                      <Badge size="xs" variant="light" color="orange" ml={4}>ผู้ขายจ่าย</Badge>
                    )}
                  </Text>
                  <Text size="sm" c={form.shippingPaidBy === 'seller' ? 'orange' : undefined}>
                    {form.shippingPaidBy === 'seller' ? `(฿${fmt(form.shippingCost)})` : `฿${fmt(form.shippingCost)}`}
                  </Text>
                </Group>
              )}
              {form.discountAmount > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="red">ส่วนลด</Text>
                  <Text size="sm" c="red">-฿{fmt(form.discountAmount)}</Text>
                </Group>
              )}
              <Divider my={8} />
              <Group justify="space-between">
                <Text size="lg" fw={700}>ยอดสุทธิ</Text>
                <Text size="xl" fw={800} c="green">฿{fmt(netAmount)}</Text>
              </Group>
              {form.shippingPaidBy === 'seller' && form.shippingCost > 0 && (
                <Text size="xs" c="orange" ta="right">
                  * ยอดรวมไม่รวมค่าจัดส่ง ฿{fmt(form.shippingCost)} (ผู้ขายจ่าย)
                </Text>
              )}
            </Stack>
          </Card>

          {/* Submit Button */}
          <Button fullWidth size="lg" loading={createMutation.isPending}
            onClick={handleSubmit} disabled={items.length === 0}
            style={{ background: items.length > 0 ? 'linear-gradient(135deg, #4f46e5, #3730a3)' : undefined }}>
            🛒 บันทึกออเดอร์ {items.length > 0 && `(${items.length} รายการ)`}
          </Button>
        </Stack>
      </div>
    </Stack>
  )
}
