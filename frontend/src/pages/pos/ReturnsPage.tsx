import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Badge, Loader, Select, Modal,
  Table, ActionIcon, Tooltip, Card, Pagination, NumberInput, Checkbox,
  Textarea, Divider,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconReceiptRefund, IconEye, IconFilter, IconFilterOff,
  IconPlus, IconCheck, IconX, IconCalendar,
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt, fmtDateTime as fmtDate } from '../../utils/formatters'
import type { SaleReturn, SaleReturnItem, SaleForReturn, SaleItemForReturn } from '../../types'

const PAGE_SIZE = 15

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'gray' },
  approved: { label: 'อนุมัติแล้ว', color: 'green' },
  voided: { label: 'ยกเลิก', color: 'red' },
}

const refundMethodLabels: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  credit: 'เครดิต',
  exchange: 'แลกเปลี่ยน',
}

interface ReturnItemForm {
  saleItemId: number
  productId: number
  productName: string
  sku: string
  quantity: number
  maxQuantity: number
  unitPrice: number
  discount: number
  restock: boolean
  selected: boolean
}

export default function ReturnsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | null>(null)
  const [dateTo, setDateTo] = useState<Date | null>(null)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)

  // Detail modal
  const [selectedReturnId, setSelectedReturnId] = useState<number | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [saleSearch, setSaleSearch] = useState('')
  const [selectedSale, setSelectedSale] = useState<SaleForReturn | null>(null)
  const [returnItems, setReturnItems] = useState<ReturnItemForm[]>([])
  const [reason, setReason] = useState('')
  const [refundMethod, setRefundMethod] = useState<string>('cash')
  const [createAsApproved, setCreateAsApproved] = useState(false)

  // Void confirm
  const [voidConfirmId, setVoidConfirmId] = useState<number | null>(null)

  // === Queries ===
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['returns', dateFrom, dateTo, filterStatus],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (dateFrom) params.from = dateFrom.toISOString().split('T')[0]
      if (dateTo) params.to = dateTo.toISOString().split('T')[0]
      if (filterStatus) params.status = filterStatus
      return api.get('/returns', { params }).then(r => r.data)
    },
  })

  const { data: returnDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['return-detail', selectedReturnId],
    queryFn: () => api.get(`/returns/${selectedReturnId}`).then(r => r.data),
    enabled: !!selectedReturnId,
  })

  const { data: salesSearchResults = [], isFetching: searchingSales } = useQuery({
    queryKey: ['search-sales-for-return', saleSearch],
    queryFn: () => api.get('/returns/search-sales', { params: { q: saleSearch } }).then(r => r.data),
    enabled: showCreate && saleSearch.length >= 1,
  })

  // === Mutations ===
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/returns', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `สร้างใบรับคืน ${res.data.returnNumber} แล้ว`, color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['returns'] })
      handleCloseCreate()
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างใบรับคืนได้', color: 'red' })
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.put(`/returns/${id}/approve`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'อนุมัติใบรับคืนแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['returns'] })
      queryClient.invalidateQueries({ queryKey: ['return-detail', selectedReturnId] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถอนุมัติได้', color: 'red' })
    },
  })

  const voidMutation = useMutation({
    mutationFn: (id: number) => api.put(`/returns/${id}/void`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกใบรับคืนแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['returns'] })
      queryClient.invalidateQueries({ queryKey: ['return-detail', selectedReturnId] })
      setVoidConfirmId(null)
      setShowDetail(false)
      setSelectedReturnId(null)
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถยกเลิกได้', color: 'red' })
    },
  })

  // === Filtered list ===
  const filtered = useMemo(() => {
    if (!search) return returns
    const s = search.toLowerCase()
    return returns.filter((r: SaleReturn) =>
      r.return_number?.toLowerCase().includes(s) ||
      r.invoice_number?.toLowerCase().includes(s) ||
      r.customer_name?.toLowerCase().includes(s)
    )
  }, [returns, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // === Handlers ===
  const handleSelectSale = async (saleId: number) => {
    try {
      const res = await api.get(`/returns/sale/${saleId}`)
      const sale: SaleForReturn = res.data
      setSelectedSale(sale)
      setReturnItems(
        sale.items
          .filter((item: SaleItemForReturn) => item.returnable_quantity > 0 && item.product_id)
          .map((item: SaleItemForReturn) => ({
            saleItemId: item.id,
            productId: item.product_id,
            productName: item.product_name,
            sku: item.sku || '',
            quantity: 0,
            maxQuantity: item.returnable_quantity,
            unitPrice: parseFloat(item.unit_price),
            discount: 0,
            restock: true,
            selected: false,
          }))
      )
    } catch (err: any) {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถโหลดข้อมูลบิลได้', color: 'red' })
    }
  }

  const handleCloseCreate = () => {
    setShowCreate(false)
    setSaleSearch('')
    setSelectedSale(null)
    setReturnItems([])
    setReason('')
    setRefundMethod('cash')
    setCreateAsApproved(false)
  }

  const handleSubmitReturn = () => {
    const selectedItems = returnItems.filter(i => i.selected && i.quantity > 0)
    if (selectedItems.length === 0) {
      notifications.show({ title: 'ผิดพลาด', message: 'กรุณาเลือกสินค้าที่ต้องการรับคืน', color: 'red' })
      return
    }
    if (!selectedSale) return

    createMutation.mutate({
      saleId: selectedSale.id,
      reason,
      refundMethod,
      status: createAsApproved ? 'approved' : 'draft',
      items: selectedItems.map(i => ({
        saleItemId: i.saleItemId,
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        restock: i.restock,
      })),
    })
  }

  const updateReturnItem = (index: number, field: string, value: any) => {
    setReturnItems(prev => prev.map((item, i) => {
      if (i !== index) return item
      const updated = { ...item, [field]: value }
      if (field === 'selected' && value && updated.quantity === 0) {
        updated.quantity = updated.maxQuantity
      }
      return updated
    }))
  }

  const selectedItemsTotal = returnItems
    .filter(i => i.selected && i.quantity > 0)
    .reduce((sum, i) => sum + (i.unitPrice * i.quantity - i.discount), 0)

  const hasFilters = dateFrom || dateTo || filterStatus || search
  const clearFilters = () => {
    setDateFrom(null)
    setDateTo(null)
    setFilterStatus(null)
    setSearch('')
    setPage(1)
  }

  if (isLoading) return <Loader style={{ margin: '60px auto', display: 'block' }} />

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="xl" fw={800}>
          <IconReceiptRefund size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          รับคืนสินค้า
        </Text>
        <Group gap="sm">
          <Text size="sm" c="dimmed">{filtered.length} รายการ</Text>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setShowCreate(true)}>
            สร้างใบรับคืน
          </Button>
        </Group>
      </Group>

      {/* Filters */}
      <Card shadow="xs" padding="sm" radius="md" withBorder>
        <Group gap="sm" wrap="wrap">
          <TextInput size="xs" placeholder="ค้นหาเลขใบรับคืน / บิลขาย / ลูกค้า" style={{ width: 280 }}
            leftSection={<IconSearch size={14} />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <DatePickerInput size="xs" placeholder="จากวันที่" style={{ width: 140 }}
            leftSection={<IconCalendar size={14} />}
            value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1) }}
            clearable />
          <DatePickerInput size="xs" placeholder="ถึงวันที่" style={{ width: 140 }}
            leftSection={<IconCalendar size={14} />}
            value={dateTo} onChange={(v) => { setDateTo(v); setPage(1) }}
            clearable />
          <Select size="xs" placeholder="สถานะ" style={{ width: 130 }}
            leftSection={<IconFilter size={14} />}
            data={[
              { value: 'draft', label: 'ร่าง' },
              { value: 'approved', label: 'อนุมัติแล้ว' },
              { value: 'voided', label: 'ยกเลิก' },
            ]}
            value={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1) }}
            clearable />
          {hasFilters && (
            <Tooltip label="ล้างตัวกรอง">
              <ActionIcon size="sm" variant="light" color="red" onClick={clearFilters}>
                <IconFilterOff size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Card>

      {/* Table */}
      <Card shadow="xs" padding={0} radius="md" withBorder>
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover>
            <Table.Thead style={{ background: 'var(--app-surface-secondary, #f8f9fa)' }}>
              <Table.Tr>
                <Table.Th>เลขใบรับคืน</Table.Th>
                <Table.Th>วันที่</Table.Th>
                <Table.Th>บิลขายอ้างอิง</Table.Th>
                <Table.Th>ลูกค้า</Table.Th>
                <Table.Th>วิธีคืนเงิน</Table.Th>
                <Table.Th ta="right">ยอดคืน</Table.Th>
                <Table.Th ta="center">สถานะ</Table.Th>
                <Table.Th ta="center" style={{ width: 80 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginated.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text ta="center" c="dimmed" py="xl">ไม่พบใบรับคืน</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                paginated.map((r: SaleReturn) => {
                  const st = statusConfig[r.status] || statusConfig.draft
                  return (
                    <Table.Tr key={r.id} style={{ cursor: 'pointer' }}
                      onClick={() => { setSelectedReturnId(r.id); setShowDetail(true) }}>
                      <Table.Td>
                        <Group gap={6}>
                          <IconReceiptRefund size={14} color="#ef4444" />
                          <Text size="sm" fw={600} ff="monospace" c="red">{r.return_number}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="xs" c="dimmed">{fmtDate(r.return_date)}</Text></Table.Td>
                      <Table.Td>
                        <Text size="sm" ff="monospace">{r.invoice_number || '-'}</Text>
                      </Table.Td>
                      <Table.Td><Text size="sm">{r.customer_name || '-'}</Text></Table.Td>
                      <Table.Td>
                        <Text size="xs">{refundMethodLabels[r.refund_method] || r.refund_method}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={700} c="red">{fmt(parseFloat(r.net_amount || '0'))}</Text>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge variant="light" color={st.color} size="sm">{st.label}</Badge>
                      </Table.Td>
                      <Table.Td ta="center" onClick={(e: any) => e.stopPropagation()}>
                        <Group gap={4} justify="center">
                          <Tooltip label="ดูรายละเอียด">
                            <ActionIcon size="sm" variant="light" onClick={() => { setSelectedReturnId(r.id); setShowDetail(true) }}>
                              <IconEye size={14} />
                            </ActionIcon>
                          </Tooltip>
                          {r.status === 'draft' && (
                            <Tooltip label="อนุมัติ">
                              <ActionIcon size="sm" variant="light" color="green"
                                onClick={() => approveMutation.mutate(r.id)}>
                                <IconCheck size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  )
                })
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {totalPages > 1 && (
          <Group justify="center" py="md">
            <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
      </Card>

      {/* === Detail Modal === */}
      <Modal opened={showDetail} onClose={() => { setShowDetail(false); setSelectedReturnId(null) }}
        title="รายละเอียดใบรับคืน" size="lg" centered>
        {detailLoading ? <Loader style={{ margin: '30px auto', display: 'block' }} /> : returnDetail ? (
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Text size="lg" fw={700} c="red">{returnDetail.return_number}</Text>
                <Text size="xs" c="dimmed">บิลอ้างอิง: {returnDetail.invoice_number || '-'}</Text>
              </div>
              <Badge variant="light" size="lg"
                color={(statusConfig[returnDetail.status] || statusConfig.draft).color}>
                {(statusConfig[returnDetail.status] || statusConfig.draft).label}
              </Badge>
            </Group>

            <Group gap="xl">
              <div>
                <Text size="xs" c="dimmed">วันที่รับคืน</Text>
                <Text size="sm">{fmtDate(returnDetail.return_date)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">ลูกค้า</Text>
                <Text size="sm">{returnDetail.customer_name || '-'}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">วิธีคืนเงิน</Text>
                <Text size="sm">{refundMethodLabels[returnDetail.refund_method] || returnDetail.refund_method}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">ผู้สร้าง</Text>
                <Text size="sm">{returnDetail.created_by_name || '-'}</Text>
              </div>
            </Group>

            {returnDetail.reason && (
              <div>
                <Text size="xs" c="dimmed">สาเหตุ</Text>
                <Text size="sm">{returnDetail.reason}</Text>
              </div>
            )}

            <Divider />

            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>สินค้า</Table.Th>
                  <Table.Th ta="right">ราคา</Table.Th>
                  <Table.Th ta="right">จำนวน</Table.Th>
                  <Table.Th ta="right">ส่วนลด</Table.Th>
                  <Table.Th ta="right">รวม</Table.Th>
                  <Table.Th ta="center">คืนสต๊อก</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(returnDetail.items || []).map((item: SaleReturnItem) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{item.product_name}</Text>
                      {item.sku && <Text size="xs" c="dimmed">{item.sku}</Text>}
                    </Table.Td>
                    <Table.Td ta="right"><Text size="sm">{fmt(parseFloat(item.unit_price))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm">{item.quantity}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm">{fmt(parseFloat(item.discount || '0'))}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" fw={600}>{fmt(parseFloat(item.subtotal))}</Text></Table.Td>
                    <Table.Td ta="center">
                      <Badge variant="light" size="xs" color={item.restock ? 'green' : 'gray'}>
                        {item.restock ? 'คืน' : 'ไม่คืน'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Divider />
            <Group justify="flex-end" gap="xl">
              {parseFloat(returnDetail.vat_amount) > 0 && (
                <>
                  <div style={{ textAlign: 'right' }}>
                    <Text size="xs" c="dimmed">ยอดก่อน VAT</Text>
                    <Text size="sm">{fmt(parseFloat(returnDetail.subtotal) - parseFloat(returnDetail.vat_amount))}</Text>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text size="xs" c="dimmed">VAT</Text>
                    <Text size="sm">{fmt(parseFloat(returnDetail.vat_amount))}</Text>
                  </div>
                </>
              )}
              <div style={{ textAlign: 'right' }}>
                <Text size="xs" c="dimmed">ยอดคืนรวม</Text>
                <Text size="lg" fw={800} c="red">{fmt(parseFloat(returnDetail.net_amount))}</Text>
              </div>
            </Group>

            {/* Actions */}
            <Group justify="flex-end" gap="sm">
              {returnDetail.status === 'draft' && (
                <Button color="green" leftSection={<IconCheck size={16} />}
                  loading={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(returnDetail.id)}>
                  อนุมัติ
                </Button>
              )}
              {(returnDetail.status === 'draft' || returnDetail.status === 'approved') && (
                <Button color="red" variant="light" leftSection={<IconX size={16} />}
                  onClick={() => setVoidConfirmId(returnDetail.id)}>
                  ยกเลิก
                </Button>
              )}
            </Group>
          </Stack>
        ) : (
          <Text c="dimmed" ta="center" py="xl">ไม่พบข้อมูล</Text>
        )}
      </Modal>

      {/* === Void Confirm Modal === */}
      <Modal opened={!!voidConfirmId} onClose={() => setVoidConfirmId(null)}
        title="ยืนยันการยกเลิก" size="sm" centered>
        <Stack gap="md">
          <Text>คุณต้องการยกเลิกใบรับคืนนี้หรือไม่?</Text>
          <Text size="sm" c="dimmed">หากใบรับคืนได้รับการอนุมัติแล้ว ระบบจะกลับรายการสต๊อกและบัญชีให้อัตโนมัติ</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setVoidConfirmId(null)}>ยกเลิก</Button>
            <Button color="red" loading={voidMutation.isPending}
              onClick={() => voidConfirmId && voidMutation.mutate(voidConfirmId)}>
              ยืนยันยกเลิก
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* === Create Return Modal === */}
      <Modal opened={showCreate} onClose={handleCloseCreate}
        title="สร้างใบรับคืนสินค้า" size="xl" centered>
        <Stack gap="md">
          {!selectedSale ? (
            <>
              {/* Step 1: Search/Select Sale */}
              <Text size="sm" fw={600}>ขั้นตอนที่ 1: เลือกบิลขาย</Text>
              <TextInput
                placeholder="ค้นหาเลขบิลขายหรือชื่อลูกค้า..."
                leftSection={<IconSearch size={16} />}
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
                autoFocus
              />

              {searchingSales && <Loader size="sm" style={{ margin: '10px auto' }} />}

              {salesSearchResults.length > 0 && (
                <Card shadow="xs" padding={0} radius="md" withBorder style={{ maxHeight: 350, overflow: 'auto' }}>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>เลขบิล</Table.Th>
                        <Table.Th>วันที่</Table.Th>
                        <Table.Th>ลูกค้า</Table.Th>
                        <Table.Th ta="right">ยอด</Table.Th>
                        <Table.Th></Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {salesSearchResults.map((s: any) => (
                        <Table.Tr key={s.id} style={{ cursor: 'pointer' }}
                          onClick={() => handleSelectSale(s.id)}>
                          <Table.Td>
                            <Text size="sm" ff="monospace" fw={600}>{s.invoice_number}</Text>
                          </Table.Td>
                          <Table.Td><Text size="xs" c="dimmed">{fmtDate(s.sold_at)}</Text></Table.Td>
                          <Table.Td><Text size="sm">{s.customer_name || '-'}</Text></Table.Td>
                          <Table.Td ta="right"><Text size="sm" fw={600}>{fmt(parseFloat(s.net_amount || '0'))}</Text></Table.Td>
                          <Table.Td>
                            <Button size="compact-xs" variant="light">เลือก</Button>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Card>
              )}

              {saleSearch && salesSearchResults.length === 0 && !searchingSales && (
                <Text ta="center" c="dimmed" size="sm" py="md">ไม่พบบิลขาย</Text>
              )}
            </>
          ) : (
            <>
              {/* Step 2: Select items and confirm */}
              <Group justify="space-between" align="center">
                <div>
                  <Text size="sm" fw={600}>ขั้นตอนที่ 2: เลือกสินค้าที่ต้องการรับคืน</Text>
                  <Text size="xs" c="dimmed">
                    บิล: {selectedSale.invoice_number} | ลูกค้า: {selectedSale.customer_name || '-'}
                  </Text>
                </div>
                <Button size="compact-xs" variant="subtle" onClick={() => { setSelectedSale(null); setReturnItems([]) }}>
                  เปลี่ยนบิล
                </Button>
              </Group>

              {returnItems.length === 0 ? (
                <Text ta="center" c="dimmed" py="md">ไม่มีสินค้าที่สามารถรับคืนได้ (อาจรับคืนครบแล้ว)</Text>
              ) : (
                <>
                  <Card shadow="xs" padding={0} radius="md" withBorder>
                    <Table striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th style={{ width: 40 }}></Table.Th>
                          <Table.Th>สินค้า</Table.Th>
                          <Table.Th ta="right">ราคา</Table.Th>
                          <Table.Th ta="center" style={{ width: 120 }}>จำนวนคืน</Table.Th>
                          <Table.Th ta="center" style={{ width: 90 }}>คืนสต๊อก</Table.Th>
                          <Table.Th ta="right">รวม</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {returnItems.map((item, index) => (
                          <Table.Tr key={item.saleItemId} style={{ opacity: item.selected ? 1 : 0.5 }}>
                            <Table.Td>
                              <Checkbox size="xs"
                                checked={item.selected}
                                onChange={(e) => updateReturnItem(index, 'selected', e.currentTarget.checked)} />
                            </Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={500}>{item.productName}</Text>
                              <Text size="xs" c="dimmed">
                                {item.sku} | คืนได้ {item.maxQuantity} ชิ้น
                              </Text>
                            </Table.Td>
                            <Table.Td ta="right"><Text size="sm">{fmt(item.unitPrice)}</Text></Table.Td>
                            <Table.Td>
                              <NumberInput size="xs" min={0} max={item.maxQuantity}
                                value={item.quantity}
                                onChange={(v) => updateReturnItem(index, 'quantity', v || 0)}
                                disabled={!item.selected}
                                style={{ width: 100 }} />
                            </Table.Td>
                            <Table.Td ta="center">
                              <Checkbox size="xs"
                                checked={item.restock}
                                onChange={(e) => updateReturnItem(index, 'restock', e.currentTarget.checked)}
                                disabled={!item.selected} />
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="sm" fw={600}>
                                {item.selected && item.quantity > 0
                                  ? fmt(item.unitPrice * item.quantity - item.discount)
                                  : '-'}
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Card>

                  <Group grow>
                    <Select label="วิธีคืนเงิน" size="sm"
                      data={[
                        { value: 'cash', label: 'เงินสด' },
                        { value: 'transfer', label: 'โอนเงิน' },
                        { value: 'credit', label: 'เครดิต' },
                        { value: 'exchange', label: 'แลกเปลี่ยน' },
                      ]}
                      value={refundMethod} onChange={(v) => setRefundMethod(v || 'cash')} />
                    <div></div>
                  </Group>

                  <Textarea label="สาเหตุการรับคืน" size="sm"
                    placeholder="เช่น สินค้าชำรุด, สินค้าไม่ตรงตามที่สั่ง..."
                    value={reason} onChange={(e) => setReason(e.target.value)}
                    rows={2} />

                  <Checkbox label="อนุมัติทันที (ตัดสต๊อก + บันทึกบัญชี)" size="sm"
                    checked={createAsApproved}
                    onChange={(e) => setCreateAsApproved(e.currentTarget.checked)} />

                  <Divider />

                  <Group justify="space-between">
                    <Text size="lg" fw={800} c="red">
                      ยอดคืนรวม: {fmt(selectedItemsTotal)}
                    </Text>
                    <Group gap="sm">
                      <Button variant="subtle" onClick={handleCloseCreate}>ยกเลิก</Button>
                      <Button leftSection={<IconReceiptRefund size={16} />}
                        loading={createMutation.isPending}
                        disabled={returnItems.filter(i => i.selected && i.quantity > 0).length === 0}
                        onClick={handleSubmitReturn}>
                        สร้างใบรับคืน
                      </Button>
                    </Group>
                  </Group>
                </>
              )}
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  )
}
