import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, TextInput, Group, Modal, Stack, NumberInput, Select,
  Text, Badge, Loader, ActionIcon, Tooltip, Divider
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconPlus, IconEdit, IconTrash, IconCheck, IconX,
  IconFileInvoice, IconPackageImport, IconClipboardList,
  IconEye, IconReceipt, IconCreditCard
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt, fmtDate } from '../utils/formatters'
import { PO_STATUSES, INV_STATUSES } from '../utils/constants'
import type {
  PurchaseOrder, PurchaseOrderItem, Warehouse, WalletChannel, Contact, Product,
  PurchaseReceiveItem, Invoice, GRN, PurchasePayment, ApiError
} from '../types'

export default function PurchasePage() {
  const [activeTab, setActiveTab] = useState<'po' | 'grn' | 'invoices' | 'payments'>('po')

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Text size="xl" fw={800}>🛒 จัดซื้อสินค้า</Text>
        <div className="stock-tabs" style={{ flexWrap: 'wrap' }}>
          <button className={`stock-tab ${activeTab === 'po' ? 'active' : ''}`} onClick={() => setActiveTab('po')}>
            <IconClipboardList size={16} /> ใบสั่งซื้อ
          </button>
          <button className={`stock-tab ${activeTab === 'grn' ? 'active' : ''}`} onClick={() => setActiveTab('grn')}>
            <IconPackageImport size={16} /> รับสินค้า
          </button>
          <button className={`stock-tab ${activeTab === 'invoices' ? 'active' : ''}`} onClick={() => setActiveTab('invoices')}>
            <IconFileInvoice size={16} /> ใบแจ้งหนี้
          </button>
          <button className={`stock-tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setActiveTab('payments')}>
            <IconCreditCard size={16} /> ชำระเงิน
          </button>
        </div>
      </Group>

      {activeTab === 'po' && <PurchaseOrdersTab />}
      {activeTab === 'grn' && <GoodsReceiptTab />}
      {activeTab === 'invoices' && <InvoicesTab />}
      {activeTab === 'payments' && <PaymentsTab />}
    </Stack>
  )
}

/* ====================================================================
   DOCUMENT STEPPER COMPONENT
   ==================================================================== */
function DocumentStepper({ status }: { status: string }) {
  const steps = [
    { key: 'po', label: 'ใบสั่งซื้อ', icon: '📋', doneStatuses: ['approved', 'partial', 'received', 'invoiced', 'paid'] },
    { key: 'grn', label: 'รับสินค้า', icon: '📥', doneStatuses: ['received', 'invoiced', 'paid'] },
    { key: 'inv', label: 'ใบแจ้งหนี้', icon: '📄', doneStatuses: ['invoiced', 'paid'] },
    { key: 'pay', label: 'ชำระเงิน', icon: '💰', doneStatuses: ['paid'] },
  ]

  const currentIdx = status === 'draft' ? 0
    : status === 'approved' ? 1
    : ['partial', 'received'].includes(status) ? 2
    : status === 'invoiced' ? 3
    : status === 'paid' ? 4
    : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '16px 0' }}>
      {steps.map((step, idx) => {
        const isDone = step.doneStatuses.includes(status)
        const isCurrent = idx === currentIdx
        const isPending = !isDone && !isCurrent

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
                background: isDone ? '#059669' : isCurrent ? '#4f46e5' : '#e5e7eb',
                color: isDone || isCurrent ? '#fff' : '#9ca3af',
                boxShadow: isCurrent ? '0 0 0 4px rgba(79,70,229,0.2)' : undefined,
                transition: 'all 0.3s ease',
              }}>
                {isDone ? '✓' : step.icon}
              </div>
              <Text size="xs" fw={isDone || isCurrent ? 700 : 400}
                c={isDone ? 'green' : isCurrent ? 'indigo' : 'dimmed'}>
                {step.label}
              </Text>
            </div>
            {idx < steps.length - 1 && (
              <div style={{
                height: 3, flex: 1, borderRadius: 2, minWidth: 20,
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

/* ====================================================================
   MINI STEPPER (for table rows)
   ==================================================================== */
function MiniStepper({ status, label, color }: { status: string; label: string; color: string }) {
  const steps = [
    { doneStatuses: ['approved', 'partial', 'received', 'invoiced', 'paid'] },
    { doneStatuses: ['received', 'invoiced', 'paid'] },
    { doneStatuses: ['invoiced', 'paid'] },
    { doneStatuses: ['paid'] },
  ]
  const currentIdx = status === 'draft' ? 0
    : status === 'approved' ? 1
    : ['partial', 'received'].includes(status) ? 2
    : status === 'invoiced' ? 3
    : status === 'paid' ? 4
    : 0

  return (
    <Group gap={6} justify="center" wrap="nowrap">
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        {steps.map((step, idx) => {
          const isDone = step.doneStatuses.includes(status)
          const isCurrent = idx === currentIdx
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: isDone || isCurrent ? 10 : 8,
                height: isDone || isCurrent ? 10 : 8,
                borderRadius: '50%',
                background: isDone ? '#059669' : isCurrent ? '#4f46e5' : '#d1d5db',
                boxShadow: isCurrent ? '0 0 0 3px rgba(79,70,229,0.25)' : undefined,
                transition: 'all 0.2s ease',
              }} />
              {idx < steps.length - 1 && (
                <div style={{
                  width: 12, height: 2, borderRadius: 1,
                  background: isDone ? '#059669' : '#e5e7eb',
                }} />
              )}
            </div>
          )
        })}
      </div>
      <Badge color={color} variant="light" size="sm">{label}</Badge>
    </Group>
  )
}

/* ====================================================================
   TAB 1: Purchase Orders
   ==================================================================== */
function PurchaseOrdersTab() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [receiveModal, setReceiveModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState<any>(null)
  const queryClient = useQueryClient()

  const { data: allOrders, isLoading } = useQuery({
    queryKey: ['purchase-orders', search],
    queryFn: () => api.get('/purchases', { params: { search } }).then(r => r.data),
  })

  // Client-side status filter
  const orders = useMemo(() => {
    if (!allOrders) return []
    if (!statusFilter) return allOrders
    return allOrders.filter((o: PurchaseOrder) => o.status === statusFilter)
  }, [allOrders, statusFilter])

  const { data: products } = useQuery({
    queryKey: ['products-for-po'],
    queryFn: () => api.get('/products').then(r => r.data),
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  const { data: walletChannels = [] } = useQuery({
    queryKey: ['wallet-channels-active'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const payChannelOptions = walletChannels.length > 0
    ? walletChannels.map((ch: WalletChannel) => ({
        value: String(ch.id),
        label: `${ch.type === 'cash' ? '💵' : ch.type === 'bank_account' ? '🏦' : ch.type === 'promptpay' ? '📱' : ch.type === 'credit_card' ? '💳' : '📋'} ${ch.name}`,
      }))
    : [
        { value: '_transfer', label: '🏦 โอนเงิน' },
        { value: '_cash', label: '💵 เงินสด' },
        { value: '_cheque', label: '📝 เช็ค' },
      ]

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/purchases/${id}/status`, { status }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'อัพเดตสถานะสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })


  // --- Receive Form ---
  const [receiveWarehouseId, setReceiveWarehouseId] = useState('')
  const [receiveNote, setReceiveNote] = useState('')
  const [taxInvoiceNumber, setTaxInvoiceNumber] = useState('')
  const [dueDate, setDueDate] = useState('')

  const { data: receiveDetailData } = useQuery({
    queryKey: ['po-detail-recv', selectedPO?.id],
    queryFn: () => api.get(`/purchases/${selectedPO?.id}`).then(r => r.data),
    enabled: !!selectedPO?.id && receiveModal,
  })

  const receiveItemsReady = useMemo(() => {
    if (!receiveDetailData?.items) return []
    return receiveDetailData.items.map((item: PurchaseOrderItem) => ({
      poItemId: item.id, productId: item.product_id, productName: item.product_name,
      sku: item.sku, ordered: item.quantity, alreadyReceived: item.received_quantity,
      remaining: item.quantity - item.received_quantity,
      receivedQuantity: item.quantity - item.received_quantity,
      costPerUnit: parseFloat(item.unit_cost),
    }))
  }, [receiveDetailData])

  const openReceive = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setReceiveNote('')
    setTaxInvoiceNumber('')
    setDueDate('')
    setReceiveWarehouseId(warehouses?.[0]?.id ? String(warehouses[0].id) : '')
    setReceiveModal(true)
  }

  const receiveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchases/receipts', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `รับสินค้า: ${res.data.grnNumber}${res.data.invoiceNumber ? ` + ใบแจ้งหนี้: ${res.data.invoiceNumber}` : ''}`, color: 'green' })
      setReceiveModal(false); setSelectedPO(null)
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['goods-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] })
    },
    onError: (err: ApiError) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถรับสินค้าได้', color: 'red' }),
  })

  // --- Pay Modal ---
  const [payInvoiceId, setPayInvoiceId] = useState('')
  const [payAmount, setPayAmount] = useState(0)
  const [payMethod, setPayMethod] = useState('transfer')
  const [payChannelId, setPayChannelId] = useState<number | null>(null)
  const [payRef, setPayRef] = useState('')
  const [payBank, setPayBank] = useState('')
  const [payNote, setPayNote] = useState('')

  const openPay = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setPayInvoiceId('')
    setPayAmount(0)
    setPayMethod('transfer')
    setPayChannelId(null)
    setPayRef('')
    setPayBank('')
    setPayNote('')
    setPayModal(true)
  }

  const { data: payInvoices } = useQuery({
    queryKey: ['po-invoices-for-pay', selectedPO?.id],
    queryFn: () => api.get(`/purchases/${selectedPO?.id}/timeline`).then(r => r.data),
    enabled: !!selectedPO?.id && payModal,
  })

  const payMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/purchases/payments', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'บันทึกการชำระเงินสำเร็จ', color: 'green' })
      setPayModal(false); setSelectedPO(null)
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-payments'] })
    },
    onError: (err: ApiError) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ผิดพลาด', color: 'red' }),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <>
      {/* Status Tabs */}
      {(() => {
        const all = allOrders || []
        const statusTabs = [
          { key: null, label: 'ทั้งหมด', color: '#4f46e5', count: all.length },
          { key: 'draft', label: 'ฉบับร่าง', color: '#6b7280', count: all.filter((o: PurchaseOrder) => o.status === 'draft').length },
          { key: 'approved', label: 'รอรับสินค้า', color: '#2563eb', count: all.filter((o: PurchaseOrder) => o.status === 'approved').length },
          { key: 'partial', label: 'รับบางส่วน', color: '#f59e0b', count: all.filter((o: PurchaseOrder) => o.status === 'partial').length },
          { key: 'received', label: 'รับครบแล้ว', color: '#0d9488', count: all.filter((o: PurchaseOrder) => o.status === 'received').length },
          { key: 'invoiced', label: 'รอชำระเงิน', color: '#7c3aed', count: all.filter((o: PurchaseOrder) => o.status === 'invoiced').length },
          { key: 'paid', label: 'ชำระครบแล้ว', color: '#059669', count: all.filter((o: PurchaseOrder) => o.status === 'paid').length },
          { key: 'cancelled', label: 'ยกเลิก', color: '#ef4444', count: all.filter((o: PurchaseOrder) => o.status === 'cancelled').length },
        ]
        return (
          <div style={{
            display: 'flex', gap: 0, overflowX: 'auto',
            borderBottom: '2px solid #e5e7eb', marginBottom: 12,
          }}>
            {statusTabs.map(tab => {
              const isActive = statusFilter === tab.key
              return (
                <button key={tab.key ?? 'all'}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    padding: '10px 16px', border: 'none', background: 'none',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    fontSize: 14, fontWeight: isActive ? 700 : 500,
                    color: isActive ? tab.color : '#6b7280',
                    borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                    marginBottom: -2,
                    transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{
                      background: isActive ? tab.color : '#e5e7eb',
                      color: isActive ? '#fff' : '#6b7280',
                      fontSize: 11, fontWeight: 700,
                      padding: '1px 7px', borderRadius: 10,
                      minWidth: 20, textAlign: 'center',
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* Search + Create */}
      <div className="stock-filter-bar">
        <TextInput placeholder="ค้นหา PO / ผู้ขาย..." leftSection={<IconSearch size={16} />}
          value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/purchases/create')}>
          สร้างใบสั่งซื้อ
        </Button>
      </div>

      {/* PO Table */}
      {(orders || []).length === 0 ? (
        <div className="stat-card"><div className="empty-state"><IconClipboardList size={48} /><Text fw={600} size="lg">ยังไม่มีใบสั่งซื้อ</Text><Text size="sm" c="dimmed">สร้างใบสั่งซื้อใหม่เพื่อสั่งสินค้าจากผู้ขาย</Text></div></div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>เลขที่ PO</Table.Th>
                <Table.Th>วันที่</Table.Th>
                <Table.Th>ผู้ขาย</Table.Th>
                <Table.Th ta="center">รายการ</Table.Th>
                <Table.Th ta="right">มูลค่ารวม</Table.Th>
                <Table.Th ta="center">สถานะเอกสาร</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {orders.map((po: PurchaseOrder) => {
                const st = PO_STATUSES[po.status] || PO_STATUSES.draft
                return (
                  <Table.Tr key={po.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/purchases/${po.id}`)}>
                    <Table.Td><Text size="sm" fw={700} ff="monospace">{po.po_number}</Text></Table.Td>
                    <Table.Td><Text size="sm">{fmtDate(po.order_date)}</Text></Table.Td>
                    <Table.Td><Text size="sm">{po.contact_name}</Text></Table.Td>
                    <Table.Td ta="center"><Badge variant="light" size="sm">{po.item_count} รายการ</Badge></Table.Td>
                    <Table.Td ta="right" fw={600}>฿{fmt(parseFloat(po.total_amount))}</Table.Td>
                    <Table.Td ta="center">
                      <Badge color={st.color} variant="light">{st.label}</Badge>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}


      {/* Receive Goods + Invoice Modal */}
      <Modal opened={receiveModal} onClose={() => { setReceiveModal(false); setSelectedPO(null) }}
        title={`📥 รับสินค้า + ใบแจ้งหนี้: ${selectedPO?.po_number || ''}`} size="xl">
        <Stack gap="md">
          <Group grow>
            <Select label="คลังสินค้าที่รับเข้า *" required
              data={(warehouses || []).map((w: Warehouse) => ({ value: String(w.id), label: w.name }))}
              value={receiveWarehouseId} onChange={(v) => setReceiveWarehouseId(v || '')} />
          </Group>

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
                  {receiveItemsReady.map((item: PurchaseReceiveItem) => (
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
              poId: selectedPO?.id,
              warehouseId: parseInt(receiveWarehouseId),
              receivedDate: new Date().toISOString().slice(0, 10),
              note: receiveNote,
              taxInvoiceNumber: taxInvoiceNumber || null,
              dueDate: dueDate || null,
              createInvoice: true,
              items: receiveItemsReady.filter((i: PurchaseReceiveItem) => i.receivedQuantity > 0 && i.remaining > 0).map((i: PurchaseReceiveItem) => ({
                poItemId: i.poItemId, productId: i.productId,
                receivedQuantity: i.receivedQuantity, costPerUnit: i.costPerUnit,
              })),
            })}>
            ยืนยันรับสินค้า + สร้างใบแจ้งหนี้
          </Button>
        </Stack>
      </Modal>

      {/* Payment Modal */}
      <Modal opened={payModal} onClose={() => { setPayModal(false); setSelectedPO(null) }}
        title={`💰 ชำระเงิน: ${selectedPO?.po_number || ''}`} size="md">
        <Stack gap="md">
          {payInvoices?.invoices?.filter((i: Invoice) => i.status !== 'paid').length > 0 ? (
            <>
              <Select label="เลือกใบแจ้งหนี้ *" required
                data={(payInvoices?.invoices || []).filter((i: Invoice) => i.status !== 'paid').map((i: Invoice) => ({
                  value: String(i.id),
                  label: `${i.invoice_number} — ฿${fmt(parseFloat(i.total_amount) - parseFloat(i.paid_amount))} ค้างชำระ`,
                }))}
                value={payInvoiceId}
                onChange={(v) => {
                  setPayInvoiceId(v || '')
                  const inv = payInvoices?.invoices?.find((i: Invoice) => String(i.id) === v)
                  if (inv) setPayAmount(parseFloat(inv.total_amount) - parseFloat(inv.paid_amount))
                }} />
              <NumberInput label="จำนวนเงิน *" min={0.01} decimalScale={2} value={payAmount}
                onChange={(v) => setPayAmount(Number(v) || 0)} prefix="฿" />
              <Select label="วิธีชำระ" data={payChannelOptions}
                value={payChannelId ? String(payChannelId) : (walletChannels.length > 0 ? null : '_transfer')}
                onChange={(v) => {
                  if (v && !v.startsWith('_')) {
                    const ch = walletChannels.find((c: WalletChannel) => String(c.id) === v)
                    setPayChannelId(Number(v))
                    setPayMethod(ch?.type === 'bank_account' ? 'transfer' : ch?.type || 'transfer')
                  } else {
                    setPayChannelId(null)
                    setPayMethod(v ? v.replace('_', '') : 'transfer')
                  }
                }} />
              <Group grow>
                <TextInput label="เลขอ้างอิง" placeholder="เลขที่โอน/เช็ค" value={payRef}
                  onChange={(e) => setPayRef(e.target.value)} />
                <TextInput label="ธนาคาร" value={payBank} onChange={(e) => setPayBank(e.target.value)} />
              </Group>
              <TextInput label="หมายเหตุ" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
              <Button fullWidth color="green" loading={payMutation.isPending}
                leftSection={<IconCreditCard size={18} />}
                onClick={() => payMutation.mutate({
                  invoiceId: parseInt(payInvoiceId), amount: payAmount,
                paymentMethod: payMethod, paymentChannelId: payChannelId,
                referenceNumber: payRef,
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
    </>
  )
}


/* ====================================================================
   TAB 3: Goods Receipt History
   ==================================================================== */
function GoodsReceiptTab() {
  const { data: receipts, isLoading } = useQuery({
    queryKey: ['goods-receipts'],
    queryFn: () => api.get('/purchases/receipts/all').then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <>
      {(receipts || []).length === 0 ? (
        <div className="stat-card"><div className="empty-state"><IconPackageImport size={48} /><Text fw={600} size="lg">ยังไม่มีการรับสินค้า</Text></div></div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th>เลขที่ GRN</Table.Th><Table.Th>อ้างอิง PO</Table.Th><Table.Th>ผู้ขาย</Table.Th><Table.Th>คลัง</Table.Th><Table.Th>วันที่รับ</Table.Th><Table.Th ta="center">รายการ</Table.Th><Table.Th>ผู้รับ</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {receipts.map((grn: GRN) => (
                <Table.Tr key={grn.id}>
                  <Table.Td><Text size="sm" fw={700} ff="monospace">{grn.grn_number}</Text></Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{grn.po_number}</Text></Table.Td>
                  <Table.Td><Text size="sm">{grn.contact_name}</Text></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{grn.warehouse_name}</Text></Table.Td>
                  <Table.Td><Text size="sm">{fmtDate(grn.received_date)}</Text></Table.Td>
                  <Table.Td ta="center"><Badge variant="light" size="sm">{grn.item_count} รายการ</Badge></Table.Td>
                  <Table.Td><Text size="xs">{grn.created_by_name || '-'}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </>
  )
}

/* ====================================================================
   TAB 4: Invoices
   ==================================================================== */
function InvoicesTab() {
  const { data: invoices, isLoading } = useQuery({
    queryKey: ['purchase-invoices'],
    queryFn: () => api.get('/purchases/invoices/all').then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <>
      {(invoices || []).length === 0 ? (
        <div className="stat-card"><div className="empty-state"><IconFileInvoice size={48} /><Text fw={600} size="lg">ยังไม่มีใบแจ้งหนี้</Text><Text size="sm" c="dimmed">ใบแจ้งหนี้จะถูกสร้างอัตโนมัติเมื่อรับสินค้า</Text></div></div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr>
              <Table.Th>เลขที่ Invoice</Table.Th>
              <Table.Th>เลขใบกำกับภาษี</Table.Th>
              <Table.Th>PO</Table.Th>
              <Table.Th>ผู้ขาย</Table.Th>
              <Table.Th>วันที่</Table.Th>
              <Table.Th>ครบกำหนด</Table.Th>
              <Table.Th ta="right">ยอดรวม</Table.Th>
              <Table.Th ta="right">ชำระแล้ว</Table.Th>
              <Table.Th ta="center">สถานะ</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {invoices.map((inv: Invoice) => {
                const st = INV_STATUSES[inv.status] || INV_STATUSES.pending
                const remaining = parseFloat(inv.total_amount) - parseFloat(inv.paid_amount)
                return (
                  <Table.Tr key={inv.id}>
                    <Table.Td><Text size="sm" fw={700} ff="monospace">{inv.invoice_number}</Text></Table.Td>
                    <Table.Td><Text size="sm" ff="monospace" c="dimmed">{inv.tax_invoice_number || '-'}</Text></Table.Td>
                    <Table.Td><Text size="sm" ff="monospace">{inv.po_number}</Text></Table.Td>
                    <Table.Td><Text size="sm">{inv.contact_name}</Text></Table.Td>
                    <Table.Td><Text size="sm">{fmtDate(inv.invoice_date || '')}</Text></Table.Td>
                    <Table.Td><Text size="sm" c={inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid' ? 'red' : undefined} fw={inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid' ? 700 : undefined}>{fmtDate(inv.due_date || '')}</Text></Table.Td>
                    <Table.Td ta="right" fw={600}>฿{fmt(parseFloat(inv.total_amount))}</Table.Td>
                    <Table.Td ta="right"><Text size="sm" c="green">฿{fmt(parseFloat(inv.paid_amount))}</Text></Table.Td>
                    <Table.Td ta="center"><Badge color={st.color} variant="light">{st.label}</Badge></Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </>
  )
}

/* ====================================================================
   TAB 5: Payments
   ==================================================================== */
function PaymentsTab() {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['purchase-payments'],
    queryFn: () => api.get('/purchases/payments/all').then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <>
      {(payments || []).length === 0 ? (
        <div className="stat-card"><div className="empty-state"><IconCreditCard size={48} /><Text fw={600} size="lg">ยังไม่มีการชำระเงิน</Text><Text size="sm" c="dimmed">ชำระเงินจากใบแจ้งหนี้ที่ค้างชำระ</Text></div></div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead><Table.Tr>
              <Table.Th>เลขที่ Payment</Table.Th>
              <Table.Th>Invoice</Table.Th>
              <Table.Th>PO</Table.Th>
              <Table.Th>ผู้ขาย</Table.Th>
              <Table.Th>วันที่จ่าย</Table.Th>
              <Table.Th ta="center">วิธีจ่าย</Table.Th>
              <Table.Th ta="right">จำนวน</Table.Th>
              <Table.Th>อ้างอิง</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {payments.map((p: PurchasePayment) => (
                <Table.Tr key={p.id}>
                  <Table.Td><Text size="sm" fw={700} ff="monospace">{p.payment_number}</Text></Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{p.invoice_number}</Text></Table.Td>
                  <Table.Td><Text size="sm" ff="monospace">{p.po_number}</Text></Table.Td>
                  <Table.Td><Text size="sm">{p.contact_name}</Text></Table.Td>
                  <Table.Td><Text size="sm">{fmtDate(p.payment_date)}</Text></Table.Td>
                  <Table.Td ta="center"><Badge variant="light" size="sm">{p.payment_method === 'transfer' ? '🏦 โอน' : p.payment_method === 'cash' ? '💵 เงินสด' : '📝 เช็ค'}</Badge></Table.Td>
                  <Table.Td ta="right" fw={700} c="green">฿{fmt(parseFloat(p.amount))}</Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{p.reference_number || '-'}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </>
  )
}
