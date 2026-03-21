import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Card, Text, Group, Table, Badge, Loader, Stack, SimpleGrid, SegmentedControl,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import {
  IconChartBar, IconUser, IconUsers, IconCategory,
} from '@tabler/icons-react'
import api from '../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => n.toLocaleString('th-TH')

type ReportTab = 'employee' | 'customer' | 'category' | 'top-products'

export default function SalesReportsPage() {
  const [tab, setTab] = useState<ReportTab>('employee')
  const [fromDate, setFromDate] = useState<Date | null>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  )
  const [toDate, setToDate] = useState<Date | null>(new Date())

  const from = fromDate?.toISOString().split('T')[0]
  const to = toDate?.toISOString().split('T')[0]

  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  const { data: byEmployee = [], isLoading: loadEmp } = useQuery({
    queryKey: ['report-sales-employee', from, to],
    queryFn: () => api.get('/reports/sales-by-employee', { params: { from, to } }).then(r => r.data),
    enabled: tab === 'employee',
  })

  const { data: byCustomer = [], isLoading: loadCust } = useQuery({
    queryKey: ['report-sales-customer', from, to],
    queryFn: () => api.get('/reports/sales-by-customer', { params: { from, to } }).then(r => r.data),
    enabled: tab === 'customer',
  })

  const { data: byCategory = [], isLoading: loadCat } = useQuery({
    queryKey: ['report-sales-category', from, to],
    queryFn: () => api.get('/reports/sales-by-category', { params: { from, to } }).then(r => r.data),
    enabled: tab === 'category',
  })

  const { data: topProducts = [], isLoading: loadTop } = useQuery({
    queryKey: ['report-top-products', from, to],
    queryFn: () => api.get('/reports/top-products', { params: { from, to } }).then(r => r.data),
    enabled: tab === 'top-products',
  })

  const isLoading = (tab === 'employee' && loadEmp) || (tab === 'customer' && loadCust) ||
    (tab === 'category' && loadCat) || (tab === 'top-products' && loadTop)

  const fmtDateThai = (d: Date | null) => d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <Stack gap="lg">
      {/* Report Header */}
      <Card shadow="xs" padding="lg" radius="md" withBorder style={{ background: 'var(--app-surface-light)' }}>
        <Text ta="center" size="lg" fw={800}>{company?.name || 'บริษัท'}</Text>
        <Text ta="center" size="md" fw={700} mt={2}>รายงานการขาย</Text>
        {from && to && (
          <Text ta="center" size="sm" c="dimmed" mt={4}>
            สำหรับงวด {fmtDateThai(fromDate)} ถึง {fmtDateThai(toDate)}
          </Text>
        )}
      </Card>

      {/* Controls */}
      <Group justify="space-between">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as ReportTab)}
          data={[
            { value: 'employee', label: 'ตามพนักงาน' },
            { value: 'customer', label: 'ตามลูกค้า' },
            { value: 'category', label: 'ตามหมวดหมู่' },
            { value: 'top-products', label: 'สินค้าขายดี' },
          ]}
        />
        <Group gap="xs">
          <Text size="sm" fw={500}>ตั้งแต่</Text>
          <DatePickerInput placeholder="วันที่เริ่มต้น" size="sm"
            value={fromDate} onChange={setFromDate}
            locale="th" valueFormat="DD MMMM YYYY"
            style={{ width: 180 }} />
          <Text size="sm" fw={500}>ถึง</Text>
          <DatePickerInput placeholder="ถึงวันที่" size="sm"
            value={toDate} onChange={setToDate}
            locale="th" valueFormat="DD MMMM YYYY"
            style={{ width: 180 }} />
        </Group>
      </Group>

      {isLoading ? (
        <Loader style={{ margin: '40px auto', display: 'block' }} />
      ) : (
        <Card shadow="xs" padding="lg" radius="md" withBorder>

          {/* ─── ตามพนักงาน ─── */}
          {tab === 'employee' && (
            byEmployee.length === 0 ? <Text ta="center" c="dimmed" py="xl">ไม่มีข้อมูล</Text> : (
              <>
                <SimpleGrid cols={3} mb="lg">
                  <Card padding="sm" radius="md" withBorder>
                    <Text size="xs" c="dimmed">พนักงานขายทั้งหมด</Text>
                    <Text size="xl" fw={800}>{byEmployee.length} คน</Text>
                  </Card>
                  <Card padding="sm" radius="md" withBorder>
                    <Text size="xs" c="dimmed">ยอดขายรวม</Text>
                    <Text size="xl" fw={800} c="green">฿{fmt(byEmployee.reduce((s: number, r: any) => s + parseFloat(r.total_revenue), 0))}</Text>
                  </Card>
                  <Card padding="sm" radius="md" withBorder>
                    <Text size="xs" c="dimmed">จำนวนบิลรวม</Text>
                    <Text size="xl" fw={800}>{fmtInt(byEmployee.reduce((s: number, r: any) => s + parseInt(r.sale_count), 0))} บิล</Text>
                  </Card>
                </SimpleGrid>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>#</Table.Th>
                      <Table.Th>ชื่อพนักงาน</Table.Th>
                      <Table.Th ta="right">จำนวนบิล</Table.Th>
                      <Table.Th ta="right">ยอดขาย</Table.Th>
                      <Table.Th ta="right">ส่วนลดรวม</Table.Th>
                      <Table.Th ta="right">เฉลี่ย/บิล</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {byEmployee.map((r: any, i: number) => (
                      <Table.Tr key={r.id}>
                        <Table.Td><Text size="sm" c="dimmed">{i + 1}</Text></Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={600}>{r.full_name}</Text>
                          {r.nick_name && <Text size="xs" c="dimmed">{r.nick_name}</Text>}
                        </Table.Td>
                        <Table.Td ta="right"><Text size="sm">{fmtInt(r.sale_count)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600} c="green">฿{fmt(parseFloat(r.total_revenue))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="red">฿{fmt(parseFloat(r.total_discount))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(parseFloat(r.avg_per_sale))}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </>
            )
          )}

          {/* ─── ตามลูกค้า ─── */}
          {tab === 'customer' && (
            byCustomer.length === 0 ? <Text ta="center" c="dimmed" py="xl">ไม่มีข้อมูล</Text> : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>ชื่อลูกค้า</Table.Th>
                    <Table.Th ta="center">ประเภท</Table.Th>
                    <Table.Th ta="right">จำนวนบิล</Table.Th>
                    <Table.Th ta="right">ยอดซื้อรวม</Table.Th>
                    <Table.Th ta="right">ส่วนลดรวม</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byCustomer.map((r: any, i: number) => (
                    <Table.Tr key={r.id}>
                      <Table.Td><Text size="sm" c="dimmed">{i + 1}</Text></Table.Td>
                      <Table.Td><Text size="sm" fw={600}>{r.customer_name}</Text></Table.Td>
                      <Table.Td ta="center">
                        <Badge variant="light" size="sm" color={
                          r.customer_type === 'wholesale' ? 'violet' :
                          r.customer_type === 'member' ? 'blue' : 'gray'
                        }>
                          {r.customer_type === 'wholesale' ? 'ขายส่ง' :
                           r.customer_type === 'member' ? 'สมาชิก' : 'ทั่วไป'}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right"><Text size="sm">{fmtInt(r.sale_count)}</Text></Table.Td>
                      <Table.Td ta="right"><Text size="sm" fw={600} c="green">฿{fmt(parseFloat(r.total_revenue))}</Text></Table.Td>
                      <Table.Td ta="right"><Text size="sm" c="red">฿{fmt(parseFloat(r.total_discount))}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Th colSpan={4}>รวม</Table.Th>
                    <Table.Th ta="right">
                      <Text fw={700} c="green">฿{fmt(byCustomer.reduce((s: number, r: any) => s + parseFloat(r.total_revenue), 0))}</Text>
                    </Table.Th>
                    <Table.Th ta="right">
                      <Text fw={700} c="red">฿{fmt(byCustomer.reduce((s: number, r: any) => s + parseFloat(r.total_discount), 0))}</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            )
          )}

          {/* ─── ตามหมวดหมู่ ─── */}
          {tab === 'category' && (
            byCategory.length === 0 ? <Text ta="center" c="dimmed" py="xl">ไม่มีข้อมูล</Text> : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>หมวดหมู่</Table.Th>
                    <Table.Th ta="right">จำนวนขาย</Table.Th>
                    <Table.Th ta="right">ยอดขาย</Table.Th>
                    <Table.Th ta="right">ต้นทุน</Table.Th>
                    <Table.Th ta="right">กำไรขั้นต้น</Table.Th>
                    <Table.Th ta="right">%กำไร</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {byCategory.map((r: any, i: number) => {
                    const revenue = parseFloat(r.total_revenue) || 0
                    const cost = parseFloat(r.total_cost) || 0
                    const profit = parseFloat(r.gross_profit) || 0
                    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
                    return (
                      <Table.Tr key={r.id}>
                        <Table.Td><Text size="sm" c="dimmed">{i + 1}</Text></Table.Td>
                        <Table.Td><Text size="sm" fw={600}>{r.category_name}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm">{fmtInt(parseInt(r.total_qty))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600} c="green">฿{fmt(revenue)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(cost)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600} c={profit >= 0 ? 'blue' : 'red'}>฿{fmt(profit)}</Text></Table.Td>
                        <Table.Td ta="right">
                          <Badge variant="light" color={margin >= 30 ? 'green' : margin >= 10 ? 'yellow' : 'red'} size="sm">
                            {margin.toFixed(1)}%
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Th colSpan={3}>รวม</Table.Th>
                    <Table.Th ta="right">
                      <Text fw={700} c="green">฿{fmt(byCategory.reduce((s: number, r: any) => s + (parseFloat(r.total_revenue) || 0), 0))}</Text>
                    </Table.Th>
                    <Table.Th ta="right">
                      <Text fw={700} c="dimmed">฿{fmt(byCategory.reduce((s: number, r: any) => s + (parseFloat(r.total_cost) || 0), 0))}</Text>
                    </Table.Th>
                    <Table.Th ta="right">
                      <Text fw={700} c="blue">฿{fmt(byCategory.reduce((s: number, r: any) => s + (parseFloat(r.gross_profit) || 0), 0))}</Text>
                    </Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            )
          )}

          {/* ─── สินค้าขายดี ─── */}
          {tab === 'top-products' && (
            topProducts.length === 0 ? <Text ta="center" c="dimmed" py="xl">ไม่มีข้อมูล</Text> : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>อันดับ</Table.Th>
                    <Table.Th>สินค้า</Table.Th>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th ta="right">จำนวนขาย</Table.Th>
                    <Table.Th ta="right">ยอดขาย</Table.Th>
                    <Table.Th ta="right">ต้นทุน</Table.Th>
                    <Table.Th ta="right">กำไร</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {topProducts.map((r: any, i: number) => {
                    const revenue = parseFloat(r.total_revenue) || 0
                    const cost = parseFloat(r.total_cost) || 0
                    const profit = revenue - cost
                    return (
                      <Table.Tr key={r.id}>
                        <Table.Td>
                          <Badge variant={i < 3 ? 'filled' : 'light'} color={i === 0 ? 'yellow' : i === 1 ? 'gray' : i === 2 ? 'orange' : 'gray'} size="lg">
                            {i + 1}
                          </Badge>
                        </Table.Td>
                        <Table.Td><Text size="sm" fw={600}>{r.name}</Text></Table.Td>
                        <Table.Td><Text size="sm" ff="monospace" c="dimmed">{r.sku}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600}>{fmtInt(parseInt(r.total_qty))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600} c="green">฿{fmt(revenue)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(cost)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600} c={profit >= 0 ? 'blue' : 'red'}>฿{fmt(profit)}</Text></Table.Td>
                      </Table.Tr>
                    )
                  })}
                </Table.Tbody>
              </Table>
            )
          )}
        </Card>
      )}
    </Stack>
  )
}
