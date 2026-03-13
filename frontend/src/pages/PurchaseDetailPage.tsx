import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Table, Button, TextInput, Group, Modal, Stack, NumberInput, Select,
  Text, Badge, Loader, SimpleGrid, ActionIcon, Tooltip, Divider, Paper
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconArrowLeft, IconCheck, IconX, IconPackageImport, IconCreditCard,
  IconClipboardList, IconFileInvoice, IconCash, IconPrinter,
  IconEdit, IconTrash, IconPlus, IconDeviceFloppy, IconArrowBackUp
} from '@tabler/icons-react'
import api from '../services/api'

const PO_STATUSES: Record<string, { label: string; color: string }> = {
  draft: { label: 'ฉบับร่าง', color: 'gray' },
  approved: { label: 'รอรับสินค้า', color: 'blue' },
  partial: { label: 'รับบางส่วน', color: 'orange' },
  received: { label: 'รับครบแล้ว', color: 'teal' },
  invoiced: { label: 'แจ้งหนี้แล้ว', color: 'violet' },
  paid: { label: 'จ่ายครบแล้ว', color: 'green' },
  cancelled: { label: 'ยกเลิก', color: 'red' },
}

const INV_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: 'รอชำระ', color: 'orange' },
  partial: { label: 'ชำระบางส่วน', color: 'blue' },
  paid: { label: 'ชำระครบ', color: 'green' },
}

const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '-'
const fmtDateFull = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'
const toInputDate = (d: string) => d ? new Date(d).toISOString().slice(0, 10) : ''

