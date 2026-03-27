import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
  IconCalendar, IconFileInvoice, IconTrendingUp, IconAlertTriangle,
  IconUser, IconClock, IconHash, IconShoppingCart,
  IconExternalLink, IconFilePlus, IconTrash, IconFileSpreadsheet,
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt, fmtDateTime as fmtDate } from '../../utils/formatters'
import { downloadExcel } from '../../utils/exportHelpers'
import type { Sale, SaleItem, SalePayment, SalesQueryParams } from '../../types'

const PAGE_SIZE = 15

const paymentIcons: Record<string, { icon: any; label: string; color: string }> = {
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
  const navigate = useNavigate()
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
  const [voidDocConfirmId, setVoidDocConfirmId] = useState<number | null>(null)
  const [deleteDocConfirmId, setDeleteDocConfirmId] = useState<number | null>(null)
  const [deleteSaleConfirmId, setDeleteSaleConfirmId] = useState<number | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  // === Data Queries ===
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales', dateFrom, dateTo, filterStatus, filterType],
    queryFn: () => {
      const params: SalesQueryParams = {}
      if (dateFrom) params.from = dateFrom.toISOString().split('T')[0]
      if (dateTo) params.to = dateTo.toISOString().split('T')[0] + ' 23:59:59'
      if (filterStatus) params.status = filterStatus
      if (filterType) params.saleType = filterType
      return api.get('/sales', { params }).then(r => r.data)
    },
  })

  const { data: companySettings } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  const vatEnabled = companySettings?.settings?.vat_enabled !== false

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

  const voidDocMutation = useMutation({
    mutationFn: (docId: number) => api.put(`/sales-doc/${docId}/void`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกเอกสารแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['sale-detail', selectedSaleId] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-docs'] })
      setVoidDocConfirmId(null)
    },
    onError: (e: any) => {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' })
    },
  })

  const deleteSaleMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/sales/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบบิลขายแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      setDeleteSaleConfirmId(null)
      setShowDetail(false)
      setSelectedSaleId(null)
    },
    onError: (e: any) => {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'ไม่สามารถลบบิลได้', color: 'red' })
    },
  })

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => api.delete(`/sales-doc/${docId}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบเอกสารแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['sale-detail', selectedSaleId] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      queryClient.invalidateQueries({ queryKey: ['sales-docs'] })
      setDeleteDocConfirmId(null)
    },
    onError: (e: any) => {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'ไม่สามารถลบเอกสารได้', color: 'red' })
    },
  })

  // === Filtered + Paginated ===
  const filtered = useMemo(() => {
    let result = sales
    if (search) {
      const s = search.toLowerCase()
      result = result.filter((r: Sale) =>
        r.invoice_number?.toLowerCase().includes(s) ||
        r.customer_name?.toLowerCase().includes(s) ||
        r.cashier_name?.toLowerCase().includes(s)
      )
    }
    if (filterPayment) {
      result = result.filter((r: Sale) => r.payment_method === filterPayment)
    }
    return result
  }, [sales, search, filterPayment])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // === Stats ===
  const today = new Date().toISOString().split('T')[0]
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

  const stats = useMemo(() => {
    const completed = sales.filter((s: Sale) => s.status !== 'voided')
    const todaySales = completed.filter((s: Sale) => s.sold_at?.startsWith(today))
    const monthSales = completed.filter((s: Sale) => s.sold_at >= monthStart)
    const voided = sales.filter((s: Sale) => s.status === 'voided')

    return {
      todayTotal: todaySales.reduce((s: number, r: Sale) => s + parseFloat(r.net_amount || '0'), 0),
      todayCount: todaySales.length,
      monthTotal: monthSales.reduce((s: number, r: Sale) => s + parseFloat(r.net_amount || '0'), 0),
      monthCount: monthSales.length,
      avgOrder: completed.length > 0
        ? completed.reduce((s: number, r: Sale) => s + parseFloat(r.net_amount || '0'), 0) / completed.length : 0,
      voidedCount: voided.length,
      voidedTotal: voided.reduce((s: number, r: Sale) => s + parseFloat(r.net_amount || '0'), 0),
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
          <Button size="xs" variant="light" color="green" leftSection={<IconFileSpreadsheet size={14} />}
            loading={exportLoading}
            onClick={async () => {
              try {
                setExportLoading(true)
                const params = new URLSearchParams()
                if (dateFrom) params.set('from', dateFrom.toISOString().split('T')[0])
                if (dateTo) params.set('to', dateTo.toISOString().split('T')[0])
                if (filterStatus) params.set('status', filterStatus)
                const qs = params.toString()
                await downloadExcel(`/exports/sales${qs ? '?' + qs : ''}`, 'sales-report.xlsx')
                notifications.show({ title: 'สำเร็จ', message: 'ส่งออกรายการขายสำเร็จ', color: 'green' })
              } catch {
                notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถส่งออกข้อมูลได้', color: 'red' })
              } finally {
                setExportLoading(false)
              }
            }}>
            ส่งออก Excel
          </Button>
        </Group>
      </Card>

      {/* === Data Table === */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <Card shadow="xs" padding={0} radius="md" withBorder>
          <Table.ScrollContainer minWidth={750}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>เลขบิล</Table.Th>
                  <Table.Th>วันที่</Table.Th>
                  <Table.Th>ลูกค้า</Table.Th>
                  <Table.Th>ช่องทาง</Table.Th>
                  <Table.Th ta="right">ยอดสุทธิ</Table.Th>
                  <Table.Th ta="center">สถานะ</Table.Th>
                  <Table.Th ta="center">ใบเสร็จ</Table.Th>
                  <Table.Th ta="center" style={{ width: 140 }}>จัดการ</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginated.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text ta="center" c="dimmed" py="xl">ไม่พบข้อมูลรายการขาย</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginated.map((sale: Sale) => {
                    const st = statusBadge[sale.status] || statusBadge.completed
                    return (
                      <Table.Tr key={sale.id} style={{ cursor: 'pointer' }}
                        onClick={() => openDetail(sale.id)}>
                        <Table.Td>
                          <Text size="sm" fw={600} ff="monospace">{sale.invoice_number}</Text>
                          {sale.linked_doc_refs && (
                            <Group gap={4} mt={2}>
                              {sale.linked_doc_refs.split('|').map((ref: string, i: number) => {
                                const [type, num] = ref.split(':')
                                const colors: Record<string, string> = { receipt: 'green', receipt_tax: 'violet', receipt_abb: 'cyan', invoice: 'indigo' }
                                const labels: Record<string, string> = { receipt: 'RC', receipt_tax: 'RT', receipt_abb: 'RA', invoice: 'IV' }
                                return <Badge key={i} size="xs" variant="dot" color={colors[type] || 'gray'}>{labels[type] || type} {num}</Badge>
                              })}
                            </Group>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">{fmtDate(sale.sold_at)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <div>
                            <Text size="sm">{sale.customer_name || 'ลูกค้าทั่วไป'}</Text>
                            {sale.cashier_name && <Text size="xs" c="dimmed">{sale.cashier_name}</Text>}
                          </div>
                        </Table.Td>
                        <Table.Td><PaymentBadge method={sale.payment_method} /></Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" fw={700} c="green">฿{fmt(parseFloat(sale.net_amount))}</Text>
                          {parseFloat(sale.discount_amount) > 0 && (
                            <Text size="xs" c="red">-฿{fmt(parseFloat(sale.discount_amount))}</Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge color={st.color} variant="light" size="sm">{st.label}</Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          {(() => {
                            const refs = sale.linked_doc_refs
                            if (!refs) return <Badge variant="light" color="gray" size="xs">ยังไม่ออก</Badge>
                            const docs = refs.split('|')
                            const hasReceipt = docs.some((r: string) => r.startsWith('receipt:') || r.startsWith('receipt_tax:') || r.startsWith('receipt_abb:'))
                            return hasReceipt
                              ? <Badge variant="filled" color="green" size="xs">ออกแล้ว</Badge>
                              : <Badge variant="light" color="gray" size="xs">ยังไม่ออก</Badge>
                          })()}
                        </Table.Td>
                        <Table.Td ta="center">
                          <Group gap={6} justify="center" onClick={(e) => e.stopPropagation()}>
                            <Tooltip label="ดูรายละเอียด">
                              <ActionIcon size="sm" variant="light" onClick={() => openDetail(sale.id)}>
                                <IconEye size={14} />
                              </ActionIcon>
                            </Tooltip>
                            {sale.status !== 'voided' ? (
                              <Button size="compact-xs" variant="light" color="red"
                                leftSection={<IconX size={12} />}
                                onClick={() => openVoid(sale.id)}>
                                ยกเลิก
                              </Button>
                            ) : (
                              <Button size="compact-xs" variant="light" color="red"
                                leftSection={<IconTrash size={12} />}
                                onClick={() => setDeleteSaleConfirmId(sale.id)}>
                                ลบ
                              </Button>
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
        size="lg" centered padding={0}
        styles={{ header: { display: 'none' }, body: { padding: 0, maxHeight: '85vh', overflowY: 'auto' } }}>
        {detailLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : saleDetail && (() => {
          const isVoided = saleDetail.status === 'voided'
          const st = statusBadge[saleDetail.status] || statusBadge.completed
          return (
            <div>
              {/* ─── Gradient Header ─── */}
              <div style={{
                background: isVoided
                  ? 'linear-gradient(135deg, #991b1b, #dc2626)'
                  : 'linear-gradient(135deg, #059669, #10b981)',
                padding: '20px 24px',
                position: 'relative',
              }}>
                <ActionIcon variant="transparent" size="sm"
                  style={{ position: 'absolute', top: 12, right: 12, color: 'rgba(255,255,255,0.7)' }}
                  onClick={() => { setShowDetail(false); setSelectedSaleId(null) }}>
                  <IconX size={18} />
                </ActionIcon>

                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="xs" c="rgba(255,255,255,0.7)" fw={600} tt="uppercase" lts={1}>
                      รายละเอียดบิลขาย
                    </Text>
                    <Text size="xl" fw={800} c="white" ff="monospace" mt={4}>
                      {saleDetail.invoice_number}
                    </Text>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Badge color="white" variant="white" size="lg"
                      style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
                      {st.label}
                    </Badge>
                    <Text size="xs" c="rgba(255,255,255,0.8)" mt={8}>
                      <IconClock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      {fmtDate(saleDetail.sold_at)}
                    </Text>
                  </div>
                </Group>

                {/* Quick stats bar */}
                <div style={{
                  display: 'flex', gap: 16, marginTop: 16, paddingTop: 14,
                  borderTop: '1px solid rgba(255,255,255,0.2)',
                }}>
                  <div style={{ flex: 1 }}>
                    <Text size="xs" c="rgba(255,255,255,0.6)">ลูกค้า</Text>
                    <Text size="sm" fw={600} c="white">
                      <IconUser size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      {saleDetail.customer_name || 'ลูกค้าทั่วไป'}
                    </Text>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text size="xs" c="rgba(255,255,255,0.6)">แคชเชียร์</Text>
                    <Text size="sm" fw={600} c="white">{saleDetail.cashier_name || '-'}</Text>
                  </div>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <Text size="xs" c="rgba(255,255,255,0.6)">ยอดสุทธิ</Text>
                    <Text size="lg" fw={800} c="white">฿{fmt(parseFloat(saleDetail.net_amount))}</Text>
                  </div>
                </div>
              </div>

              {/* ─── Body Content ─── */}
              <Stack gap="md" p="lg">

                {/* ─── Items Section ─── */}
                <div>
                  <Group gap={8} mb={10}>
                    <IconShoppingCart size={16} color="var(--app-primary)" />
                    <Text fw={700} size="sm">รายการสินค้า</Text>
                    <Badge variant="light" size="xs" color="blue">{saleDetail.items?.length || 0} รายการ</Badge>
                  </Group>
                  <div style={{ borderRadius: 10, border: '1px solid var(--app-border)', overflow: 'hidden' }}>
                    <Table verticalSpacing={10} horizontalSpacing="md" striped>
                      <Table.Thead>
                        <Table.Tr style={{ background: 'var(--app-surface-light)' }}>
                          <Table.Th style={{ width: 30 }}><Text size="xs" c="dimmed" ta="center">#</Text></Table.Th>
                          <Table.Th><Text size="xs" c="dimmed">สินค้า</Text></Table.Th>
                          <Table.Th ta="center" style={{ width: 65 }}><Text size="xs" c="dimmed">จำนวน</Text></Table.Th>
                          <Table.Th ta="right" style={{ width: 100 }}><Text size="xs" c="dimmed">ราคา</Text></Table.Th>
                          <Table.Th ta="right" style={{ width: 80 }}><Text size="xs" c="dimmed">ส่วนลด</Text></Table.Th>
                          <Table.Th ta="right" style={{ width: 110 }}><Text size="xs" c="dimmed">รวม</Text></Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {saleDetail.items?.map((item: SaleItem, idx: number) => (
                          <Table.Tr key={item.id}>
                            <Table.Td ta="center"><Text size="xs" c="dimmed">{idx + 1}</Text></Table.Td>
                            <Table.Td>
                              <Text size="sm" fw={600} lineClamp={1}>{item.product_name}</Text>
                              {item.sku && <Text size="xs" c="dimmed" ff="monospace">{item.sku}</Text>}
                            </Table.Td>
                            <Table.Td ta="center">
                              <Badge variant="light" color="gray" size="sm" radius="sm">{item.quantity}</Badge>
                            </Table.Td>
                            <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(item.unit_price))}</Text></Table.Td>
                            <Table.Td ta="right">
                              {parseFloat(item.discount) > 0
                                ? <Text size="sm" c="red" fw={500}>-฿{fmt(parseFloat(item.discount))}</Text>
                                : <Text size="xs" c="dimmed">-</Text>}
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="sm" fw={700} c="green">฿{fmt(parseFloat(item.subtotal))}</Text>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </div>
                </div>

                {/* ─── Summary + Payment Row ─── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Payment Info */}
                  <div style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--app-border)', background: 'var(--app-surface-light)' }}>
                    <Group gap={8} mb={10}>
                      <IconCash size={15} color="#059669" />
                      <Text fw={700} size="sm">การชำระเงิน</Text>
                    </Group>
                    {saleDetail.payments?.length > 0 ? (
                      <Stack gap={6}>
                        {saleDetail.payments.map((p: SalePayment) => {
                          const pm = paymentIcons[p.method] || paymentIcons.cash
                          return (
                            <Group key={p.id} justify="space-between" style={{
                              padding: '8px 12px', borderRadius: 8, background: 'var(--app-surface)',
                              border: '1px solid var(--app-border)',
                            }}>
                              <Group gap={8}>
                                <div style={{
                                  width: 28, height: 28, borderRadius: 6, display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                  background: `${pm.color}18`,
                                }}>
                                  <pm.icon size={14} color={pm.color} />
                                </div>
                                <Text size="sm" fw={500}>{pm.label}</Text>
                              </Group>
                              <Text size="sm" fw={700}>฿{fmt(parseFloat(p.amount))}</Text>
                            </Group>
                          )
                        })}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed" ta="center" py="sm">ไม่มีข้อมูล</Text>
                    )}
                  </div>

                  {/* Totals */}
                  <div style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--app-border)', background: 'var(--app-surface-light)' }}>
                    <Group gap={8} mb={10}>
                      <IconHash size={15} color="var(--app-primary)" />
                      <Text fw={700} size="sm">สรุปยอด</Text>
                    </Group>
                    <Stack gap={4}>
                      <Group justify="space-between">
                        <Text size="sm" c="dimmed">ยอดรวม</Text>
                        <Text size="sm" fw={500}>฿{fmt(parseFloat(saleDetail.total_amount))}</Text>
                      </Group>
                      {parseFloat(saleDetail.discount_amount) > 0 && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">ส่วนลด</Text>
                          <Text size="sm" fw={600} c="red">-฿{fmt(parseFloat(saleDetail.discount_amount))}</Text>
                        </Group>
                      )}
                      {parseFloat(saleDetail.vat_amount) > 0 && (
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">VAT</Text>
                          <Text size="sm">฿{fmt(parseFloat(saleDetail.vat_amount))}</Text>
                        </Group>
                      )}
                      <Divider my={6} />
                      <Group justify="space-between">
                        <Text size="md" fw={800}>ยอดสุทธิ</Text>
                        <Text size="lg" fw={800} c="green">฿{fmt(parseFloat(saleDetail.net_amount))}</Text>
                      </Group>
                    </Stack>
                  </div>
                </div>

                {/* ─── Documents Section ─── */}
                <div style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--app-border)', background: 'var(--app-surface-light)' }}>
                  <Group gap={8} mb={10}>
                    <IconFileInvoice size={15} color="#7c3aed" />
                    <Text fw={700} size="sm">เอกสารขาย</Text>
                    {saleDetail.linkedDocs?.length > 0 && (
                      <Badge variant="light" size="xs" color="violet">{saleDetail.linkedDocs.filter((d: any) => d.status !== 'voided').length}</Badge>
                    )}
                  </Group>

                  {saleDetail.linkedDocs?.length > 0 ? (
                    <Stack gap={6}>
                      {saleDetail.linkedDocs.map((doc: any) => {
                        const typeConfig: Record<string, { label: string; color: string; icon: any; bg: string }> = {
                          receipt: { label: 'ใบเสร็จรับเงิน', color: '#059669', icon: IconReceipt, bg: '#05966910' },
                          receipt_tax: { label: 'ใบเสร็จ/ใบกำกับภาษี', color: '#7c3aed', icon: IconReceipt, bg: '#7c3aed10' },
                          receipt_abb: { label: 'ใบกำกับภาษีอย่างย่อ', color: '#0891b2', icon: IconReceipt, bg: '#0891b210' },
                          invoice: { label: 'ใบแจ้งหนี้', color: '#4f46e5', icon: IconFileInvoice, bg: '#4f46e510' },
                        }
                        const tc = typeConfig[doc.doc_type] || { label: doc.doc_type, color: '#6b7280', icon: IconFileInvoice, bg: '#6b728010' }
                        const DocTypeIcon = tc.icon
                        const docVoided = doc.status === 'voided'

                        return (
                          <div key={doc.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', borderRadius: 8,
                            background: docVoided ? '#fef2f2' : 'var(--app-surface)',
                            border: `1px solid ${docVoided ? '#fecaca' : 'var(--app-border)'}`,
                            opacity: docVoided ? 0.7 : 1,
                            transition: 'all 0.15s',
                          }}>
                            <Group gap={10}>
                              <div style={{
                                width: 32, height: 32, borderRadius: 8, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                background: docVoided ? '#fee2e2' : tc.bg,
                              }}>
                                <DocTypeIcon size={16} color={docVoided ? '#dc2626' : tc.color} />
                              </div>
                              <div>
                                <Text size="xs" c={docVoided ? 'red' : 'dimmed'} fw={600}>{tc.label}</Text>
                                <Text size="sm" fw={700} ff="monospace"
                                  c={docVoided ? 'red' : tc.color}
                                  td={docVoided ? 'line-through' : undefined}>
                                  {doc.doc_number}
                                </Text>
                              </div>
                            </Group>
                            <Group gap={6}>
                              <Badge size="sm" variant="light" radius="sm"
                                color={doc.status === 'approved' ? 'green' : doc.status === 'voided' ? 'red' : 'gray'}>
                                {doc.status === 'approved' ? 'อนุมัติ' : doc.status === 'voided' ? 'ยกเลิก' : doc.status === 'draft' ? 'ร่าง' : doc.status}
                              </Badge>
                              {!docVoided && (
                                <>
                                  <Tooltip label="ดูเอกสาร">
                                    <ActionIcon size="sm" variant="light" color={tc.color}
                                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowDetail(false); navigate(`/sales-doc/${doc.id}`) }}>
                                      <IconExternalLink size={13} />
                                    </ActionIcon>
                                  </Tooltip>
                                  <Tooltip label="ยกเลิกเอกสาร">
                                    <ActionIcon size="sm" variant="light" color="red"
                                      onClick={(e: React.MouseEvent) => { e.stopPropagation(); setVoidDocConfirmId(doc.id) }}>
                                      <IconX size={13} />
                                    </ActionIcon>
                                  </Tooltip>
                                </>
                              )}
                              {(doc.status === 'draft' || docVoided) && (
                                <Tooltip label="ลบเอกสารถาวร">
                                  <ActionIcon size="sm" variant="filled" color="red"
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDeleteDocConfirmId(doc.id) }}>
                                    <IconTrash size={12} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                          </div>
                        )
                      })}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed" ta="center" py={6}>ยังไม่มีเอกสารที่เชื่อมกับบิลนี้</Text>
                  )}

                  {/* Create doc buttons */}
                  {!isVoided && (
                    <Group grow gap="sm" mt={10}>
                      {!saleDetail.linkedDocs?.some((d: any) => d.doc_type === 'receipt' && d.status !== 'voided') && (
                        <Button variant="light" color="green" size="xs" radius="md"
                          leftSection={<IconFilePlus size={14} />}
                          onClick={() => { setShowDetail(false); navigate(`/sales-doc/create?type=receipt&saleId=${saleDetail.id}`) }}>
                          ออกใบเสร็จ
                        </Button>
                      )}
                      {vatEnabled && !saleDetail.linkedDocs?.some((d: any) => d.doc_type === 'receipt_tax' && d.status !== 'voided') && (
                        <Button variant="light" color="violet" size="xs" radius="md"
                          leftSection={<IconFilePlus size={14} />}
                          onClick={() => { setShowDetail(false); navigate(`/sales-doc/create?type=receipt_tax&saleId=${saleDetail.id}`) }}>
                          ออกใบกำกับภาษี
                        </Button>
                      )}
                      {vatEnabled && parseFloat(saleDetail.net_amount) <= 1000 && !saleDetail.linkedDocs?.some((d: any) => d.doc_type === 'receipt_abb' && d.status !== 'voided') && (
                        <Button variant="light" color="cyan" size="xs" radius="md"
                          leftSection={<IconFilePlus size={14} />}
                          onClick={() => { setShowDetail(false); navigate(`/sales-doc/create?type=receipt_abb&saleId=${saleDetail.id}`) }}>
                          ออกใบกำกับภาษีอย่างย่อ
                        </Button>
                      )}
                    </Group>
                  )}
                </div>

                {/* ─── Bottom Actions ─── */}
                <Group justify="space-between" pt={4}>
                  <Button variant="subtle" color="gray" size="sm"
                    onClick={() => { setShowDetail(false); setSelectedSaleId(null) }}>
                    ปิด
                  </Button>
                  {!isVoided ? (
                    <Button variant="light" color="red" size="sm" radius="md"
                      leftSection={<IconX size={15} />}
                      onClick={() => openVoid(saleDetail.id)}>
                      ยกเลิกบิลนี้
                    </Button>
                  ) : (
                    <Button variant="filled" color="red" size="sm" radius="md"
                      leftSection={<IconTrash size={15} />}
                      onClick={() => setDeleteSaleConfirmId(saleDetail.id)}>
                      ลบบิลนี้
                    </Button>
                  )}
                </Group>
              </Stack>
            </div>
          )
        })()}
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

      {/* === Void Doc Confirm Modal === */}
      <Modal opened={!!voidDocConfirmId} onClose={() => setVoidDocConfirmId(null)}
        title="⚠️ ยืนยันยกเลิกเอกสาร" size="sm" centered zIndex={250}>
        <Stack gap="md">
          <Text size="sm">คุณต้องการยกเลิกเอกสารนี้ใช่หรือไม่? การยกเลิกไม่สามารถย้อนกลับได้</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="light" onClick={() => setVoidDocConfirmId(null)}>ไม่ ปิดหน้านี้</Button>
            <Button color="red" loading={voidDocMutation.isPending}
              onClick={() => voidDocConfirmId && voidDocMutation.mutate(voidDocConfirmId)}>
              ยืนยัน ยกเลิกเอกสาร
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* === Delete Sale Confirm Modal === */}
      <Modal opened={!!deleteSaleConfirmId} onClose={() => setDeleteSaleConfirmId(null)}
        title="ยืนยันลบบิลขาย" size="sm" centered zIndex={250}>
        <Stack gap="md">
          <Group gap="sm" style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 16px' }}>
            <IconTrash size={20} color="#dc2626" />
            <div>
              <Text size="sm" fw={600} c="red">ลบบิลขายถาวร</Text>
              <Text size="xs" c="dimmed">บิลขายและเอกสารที่เกี่ยวข้องจะถูกลบออกจากระบบทั้งหมดและไม่สามารถกู้คืนได้</Text>
            </div>
          </Group>
          <Group grow>
            <Button variant="light" onClick={() => setDeleteSaleConfirmId(null)}>ยกเลิก</Button>
            <Button color="red" loading={deleteSaleMutation.isPending}
              onClick={() => deleteSaleConfirmId && deleteSaleMutation.mutate(deleteSaleConfirmId)}
              leftSection={<IconTrash size={16} />}>ลบบิลขาย</Button>
          </Group>
        </Stack>
      </Modal>

      {/* === Delete Doc Confirm Modal === */}
      <Modal opened={!!deleteDocConfirmId} onClose={() => setDeleteDocConfirmId(null)}
        title="ยืนยันลบเอกสาร" size="sm" centered zIndex={250}>
        <Stack gap="md">
          <Group gap="sm" style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 16px' }}>
            <IconTrash size={20} color="#dc2626" />
            <div>
              <Text size="sm" fw={600} c="red">ลบเอกสารถาวร</Text>
              <Text size="xs" c="dimmed">เอกสารจะถูกลบออกจากระบบทั้งหมดและไม่สามารถกู้คืนได้</Text>
            </div>
          </Group>
          <Group grow>
            <Button variant="light" onClick={() => setDeleteDocConfirmId(null)}>ยกเลิก</Button>
            <Button color="red" loading={deleteDocMutation.isPending}
              onClick={() => deleteDocConfirmId && deleteDocMutation.mutate(deleteDocConfirmId)}
              leftSection={<IconTrash size={16} />}>ลบเอกสาร</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
