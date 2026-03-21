import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Table, Button, TextInput, Group, Stack, Select, NumberInput, Modal, Menu,
  Text, Badge, Loader, SimpleGrid, ActionIcon, Divider, Card
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft, IconCheck, IconX, IconTruckDelivery,
  IconPackage, IconClock, IconUser, IconMapPin,
  IconFileInvoice, IconArrowRight, IconAlertTriangle,
  IconPhone, IconWorld, IconBrandFacebook, IconBrandShopee,
  IconShoppingBag, IconCash, IconTruck, IconPrinter,
  IconEdit, IconDeviceFloppy, IconTrash, IconPlus, IconArrowBackUp,
  IconFileBarcode,
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt, fmtDateTimeFull as fmtDate } from '../utils/formatters'
import OrderStepper from './orders/OrderStepper'
import { printOrder } from './orders/printOrder'
import { printShippingLabels } from '../utils/printShippingLabels'
import {
  ORDER_STATUSES as statusConfig,
  PLATFORM_CONFIG as platformConfig,
  PLATFORM_OPTIONS as platformOptions,
  PAYMENT_OPTIONS as paymentOptions,
  PAYMENT_LABELS as paymentLabels,
  ORDER_NEXT_STATUS as nextStatus,
  ORDER_PREV_STATUS as prevStatus,
} from '../utils/constants'

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [trackingInput, setTrackingInput] = useState('')
  const [shippingProviderInput, setShippingProviderInput] = useState('')

  // Edit mode state
  const [editMode, setEditMode] = useState(false)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerPhone, setEditCustomerPhone] = useState('')
  const [editShippingAddress, setEditShippingAddress] = useState('')
  const [editPlatform, setEditPlatform] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState('')
  const [editShippingCost, setEditShippingCost] = useState(0)
  const [editDiscountAmount, setEditDiscountAmount] = useState(0)
  const [editNote, setEditNote] = useState('')
  const [editItems, setEditItems] = useState<any[]>([])
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Payment confirmation modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [payChannelId, setPayChannelId] = useState<string | null>(null)
  const [payReference, setPayReference] = useState('')
  const [payAmount, setPayAmount] = useState(0)

  // Shipping modal
  const [shippingModalOpen, setShippingModalOpen] = useState(false)
  const [shipTracking, setShipTracking] = useState('')
  const [shipProvider, setShipProvider] = useState('')

  // Queries
  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  const { data: paymentChannels = [] } = useQuery({
    queryKey: ['payment-channels'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
  })

  const { data: order, isLoading } = useQuery({
    queryKey: ['order-detail', id],
    queryFn: () => api.get(`/orders/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-order'],
    queryFn: () => api.get('/products').then(r => r.data),
    enabled: editMode,
  })

  const { data: creditNote } = useQuery({
    queryKey: ['credit-note-order', id],
    queryFn: () => api.get(`/credit-notes/by-order/${id}`).then(r => r.data),
    enabled: !!order && order.order_status === 'returned',
  })

  const productOptions = products.map((p: any) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))

  // Start editing
  const startEdit = () => {
    if (!order) return
    setEditCustomerName(order.customer_name || '')
    setEditCustomerPhone(order.customer_phone || '')
    setEditShippingAddress(order.shipping_address || '')
    setEditPlatform(order.platform || 'facebook')
    setEditPaymentMethod(order.payment_method || 'transfer')
    setEditShippingCost(parseFloat(order.shipping_cost) || 0)
    setEditDiscountAmount(parseFloat(order.discount_amount) || 0)
    setEditNote(order.note || '')
    setEditItems(order.items?.map((item: any) => ({
      productId: String(item.product_id),
      quantity: item.quantity,
      unitPrice: parseFloat(item.unit_price),
      discount: parseFloat(item.discount || 0),
    })) || [])
    setEditMode(true)
  }

  const cancelEdit = () => setEditMode(false)

  const addEditItem = () => setEditItems(prev => [...prev, { productId: '', quantity: 1, unitPrice: 0, discount: 0 }])
  const removeEditItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx))
  const updateEditItem = (idx: number, updates: any) => {
    setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item))
  }

  const editItemsTotal = editItems.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity - i.discount), 0)
  const editNetAmount = editItemsTotal + editShippingCost - editDiscountAmount

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put(`/orders/${id}`, data),
    onSuccess: () => {
      notifications.show({ title: '✅ แก้ไขสำเร็จ', message: 'บันทึกการแก้ไขออเดอร์เรียบร้อย', color: 'green' })
      setEditMode(false)
      queryClient.invalidateQueries({ queryKey: ['order-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถแก้ไขได้', color: 'red' })
    },
  })

  const handleSave = () => {
    saveMutation.mutate({
      customerName: editCustomerName,
      customerPhone: editCustomerPhone,
      shippingAddress: editShippingAddress,
      platform: editPlatform,
      paymentMethod: editPaymentMethod,
      shippingCost: editShippingCost,
      discountAmount: editDiscountAmount,
      note: editNote,
      items: editItems.filter(i => i.productId).map(i => ({
        productId: Number(i.productId),
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        discount: i.discount,
      })),
    })
  }

  // Status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status, tracking, provider }: any) =>
      api.put(`/orders/${orderId}/status`, {
        orderStatus: status, trackingNumber: tracking, shippingProvider: provider,
      }),
    onSuccess: (_data, variables) => {
      const isReturn = variables.status === 'returned'
      notifications.show({
        title: isReturn ? '✅ คืนสินค้าและออกใบลดหนี้สำเร็จ' : '✅ อัพเดตสถานะสำเร็จ',
        message: isReturn ? 'ใบลดหนี้ถูกสร้างอัตโนมัติ' : '', color: 'green',
      })
      queryClient.invalidateQueries({ queryKey: ['order-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      if (isReturn) {
        queryClient.invalidateQueries({ queryKey: ['credit-note-order', id] })
        // Scroll to credit note section after data loads
        setTimeout(() => {
          document.getElementById('credit-note-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 800)
      }
    },
    onError: () => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: '', color: 'red' })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/orders/${id}`),
    onSuccess: () => {
      notifications.show({ title: '✅ ลบสำเร็จ', message: 'ลบออเดอร์เรียบร้อย', color: 'green' })
      navigate('/orders')
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' })
    },
  })

  const handleStatusChange = (status: string) => {
    // ถ้าจะเปลี่ยนเป็น "ชำระเงินแล้ว" → เปิด modal ถามวิธีชำระ
    if (status === 'confirmed') {
      setPayAmount(parseFloat(order?.net_amount) || 0)
      setPayChannelId(null)
      setPayReference('')
      setPaymentModalOpen(true)
      return
    }
    // ถ้าจะเปลี่ยนเป็น "จัดส่งแล้ว" → เปิด modal ถาม tracking
    if (status === 'shipped') {
      setShipTracking('')
      setShipProvider('')
      setShippingModalOpen(true)
      return
    }
    // อื่นๆ ส่งตรง
    updateStatusMutation.mutate({ orderId: order.id, status })
  }

  const handleConfirmPayment = () => {
    const channel = paymentChannels.find((c: any) => String(c.id) === payChannelId)
    updateStatusMutation.mutate({
      orderId: order.id, status: 'confirmed',
      paymentMethod: channel?.type || 'transfer',
      paymentChannelId: channel?.id || null,
      paymentReference: payReference,
    })
    setPaymentModalOpen(false)
  }

  const handleConfirmShipping = () => {
    updateStatusMutation.mutate({
      orderId: order.id, status: 'shipped',
      tracking: shipTracking || undefined,
      provider: shipProvider || undefined,
    })
    setShippingModalOpen(false)
  }

  // ===== PRINT FUNCTIONS =====
  const handlePrint = () => {
    if (order) printOrder(order, creditNote, company)
  }

  const handlePrintLabel = () => {
    if (!order) return
    const plat = platformConfig[order.platform] || platformConfig.other
    printShippingLabels({
      companyName: company?.name || 'บริษัท',
      companyPhone: company?.phone || '',
      companyAddress: company?.address || '',
      orders: [{
        orderNumber: order.order_number,
        customerName: order.customer_name || '-',
        customerPhone: order.customer_phone,
        shippingAddress: order.shipping_address,
        platform: plat.label,
        trackingNumber: order.tracking_number,
        shippingProvider: order.shipping_provider,
        items: (order.items || []).map((i: any) => ({ name: i.product_name || '-', qty: i.quantity })),
        note: order.note,
      }],
    })
  }

  if (isLoading || !order) {
    return <Loader style={{ margin: '60px auto', display: 'block' }} />
  }

  const st = statusConfig[order.order_status] || statusConfig.pending
  const plat = platformConfig[order.platform] || platformConfig.other
  const StatusIcon = st.icon
  const PlatIcon = plat.icon
  const isEditable = order.order_status === 'pending'
  const canRollback = !!prevStatus[order.order_status]

  return (
    <Stack gap="lg">
      {/* ===== HEADER ===== */}
      <Group justify="space-between" align="flex-start">
        <Group gap="sm">
          <ActionIcon variant="light" size="lg" onClick={() => navigate('/orders')}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <div>
            <Group gap="sm" align="center">
              <Text size="xl" fw={800} ff="monospace">{order.order_number}</Text>
              <Badge color={st.color} variant="light" size="lg" leftSection={<StatusIcon size={14} />}>
                {st.label}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              ลูกค้า: {order.customer_name || '-'} • {fmtDate(order.created_at)}
            </Text>
          </div>
        </Group>
        <Group gap="sm">
          {/* Edit / Save buttons */}
          {isEditable && !editMode && (
            <>
              <Button variant="light" color="blue" leftSection={<IconEdit size={16} />} onClick={startEdit}>
                แก้ไข
              </Button>
              <Button variant="light" color="red" leftSection={<IconTrash size={16} />}
                onClick={() => setDeleteConfirm(true)}>
                ลบ
              </Button>
            </>
          )}
          {editMode && (
            <>
              <Button color="green" leftSection={<IconDeviceFloppy size={16} />}
                loading={saveMutation.isPending} onClick={handleSave}>
                บันทึก
              </Button>
              <Button variant="light" color="gray" leftSection={<IconX size={16} />} onClick={cancelEdit}>
                ยกเลิก
              </Button>
            </>
          )}
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Button variant="light" color="gray" leftSection={<IconPrinter size={16} />}>
                พิมพ์
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconFileInvoice size={14} />} onClick={handlePrint}>
                ใบส่งสินค้า / Invoice
              </Menu.Item>
              <Menu.Item leftSection={<IconFileBarcode size={14} />} onClick={handlePrintLabel}>
                ใบปะหน้าพัสดุ
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {/* ===== ORDER STATUS STEPPER ===== */}
      <div className="stat-card">
        <Text fw={700} mb="sm">ทางเดินเอกสาร</Text>
        <OrderStepper status={order.order_status}
          onStepClick={(stepStatus) => handleStatusChange(stepStatus)}
          isLoading={updateStatusMutation.isPending} />
      </div>

      {/* ===== ORDER INFO + SUMMARY ===== */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Left — Order Info */}
        <div className="stat-card">
          <Text fw={700} mb="md">ข้อมูลออเดอร์</Text>
          {editMode ? (
            <Stack gap="sm">
              <SimpleGrid cols={2}>
                <Select label="ช่องทาง" data={platformOptions} value={editPlatform}
                  onChange={(v) => setEditPlatform(v || 'facebook')} />
                <Select label="การชำระเงิน" data={paymentOptions} value={editPaymentMethod}
                  onChange={(v) => setEditPaymentMethod(v || 'transfer')} />
              </SimpleGrid>
              <TextInput label="หมายเหตุ" value={editNote}
                onChange={(e) => setEditNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติม" />
            </Stack>
          ) : (
            <>
              <SimpleGrid cols={2} spacing="sm">
                <div>
                  <Text size="xs" c="dimmed">เลขที่ออเดอร์</Text>
                  <Text fw={600} ff="monospace">{order.order_number}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">สถานะ</Text>
                  <Badge color={st.color} variant="light">{st.label}</Badge>
                </div>
                <div>
                  <Text size="xs" c="dimmed">ช่องทาง</Text>
                  <Badge color={plat.color} variant="light" leftSection={<PlatIcon size={12} />}>
                    {plat.label}
                  </Badge>
                </div>
                <div>
                  <Text size="xs" c="dimmed">การชำระเงิน</Text>
                  <Text fw={500}>{paymentLabels[order.payment_method] || order.payment_method}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">สถานะชำระเงิน</Text>
                  <Badge color={order.payment_status === 'confirmed' ? 'green' : 'yellow'} variant="light">
                    {order.payment_status === 'confirmed' ? '✅ ชำระแล้ว' : '⏳ รอชำระ'}
                  </Badge>
                </div>
                <div>
                  <Text size="xs" c="dimmed">วันที่สร้าง</Text>
                  <Text>{fmtDate(order.created_at)}</Text>
                </div>
              </SimpleGrid>
              {order.note && (
                <>
                  <Divider my="sm" />
                  <Text size="xs" c="dimmed">หมายเหตุ</Text>
                  <Text size="sm">{order.note}</Text>
                </>
              )}
            </>
          )}
        </div>

        {/* Right — Summary */}
        <div className="stat-card">
          <Text fw={700} mb="md">สรุปยอด</Text>
          <Stack gap={8}>
            <Group justify="space-between">
              <Text c="dimmed">จำนวนรายการ</Text>
              <Badge variant="light">
                {editMode ? editItems.filter(i => i.productId).length : (order.items?.length || 0)} รายการ
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">ยอดสินค้า</Text>
              <Text fw={600}>฿{fmt(editMode ? editItemsTotal : parseFloat(order.total_amount))}</Text>
            </Group>
            {(editMode ? editShippingCost > 0 : parseFloat(order.shipping_cost) > 0) && (
              <Group justify="space-between">
                <Text c="dimmed">ค่าจัดส่ง</Text>
                <Text fw={600}>฿{fmt(editMode ? editShippingCost : parseFloat(order.shipping_cost))}</Text>
              </Group>
            )}
            {(editMode ? editDiscountAmount > 0 : parseFloat(order.discount_amount) > 0) && (
              <Group justify="space-between">
                <Text c="dimmed">ส่วนลด</Text>
                <Text fw={600} c="red">-฿{fmt(editMode ? editDiscountAmount : parseFloat(order.discount_amount))}</Text>
              </Group>
            )}
            <Divider />
            <Group justify="space-between">
              <Text fw={800} size="lg">ยอดสุทธิ</Text>
              <Text fw={800} size="xl" c="green">฿{fmt(editMode ? editNetAmount : parseFloat(order.net_amount))}</Text>
            </Group>
            {editMode && (
              <>
                <Divider />
                <NumberInput label="ค่าจัดส่ง (บาท)" size="sm" min={0}
                  value={editShippingCost} onChange={(v) => setEditShippingCost(Number(v) || 0)} />
                <NumberInput label="ส่วนลดรวม (บาท)" size="sm" min={0}
                  value={editDiscountAmount} onChange={(v) => setEditDiscountAmount(Number(v) || 0)} />
              </>
            )}
          </Stack>
        </div>
      </SimpleGrid>

      {/* ===== CUSTOMER + ADDRESS ===== */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <div className="stat-card">
          <Group gap={8} mb="md">
            <IconUser size={18} color="#7c3aed" />
            <Text fw={700}>ข้อมูลลูกค้า</Text>
          </Group>
          {editMode ? (
            <SimpleGrid cols={2} spacing="sm">
              <TextInput label="ชื่อลูกค้า" value={editCustomerName}
                onChange={(e) => setEditCustomerName(e.target.value)} />
              <TextInput label="เบอร์โทร" value={editCustomerPhone}
                onChange={(e) => setEditCustomerPhone(e.target.value)} />
            </SimpleGrid>
          ) : (
            <SimpleGrid cols={2} spacing="sm">
              <div>
                <Text size="xs" c="dimmed">ชื่อลูกค้า</Text>
                <Text fw={600}>{order.customer_name || '-'}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">เบอร์โทร</Text>
                <Text fw={500}>{order.customer_phone || '-'}</Text>
              </div>
            </SimpleGrid>
          )}
        </div>

        <div className="stat-card">
          <Group gap={8} mb="md">
            <IconMapPin size={18} color="#0891b2" />
            <Text fw={700}>ที่อยู่จัดส่ง</Text>
          </Group>
          {editMode ? (
            <TextInput value={editShippingAddress}
              onChange={(e) => setEditShippingAddress(e.target.value)}
              placeholder="ที่อยู่จัดส่ง" />
          ) : (
            <>
              <Text size="sm" style={{ lineHeight: 1.8 }}>{order.shipping_address || '-'}</Text>
              {order.tracking_number && (
                <>
                  <Divider my="sm" />
                  <Group gap={8}>
                    <IconTruck size={16} color="var(--app-primary)" />
                    <div>
                      <Text size="xs" c="dimmed">หมายเลขพัสดุ</Text>
                      <Text fw={700} ff="monospace">{order.tracking_number}</Text>
                      {order.shipping_provider && <Text size="xs" c="dimmed">{order.shipping_provider}</Text>}
                    </div>
                  </Group>
                </>
              )}
            </>
          )}
        </div>
      </SimpleGrid>

      {/* ===== ITEMS TABLE ===== */}
      <div className="stat-card">
        <Group justify="space-between" mb="md">
          <Text fw={700}>📦 รายการสินค้า</Text>
          {editMode && (
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={addEditItem}>
              เพิ่มรายการ
            </Button>
          )}
        </Group>
        <div style={{ overflow: 'auto' }}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 50 }} ta="center">#</Table.Th>
                {editMode ? (
                  <>
                    <Table.Th style={{ minWidth: 280 }}>สินค้า</Table.Th>
                    <Table.Th ta="center" style={{ width: 110 }}>จำนวน</Table.Th>
                    <Table.Th ta="center" style={{ width: 140 }}>ราคาขาย/หน่วย</Table.Th>
                    <Table.Th ta="center" style={{ width: 130 }}>ส่วนลด</Table.Th>
                    <Table.Th ta="right" style={{ width: 130 }}>รวม</Table.Th>
                    <Table.Th ta="center" style={{ width: 50 }}></Table.Th>
                  </>
                ) : (
                  <>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>สินค้า</Table.Th>
                    <Table.Th ta="center">จำนวน</Table.Th>
                    <Table.Th ta="right">ราคา/หน่วย</Table.Th>
                    <Table.Th ta="right">ส่วนลด</Table.Th>
                    <Table.Th ta="right">รวม</Table.Th>
                  </>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {editMode ? (
                editItems.map((item: any, idx: number) => {
                  const lineTotal = item.unitPrice * item.quantity - item.discount
                  return (
                    <Table.Tr key={idx}>
                      <Table.Td ta="center"><Text size="sm" c="dimmed">{idx + 1}</Text></Table.Td>
                      <Table.Td>
                        <Select data={productOptions} value={item.productId} searchable size="sm"
                          placeholder="🔍 เลือกสินค้า" nothingFoundMessage="ไม่พบ"
                          onChange={(v) => {
                            const prod = products?.find((p: any) => String(p.id) === v)
                            updateEditItem(idx, {
                              productId: v || '',
                              unitPrice: prod ? parseFloat(prod.selling_price) : 0,
                            })
                          }} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput min={1} value={item.quantity} hideControls size="sm"
                          onChange={(v) => updateEditItem(idx, { quantity: Number(v) || 1 })}
                          styles={{ input: { textAlign: 'center' } }} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput min={0} decimalScale={2} value={item.unitPrice} hideControls size="sm"
                          thousandSeparator=","
                          onChange={(v) => updateEditItem(idx, { unitPrice: Number(v) || 0 })}
                          styles={{ input: { textAlign: 'center' } }} />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput min={0} decimalScale={2} value={item.discount} hideControls size="sm"
                          thousandSeparator=","
                          onChange={(v) => updateEditItem(idx, { discount: Number(v) || 0 })}
                          styles={{ input: { textAlign: 'center' } }} />
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text fw={600}>฿{fmt(lineTotal)}</Text>
                      </Table.Td>
                      <Table.Td ta="center">
                        {editItems.length > 1 && (
                          <ActionIcon size="sm" variant="light" color="red" onClick={() => removeEditItem(idx)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  )
                })
              ) : (
                <>
                  {order.items?.map((item: any, idx: number) => (
                    <Table.Tr key={item.id}>
                      <Table.Td ta="center"><Text size="sm" c="dimmed">{idx + 1}</Text></Table.Td>
                      <Table.Td><Text size="sm" fw={600} ff="monospace">{item.sku}</Text></Table.Td>
                      <Table.Td><Text size="sm">{item.product_name}</Text></Table.Td>
                      <Table.Td ta="center"><Text size="sm">{item.quantity}</Text></Table.Td>
                      <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(item.unit_price))}</Text></Table.Td>
                      <Table.Td ta="right">
                        {parseFloat(item.discount || 0) > 0 ? (
                          <Text size="sm" c="red">-฿{fmt(parseFloat(item.discount))}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">-</Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(parseFloat(item.subtotal))}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                  {(!order.items || order.items.length === 0) && (
                    <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" size="sm">ไม่มีรายการ</Text></Table.Td></Table.Tr>
                  )}
                </>
              )}
            </Table.Tbody>
          </Table>
        </div>
        {editMode && (
          <Button variant="subtle" size="xs" mt="sm" leftSection={<IconPlus size={14} />} onClick={addEditItem}
            style={{ alignSelf: 'flex-start' }}>
            เพิ่มรายการ
          </Button>
        )}
      </div>

      {/* ===== LINKED SALE ===== */}
      {order.sale_id && (
        <div className="stat-card" style={{
          background: 'rgba(5,150,105,0.06)',
          border: '1px solid rgba(5,150,105,0.2)',
        }}>
          <Group gap={8}>
            <IconFileInvoice size={18} color="var(--app-success)" />
            <Text fw={600} c="green">เชื่อมกับรายการขาย ID: {order.sale_id}</Text>
            <IconArrowRight size={14} color="var(--app-success)" />
          </Group>
        </div>
      )}

      {/* ===== CREDIT NOTE (ใบลดหนี้) ===== */}
      {order.order_status === 'returned' && creditNote && (
        <div id="credit-note-section" className="stat-card" style={{
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <Group gap={8} mb="md">
            <Text size="lg">📄</Text>
            <Text fw={700} c="red" size="lg">ใบลดหนี้ (Credit Note)</Text>
          </Group>
          <SimpleGrid cols={2} spacing="sm" mb="md">
            <div>
              <Text size="xs" c="dimmed">เลขที่ใบลดหนี้</Text>
              <Text fw={700} ff="monospace" c="red">{creditNote.credit_note_number}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">สาเหตุ</Text>
              <Text fw={500}>{creditNote.reason || '-'}</Text>
            </div>
          </SimpleGrid>
          {creditNote.items?.length > 0 && (
            <Table striped highlightOnHover withTableBorder withColumnBorders mb="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>สินค้า</Table.Th>
                  <Table.Th ta="center">จำนวน</Table.Th>
                  <Table.Th ta="right">ราคา/หน่วย</Table.Th>
                  <Table.Th ta="right">ส่วนลด</Table.Th>
                  <Table.Th ta="right">รวม</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {creditNote.items.map((item: any, idx: number) => (
                  <Table.Tr key={idx}>
                    <Table.Td><Text size="sm">{item.product_name || `สินค้า #${item.product_id}`}</Text></Table.Td>
                    <Table.Td ta="center"><Text size="sm">{item.quantity}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm">{fmt(parseFloat(item.unit_price))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm">{fmt(parseFloat(item.discount || 0))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" fw={600} c="red">{fmt(parseFloat(item.subtotal))}</Text></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
          <Divider mb="sm" />
          <Group justify="flex-end">
            <div style={{ textAlign: 'right' }}>
              <Text size="sm" c="dimmed">ยอดคืนเงินทั้งสิ้น</Text>
              <Text size="xl" fw={800} c="red">฿{fmt(parseFloat(creditNote.net_amount))}</Text>
            </div>
          </Group>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      {/* ===== Modal: ยืนยันชำระเงิน ===== */}
      <Modal opened={paymentModalOpen} onClose={() => setPaymentModalOpen(false)}
        title="ยืนยันการชำระเงิน" size="lg" centered>
        <Stack gap="md">
          {/* ยอดที่ต้องชำระ */}
          <Card padding="md" radius="md" withBorder
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)', border: 'none' }}>
            <Group justify="space-between">
              <Text size="sm" c="rgba(255,255,255,0.8)" fw={600}>ยอดที่ต้องชำระ</Text>
              <Text size="xl" fw={800} c="white">฿{fmt(payAmount)}</Text>
            </Group>
          </Card>

          {/* เลือกช่องทางชำระเงิน */}
          <div>
            <Text size="sm" fw={600} mb={8}>เลือกช่องทางชำระเงิน <Text span c="red">*</Text></Text>
            {paymentChannels.length === 0 ? (
              <Card padding="md" radius="md" withBorder>
                <Text ta="center" c="dimmed" size="sm">ยังไม่มีช่องทางชำระเงิน — กรุณาเพิ่มในหน้า "กระเป๋าเงิน" ก่อน</Text>
              </Card>
            ) : (
              <SimpleGrid cols={2} spacing="sm">
                {paymentChannels.map((ch: any) => {
                  const isSelected = payChannelId === String(ch.id)
                  const typeLabel = ch.type === 'cash' ? 'เงินสด' : ch.type === 'transfer' ? 'โอนเงิน' :
                    ch.type === 'credit_card' ? 'บัตรเครดิต' : ch.type === 'qr_code' ? 'QR Code' : ch.type
                  const typeColor = ch.type === 'cash' ? '#059669' : ch.type === 'transfer' ? '#3b82f6' :
                    ch.type === 'credit_card' ? '#8b5cf6' : ch.type === 'qr_code' ? '#06b6d4' : '#6b7280'

                  return (
                    <Card key={ch.id} padding="sm" radius="md" withBorder
                      onClick={() => setPayChannelId(String(ch.id))}
                      style={{
                        cursor: 'pointer',
                        border: isSelected ? `2px solid ${typeColor}` : '1px solid var(--app-border)',
                        background: isSelected ? `${typeColor}08` : 'var(--app-surface)',
                        transition: 'all 0.2s',
                      }}>
                      <Group gap={10} wrap="nowrap">
                        {/* Color dot */}
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                          background: isSelected ? typeColor : `${typeColor}20`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isSelected ? '#fff' : typeColor, fontWeight: 800, fontSize: 14,
                          transition: 'all 0.2s',
                        }}>
                          {ch.type === 'cash' ? '฿' : ch.type === 'transfer' ? '🏦' :
                           ch.type === 'credit_card' ? '💳' : ch.type === 'qr_code' ? '📱' : '💰'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={700} lineClamp={1}>{ch.name}</Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {ch.bank_name ? `${ch.bank_name}` : typeLabel}
                            {ch.account_number ? ` • ${ch.account_number}` : ''}
                          </Text>
                          {ch.account_name && (
                            <Text size="xs" c="dimmed" lineClamp={1}>{ch.account_name}</Text>
                          )}
                        </div>
                        {/* Check mark */}
                        {isSelected && (
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: typeColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
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

          {/* หมายเลขอ้างอิง */}
          <TextInput label="หมายเลขอ้างอิง / สลิป" placeholder="เช่น เลขที่สลิปโอนเงิน, หมายเลข transaction"
            value={payReference} onChange={(e) => setPayReference(e.target.value)} />

          <Group justify="flex-end" mt="sm">
            <Button variant="light" onClick={() => setPaymentModalOpen(false)}>ยกเลิก</Button>
            <Button color="green" leftSection={<IconCheck size={16} />}
              loading={updateStatusMutation.isPending}
              disabled={!payChannelId}
              onClick={handleConfirmPayment}>
              ยืนยันชำระเงิน
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ===== Modal: จัดส่งสินค้า ===== */}
      <Modal opened={shippingModalOpen} onClose={() => setShippingModalOpen(false)}
        title="บันทึกการจัดส่ง" size="md" centered>
        <Stack gap="md">
          <TextInput label="หมายเลข Tracking" placeholder="เช่น TH12345678"
            value={shipTracking} onChange={(e) => setShipTracking(e.target.value)} />

          <div>
            <Text size="sm" fw={600} mb={8}>บริษัทขนส่ง</Text>
            <SimpleGrid cols={2} spacing="xs">
              {[
                { value: 'Kerry Express', short: 'KEX', bg: '#f97316', text: '#fff' },
                { value: 'Flash Express', short: 'FL', bg: '#eab308', text: '#fff' },
                { value: 'J&T Express', short: 'J&T', bg: '#ef4444', text: '#fff' },
                { value: 'ไปรษณีย์ไทย', short: 'THP', bg: '#dc2626', text: '#fff' },
                { value: 'Ninja Van', short: 'NV', bg: '#cd2027', text: '#fff' },
                { value: 'DHL', short: 'DHL', bg: '#ffcc00', text: '#c00' },
                { value: 'SCG Express', short: 'SCG', bg: '#1e40af', text: '#fff' },
                { value: 'Best Express', short: 'BST', bg: '#f97316', text: '#fff' },
                { value: 'SPX Express', short: 'SPX', bg: '#ee4d2d', text: '#fff' },
                { value: 'อื่นๆ', short: '...', bg: '#6b7280', text: '#fff' },
              ].map(sp => {
                const isSelected = shipProvider === sp.value
                return (
                  <Card key={sp.value} padding="xs" radius="md" withBorder
                    onClick={() => setShipProvider(isSelected ? '' : sp.value)}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? `2px solid ${sp.bg}` : '1px solid var(--app-border)',
                      background: isSelected ? `${sp.bg}0a` : 'var(--app-surface)',
                      transition: 'all 0.15s',
                    }}>
                    <Group gap={10} wrap="nowrap">
                      <div style={{
                        width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                        background: sp.bg, color: sp.text,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: sp.short.length > 2 ? 11 : 14,
                        letterSpacing: -0.5,
                      }}>
                        {sp.short}
                      </div>
                      <Text size="sm" fw={isSelected ? 700 : 500} style={{ flex: 1 }}>{sp.value}</Text>
                      {isSelected && (
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          background: sp.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <IconCheck size={13} color="#fff" />
                        </div>
                      )}
                    </Group>
                  </Card>
                )
              })}
            </SimpleGrid>
          </div>

          <Group justify="flex-end" mt="sm">
            <Button variant="light" onClick={() => setShippingModalOpen(false)}>ยกเลิก</Button>
            <Button color="indigo" leftSection={<IconTruckDelivery size={16} />}
              loading={updateStatusMutation.isPending}
              onClick={handleConfirmShipping}>
              บันทึกจัดส่ง
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ===== Modal: ลบออเดอร์ ===== */}
      <Modal opened={deleteConfirm} onClose={() => setDeleteConfirm(false)}
        title="ยืนยันการลบ" size="sm" centered>
        <Stack gap="md">
          <Text>ต้องการลบออเดอร์ <Text span fw={700} ff="monospace">{order.order_number}</Text> ?</Text>
          <Text size="sm" c="red">การลบจะไม่สามารถย้อนกลับได้</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteConfirm(false)}>ยกเลิก</Button>
            <Button color="red" leftSection={<IconTrash size={16} />}
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}>
              ลบออเดอร์
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

