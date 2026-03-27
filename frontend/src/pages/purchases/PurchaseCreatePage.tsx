import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, TextInput, Group, Stack, NumberInput, Select,
  Text, Badge, ActionIcon, Divider
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconTrash, IconArrowLeft, IconDeviceFloppy, IconCheck
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt } from '../../utils/formatters'

export default function PurchaseCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: vendors } = useQuery({
    queryKey: ['contacts-vendors'],
    queryFn: () => api.get('/contacts', { params: { type: 'vendor' } }).then(r => r.data),
  })

  const { data: products } = useQuery({
    queryKey: ['products-for-po'],
    queryFn: () => api.get('/products').then(r => r.data),
  })

  // --- Form State ---
  const [contactId, setContactId] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [expectedDate, setExpectedDate] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<{ productId: string; quantity: number; unitCost: number }[]>([
    { productId: '', quantity: 1, unitCost: 0 }
  ])

  const addItem = () => setItems(prev => [...prev, { productId: '', quantity: 1, unitCost: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx: number, updates: Partial<typeof items[0]>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item))
  }

  // Fetch company settings for VAT rate
  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })
  const companySettings = company?.settings || {}
  const vatRate = companySettings.vat_enabled !== false ? (companySettings.vat_rate || 7) / 100 : 0

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitCost), 0)
  const vat = subtotal * vatRate
  const total = subtotal + vat
  const itemCount = items.filter(i => i.productId).length

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/purchases', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `สร้างใบสั่งซื้อ: ${res.data.poNumber}`, color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      navigate('/purchases')
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' }),
  })

  const handleSubmit = (status: 'draft' | 'approved') => {
    if (!contactId) {
      notifications.show({ title: 'กรุณากรอกข้อมูล', message: 'เลือกผู้ขายก่อน', color: 'orange' })
      return
    }
    if (!items.some(i => i.productId && i.quantity > 0)) {
      notifications.show({ title: 'กรุณากรอกข้อมูล', message: 'เพิ่มสินค้าอย่างน้อย 1 รายการ', color: 'orange' })
      return
    }
    createMutation.mutate({
      contactId, orderDate, expectedDate, note, status,
      items: items.filter(i => i.productId),
    })
  }

  const productOptions = (products || []).map((p: any) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))
  const vendorOptions = (vendors || []).map((c: any) => ({ value: String(c.id), label: c.name }))

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <ActionIcon variant="light" size="lg" onClick={() => navigate('/purchases')}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <div>
            <Text size="xl" fw={800}>📝 สร้างใบสั่งซื้อใหม่</Text>
            <Text size="sm" c="dimmed">กรอกข้อมูลผู้ขายและเพิ่มรายการสินค้าที่ต้องการสั่งซื้อ</Text>
          </div>
        </Group>
        <Group>
          <Button variant="light" leftSection={<IconDeviceFloppy size={16} />}
            onClick={() => handleSubmit('draft')} loading={createMutation.isPending}>
            บันทึกฉบับร่าง
          </Button>
          <Button leftSection={<IconCheck size={16} />}
            onClick={() => handleSubmit('approved')} loading={createMutation.isPending}>
            สร้างและอนุมัติ
          </Button>
        </Group>
      </Group>

      {/* Contact & Date Info */}
      <div className="stat-card">
        <Text fw={700} mb="md">ข้อมูลใบสั่งซื้อ</Text>
        <Group grow align="flex-start">
          <Select label="ผู้ขาย *" placeholder="เลือกผู้ขาย" required searchable
            data={vendorOptions} value={contactId}
            onChange={(v) => setContactId(v || '')}
            nothingFoundMessage="ไม่พบผู้ขาย — ไปเพิ่มที่หน้าผู้ติดต่อก่อน" />
          <TextInput label="วันที่สั่ง *" type="date" required
            value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          <TextInput label="กำหนดรับสินค้า" type="date"
            value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </Group>
        <TextInput label="หมายเหตุ" mt="md" placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {/* Items Table */}
      <div className="stat-card">
        <Group justify="space-between" mb="md">
          <Text fw={700}>รายการสินค้า ({itemCount} รายการ)</Text>
          <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={addItem}>
            เพิ่มรายการ
          </Button>
        </Group>

        <div style={{ overflow: 'auto' }}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 50 }} ta="center">#</Table.Th>
                <Table.Th style={{ minWidth: 300 }}>สินค้า</Table.Th>
                <Table.Th ta="center" style={{ width: 120 }}>จำนวน</Table.Th>
                <Table.Th ta="center" style={{ width: 150 }}>ราคาทุน/หน่วย</Table.Th>
                <Table.Th ta="right" style={{ width: 140 }}>รวม</Table.Th>
                <Table.Th ta="center" style={{ width: 50 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item, idx) => (
                <Table.Tr key={idx}>
                  <Table.Td ta="center">
                    <Text size="sm" c="dimmed">{idx + 1}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Select data={productOptions} value={item.productId} searchable
                      placeholder="🔍 ค้นหาหรือเลือกสินค้า"
                      nothingFoundMessage="ไม่พบสินค้า"
                      onChange={(v) => {
                        const prod = products?.find((p: any) => String(p.id) === v)
                        updateItem(idx, { productId: v || '', unitCost: prod ? parseFloat(prod.cost_price) : 0 })
                      }} />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput min={1} value={item.quantity} hideControls
                      onChange={(v) => updateItem(idx, { quantity: Number(v) || 1 })}
                      styles={{ input: { textAlign: 'center' } }} />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput min={0} decimalScale={2} value={item.unitCost} hideControls
                      onChange={(v) => updateItem(idx, { unitCost: Number(v) || 0 })}
                      styles={{ input: { textAlign: 'center' } }} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text fw={600}>฿{fmt(item.quantity * item.unitCost)}</Text>
                  </Table.Td>
                  <Table.Td ta="center">
                    {items.length > 1 && (
                      <ActionIcon size="sm" variant="light" color="red" onClick={() => removeItem(idx)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>

        <Button variant="subtle" size="xs" mt="sm" leftSection={<IconPlus size={14} />} onClick={addItem}
          style={{ alignSelf: 'flex-start' }}>
          เพิ่มรายการ
        </Button>
      </div>

      {/* Summary */}
      <div className="stat-card" style={{ maxWidth: 400, marginLeft: 'auto' }}>
        <Stack gap={8}>
          <Group justify="space-between">
            <Text c="dimmed">ยอดรวมก่อน VAT</Text>
            <Text fw={600}>฿{fmt(subtotal)}</Text>
          </Group>
          <Group justify="space-between">
            <Text c="dimmed">VAT 7%</Text>
            <Text fw={600}>฿{fmt(vat)}</Text>
          </Group>
          <Divider />
          <Group justify="space-between">
            <Text fw={800} size="lg">ยอดสุทธิ</Text>
            <Text fw={800} size="xl" c="green">฿{fmt(total)}</Text>
          </Group>
        </Stack>
      </div>

      {/* Bottom Actions */}
      <Group justify="flex-end">
        <Button variant="default" onClick={() => navigate('/purchases')}>ยกเลิก</Button>
        <Button variant="light" leftSection={<IconDeviceFloppy size={16} />}
          onClick={() => handleSubmit('draft')} loading={createMutation.isPending}>
          บันทึกฉบับร่าง
        </Button>
        <Button leftSection={<IconCheck size={16} />}
          onClick={() => handleSubmit('approved')} loading={createMutation.isPending}>
          สร้างและอนุมัติ
        </Button>
      </Group>
    </Stack>
  )
}
