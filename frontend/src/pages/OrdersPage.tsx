import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Badge, Loader, Select,
  Table, ActionIcon, Tooltip, Divider, Card, Pagination, Modal
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconFilterOff, IconEye, IconPlus, IconTruckDelivery,
  IconPackage, IconCheck, IconX, IconClock, IconShoppingBag,
  IconBrandFacebook, IconBrandShopee, IconWorld, IconPhone,
  IconMapPin, IconFileInvoice, IconArrowRight, IconAlertTriangle, IconTrash
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt, fmtDateTime as fmtDate } from '../utils/formatters'
import {
  ORDER_STATUSES as statusConfig,
  PLATFORM_CONFIG as platformConfig,
  PAYMENT_LABELS as paymentLabels,
  ORDER_NEXT_STATUS as nextStatus,
} from '../utils/constants'

const PAGE_SIZE = 15

export default function OrdersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [trackingInput, setTrackingInput] = useState('')
  const [shippingProviderInput, setShippingProviderInput] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{id: number; number: string} | null>(null)



  // === Queries ===
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', filterPlatform, filterStatus],
    queryFn: () => {
      const params: any = {}
      if (filterPlatform) params.platform = filterPlatform
      if (filterStatus) params.status = filterStatus
      return api.get('/orders', { params }).then(r => r.data)
    },
  })



  const updateStatusMutation = useMutation({
    mutationFn: ({ id, orderStatus, trackingNumber, shippingProvider }:
      { id: number; orderStatus: string; trackingNumber?: string; shippingProvider?: string }) =>
      api.put(`/orders/${id}/status`, { orderStatus, trackingNumber, shippingProvider }),
    onSuccess: () => {
      notifications.show({ title: '✅ อัพเดตสำเร็จ', message: 'เปลี่ยนสถานะออเดอร์แล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: () => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถอัพเดตสถานะได้', color: 'red' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (orderId: number) => api.delete(`/orders/${orderId}`),
    onSuccess: () => {
      notifications.show({ title: '✅ ลบสำเร็จ', message: 'ลบออเดอร์เรียบร้อย', color: 'green' })
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' })
    },
  })


  const filtered = useMemo(() => {
    let result = orders
    if (filterStatus) {
      result = result.filter((o: any) => o.order_status === filterStatus)
    }
    if (search) {
      const s = search.toLowerCase()
      result = result.filter((o: any) =>
        o.order_number?.toLowerCase().includes(s) ||
        o.customer_name?.toLowerCase().includes(s) ||
        o.customer_phone?.includes(s) ||
        o.tracking_number?.toLowerCase().includes(s)
      )
    }
    return result
  }, [orders, search, filterStatus])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // === Stats ===
  const stats = useMemo(() => {
    const pending = orders.filter((o: any) => o.order_status === 'pending').length
    const packing = orders.filter((o: any) => ['confirmed', 'packing'].includes(o.order_status)).length
    const shipped = orders.filter((o: any) => o.order_status === 'shipped').length
    const delivered = orders.filter((o: any) => o.order_status === 'delivered').length
    const totalRevenue = orders
      .filter((o: any) => o.order_status === 'delivered')
      .reduce((s: number, o: any) => s + parseFloat(o.net_amount || 0), 0)
    return { pending, packing, shipped, delivered, totalRevenue }
  }, [orders])

  const hasFilters = !!search || !!filterPlatform || !!filterStatus
  const clearFilters = () => { setSearch(''); setFilterPlatform(null); setFilterStatus(null); setPage(1) }

  const openDetail = (id: number) => navigate(`/orders/${id}`)

  const handleStatusChange = (id: number, newStatus: string) => {
    const payload: any = { id, orderStatus: newStatus }
    if (newStatus === 'shipped') {
      payload.trackingNumber = trackingInput || undefined
      payload.shippingProvider = shippingProviderInput || undefined
    }
    updateStatusMutation.mutate(payload)
  }

  const PlatformBadge = ({ platform }: { platform: string }) => {
    const p = platformConfig[platform] || platformConfig.other
    return <Badge variant="light" color={p.color} size="sm" leftSection={<p.icon size={12} />}>{p.label}</Badge>
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const s = statusConfig[status] || statusConfig.pending
    return <Badge variant="light" color={s.color} size="sm" leftSection={<s.icon size={12} />}>{s.label}</Badge>
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="xl" fw={800}>🚚 ออเดอร์ออนไลน์</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/orders/create')}
          style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
          สร้างออเดอร์
        </Button>
      </Group>

      {/* === Status Tabs === */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '2px solid var(--app-border, #e5e7eb)',
        overflowX: 'auto', background: 'var(--app-surface, #fff)',
        borderRadius: '10px 10px 0 0', padding: '0 4px',
      }}>
        {[
          { key: null, label: 'ทั้งหมด', color: '#4f46e5' },
          { key: 'pending', label: 'รอยืนยัน', color: '#eab308' },
          { key: 'confirmed', label: 'ยืนยันแล้ว', color: '#3b82f6' },
          { key: 'packing', label: 'กำลังแพ็ค', color: '#06b6d4' },
          { key: 'shipped', label: 'จัดส่งแล้ว', color: '#6366f1' },
          { key: 'delivered', label: 'ได้รับแล้ว', color: '#059669' },
          { key: 'cancelled', label: 'ยกเลิก', color: '#ef4444' },
          { key: 'returned', label: 'คืนสินค้า', color: '#f97316' },
        ].map(tab => {
          const count = tab.key === null
            ? orders.length
            : orders.filter((o: any) => o.order_status === tab.key).length
          const isActive = filterStatus === tab.key
          return (
            <button key={tab.key || 'all'}
              onClick={() => { setFilterStatus(tab.key); setPage(1) }}
              style={{
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: 'transparent', whiteSpace: 'nowrap',
                borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                color: isActive ? tab.color : 'var(--app-text-secondary, #6b7280)',
                fontWeight: isActive ? 700 : 500, fontSize: 13,
                transition: 'all 0.2s ease',
              }}>
              {tab.label}
              {count > 0 && (
                <span style={{
                  marginLeft: 6, padding: '1px 7px', borderRadius: 10,
                  fontSize: 11, fontWeight: 700,
                  background: isActive ? tab.color : '#e5e7eb',
                  color: isActive ? '#fff' : '#6b7280',
                }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* === Filter Toolbar === */}
      <Card shadow="xs" padding="sm" radius="md" withBorder style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -16 }}>
        <Group gap="sm" wrap="wrap">
          <TextInput size="xs" placeholder="ค้นหาเลขออเดอร์ / ลูกค้า / Tracking" style={{ width: 260 }}
            leftSection={<IconSearch size={14} />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <Select size="xs" placeholder="ช่องทาง" clearable style={{ width: 130 }}
            data={Object.entries(platformConfig).map(([k, v]) => ({ value: k, label: v.label }))}
            value={filterPlatform} onChange={(v) => { setFilterPlatform(v); setPage(1) }} />
          {hasFilters && (
            <Tooltip label="ล้างตัวกรอง">
              <ActionIcon size="sm" variant="light" color="red" onClick={clearFilters}>
                <IconFilterOff size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Text size="xs" c="dimmed" ml="auto">{filtered.length} ออเดอร์</Text>
        </Group>
      </Card>

      {/* === Data Table === */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <Card shadow="xs" padding={0} radius="md" withBorder>
          <Table.ScrollContainer minWidth={1000}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>เลขออเดอร์</Table.Th>
                  <Table.Th>วันที่</Table.Th>
                  <Table.Th>ช่องทาง</Table.Th>
                  <Table.Th>ลูกค้า</Table.Th>
                  <Table.Th ta="right">ยอดสุทธิ</Table.Th>
                  <Table.Th ta="center">ชำระเงิน</Table.Th>
                  <Table.Th ta="center">สถานะ</Table.Th>
                  <Table.Th>Tracking</Table.Th>
                  <Table.Th ta="center">สถานะเอกสาร</Table.Th>
                  <Table.Th ta="center" style={{width:50}}></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginated.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={9}>
                      <Text ta="center" c="dimmed" py="xl">ไม่พบออเดอร์</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginated.map((o: any) => (
                    <Table.Tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(o.id)}>
                      <Table.Td><Text size="sm" fw={600} ff="monospace">{o.order_number}</Text></Table.Td>
                      <Table.Td><Text size="xs" c="dimmed">{fmtDate(o.created_at)}</Text></Table.Td>
                      <Table.Td><PlatformBadge platform={o.platform} /></Table.Td>
                      <Table.Td>
                        <Text size="sm">{o.customer_name || o.customer_name_ref || '-'}</Text>
                        {o.customer_phone && <Text size="xs" c="dimmed">{o.customer_phone}</Text>}
                      </Table.Td>
                      <Table.Td ta="right"><Text size="sm" fw={700} c="green">฿{fmt(parseFloat(o.net_amount))}</Text></Table.Td>
                      <Table.Td ta="center">
                        <Badge color={o.payment_status === 'confirmed' ? 'green' : 'yellow'} variant="light" size="sm">
                          {o.payment_status === 'confirmed' ? 'ชำระแล้ว' : 'รอชำระ'}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="center"><StatusBadge status={o.order_status} /></Table.Td>
                      <Table.Td>
                        {o.tracking_number ? (
                          <Text size="xs" ff="monospace">{o.tracking_number}</Text>
                        ) : <Text size="xs" c="dimmed">-</Text>}
                      </Table.Td>
                      <Table.Td ta="center"><StatusBadge status={o.order_status} /></Table.Td>
                      <Table.Td ta="center" onClick={(e: any) => e.stopPropagation()}>
                        {o.order_status === 'pending' && (
                          <Tooltip label="ลบออเดอร์">
                            <ActionIcon size="sm" variant="light" color="red"
                              onClick={() => setDeleteTarget({ id: o.id, number: o.order_number })}>
                              <IconTrash size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))
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

      {/* Delete Confirmation Modal */}
      <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        title="⚠️ ยืนยันการลบ" size="sm" centered>
        <Stack gap="md">
          <Text>คุณต้องการลบออเดอร์ <Text span fw={700} ff="monospace">{deleteTarget?.number}</Text> ใช่หรือไม่?</Text>
          <Text size="sm" c="red">การลบจะไม่สามารถย้อนกลับได้</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button color="red" leftSection={<IconTrash size={16} />}
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              ลบออเดอร์
            </Button>
          </Group>
        </Stack>
      </Modal>

    </Stack>
  )
}
