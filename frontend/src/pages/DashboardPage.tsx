import { useQuery } from '@tanstack/react-query'
import { SimpleGrid, Text, Group, Table, Badge, Loader, Stack, SegmentedControl, Card, Progress } from '@mantine/core'
import {
  IconCash, IconShoppingCart, IconAlertTriangle, IconTruckDelivery, IconTrendingUp,
  IconTrendingDown, IconChartBar, IconPackage, IconReceipt, IconArrowUpRight,
  IconArrowDownRight, IconContract, IconBasket, IconCreditCard,
} from '@tabler/icons-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { useState } from 'react'
import api from '../services/api'
import { fmt } from '../utils/formatters'

const fmtShort = (n: number) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toFixed(0)
}

export default function DashboardPage() {
  const [trendDays, setTrendDays] = useState('30')

  const { data: d, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/reports/dashboard').then(r => r.data),
  })
  const { data: trend } = useQuery({
    queryKey: ['sales-trend', trendDays],
    queryFn: () => api.get('/reports/sales-trend', { params: { days: trendDays } }).then(r => r.data),
  })
  const { data: topProducts } = useQuery({
    queryKey: ['top-products'],
    queryFn: () => api.get('/reports/top-products').then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const trendData = (trend || []).map((t: any) => ({
    date: t.date?.split('T')[0]?.slice(5) || t.date,
    revenue: parseFloat(t.revenue) || 0,
  }))
  const topData = (topProducts || []).map((p: any) => ({
    name: p.name?.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
    qty: parseInt(p.total_qty) || 0,
    revenue: parseFloat(p.total_revenue) || 0,
  }))

  const growth = d?.growthPercent || 0
  const isGrowth = growth >= 0

  return (
    <Stack gap="lg">
      {/* ═══ Row 1: KPI หลัก 4 ช่อง ═══ */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {/* ยอดขายวันนี้ */}
        <div className="stat-card">
          <Group gap={8} mb={4}>
            <IconCash size={18} color="#059669" />
            <Text size="xs" c="dimmed" fw={600}>ยอดขายวันนี้</Text>
          </Group>
          <Text size="xl" fw={800} c="green">฿{fmt(d?.todaySales?.total || 0)}</Text>
          <Text size="xs" c="dimmed">{d?.todaySales?.count || 0} บิล</Text>
        </div>

        {/* ยอดขายเดือนนี้ + เทียบเดือนที่แล้ว */}
        <div className="stat-card">
          <Group gap={8} mb={4}>
            <IconShoppingCart size={18} color="#4f46e5" />
            <Text size="xs" c="dimmed" fw={600}>ยอดขายเดือนนี้</Text>
          </Group>
          <Text size="xl" fw={800} c="indigo">฿{fmt(d?.monthlySales?.total || 0)}</Text>
          <Group gap={4}>
            {isGrowth ? <IconArrowUpRight size={14} color="#059669" /> : <IconArrowDownRight size={14} color="#dc2626" />}
            <Text size="xs" c={isGrowth ? 'green' : 'red'} fw={600}>
              {isGrowth ? '+' : ''}{growth}% จากเดือนที่แล้ว
            </Text>
          </Group>
        </div>

        {/* กำไรสุทธิเดือนนี้ */}
        <div className="stat-card">
          <Group gap={8} mb={4}>
            <IconChartBar size={18} color={(d?.netProfit || 0) >= 0 ? '#059669' : '#dc2626'} />
            <Text size="xs" c="dimmed" fw={600}>กำไรสุทธิเดือนนี้</Text>
          </Group>
          <Text size="xl" fw={800} c={(d?.netProfit || 0) >= 0 ? 'green' : 'red'}>
            ฿{fmt(d?.netProfit || 0)}
          </Text>
          <Text size="xs" c="dimmed">
            ขั้นต้น ฿{fmt(d?.grossProfit || 0)} | ค่าใช้จ่าย ฿{fmt(d?.monthlyExpenses || 0)}
          </Text>
        </div>

        {/* มูลค่าสต๊อก */}
        <div className="stat-card">
          <Group gap={8} mb={4}>
            <IconPackage size={18} color="#0891b2" />
            <Text size="xs" c="dimmed" fw={600}>มูลค่าสินค้าคงเหลือ</Text>
          </Group>
          <Text size="xl" fw={800} c="cyan">฿{fmt(d?.stockValue?.costValue || 0)}</Text>
          <Text size="xs" c="dimmed">{(d?.stockValue?.productCount || 0).toLocaleString()} รายการ / {(d?.stockValue?.totalQty || 0).toLocaleString()} ชิ้น</Text>
        </div>
      </SimpleGrid>

      {/* ═══ Row 2: การแจ้งเตือน 4 ช่อง ═══ */}
      <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="md">
        <Card shadow="xs" padding="sm" radius="md" withBorder style={{ borderLeft: '3px solid var(--app-warning)' }}>
          <Group gap={8}>
            <IconAlertTriangle size={16} color="var(--app-warning)" />
            <Text size="xs" fw={700} c="orange">สินค้าใกล้หมด</Text>
          </Group>
          <Text size="lg" fw={800} mt={2}>{d?.lowStockProducts?.length || 0} <Text span size="xs" c="dimmed">รายการ</Text></Text>
        </Card>
        <Card shadow="xs" padding="sm" radius="md" withBorder style={{ borderLeft: '3px solid var(--app-accent)' }}>
          <Group gap={8}>
            <IconTruckDelivery size={16} color="var(--app-accent)" />
            <Text size="xs" fw={700} c="cyan">ออเดอร์รอดำเนินการ</Text>
          </Group>
          <Text size="lg" fw={800} mt={2}>{d?.pendingOrders || 0} <Text span size="xs" c="dimmed">ออเดอร์</Text></Text>
        </Card>
        <Card shadow="xs" padding="sm" radius="md" withBorder style={{ borderLeft: '3px solid #fb923c' }}>
          <Group gap={8}>
            <IconBasket size={16} color="#fb923c" />
            <Text size="xs" fw={700} c="orange">ใบสั่งซื้อค้าง</Text>
          </Group>
          <Text size="lg" fw={800} mt={2}>{d?.pendingPO?.count || 0} <Text span size="xs" c="dimmed">฿{fmt(d?.pendingPO?.total || 0)}</Text></Text>
        </Card>
        <Card shadow="xs" padding="sm" radius="md" withBorder style={{ borderLeft: '3px solid #ef4444' }}>
          <Group gap={8}>
            <IconCreditCard size={16} color="#ef4444" />
            <Text size="xs" fw={700} c="red">เจ้าหนี้ค้างจ่าย</Text>
          </Group>
          <Text size="lg" fw={800} mt={2}>{d?.unpaidInvoices?.count || 0} <Text span size="xs" c="dimmed">฿{fmt(d?.unpaidInvoices?.total || 0)}</Text></Text>
        </Card>
      </SimpleGrid>

      {/* ═══ Row 3: แนวโน้มยอดขาย ═══ */}
      <div className="stat-card">
        <Group justify="space-between" mb="md">
          <Group gap={8}>
            <IconTrendingUp size={20} color="var(--app-primary)" />
            <Text fw={700} size="lg">แนวโน้มยอดขาย</Text>
          </Group>
          <SegmentedControl size="xs" value={trendDays} onChange={setTrendDays}
            data={[{ value: '7', label: '7 วัน' }, { value: '30', label: '30 วัน' }, { value: '90', label: '90 วัน' }]} />
        </Group>
        <div style={{ width: '100%', height: 280 }}>
          {trendData.length > 0 ? (
            <ResponsiveContainer>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={fmtShort} />
                <Tooltip formatter={(value: number) => [`฿${fmt(value)}`, 'รายได้']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <Text ta="center" c="dimmed" pt={80}>ยังไม่มีข้อมูลยอดขาย</Text>}
        </div>
      </div>

      {/* ═══ Row 4: สินค้าขายดี + การขายล่าสุด + ฝากขาย ═══ */}
      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        {/* Top Products */}
        <div className="stat-card">
          <Text fw={700} mb="md" size="sm">สินค้าขายดี Top 10</Text>
          {topData.length > 0 ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={topData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={11} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={100} fontSize={11} tickLine={false} />
                  <Tooltip formatter={(v: number) => [`${v} ชิ้น`, 'จำนวน']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="qty" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Text ta="center" c="dimmed" py="xl">ยังไม่มีข้อมูล</Text>}
        </div>

        {/* Recent Sales */}
        <div className="stat-card">
          <Text fw={700} mb="md" size="sm">การขายล่าสุด</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>เลขที่บิล</Table.Th>
                <Table.Th ta="right">ยอด</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d?.recentSales?.map((sale: any) => (
                <Table.Tr key={sale.id}>
                  <Table.Td>
                    <Text size="xs" fw={600}>{sale.invoice_number}</Text>
                    <Text size="xs" c="dimmed">{sale.cashier_name}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" fw={700} c="green">฿{fmt(sale.net_amount)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
              {(!d?.recentSales || d.recentSales.length === 0) && (
                <Table.Tr><Table.Td colSpan={2}><Text ta="center" c="dimmed" size="sm">ยังไม่มีข้อมูล</Text></Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>

        {/* สรุปโมดูล */}
        <div className="stat-card">
          <Text fw={700} mb="md" size="sm">สรุปภาพรวม</Text>
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap={6}><IconReceipt size={14} color="#fb923c" /><Text size="xs">ค่าใช้จ่ายเดือนนี้</Text></Group>
              <Text size="sm" fw={700} c="orange">฿{fmt(d?.monthlyExpenses || 0)}</Text>
            </Group>
            <Group justify="space-between">
              <Group gap={6}><IconShoppingCart size={14} color="#4f46e5" /><Text size="xs">ต้นทุนขายเดือนนี้</Text></Group>
              <Text size="sm" fw={700} c="indigo">฿{fmt(d?.monthlyCogs || 0)}</Text>
            </Group>
            <Group justify="space-between">
              <Group gap={6}><IconContract size={14} color="#8b5cf6" /><Text size="xs">สินค้าฝากขายคงเหลือ</Text></Group>
              <Text size="sm" fw={700} c="violet">{(d?.consignment?.totalOnHand || 0).toLocaleString()} ชิ้น</Text>
            </Group>
            <Group justify="space-between">
              <Group gap={6}><IconContract size={14} color="#8b5cf6" /><Text size="xs">มูลค่าฝากขาย (ราคาขาย)</Text></Group>
              <Text size="sm" fw={700} c="violet">฿{fmt(d?.consignment?.retailValue || 0)}</Text>
            </Group>

            {/* Gross margin bar */}
            <div style={{ marginTop: 8 }}>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">อัตรากำไรขั้นต้น</Text>
                <Text size="xs" fw={700} c={(d?.monthlySales?.total || 0) > 0 ? 'green' : 'dimmed'}>
                  {(d?.monthlySales?.total || 0) > 0
                    ? `${((d?.grossProfit / d?.monthlySales?.total) * 100).toFixed(1)}%`
                    : '—'}
                </Text>
              </Group>
              <Progress
                value={(d?.monthlySales?.total || 0) > 0 ? (d?.grossProfit / d?.monthlySales?.total) * 100 : 0}
                color="green" size="sm" radius="xl" />
            </div>
          </Stack>
        </div>
      </SimpleGrid>

      {/* ═══ Row 5: สินค้าใกล้หมด ═══ */}
      {d?.lowStockProducts?.length > 0 && (
        <div className="stat-card" style={{ borderLeft: '4px solid var(--app-warning)' }}>
          <Text fw={700} mb="md" c="orange" size="sm">สินค้าใกล้หมดสต๊อก ({d.lowStockProducts.length} รายการ)</Text>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>SKU</Table.Th>
                <Table.Th>ชื่อสินค้า</Table.Th>
                <Table.Th ta="center">คงเหลือ</Table.Th>
                <Table.Th ta="center">ขั้นต่ำ</Table.Th>
                <Table.Th ta="center">สถานะ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d.lowStockProducts.map((p: any) => {
                const stock = parseInt(p.total_stock) || 0
                const isOut = stock <= 0
                return (
                  <Table.Tr key={p.id}>
                    <Table.Td><Text size="sm" ff="monospace">{p.sku}</Text></Table.Td>
                    <Table.Td><Text size="sm">{p.name}</Text></Table.Td>
                    <Table.Td ta="center">
                      <Badge color={isOut ? 'red' : 'orange'} variant="filled" size="sm">{stock}</Badge>
                    </Table.Td>
                    <Table.Td ta="center"><Text size="sm" c="dimmed">{p.min_stock}</Text></Table.Td>
                    <Table.Td ta="center">
                      <Badge color={isOut ? 'red' : 'yellow'} variant="light" size="sm">
                        {isOut ? 'หมด' : 'ใกล้หมด'}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </Stack>
  )
}