export default function PurchaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // --- Data ---
  const { data: poDetail, isLoading } = useQuery({
    queryKey: ['po-detail', id],
    queryFn: () => api.get(`/purchases/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: timeline } = useQuery({
    queryKey: ['po-timeline', id],
    queryFn: () => api.get(`/purchases/${id}/timeline`).then(r => r.data),
    enabled: !!id,
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  const { data: vendors } = useQuery({
    queryKey: ['contacts-vendors'],
    queryFn: () => api.get('/contacts', { params: { type: 'vendor' } }).then(r => r.data),
  })

  const { data: products } = useQuery({
    queryKey: ['products-for-po'],
    queryFn: () => api.get('/products').then(r => r.data),
  })

  // --- Edit Mode ---
  const [editMode, setEditMode] = useState(false)
  const [editContactId, setEditContactId] = useState('')
  const [editOrderDate, setEditOrderDate] = useState('')
  const [editExpectedDate, setEditExpectedDate] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editItems, setEditItems] = useState<any[]>([])

  const isEditable = poDetail && ['draft', 'approved'].includes(poDetail.status)
  const isDeletable = poDetail?.status === 'draft'

  const startEdit = () => {
    if (!poDetail) return
    setEditContactId(String(poDetail.contact_id))
    setEditOrderDate(toInputDate(poDetail.order_date))
    setEditExpectedDate(toInputDate(poDetail.expected_date))
    setEditNote(poDetail.note || '')
    setEditItems(poDetail.items.map((item: any) => ({
      productId: item.product_id,
      productName: item.product_name,
      sku: item.sku,
      quantity: item.quantity,
      unitCost: parseFloat(item.unit_cost),
    })))
    setEditMode(true)
  }

  const cancelEdit = () => {
    setEditMode(false)
  }

  const addEditItem = () => {
    setEditItems([...editItems, { productId: '', productName: '', sku: '', quantity: 1, unitCost: 0 }])
  }

  const removeEditItem = (idx: number) => {
    setEditItems(editItems.filter((_, i) => i !== idx))
  }

  const updateEditItem = (idx: number, field: string, value: any) => {
    const updated = [...editItems]
    updated[idx] = { ...updated[idx], [field]: value }
    if (field === 'productId' && products) {
      const p = products.find((pr: any) => String(pr.id) === String(value))
      if (p) {
        updated[idx].productName = p.name
        updated[idx].sku = p.sku
        updated[idx].unitCost = parseFloat(p.cost_price) || 0
      }
    }
    setEditItems(updated)
  }

  const editSubtotal = useMemo(() => editItems.reduce((s, i) => s + (i.quantity * i.unitCost), 0), [editItems])
  const editVat = editSubtotal * 0.07
  const editTotal = editSubtotal + editVat

  // --- Save Mutation ---
  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put(`/purchases/${id}`, data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'แก้ไขใบสั่งซื้อสำเร็จ', color: 'green' })
      setEditMode(false)
      queryClient.invalidateQueries({ queryKey: ['po-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถแก้ไขได้', color: 'red' }),
  })

  // --- Delete ---
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/purchases/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบใบสั่งซื้อสำเร็จ', color: 'green' })
      navigate('/purchases')
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' }),
  })

  // --- Revert ---
  const [revertConfirm, setRevertConfirm] = useState(false)
  const revertLabels: Record<string, string> = {
    approved: 'ย้อนกลับเป็น: ฉบับร่าง',
    partial: 'ย้อนกลับเป็น: อนุมัติแล้ว (ลบ GRN + สต๊อก)',
    received: 'ย้อนกลับเป็น: อนุมัติแล้ว (ลบ GRN + สต๊อก)',
    invoiced: 'ย้อนกลับเป็น: อนุมัติแล้ว (ลบ Invoice + GRN + สต๊อก)',
    paid: 'ย้อนกลับเป็น: แจ้งหนี้แล้ว (ลบประวัติชำระ)',
  }
  const canRevert = poDetail && !['draft', 'cancelled'].includes(poDetail?.status || '')

  const revertMutation = useMutation({
    mutationFn: () => api.post(`/purchases/${id}/revert`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ย้อนสถานะสำเร็จ', color: 'green' })
      setRevertConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['po-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['po-timeline', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถย้อนสถานะได้', color: 'red' }),
  })

  // --- Status Mutation ---
  const statusMutation = useMutation({
    mutationFn: ({ status }: { status: string }) => api.put(`/purchases/${id}/status`, { status }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'อัพเดตสถานะสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['po-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['po-timeline', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })

  // --- Receive Modal ---
  const [receiveModal, setReceiveModal] = useState(false)
  const [receiveWarehouseId, setReceiveWarehouseId] = useState('')
  const [receiveNote, setReceiveNote] = useState('')
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('')
  const [dueDate, setDueDate] = useState('')

  const receiveItemsReady = useMemo(() => {
    if (!poDetail?.items) return []
    return poDetail.items.map((item: any) => ({
      poItemId: item.id, productId: item.product_id, productName: item.product_name,
      sku: item.sku, ordered: item.quantity, alreadyReceived: item.received_quantity,
      remaining: item.quantity - item.received_quantity,
      receivedQuantity: item.quantity - item.received_quantity,
      costPerUnit: parseFloat(item.unit_cost),
    }))
  }, [poDetail])

  const receiveMutation = useMutation({
    mutationFn: (data: any) => api.post('/purchases/receipts', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `รับสินค้า: ${res.data.grnNumber}${res.data.invoiceNumber ? ` + Invoice: ${res.data.invoiceNumber}` : ''}`, color: 'green' })
      setReceiveModal(false)
      queryClient.invalidateQueries({ queryKey: ['po-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['po-timeline', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถรับสินค้าได้', color: 'red' }),
  })

  // --- Pay Modal ---
  const [payModal, setPayModal] = useState(false)
  const [payInvoiceId, setPayInvoiceId] = useState('')
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('transfer')
  const [payRef, setPayRef] = useState('')
  const [payBank, setPayBank] = useState('')
  const [payNote, setPayNote] = useState('')

  const payMutation = useMutation({
    mutationFn: (data: any) => api.post('/purchases/payments', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'บันทึกการชำระเงินสำเร็จ', color: 'green' })
      setPayModal(false)
      queryClient.invalidateQueries({ queryKey: ['po-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['po-timeline', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ผิดพลาด', color: 'red' }),
  })

  if (isLoading || !poDetail) {
    return <Loader style={{ margin: '60px auto', display: 'block' }} />
  }

  const st = PO_STATUSES[poDetail.status] || PO_STATUSES.draft

  return (
    <Stack gap="lg">
      {/* ===== HEADER ===== */}
      <Group justify="space-between" align="flex-start">
        <Group gap="sm">
          <ActionIcon variant="light" size="lg" onClick={() => navigate('/purchases')}>
            <IconArrowLeft size={20} />
          </ActionIcon>
          <div>
            <Group gap="sm" align="center">
              <Text size="xl" fw={800} ff="monospace">{poDetail.po_number}</Text>
              <Badge color={st.color} variant="light" size="lg">{st.label}</Badge>
            </Group>
            <Text size="sm" c="dimmed">ผู้ขาย: {poDetail.contact_name}</Text>
          </div>
        </Group>
        <Group>
          {/* Edit / Delete buttons (draft or approved only) */}
          {isEditable && !editMode && (
            <>
              <Button variant="light" color="blue" leftSection={<IconEdit size={16} />}
                onClick={startEdit}>
                แก้ไข
              </Button>
              {isDeletable && (
                <Button variant="light" color="red" leftSection={<IconTrash size={16} />}
                  onClick={() => setDeleteConfirm(true)}>
                  ลบ
                </Button>
              )}
            </>
          )}
          {editMode && (
            <>
              <Button color="green" leftSection={<IconDeviceFloppy size={16} />}
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate({
                  contactId: parseInt(editContactId),
                  orderDate: editOrderDate,
                  expectedDate: editExpectedDate || null,
                  note: editNote,
                  items: editItems.filter(i => i.productId).map(i => ({
                    productId: parseInt(i.productId), quantity: i.quantity, unitCost: i.unitCost,
                  })),
                })}>
                บันทึก
              </Button>
              <Button variant="light" color="gray" leftSection={<IconX size={16} />}
                onClick={cancelEdit}>
                ยกเลิก
              </Button>
            </>
          )}
          {/* Status action buttons */}
          {!editMode && poDetail.status === 'draft' && (
            <Button variant="light" color="green" leftSection={<IconCheck size={16} />}
              onClick={() => statusMutation.mutate({ status: 'approved' })} loading={statusMutation.isPending}>
              อนุมัติ
            </Button>
          )}
          {/* Revert button */}
          {!editMode && canRevert && (
            <Button variant="light" color="orange" leftSection={<IconArrowBackUp size={16} />}
              onClick={() => setRevertConfirm(true)}>
              ย้อนสถานะ
            </Button>
          )}
        </Group>
      </Group>

      {/* ===== DOCUMENT STEPPER ===== */}
      <div className="stat-card">
        <Text fw={700} mb="sm">ทางเดินเอกสาร</Text>
        <DocumentStepper status={poDetail.status} onStepClick={(stepKey) => {
          if (stepKey === 'po' && poDetail.status === 'draft') {
            statusMutation.mutate({ status: 'approved' })
          } else if (stepKey === 'grn' && ['approved', 'partial'].includes(poDetail.status)) {
            setReceiveNote(''); setTaxInvoiceNumber(''); setDueDate('');
            setReceiveWarehouseId(warehouses?.[0]?.id ? String(warehouses[0].id) : '')
            setReceiveModal(true)
          } else if (stepKey === 'inv' && ['approved', 'partial'].includes(poDetail.status)) {
            setReceiveNote(''); setTaxInvoiceNumber(''); setDueDate('');
            setReceiveWarehouseId(warehouses?.[0]?.id ? String(warehouses[0].id) : '')
            setReceiveModal(true)
          } else if (stepKey === 'pay' && poDetail.status === 'invoiced') {
            // Auto-select the first unpaid invoice from this PO
            const unpaidInv = timeline?.invoices?.find((i: any) => i.status !== 'paid')
            if (unpaidInv) {
              const remaining = parseFloat(unpaidInv.total_amount) - parseFloat(unpaidInv.paid_amount)
              setPayInvoiceId(String(unpaidInv.id))
              setPayAmount(remaining)
            } else {
              setPayInvoiceId(''); setPayAmount(0)
            }
            setPayMethod('transfer'); setPayRef(''); setPayBank(''); setPayNote('')
            setPayModal(true)
          }
        }} />
      </div>

      {/* ===== PO INFO + SUMMARY ===== */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Left - PO Info */}
        <div className="stat-card">
          <Text fw={700} mb="md">ข้อมูลใบสั่งซื้อ</Text>
          {editMode ? (
            <Stack gap="sm">
              <Select label="ผู้ขาย *" required
                data={(vendors || []).map((c: any) => ({ value: String(c.id), label: c.name }))}
                value={editContactId} onChange={(v) => setEditContactId(v || '')} searchable />
              <Group grow>
                <TextInput label="วันที่สั่งซื้อ" type="date" value={editOrderDate}
                  onChange={(e) => setEditOrderDate(e.target.value)} />
                <TextInput label="กำหนดรับสินค้า" type="date" value={editExpectedDate}
                  onChange={(e) => setEditExpectedDate(e.target.value)} />
              </Group>
              <TextInput label="หมายเหตุ" value={editNote}
                onChange={(e) => setEditNote(e.target.value)} />
            </Stack>
          ) : (
            <>
              <SimpleGrid cols={2} spacing="sm">
                <div>
                  <Text size="xs" c="dimmed">เลขที่ PO</Text>
                  <Text fw={600} ff="monospace">{poDetail.po_number}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">สถานะ</Text>
                  <Badge color={st.color} variant="light">{st.label}</Badge>
                </div>
                <div>
                  <Text size="xs" c="dimmed">ผู้ขาย</Text>
                  <Text fw={600}>{poDetail.contact_name}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">รหัสผู้ติดต่อ</Text>
                  <Text ff="monospace">CON-{String(poDetail.contact_id).padStart(5, '0')}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">วันที่สั่งซื้อ</Text>
                  <Text>{fmtDateFull(poDetail.order_date)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">กำหนดรับสินค้า</Text>
                  <Text>{fmtDateFull(poDetail.expected_date)}</Text>
                </div>
              </SimpleGrid>
              {poDetail.note && (
                <>
                  <Divider my="sm" />
                  <Text size="xs" c="dimmed">หมายเหตุ</Text>
                  <Text size="sm">{poDetail.note}</Text>
                </>
              )}
            </>
          )}
        </div>

        {/* Right - Summary */}
        <div className="stat-card">
          <Text fw={700} mb="md">สรุปยอด</Text>
          <Stack gap={8}>
            <Group justify="space-between">
              <Text c="dimmed">จำนวนรายการ</Text>
              <Badge variant="light">{editMode ? editItems.filter(i => i.productId).length : (poDetail.items?.length || 0)} รายการ</Badge>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">ยอดรวมก่อน VAT</Text>
              <Text fw={600}>฿{fmt(editMode ? editSubtotal : parseFloat(poDetail.subtotal))}</Text>
            </Group>
            <Group justify="space-between">
              <Text c="dimmed">VAT 7%</Text>
              <Text fw={600}>฿{fmt(editMode ? editVat : parseFloat(poDetail.vat_amount))}</Text>
            </Group>
            <Divider />
            <Group justify="space-between">
              <Text fw={800} size="lg">ยอดสุทธิ</Text>
              <Text fw={800} size="xl" c="green">฿{fmt(editMode ? editTotal : parseFloat(poDetail.total_amount))}</Text>
            </Group>
          </Stack>
        </div>
      </SimpleGrid>

      {/* ===== ITEMS TABLE ===== */}
      <div className="stat-card">
        <Group justify="space-between" mb="md">
          <Text fw={700}>รายการสินค้า</Text>
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
                    <Table.Th style={{ minWidth: 200 }}>สินค้า</Table.Th>
                    <Table.Th ta="center" style={{ width: 100 }}>จำนวน</Table.Th>
                    <Table.Th ta="right" style={{ width: 130 }}>ราคา/หน่วย</Table.Th>
                    <Table.Th ta="right" style={{ width: 130 }}>รวม</Table.Th>
                    <Table.Th ta="center" style={{ width: 60 }}></Table.Th>
                  </>
                ) : (
                  <>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>สินค้า</Table.Th>
                    <Table.Th ta="center">สั่ง</Table.Th>
                    <Table.Th ta="center">รับแล้ว</Table.Th>
                    <Table.Th ta="right">ราคา/หน่วย</Table.Th>
                    <Table.Th ta="right">รวม</Table.Th>
                  </>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {editMode ? (
                editItems.map((item, idx) => (
                  <Table.Tr key={idx}>
                    <Table.Td ta="center"><Text size="sm" c="dimmed">{idx + 1}</Text></Table.Td>
                    <Table.Td>
                      <Select size="xs" placeholder="เลือกสินค้า" searchable
                        data={(products || []).map((p: any) => ({ value: String(p.id), label: `${p.sku} - ${p.name}` }))}
                        value={item.productId ? String(item.productId) : null}
                        onChange={(v) => updateEditItem(idx, 'productId', v)} />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" min={1} value={item.quantity}
                        onChange={(v) => updateEditItem(idx, 'quantity', Number(v) || 1)} />
                    </Table.Td>
                    <Table.Td>
                      <NumberInput size="xs" min={0} decimalScale={2} prefix="฿" value={item.unitCost}
                        onChange={(v) => updateEditItem(idx, 'unitCost', Number(v) || 0)} />
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600}>฿{fmt(item.quantity * item.unitCost)}</Text>
                    </Table.Td>
                    <Table.Td ta="center">
                      <ActionIcon size="sm" variant="light" color="red" onClick={() => removeEditItem(idx)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                poDetail.items?.map((item: any, idx: number) => (
                  <Table.Tr key={item.id}>
                    <Table.Td ta="center"><Text size="sm" c="dimmed">{idx + 1}</Text></Table.Td>
                    <Table.Td><Text size="sm" fw={600} ff="monospace">{item.sku}</Text></Table.Td>
                    <Table.Td><Text size="sm">{item.product_name}</Text></Table.Td>
                    <Table.Td ta="center"><Text size="sm">{item.quantity}</Text></Table.Td>
                    <Table.Td ta="center">
                      <Badge
                        color={item.received_quantity >= item.quantity ? 'green' : item.received_quantity > 0 ? 'orange' : 'gray'}
                        variant="light">
                        {item.received_quantity}/{item.quantity}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(item.unit_cost))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(parseFloat(item.subtotal))}</Text></Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </div>
      </div>

      {/* ===== DOCUMENT TIMELINE ===== */}
      {timeline && !editMode && (
        <div className="stat-card">
          <Text fw={700} mb="md">📁 ประวัติเอกสาร</Text>
          <Stack gap="sm">
            {timeline.grns?.map((g: any) => (
              <Paper key={`grn-${g.id}`} p="md" radius="md" withBorder
                style={{ borderLeft: '4px solid #2563eb' }}>
                <Group justify="space-between">
                  <Group gap="sm">
                    <Text size="lg">📥</Text>
                    <div>
                      <Text size="sm" fw={700} ff="monospace">{g.grn_number}</Text>
                      <Text size="xs" c="dimmed">ใบรับสินค้า</Text>
                    </div>
                  </Group>
                  <div style={{ textAlign: 'right' }}>
                    <Text size="sm">{fmtDateFull(g.received_date)}</Text>
                    <Text size="xs" c="dimmed">{g.warehouse_name}</Text>
                  </div>
                </Group>
              </Paper>
            ))}

            {timeline.invoices?.map((inv: any) => {
              const invSt = INV_STATUSES[inv.status] || INV_STATUSES.pending
              const remaining = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount)
              return (
                <Paper key={`inv-${inv.id}`} p="md" radius="md" withBorder
                  style={{ borderLeft: '4px solid #7c3aed' }}>
                  <Group justify="space-between">
                    <Group gap="sm">
                      <Text size="lg">📄</Text>
                      <div>
                        <Group gap="xs">
                          <Text size="sm" fw={700} ff="monospace">{inv.invoice_number}</Text>
                          <Badge color={invSt.color} variant="light" size="sm">{invSt.label}</Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          ใบแจ้งหนี้{inv.tax_invoice_number ? ` • Tax: ${inv.tax_invoice_number}` : ''}
                        </Text>
                      </div>
                    </Group>
                    <div style={{ textAlign: 'right' }}>
                      <Text size="sm" fw={700}>฿{fmt(parseFloat(inv.total_amount))}</Text>
                      {remaining > 0 && inv.status !== 'paid' && (
                        <Text size="xs" c="orange">ค้าง ฿{fmt(remaining)}</Text>
                      )}
                      {inv.due_date && (
                        <Text size="xs" c={new Date(inv.due_date) < new Date() && inv.status !== 'paid' ? 'red' : 'dimmed'}>
                          ครบกำหนด {fmtDate(inv.due_date)}
                        </Text>
                      )}
                    </div>
                  </Group>
                </Paper>
              )
            })}

            {timeline.payments?.map((p: any) => (
              <Paper key={`pay-${p.id}`} p="md" radius="md" withBorder
                style={{ borderLeft: '4px solid #059669' }}>
                <Group justify="space-between">
                  <Group gap="sm">
                    <Text size="lg">💰</Text>
                    <div>
                      <Text size="sm" fw={700} ff="monospace">{p.payment_number}</Text>
                      <Text size="xs" c="dimmed">
                        ชำระเงิน • {p.payment_method === 'transfer' ? '🏦 โอน' : p.payment_method === 'cash' ? '💵 เงินสด' : '📝 เช็ค'}
                        {p.reference_number ? ` • Ref: ${p.reference_number}` : ''}
                      </Text>
                    </div>
                  </Group>
                  <div style={{ textAlign: 'right' }}>
                    <Text size="sm" fw={700} c="green">฿{fmt(parseFloat(p.amount))}</Text>
                    <Text size="xs" c="dimmed">{fmtDateFull(p.payment_date)}</Text>
                  </div>
                </Group>
              </Paper>
            ))}

            {!timeline.grns?.length && !timeline.invoices?.length && !timeline.payments?.length && (
              <Text c="dimmed" ta="center" py="md">ยังไม่มีเอกสารที่เกี่ยวข้อง</Text>
            )}
          </Stack>
        </div>
      )}

      {/* ===== DELETE CONFIRMATION MODAL ===== */}
      <Modal opened={deleteConfirm} onClose={() => setDeleteConfirm(false)}
        title="⚠️ ยืนยันการลบ" size="sm">
        <Stack gap="md">
          <Text>คุณต้องการลบใบสั่งซื้อ <Text span fw={700} ff="monospace">{poDetail.po_number}</Text> ใช่หรือไม่?</Text>
          <Text size="sm" c="red">การลบจะไม่สามารถย้อนกลับได้</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteConfirm(false)}>ยกเลิก</Button>
            <Button color="red" leftSection={<IconTrash size={16} />}
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}>
              ลบใบสั่งซื้อ
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ===== REVERT CONFIRMATION MODAL ===== */}
      <Modal opened={revertConfirm} onClose={() => setRevertConfirm(false)}
        title="⚠️ ย้อนสถานะเอกสาร" size="sm">
        <Stack gap="md">
          <Text>ต้องการย้อนสถานะ <Text span fw={700} ff="monospace">{poDetail.po_number}</Text>?</Text>
          <Paper p="sm" radius="md" withBorder style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
            <Text size="sm" fw={600} c="orange.8">{revertLabels[poDetail.status] || 'ย้อนสถานะ'}</Text>
          </Paper>
          <Text size="xs" c="dimmed">เอกสารที่ถูกลบจะไม่สามารถกู้คืนได้ กรุณาตรวจสอบก่อนดำเนินการ</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setRevertConfirm(false)}>ยกเลิก</Button>
            <Button color="orange" leftSection={<IconArrowBackUp size={16} />}
              loading={revertMutation.isPending}
              onClick={() => revertMutation.mutate()}>
              ย้อนสถานะ
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ===== RECEIVE GOODS + INVOICE MODAL ===== */}
      <Modal opened={receiveModal} onClose={() => setReceiveModal(false)}
        title={`📥 รับสินค้า + ใบแจ้งหนี้: ${poDetail.po_number}`} size="xl">
        <Stack gap="md">
          <Select label="คลังสินค้าที่รับเข้า *" required
            data={(warehouses || []).map((w: any) => ({ value: String(w.id), label: w.name }))}
            value={receiveWarehouseId} onChange={(v) => setReceiveWarehouseId(v || '')} />

          <Divider label="📄 ข้อมูลใบแจ้งหนี้ / ใบกำกับภาษี" />
          <Group grow>
            <TextInput label="เลขใบกำกับภาษี" placeholder="เช่น IV-2024-0001"
              value={taxInvoiceNumber} onChange={(e) => setTaxInvoiceNumber(e.target.value)} />
            <TextInput label="วันครบกำหนดชำระ" type="date"
              value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Group>

          <Divider label="📦 รายการสินค้า" />
          {receiveItemsReady.length > 0 ? (
            <div style={{ overflow: 'auto' }}>
              <Table>
                <Table.Thead><Table.Tr><Table.Th>SKU</Table.Th><Table.Th>สินค้า</Table.Th><Table.Th ta="center">สั่ง</Table.Th><Table.Th ta="center">รับแล้ว</Table.Th><Table.Th ta="center">คงเหลือ</Table.Th><Table.Th ta="center">รับครั้งนี้</Table.Th><Table.Th ta="center">ราคาทุน</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {receiveItemsReady.map((item: any) => (
                    <Table.Tr key={item.poItemId} style={{ opacity: item.remaining <= 0 ? 0.4 : 1 }}>
                      <Table.Td><Text size="sm" ff="monospace">{item.sku}</Text></Table.Td>
                      <Table.Td>{item.productName}</Table.Td>
                      <Table.Td ta="center">{item.ordered}</Table.Td>
                      <Table.Td ta="center">{item.alreadyReceived}</Table.Td>
                      <Table.Td ta="center"><Badge color={item.remaining > 0 ? 'orange' : 'green'} variant="light">{item.remaining}</Badge></Table.Td>
                      <Table.Td ta="center"><Text size="sm" fw={600}>{item.receivedQuantity}</Text></Table.Td>
                      <Table.Td ta="center"><Text size="sm">฿{fmt(item.costPerUnit)}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          ) : <Loader style={{ margin: '20px auto', display: 'block' }} />}

          <TextInput label="หมายเหตุ" value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} />

          <Button fullWidth color="green" loading={receiveMutation.isPending}
            leftSection={<IconPackageImport size={18} />}
            onClick={() => receiveMutation.mutate({
              poId: parseInt(id!),
              warehouseId: parseInt(receiveWarehouseId),
              receivedDate: new Date().toISOString().slice(0, 10),
              note: receiveNote,
              taxInvoiceNumber: taxInvoiceNumber || null,
              dueDate: dueDate || null,
              createInvoice: true,
              items: receiveItemsReady.filter((i: any) => i.receivedQuantity > 0 && i.remaining > 0).map((i: any) => ({
                poItemId: i.poItemId, productId: i.productId,
                receivedQuantity: i.receivedQuantity, costPerUnit: i.costPerUnit,
              })),
            })}>
            ยืนยันรับสินค้า + สร้างใบแจ้งหนี้
          </Button>
        </Stack>
      </Modal>

      {/* ===== PAYMENT MODAL ===== */}
      <Modal opened={payModal} onClose={() => setPayModal(false)}
        title={`💰 ชำระเงิน: ${poDetail.po_number}`} size="md">
        <Stack gap="md">
          {timeline?.invoices?.filter((i: any) => i.status !== 'paid').length > 0 ? (
            <>
              <Select label="เลือกใบแจ้งหนี้ *" required
                data={(timeline?.invoices || []).filter((i: any) => i.status !== 'paid').map((i: any) => ({
                  value: String(i.id),
                  label: `${i.invoice_number} — ค้าง ฿${fmt(parseFloat(i.total_amount) - parseFloat(i.paid_amount))}`,
                }))}
                value={payInvoiceId}
                onChange={(v) => {
                  setPayInvoiceId(v || '')
                  const inv = timeline?.invoices?.find((i: any) => String(i.id) === v)
                  if (inv) setPayAmount(parseFloat(inv.total_amount) - parseFloat(inv.paid_amount))
                }} />
              <NumberInput label="จำนวนเงิน *" min={0.01} decimalScale={2} value={payAmount}
                onChange={(v) => setPayAmount(Number(v) || 0)} prefix="฿" />
              <Select label="วิธีชำระ" data={[
                { value: 'transfer', label: '🏦 โอนเงิน' },
                { value: 'cash', label: '💵 เงินสด' },
                { value: 'cheque', label: '📝 เช็ค' },
              ]} value={payMethod} onChange={(v) => setPayMethod(v || 'transfer')} />
              <Group grow>
                <TextInput label="เลขอ้างอิง" placeholder="เลขที่โอน/เช็ค"
                  value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                <TextInput label="ธนาคาร" value={payBank} onChange={(e) => setPayBank(e.target.value)} />
              </Group>
              <TextInput label="หมายเหตุ" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              <Button fullWidth color="green" loading={payMutation.isPending}
                leftSection={<IconCreditCard size={18} />}
                onClick={() => payMutation.mutate({
                  invoiceId: parseInt(payInvoiceId), amount: payAmount,
                  paymentMethod: payMethod, referenceNumber: payRef,
                  bankName: payBank, note: payNote,
                })}>
                ยืนยันชำระเงิน
              </Button>
            </>
          ) : (
            <div className="empty-state"><IconCheck size={48} color="#059669" /><Text fw={600}>ไม่มีใบแจ้งหนี้ค้างชำระ</Text></div>
          )}
        </Stack>
      </Modal>
    </Stack>
  )
}

/* ====================================================================
   DOCUMENT STEPPER
   ==================================================================== */
function DocumentStepper({ status, onStepClick }: { status: string; onStepClick?: (stepKey: string) => void }) {
  const steps = [
    { key: 'po', label: 'ใบสั่งซื้อ', icon: '📋', desc: 'สร้างและอนุมัติ', doneStatuses: ['approved', 'partial', 'received', 'invoiced', 'paid'] },
    { key: 'grn', label: 'รับสินค้า', icon: '📥', desc: 'ตรวจรับเข้าคลัง', doneStatuses: ['received', 'invoiced', 'paid'] },
    { key: 'inv', label: 'ใบแจ้งหนี้', icon: '📄', desc: 'บันทึกหนี้ค้างจ่าย', doneStatuses: ['invoiced', 'paid'] },
    { key: 'pay', label: 'ชำระเงิน', icon: '💰', desc: 'จ่ายเงินให้ผู้ขาย', doneStatuses: ['paid'] },
  ]

  const currentIdx = status === 'draft' ? 0
    : status === 'approved' ? 1
    : ['partial', 'received'].includes(status) ? 2
    : status === 'invoiced' ? 3
    : status === 'paid' ? 4
    : 0

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '12px 0' }}>
      {steps.map((step, idx) => {
        const isDone = step.doneStatuses.includes(status)
        const isCurrent = idx === currentIdx
        const isClickable = isCurrent && !isDone && onStepClick && status !== 'cancelled'
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
              <div
                onClick={isClickable ? () => onStepClick(step.key) : undefined}
                style={{
                  width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                  cursor: isClickable ? 'pointer' : 'default',
                  background: isDone ? '#059669' : isCurrent ? '#4f46e5' : '#f3f4f6',
                  color: isDone || isCurrent ? '#fff' : '#9ca3af',
                  boxShadow: isClickable ? '0 0 0 4px rgba(79,70,229,0.3), 0 4px 12px rgba(79,70,229,0.2)'
                    : isDone ? '0 0 0 4px rgba(5,150,105,0.15)'
                    : undefined,
                  transition: 'all 0.3s ease',
                  transform: isClickable ? 'scale(1)' : undefined,
                }}
                onMouseEnter={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.transform = 'scale(1.12)'
                    e.currentTarget.style.boxShadow = '0 0 0 6px rgba(79,70,229,0.35), 0 6px 20px rgba(79,70,229,0.3)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(79,70,229,0.3), 0 4px 12px rgba(79,70,229,0.2)'
                  }
                }}
              >
                {isDone ? '✓' : step.icon}
              </div>
              <Text size="sm" fw={isDone || isCurrent ? 700 : 500}
                c={isDone ? 'green' : isCurrent ? 'indigo' : 'dimmed'}>
                {step.label}
              </Text>
              <Text size="xs" c={isClickable ? 'indigo' : 'dimmed'} ta="center" style={{ lineHeight: 1.2 }}>
                {isClickable ? '👆 คลิกเพื่อดำเนินการ' : step.desc}
              </Text>
            </div>
            {idx < steps.length - 1 && (
              <div style={{
                height: 3, flex: 1, borderRadius: 2, minWidth: 24, marginTop: 25,
                background: isDone ? '#059669' : '#e5e7eb',
                transition: 'background 0.3s ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
