import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Badge, Loader, Select, Modal,
  Table, ActionIcon, Tooltip, Divider, Card, Pagination
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconReceipt, IconCash, IconCreditCard, IconQrcode,
  IconBuildingBank, IconEye, IconX, IconFilter, IconFilterOff,
  IconCalendar, IconFileInvoice, IconTrendingUp, IconAlertTriangle
} from '@tabler/icons-react'
import api from '../services/api'

const PAGE_SIZE = 15

const paymentIcons: Record<string, any> = {
  cash: { icon: IconCash, label: 'เงินสด', color: '#059669' },
  transfer: { icon: IconBuildingBank, label: 'โอนเงิน', color: '#2563eb' },
  credit_card: { icon: IconCreditCard, label: 'บัตรเครดิต', color: '#7c3aed' },
  qr_code: { icon: IconQrcode, label: 'QR Code', color: '#0891b2' },
  mixed: { icon: IconReceipt, label: 'ผสม', color: '#6b7280' },
}

const statusBadge: Record<string, { color: string; label: string }> = {
  completed: { color: 'green', label: 'สำเร็จ' },
  voided: { color: 'red', label: 'ยกเลิก' },
  pending: { color: 'yellow', label: 'รอดำเนินการ' },
}

export default function SalesPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | null>(null)
  const [dateTo, setDateTo] = useState<Date | null>(null)
  const [filterPayment, setFilterPayment] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)
  const [voidSaleId, setVoidSaleId] = useState<number | null>(null)

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  // === Data Queries ===
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales', dateFrom, dateTo, filterStatus, filterType],
    queryFn: () => {
      const params: any = {}
      if (dateFrom) params.from = dateFrom.toISOString().split('T')[0]
      if (dateTo) params.to = dateTo.toISOString().split('T')[0] + ' 23:59:59'
      if (filterStatus) params.status = filterStatus
      if (filterType) params.saleType = filterType
      return api.get('/sales', { params }).then(r => r.data)
    },
  })

  const { data: saleDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['sale-detail', selectedSaleId],
    queryFn: () => api.get(`/sales/${selectedSaleId}`).then(r => r.data),
    enabled: !!selectedSaleId,
  })

  const voidMutation = useMutation({
    mutationFn: (id: number) => api.put(`/sales/${id}/void`),
    onSuccess: () => {
      notifications.show({ title: '✅ ยกเลิกบิลสำเร็จ', message: 'บิลถูกยกเลิกแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      setShowVoidConfirm(false)
      setShowDetail(false)
      setSelectedSaleId(null)
    },
    onError: () => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถยกเลิกบิลได้', color: 'red' })
    },
  })

  // === Filtered + Paginated ===
  const filtered = useMemo(() => {
    let result = sales
    if (search) {
      const s = search.toLowerCase()
      result = result.filter((r: any) =>
        r.invoice_number?.toLowerCase().includes(s) ||
        r.customer_name?.toLowerCase().includes(s) ||
        r.cashier_name?.toLowerCase().includes(s)
      )
    }
    if (filterPayment) {
      result = result.filter((r: any) => r.payment_method === filterPayment)
    }
    return result
  }, [sales, search, filterPayment])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // === Stats ===
  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const stats = useMemo(() => {
    const completed = sales.filter((s: any) => s.status !== 'voided')
    const todaySales = completed.filter((s: any) => s.sold_at?.startsWith(today))
    const monthSales = completed.filter((s: any) => s.sold_at >= monthStart)
    const voided = sales.filter((s: any) => s.status === 'voided')

    return {
      todayTotal: todaySales.reduce((s: number, r: any) => s + parseFloat(r.net_amount || 0), 0),
      todayCount: todaySales.length,
      monthTotal: monthSales.reduce((s: number, r: any) => s + parseFloat(r.net_amount || 0), 0),
      monthCount: monthSales.length,
      avgOrder: completed.length > 0
        ? completed.reduce((s: number, r: any) => s + parseFloat(r.net_amount || 0), 0) / completed.length : 0,
      voidedCount: voided.length,
      voidedTotal: voided.reduce((s: number, r: any) => s + parseFloat(r.net_amount || 0), 0),
    }
  }, [sales, today, monthStart])

  const hasFilters = !!dateFrom || !!dateTo || !!filterPayment || !!filterType || !!filterStatus || !!search
  const clearFilters = () => {
    setSearch(''); setDateFrom(null); setDateTo(null)
    setFilterPayment(null); setFilterType(null); setFilterStatus(null)
    setPage(1)
  }

  const openDetail = (id: number) => { setSelectedSaleId(id); setShowDetail(true) }
  const openVoid = (id: number) => { setVoidSaleId(id); setShowVoidConfirm(true) }

  const PaymentBadge = ({ method }: { method: string }) => {
    const pm = paymentIcons[method] || paymentIcons.cash
    return (
      <Badge variant="light" color={pm.color.replace('#', '')} size="sm"
        leftSection={<pm.icon size={12} />} style={{ color: pm.color }}>
        {pm.label}
      </Badge>
    )
  }

  return (
    <Stack gap="lg">
      <Text size="xl" fw={800}>📋 รายการขาย</Text>

      {/* === Stat Cards === */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="stat-card">
          <Group gap={6}><IconCash size={16} color="var(--app-success)" /><Text size="xs" c="dimmed">ยอดขายวันนี้</Text></Group>
          <Text fw={800} size="xl" c="green" mt={4}>฿{fmt(stats.todayTotal)}</Text>
          <Text size="xs" c="dimmed">{stats.todayCount} บิล</Text>
        </div>
        <div className="stat-card">
          <Group gap={6}><IconTrendingUp size={16} color="var(--app-primary)" /><Text size="xs" c="dimmed">ยอดขายเดือนนี้</Text></Group>
          <Text fw={800} size="xl" c="blue" mt={4}>฿{fmt(stats.monthTotal)}</Text>
          <Text size="xs" c="dimmed">{stats.monthCount} บิล</Text>
        </div>
        <div className="stat-card">
          <Group gap={6}><IconFileInvoice size={16} color="#7c3aed" /><Text size="xs" c="dimmed">ยอดเฉลี่ยต่อบิล</Text></Group>
          <Text fw={800} size="xl" style={{ color: '#7c3aed' }} mt={4}>฿{fmt(stats.avgOrder)}</Text>
          <Text size="xs" c="dimmed">{filtered.length} บิลทั้งหมด</Text>
        </div>
        <div className="stat-card">
          <Group gap={6}><IconAlertTriangle size={16} color="var(--app-danger)" /><Text size="xs" c="dimmed">บิลยกเลิก</Text></Group>
          <Text fw={800} size="xl" c="red" mt={4}>{stats.voidedCount}</Text>
          <Text size="xs" c="dimmed">฿{fmt(stats.voidedTotal)}</Text>
        </div>
      </div>

      {/* === Filter Toolbar === */}
      <Card shadow="xs" padding="sm" radius="md" withBorder>
        <Group gap="sm" wrap="wrap">
          <IconFilter size={16} color="var(--app-text-dim)" />
          <TextInput size="xs" placeholder="ค้นหาเลขบิล / ลูกค้า" style={{ width: 180 }}
            leftSection={<IconSearch size={14} />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <DatePickerInput size="xs" placeholder="จากวันที่" clearable
            leftSection={<IconCalendar size={14} />}
            value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1) }}
            style={{ width: 150 }} valueFormat="DD MMM YYYY" />
          <DatePickerInput size="xs" placeholder="ถึงวันที่" clearable
            leftSection={<IconCalendar size={14} />}
            value={dateTo} onChange={(v) => { setDateTo(v); setPage(1) }}
            style={{ width: 150 }} valueFormat="DD MMM YYYY" />
          <Select size="xs" placeholder="ช่องทางชำระ" clearable style={{ width: 140 }}
            data={[
              { value: 'cash', label: 'เงินสด' }, { value: 'transfer', label: 'โอนเงิน' },
              { value: 'credit_card', label: 'บัตรเครดิต' }, { value: 'qr_code', label: 'QR Code' },
            ]}
            value={filterPayment} onChange={(v) => { setFilterPayment(v); setPage(1) }} />
          <Select size="xs" placeholder="ประเภท" clearable style={{ width: 110 }}
            data={[{ value: 'pos', label: 'POS' }, { value: 'online', label: 'ออนไลน์' }]}
            value={filterType} onChange={(v) => { setFilterType(v); setPage(1) }} />
          <Select size="xs" placeholder="สถานะ" clearable style={{ width: 120 }}
            data={[{ value: 'completed', label: 'สำเร็จ' }, { value: 'voided', label: 'ยกเลิก' }]}
            value={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1) }} />
          {hasFilters && (
            <Tooltip label="ล้างตัวกรอง">
              <ActionIcon size="sm" variant="light" color="red" onClick={clearFilters}>
                <IconFilterOff size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Card>

      {/* === Data Table === */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <Card shadow="xs" padding={0} radius="md" withBorder>
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>เลขบิล</Table.Th>
                  <Table.Th>วันที่/เวลา</Table.Th>
                  <Table.Th>ลูกค้า</Table.Th>
                  <Table.Th>พนักงาน</Table.Th>
                  <Table.Th>ช่องทาง</Table.Th>
                  <Table.Th ta="right">ยอดรวม</Table.Th>
                  <Table.Th ta="right">ส่วนลด</Table.Th>
                  <Table.Th ta="right">VAT</Table.Th>
                  <Table.Th ta="right">ยอดสุทธิ</Table.Th>
                  <Table.Th ta="center">สถานะ</Table.Th>
                  <Table.Th ta="center">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginated.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={11}>
                      <Text ta="center" c="dimmed" py="xl">ไม่พบข้อมูลรายการขาย</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginated.map((sale: any) => {
                    const st = statusBadge[sale.status] || statusBadge.completed
                    return (
                      <Table.Tr key={sale.id} style={{ cursor: 'pointer' }}
                        onClick={() => openDetail(sale.id)}>
                        <Table.Td>
                          <Text size="sm" fw={600} ff="monospace">{sale.invoice_number}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">{fmtDate(sale.sold_at)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{sale.customer_name || 'ลูกค้าทั่วไป'}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{sale.cashier_name || '-'}</Text>
                        </Table.Td>
                        <Table.Td><PaymentBadge method={sale.payment_method} /></Table.Td>
                        <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(sale.total_amount))}</Text></Table.Td>
                        <Table.Td ta="right">
                          {parseFloat(sale.discount_amount) > 0 && (
                            <Text size="sm" c="red">-฿{fmt(parseFloat(sale.discount_amount))}</Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">
                          {parseFloat(sale.vat_amount) > 0 && (
                            <Text size="xs" c="dimmed">฿{fmt(parseFloat(sale.vat_amount))}</Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" fw={700} c="green">฿{fmt(parseFloat(sale.net_amount))}</Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge color={st.color} variant="light" size="sm">{st.label}</Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Group gap={4} justify="center" onClick={(e) => e.stopPropagation()}>
                            <Tooltip label="ดูรายละเอียด">
                              <ActionIcon size="sm" variant="light" onClick={() => openDetail(sale.id)}>
                                <IconEye size={14} />
                              </ActionIcon>
                            </Tooltip>
                            {sale.status !== 'voided' && (
                              <Tooltip label="ยกเลิกบิล">
                                <ActionIcon size="sm" variant="light" color="red" onClick={() => openVoid(sale.id)}>
                                  <IconX size={14} />
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
      )}

      {/* === Sale Detail Modal === */}
      <Modal opened={showDetail} onClose={() => { setShowDetail(false); setSelectedSaleId(null) }}
        title="🧾 รายละเอียดบิล" size="lg" centered>
        {detailLoading ? <Loader style={{ margin: '20px auto', display: 'block' }} /> : saleDetail && (
          <Stack gap="md">
            {/* Header Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Text size="xs" c="dimmed">เลขบิล</Text>
                <Text fw={700} ff="monospace">{saleDetail.invoice_number}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">วันที่</Text>
                <Text fw={500}>{fmtDate(saleDetail.sold_at)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">แคชเชียร์</Text>
                <Text>{saleDetail.cashier_name || '-'}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">สถานะ</Text>
                <Badge color={(statusBadge[saleDetail.status] || statusBadge.completed).color} variant="light">
                  {(statusBadge[saleDetail.status] || statusBadge.completed).label}
                </Badge>
              </div>
            </div>

            <Divider />

            {/* Items Table */}
            <Text fw={600} size="sm">รายการสินค้า</Text>
            <Table verticalSpacing="xs" horizontalSpacing="sm" withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>สินค้า</Table.Th>
                  <Table.Th ta="center">จำนวน</Table.Th>
                  <Table.Th ta="right">ราคา</Table.Th>
                  <Table.Th ta="right">ส่วนลด</Table.Th>
                  <Table.Th ta="right">รวม</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {saleDetail.items?.map((item: any) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{item.product_name}</Text>
                      <Text size="xs" c="dimmed" ff="monospace">{item.sku}</Text>
                    </Table.Td>
                    <Table.Td ta="center">{item.quantity}</Table.Td>
                    <Table.Td ta="right">฿{fmt(parseFloat(item.unit_price))}</Table.Td>
                    <Table.Td ta="right">
                      {parseFloat(item.discount) > 0 ? (
                        <Text size="sm" c="red">-฿{fmt(parseFloat(item.discount))}</Text>
                      ) : '-'}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fw={600}>฿{fmt(parseFloat(item.subtotal))}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Divider />

            {/* Totals */}
            <div style={{ maxWidth: 300, marginLeft: 'auto' }}>
              <div className="cart-total-row">
                <span>ยอดรวม</span>
                <span>฿{fmt(parseFloat(saleDetail.total_amount))}</span>
              </div>
              {parseFloat(saleDetail.discount_amount) > 0 && (
                <div className="cart-total-row discount">
                  <span>ส่วนลด</span>
                  <span>-฿{fmt(parseFloat(saleDetail.discount_amount))}</span>
                </div>
              )}
              {parseFloat(saleDetail.vat_amount) > 0 && (
                <div className="cart-total-row">
                  <span>VAT</span>
                  <span>฿{fmt(parseFloat(saleDetail.vat_amount))}</span>
                </div>
              )}
              <Divider my={4} />
              <div className="cart-total-row grand">
                <span>ยอดสุทธิ</span>
                <span>฿{fmt(parseFloat(saleDetail.net_amount))}</span>
              </div>
            </div>

            {/* Payment Info */}
            {saleDetail.payments?.length > 0 && (
              <>
                <Text fw={600} size="sm">การชำระเงิน</Text>
                {saleDetail.payments.map((p: any) => (
                  <Group key={p.id} justify="space-between" px="sm">
                    <PaymentBadge method={p.method} />
                    <Text fw={600}>฿{fmt(parseFloat(p.amount))}</Text>
                  </Group>
                ))}
              </>
            )}

            {/* Void Button */}
            {saleDetail.status !== 'voided' && (
              <Button fullWidth variant="light" color="red" onClick={() => openVoid(saleDetail.id)}
                leftSection={<IconX size={16} />}>
                ยกเลิกบิลนี้
              </Button>
            )}
          </Stack>
        )}
      </Modal>

      {/* === Void Confirm Modal === */}
      <Modal opened={showVoidConfirm} onClose={() => setShowVoidConfirm(false)}
        title="⚠️ ยืนยันยกเลิกบิล" size="sm" centered>
        <Stack gap="md">
          <Text size="sm">คุณต้องการยกเลิกบิลนี้ใช่หรือไม่? การยกเลิกไม่สามารถย้อนกลับได้</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={() => setShowVoidConfirm(false)}>ยกเลิก</Button>
            <Button color="red" loading={voidMutation.isPending}
              onClick={() => voidSaleId && voidMutation.mutate(voidSaleId)}>
              ยืนยันยกเลิกบิล
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
