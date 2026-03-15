import { useQuery } from '@tanstack/react-query'
import { SimpleGrid, Text, Group, Table, Badge, Loader, Stack, SegmentedControl } from '@mantine/core'
import { IconCash, IconShoppingCart, IconAlertTriangle, IconTruckDelivery, IconTrendingUp } from '@tabler/icons-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { useState } from 'react'
import api from '../services/api'
import { fmt } from '../utils/formatters'

export default function DashboardPage() {
  const [trendDays, setTrendDays] = useState('30')

  const { data, isLoading } = useQuery({
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


  const fmtShort = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toFixed(0)
  }

  const trendData = (trend || []).map((t: any) => ({
    date: t.date?.split('T')[0]?.slice(5) || t.date,
    revenue: parseFloat(t.revenue) || 0,
    count: t.sales_count || 0,
  }))

  const topData = (topProducts || []).map((p: any) => ({
    name: p.name?.length > 15 ? p.name.slice(0, 15) + '...' : p.name,
    fullName: p.name,
    qty: parseInt(p.total_qty) || 0,
    revenue: parseFloat(p.total_revenue) || 0,
  }))

  return (
    <Stack gap="xl">
      <Text size="xl" fw={800}>📊 Dashboard</Text>

      {/* Stat Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
        <div className="stat-card">
          <Group gap={8}>
            <IconCash size={20} color="var(--app-success)" />
            <span className="stat-card-label">ยอดขายวันนี้</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-success)' }}>
            ฿{fmt(data?.todaySales?.total || 0)}
          </div>
          <span className="stat-card-label">{data?.todaySales?.count || 0} บิล</span>
        </div>

        <div className="stat-card">
          <Group gap={8}>
            <IconShoppingCart size={20} color="var(--app-primary)" />
            <span className="stat-card-label">ยอดขายเดือนนี้</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-primary)' }}>
            ฿{fmt(data?.monthlySales?.total || 0)}
          </div>
          <span className="stat-card-label">{data?.monthlySales?.count || 0} บิล</span>
        </div>

        <div className="stat-card">
          <Group gap={8}>
            <IconAlertTriangle size={20} color="var(--app-warning)" />
            <span className="stat-card-label">สินค้าใกล้หมด</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-warning)' }}>
            {data?.lowStockProducts?.length || 0}
          </div>
          <span className="stat-card-label">รายการ</span>
        </div>

        <div className="stat-card">
          <Group gap={8}>
            <IconTruckDelivery size={20} color="var(--app-accent)" />
            <span className="stat-card-label">ออเดอร์รอดำเนินการ</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-accent)' }}>
            {data?.pendingOrders || 0}
          </div>
          <span className="stat-card-label">ออเดอร์</span>
        </div>
      </SimpleGrid>

      {/* Sales Trend Chart */}
      <div className="stat-card">
        <Group justify="space-between" mb="md">
          <Group gap={8}>
            <IconTrendingUp size={20} color="var(--app-primary)" />
            <Text fw={700} size="lg">แนวโน้มยอดขาย</Text>
          </Group>
          <SegmentedControl
            size="xs"
            data={[
              { value: '7', label: '7 วัน' },
              { value: '30', label: '30 วัน' },
              { value: '90', label: '90 วัน' },
            ]}
            value={trendDays}
            onChange={setTrendDays}
          />
        </Group>
        <div style={{ width: '100%', height: 300 }}>
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
                <Tooltip
                  formatter={(value: number) => [`฿${fmt(value)}`, 'รายได้']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="url(#colorRevenue)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Text ta="center" c="dimmed" pt={80}>ยังไม่มีข้อมูลยอดขาย</Text>
          )}
        </div>
      </div>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        {/* Top 10 Products */}
        <div className="stat-card">
          <Text fw={700} mb="md">🏆 Top 10 สินค้าขายดี</Text>
          {topData.length > 0 ? (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={topData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" fontSize={12} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={120} fontSize={11} tickLine={false} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === 'qty' ? `${value} ชิ้น` : `฿${fmt(value)}`,
                      name === 'qty' ? 'จำนวน' : 'รายได้',
                    ]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="qty" fill="#4f46e5" radius={[0, 4, 4, 0]} name="qty" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Text ta="center" c="dimmed" py="xl">ยังไม่มีข้อมูล</Text>
          )}
        </div>

        {/* Recent Sales */}
        <div className="stat-card">
          <Text fw={700} mb="md">🧾 การขายล่าสุด</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>เลขที่บิล</Table.Th>
                <Table.Th>ช่องทาง</Table.Th>
                <Table.Th ta="right">ยอดรวม</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data?.recentSales?.map((sale: any) => (
                <Table.Tr key={sale.id}>
                  <Table.Td><Text size="sm" fw={600}>{sale.invoice_number}</Text></Table.Td>
                  <Table.Td>
                    <Badge color={sale.sale_type === 'pos' ? 'indigo' : 'cyan'} variant="light" size="sm">
                      {sale.sale_type === 'pos' ? 'หน้าร้าน' : 'ออนไลน์'}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="right" fw={600}>฿{fmt(sale.net_amount)}</Table.Td>
                </Table.Tr>
              ))}
              {(!data?.recentSales || data.recentSales.length === 0) && (
                <Table.Tr><Table.Td colSpan={3} ta="center" c="dimmed">ยังไม่มีข้อมูล</Table.Td></Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      </SimpleGrid>

      {/* Low Stock Alert */}
      {data?.lowStockProducts?.length > 0 && (
        <div className="stat-card" style={{ borderColor: 'var(--app-warning)', borderLeftWidth: 4 }}>
          <Text fw={700} mb="md" c="orange">⚠️ สินค้าใกล้หมดสต๊อก</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>SKU</Table.Th>
                <Table.Th>ชื่อสินค้า</Table.Th>
                <Table.Th ta="center">คงเหลือ</Table.Th>
                <Table.Th ta="center">ขั้นต่ำ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.lowStockProducts.map((p: any) => (
                <Table.Tr key={p.id}>
                  <Table.Td>{p.sku}</Table.Td>
                  <Table.Td>{p.name}</Table.Td>
                  <Table.Td ta="center">
                    <Badge color="red" variant="filled">{p.total_stock}</Badge>
                  </Table.Td>
                  <Table.Td ta="center">{p.min_stock}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
    </Stack>
  )
}
