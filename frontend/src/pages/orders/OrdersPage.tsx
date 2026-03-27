import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Badge, Loader, Select,
  Table, ActionIcon, Tooltip, Card, Pagination, Modal, SimpleGrid, Menu,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconFilterOff, IconPlus, IconTruckDelivery,
  IconPackage, IconCheck, IconX, IconClock, IconShoppingBag,
  IconBrandFacebook, IconBrandShopee, IconWorld, IconPhone,
  IconTrash, IconChartBar, IconTrophy, IconDotsVertical,
  IconArrowRight, IconPrinter, IconEye, IconFileBarcode,
} from '@tabler/icons-react'
import api from '../../services/api'
import { printShippingLabels } from '../../utils/printShippingLabels'
import { fmt, fmtDateTime as fmtDate } from '../../utils/formatters'
import {
  ORDER_STATUSES as statusConfig,
  PLATFORM_CONFIG as platformConfig,
  ORDER_NEXT_STATUS as nextStatus,
} from '../../utils/constants'

const PAGE_SIZE = 15

export default function OrdersPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null])
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; number: string } | null>(null)
  const [printModalOpen, setPrintModalOpen] = useState(false)
  const [printDate, setPrintDate] = useState<Date | null>(new Date())
  const [printTarget, setPrintTarget] = useState<'date' | 'packing' | 'filtered' | 'all'>('date')
  const [printSenderType, setPrintSenderType] = useState<'company' | 'custom'>('company')
  const [printSenderName, setPrintSenderName] = useState('')
  const [printSenderPhone, setPrintSenderPhone] = useState('')
  const [printSenderAddress, setPrintSenderAddress] = useState('')

  // === Queries ===
  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

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
    mutationFn: ({ id, orderStatus }: { id: number; orderStatus: string }) =>
      api.put(`/orders/${id}/status`, { orderStatus }),
    onSuccess: () => {
      notifications.show({ title: 'อัพเดตสำเร็จ', message: 'เปลี่ยนสถานะออเดอร์แล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: () => {
      notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถอัพเดตสถานะได้', color: 'red' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (orderId: number) => api.delete(`/orders/${orderId}`),
    onSuccess: () => {
      notifications.show({ title: 'ลบสำเร็จ', message: 'ลบออเดอร์เรียบร้อย', color: 'green' })
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' })
    },
  })

  // === Filtered data ===
  const filtered = useMemo(() => {
    let result = orders
    if (search) {
      const s = search.toLowerCase()
      result = result.filter((o: any) =>
        o.order_number?.toLowerCase().includes(s) ||
        o.customer_name?.toLowerCase().includes(s) ||
        o.customer_phone?.includes(s) ||
        o.tracking_number?.toLowerCase().includes(s)
      )
    }
    if (dateRange[0]) {
      const from = dateRange[0].toISOString().split('T')[0]
      result = result.filter((o: any) => (o.created_at || '').slice(0, 10) >= from)
    }
    if (dateRange[1]) {
      const to = dateRange[1].toISOString().split('T')[0]
      result = result.filter((o: any) => (o.created_at || '').slice(0, 10) <= to)
    }
    return result
  }, [orders, search, dateRange])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // === Platform summary ===
  const platformStats = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {}
    for (const o of orders) {
      const p = o.platform || 'other'
      if (!map[p]) map[p] = { count: 0, revenue: 0 }
      map[p].count++
      map[p].revenue += parseFloat(o.net_amount || 0)
    }
    return Object.entries(map)
      .map(([key, val]) => ({ key, ...val, config: platformConfig[key] || platformConfig.other }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [orders])

  const totalOrderRevenue = orders.reduce((s: number, o: any) => s + parseFloat(o.net_amount || 0), 0)

  // === Print labels ===
  const handlePrintLabels = async (targetOrders: any[]) => {
    const ordersWithItems = await Promise.all(
      targetOrders.map(async (o: any) => {
        try { return (await api.get(`/orders/${o.id}`)).data } catch { return o }
      })
    )

    const senderName = printSenderType === 'custom' && printSenderName ? printSenderName : (company?.name || 'บริษัท')
    const senderPhone = printSenderType === 'custom' && printSenderPhone ? printSenderPhone : (company?.phone || '')
    const senderAddress = printSenderType === 'custom' && printSenderAddress ? printSenderAddress : (company?.address || '')

    const plConfig = platformConfig
    printShippingLabels({
      companyName: senderName,
      companyPhone: senderPhone,
      companyAddress: senderAddress,
      orders: ordersWithItems.map((o: any) => ({
        orderNumber: o.order_number,
        customerName: o.customer_name || '-',
        customerPhone: o.customer_phone,
        shippingAddress: o.shipping_address,
        platform: (plConfig[o.platform] || plConfig.other).label,
        trackingNumber: o.tracking_number,
        shippingProvider: o.shipping_provider,
        items: (o.items || []).map((i: any) => ({ name: i.product_name || i.name || '-', qty: i.quantity })),
        totalAmount: parseFloat(o.net_amount) || 0,
        note: o.note,
      })),
    })
  }

  // ออเดอร์ที่ต้องแพ็ค (confirmed + packing)
  const packingOrders = orders.filter((o: any) => ['confirmed', 'packing'].includes(o.order_status))

  // ออเดอร์ตามวันที่เลือก
  const getOrdersByDate = (date: Date | null) => {
    if (!date) return []
    const d = date.toISOString().split('T')[0]
    return orders.filter((o: any) => (o.created_at || '').slice(0, 10) === d)
  }

  const handlePrintFromModal = () => {
    let target: any[] = []
    if (printTarget === 'date') target = getOrdersByDate(printDate)
    else if (printTarget === 'packing') target = packingOrders
    else if (printTarget === 'filtered') target = filtered
    else target = orders
    if (target.length === 0) { notifications.show({ title: 'ไม่มีข้อมูล', message: 'ไม่พบออเดอร์ที่จะปริ้น', color: 'yellow' }); return }
    handlePrintLabels(target)
    setPrintModalOpen(false)
  }

  const hasFilters = !!search || !!filterPlatform || !!filterStatus || !!dateRange[0] || !!dateRange[1]
  const clearFilters = () => { setSearch(''); setFilterPlatform(null); setFilterStatus(null); setDateRange([null, null]); setPage(1) }

  const PlatformBadge = ({ platform }: { platform: string }) => {
    const p = platformConfig[platform] || platformConfig.other
    return <Badge variant="light" color={p.color} size="sm" leftSection={<p.icon size={12} />}>{p.label}</Badge>
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const s = statusConfig[status] || statusConfig.pending
    return <Badge variant="light" color={s.color} size="sm" leftSection={<s.icon size={12} />}>{s.label}</Badge>
  }

  // Next status for quick action — first option only (primary action)
  const getNextAction = (status: string) => {
    const options = nextStatus[status]
    if (!options || options.length === 0) return null
    const ns = options[0] // primary next status
    const config = statusConfig[ns]
    if (!config) return null
    // Action labels
    const actionLabels: Record<string, string> = {
      confirmed: 'ยืนยันชำระเงิน',
      packing: 'เริ่มแพ็คสินค้า',
      shipped: 'จัดส่งแล้ว',
      delivered: 'ได้รับแล้ว',
      returned: 'คืนสินค้า',
    }
    return { status: ns, label: actionLabels[ns] || config.label, color: config.color }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="xl" fw={800}>ออเดอร์ออนไลน์</Text>
        <Group gap="sm">
          <Button variant="light" leftSection={<IconFileBarcode size={16} />}
            onClick={() => setPrintModalOpen(true)}>
            ปริ้นใบปะหน้า
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/orders/create')}
            style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
            สร้างออเดอร์
          </Button>
        </Group>
      </Group>

      {/* ═══ Platform Summary Cards ═══ */}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: Math.min(platformStats.length + 1, 5) }} spacing="sm">
        <Card shadow="sm" padding="md" radius="md"
          style={{ background: 'linear-gradient(135deg, #312e81, #4338ca)', border: 'none' }}>
          <Group gap={8} mb={6}>
            <IconChartBar size={18} color="rgba(255,255,255,0.7)" />
            <Text size="xs" c="rgba(255,255,255,0.7)" fw={600}>ยอดรวมทั้งหมด</Text>
          </Group>
          <Text size="xl" fw={800} c="white">฿{fmt(totalOrderRevenue)}</Text>
          <Text size="xs" c="rgba(255,255,255,0.6)" mt={2}>{orders.length} ออเดอร์</Text>
        </Card>

        {platformStats.map((ps, i) => {
          const colorMap: Record<string, { bg: string; accent: string }> = {
            blue: { bg: 'linear-gradient(135deg, #1e40af, #3b82f6)', accent: '#93c5fd' },
            green: { bg: 'linear-gradient(135deg, #166534, #22c55e)', accent: '#86efac' },
            orange: { bg: 'linear-gradient(135deg, #9a3412, #f97316)', accent: '#fdba74' },
            gray: { bg: 'linear-gradient(135deg, #374151, #6b7280)', accent: '#d1d5db' },
          }
          const cm = colorMap[ps.config.color] || colorMap.gray
          const pct = totalOrderRevenue > 0 ? ((ps.revenue / totalOrderRevenue) * 100).toFixed(0) : '0'
          return (
            <Card key={ps.key} shadow="sm" padding="md" radius="md"
              style={{ background: cm.bg, border: 'none', position: 'relative', overflow: 'hidden' }}>
              {i === 0 && <div style={{ position: 'absolute', top: 8, right: 10 }}><IconTrophy size={20} color="#fbbf24" /></div>}
              <Group gap={8} mb={6}>
                <ps.config.icon size={18} color="rgba(255,255,255,0.8)" />
                <Text size="xs" c="rgba(255,255,255,0.8)" fw={700}>{ps.config.label}</Text>
              </Group>
              <Text size="xl" fw={800} c="white">฿{fmt(ps.revenue)}</Text>
              <Group gap={8} mt={4}>
                <Text size="xs" c={cm.accent}>{ps.count} ออเดอร์</Text>
                <Badge size="xs" variant="filled" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>{pct}%</Badge>
              </Group>
            </Card>
          )
        })}
      </SimpleGrid>

      {/* ═══ Status Tabs ═══ */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '2px solid var(--app-border, #e5e7eb)',
        overflowX: 'auto', background: 'var(--app-surface, #fff)',
        borderRadius: '10px 10px 0 0', padding: '0 4px',
      }}>
        {[
          { key: null, label: 'ทั้งหมด', color: '#4f46e5' },
          { key: 'pending', label: 'ออกบิล', color: '#eab308' },
          { key: 'confirmed', label: 'ชำระเงินแล้ว', color: '#3b82f6' },
          { key: 'packing', label: 'แพ็คสินค้า', color: '#06b6d4' },
          { key: 'shipped', label: 'จัดส่งแล้ว', color: '#6366f1' },
          { key: 'delivered', label: 'ได้รับแล้ว', color: '#059669' },
          { key: 'returned', label: 'คืนสินค้า', color: '#f97316' },
          { key: 'cancelled', label: 'ยกเลิก', color: '#ef4444' },
        ].map(tab => {
          const count = tab.key === null ? orders.length
            : orders.filter((o: any) => o.order_status === tab.key).length
          const isActive = filterStatus === tab.key
          return (
            <button key={tab.key || 'all'}
              onClick={() => { setFilterStatus(tab.key); setPage(1) }}
              style={{
                padding: '10px 16px', border: 'none', cursor: 'pointer',
                background: 'transparent', whiteSpace: 'nowrap', fontFamily: 'inherit',
                borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                color: isActive ? tab.color : '#6b7280',
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

      {/* ═══ Filter Toolbar ═══ */}
      <Card shadow="xs" padding="sm" radius="md" withBorder style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -16 }}>
        <Group gap="sm" wrap="wrap">
          <TextInput size="xs" placeholder="ค้นหาเลขออเดอร์ / ลูกค้า / Tracking" style={{ width: 240 }}
            leftSection={<IconSearch size={14} />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <Select size="xs" placeholder="ช่องทาง" clearable style={{ width: 130 }}
            data={Object.entries(platformConfig).map(([k, v]) => ({ value: k, label: v.label }))}
            value={filterPlatform} onChange={(v) => { setFilterPlatform(v); setPage(1) }} />
          <DatePickerInput type="range" size="xs" placeholder="ช่วงวันที่"
            value={dateRange} onChange={(v) => { setDateRange(v); setPage(1) }}
            locale="th" valueFormat="DD MMM YYYY" clearable
            style={{ width: 220 }} />
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

      {/* ═══ Data Table ═══ */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <Card shadow="xs" padding={0} radius="md" withBorder>
          <Table.ScrollContainer minWidth={850}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>เลขออเดอร์</Table.Th>
                  <Table.Th>ช่องทาง</Table.Th>
                  <Table.Th>ลูกค้า</Table.Th>
                  <Table.Th ta="right">ยอดสุทธิ</Table.Th>
                  <Table.Th ta="center">สถานะ</Table.Th>
                  <Table.Th>Tracking</Table.Th>
                  <Table.Th ta="center" style={{ width: 100 }}>จัดการ</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginated.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text ta="center" c="dimmed" py="xl">ไม่พบออเดอร์</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginated.map((o: any) => {
                    const next = getNextAction(o.order_status)
                    return (
                      <Table.Tr key={o.id}>
                        <Table.Td>
                          <Text size="sm" fw={600} ff="monospace" c="indigo"
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/orders/${o.id}`)}>
                            {o.order_number}
                          </Text>
                          <Text size="xs" c="dimmed">{fmtDate(o.created_at)}</Text>
                        </Table.Td>
                        <Table.Td><PlatformBadge platform={o.platform} /></Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={500}>{o.customer_name || '-'}</Text>
                          {o.customer_phone && <Text size="xs" c="dimmed">{o.customer_phone}</Text>}
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" fw={700} c="green">฿{fmt(parseFloat(o.net_amount))}</Text>
                        </Table.Td>
                        <Table.Td ta="center"><StatusBadge status={o.order_status} /></Table.Td>
                        <Table.Td>
                          {o.tracking_number
                            ? <Text size="xs" ff="monospace" fw={600} c="indigo">{o.tracking_number}</Text>
                            : <Text size="xs" c="dimmed">—</Text>}
                        </Table.Td>
                        <Table.Td ta="center">
                          <Group gap={4} justify="center">
                            {/* Quick status change */}
                            {next && (
                              <Tooltip label={`เปลี่ยนเป็น "${next.label}"`}>
                                <ActionIcon size="sm" variant="light" color={next.color}
                                  loading={updateStatusMutation.isPending}
                                  onClick={() => updateStatusMutation.mutate({ id: o.id, orderStatus: next.status })}>
                                  <IconArrowRight size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {/* More menu */}
                            <Menu shadow="md" width={160}>
                              <Menu.Target>
                                <ActionIcon size="sm" variant="subtle" color="gray">
                                  <IconDotsVertical size={14} />
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item leftSection={<IconEye size={14} />}
                                  onClick={() => navigate(`/orders/${o.id}`)}>
                                  ดูรายละเอียด
                                </Menu.Item>
                                {o.order_status === 'pending' && (
                                  <>
                                    <Menu.Divider />
                                    <Menu.Item leftSection={<IconTrash size={14} />} color="red"
                                      onClick={() => setDeleteTarget({ id: o.id, number: o.order_number })}>
                                      ลบออเดอร์
                                    </Menu.Item>
                                  </>
                                )}
                              </Menu.Dropdown>
                            </Menu>
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

      {/* Print Labels Modal */}
      <Modal opened={printModalOpen} onClose={() => setPrintModalOpen(false)}
        title="ปริ้นใบปะหน้าพัสดุ" size="md" centered>
        <Stack gap="md">
          {/* เลือกแบบ */}
          <SimpleGrid cols={2} spacing="xs">
            {([
              { key: 'date' as const, label: 'เลือกวันที่', desc: 'ปริ้นตามวันที่กำหนด', color: '#4f46e5',
                count: getOrdersByDate(printDate).length },
              { key: 'packing' as const, label: 'รอแพ็ค/ชำระแล้ว', desc: 'ออเดอร์ที่พร้อมจัดส่ง', color: '#0891b2',
                count: packingOrders.length },
              { key: 'filtered' as const, label: 'ตาม filter ที่เลือก', desc: 'ตามตัวกรองปัจจุบัน', color: '#059669',
                count: filtered.length },
              { key: 'all' as const, label: 'ทุกออเดอร์', desc: 'ปริ้นทั้งหมด', color: '#6b7280',
                count: orders.length },
            ]).map(opt => (
              <Card key={opt.key} padding="sm" radius="md" withBorder
                onClick={() => setPrintTarget(opt.key)}
                style={{
                  cursor: 'pointer',
                  border: printTarget === opt.key ? `2px solid ${opt.color}` : '1px solid var(--app-border)',
                  background: printTarget === opt.key ? `${opt.color}08` : 'var(--app-surface)',
                  transition: 'all 0.15s',
                }}>
                <Group justify="space-between" align="flex-start">
                  <div>
                    <Text size="sm" fw={700}>{opt.label}</Text>
                    <Text size="xs" c="dimmed">{opt.desc}</Text>
                  </div>
                  <Badge size="lg" variant={printTarget === opt.key ? 'filled' : 'light'}
                    color={printTarget === opt.key ? opt.color : 'gray'}>
                    {opt.count}
                  </Badge>
                </Group>
              </Card>
            ))}
          </SimpleGrid>

          {/* เลือกวันที่ (ถ้าเลือกแบบ date) */}
          {printTarget === 'date' && (
            <DatePickerInput label="วันที่ที่จะปริ้น" size="sm"
              value={printDate} onChange={setPrintDate}
              locale="th" valueFormat="DD MMMM YYYY"
              style={{ maxWidth: 250 }} />
          )}

          {/* ข้อมูลผู้ส่ง */}
          <div>
            <Text size="sm" fw={600} mb={6}>ข้อมูลผู้ส่ง</Text>
            <SimpleGrid cols={2} spacing="xs" mb="xs">
              <Card padding="xs" radius="md" withBorder
                onClick={() => setPrintSenderType('company')}
                style={{
                  cursor: 'pointer',
                  border: printSenderType === 'company' ? '2px solid #4f46e5' : '1px solid var(--app-border)',
                  background: printSenderType === 'company' ? '#4f46e508' : 'var(--app-surface)',
                }}>
                <Text size="sm" fw={700}>ใช้ข้อมูลบริษัท</Text>
                <Text size="xs" c="dimmed" lineClamp={1}>{company?.name || '-'}</Text>
              </Card>
              <Card padding="xs" radius="md" withBorder
                onClick={() => setPrintSenderType('custom')}
                style={{
                  cursor: 'pointer',
                  border: printSenderType === 'custom' ? '2px solid #4f46e5' : '1px solid var(--app-border)',
                  background: printSenderType === 'custom' ? '#4f46e508' : 'var(--app-surface)',
                }}>
                <Text size="sm" fw={700}>กรอกเอง</Text>
                <Text size="xs" c="dimmed">ระบุชื่อ/ที่อยู่ส่งจริง</Text>
              </Card>
            </SimpleGrid>
            {printSenderType === 'custom' && (
              <Stack gap="xs">
                <TextInput size="xs" label="ชื่อผู้ส่ง" placeholder="เช่น ร้านบุ๊คดี สาขาลาดพร้าว"
                  value={printSenderName} onChange={e => setPrintSenderName(e.target.value)} />
                <TextInput size="xs" label="เบอร์โทร" placeholder="0812345678"
                  value={printSenderPhone} onChange={e => setPrintSenderPhone(e.target.value)} />
                <TextInput size="xs" label="ที่อยู่ส่ง" placeholder="123/45 ถ.ลาดพร้าว แขวงจอมพล เขตจตุจักร กทม. 10900"
                  value={printSenderAddress} onChange={e => setPrintSenderAddress(e.target.value)} />
              </Stack>
            )}
          </div>

          {/* สรุป */}
          <Card padding="sm" radius="md" withBorder style={{ background: 'var(--app-surface-light)' }}>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">จำนวนใบปะหน้าที่จะปริ้น</Text>
              <Text size="lg" fw={800} c="indigo">
                {printTarget === 'date' ? getOrdersByDate(printDate).length :
                 printTarget === 'packing' ? packingOrders.length :
                 printTarget === 'filtered' ? filtered.length : orders.length} ใบ
              </Text>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              พิมพ์บนกระดาษ A4 แนวนอน (4 ใบ/หน้า)
            </Text>
          </Card>

          <Group justify="flex-end">
            <Button variant="light" onClick={() => setPrintModalOpen(false)}>ยกเลิก</Button>
            <Button leftSection={<IconPrinter size={16} />}
              onClick={handlePrintFromModal}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              ปริ้นใบปะหน้า
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Modal */}
      <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="ยืนยันการลบ" size="sm" centered>
        <Stack gap="md">
          <Text>ต้องการลบออเดอร์ <Text span fw={700} ff="monospace">{deleteTarget?.number}</Text> ?</Text>
          <Text size="sm" c="red">การลบจะไม่สามารถย้อนกลับได้</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteTarget(null)}>ยกเลิก</Button>
            <Button color="red" leftSection={<IconTrash size={16} />}
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              ลบ
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
