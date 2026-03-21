import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Text, Group, Table, Badge, Loader, Stack, SimpleGrid } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconReportMoney, IconArrowUp, IconArrowDown, IconEqual } from '@tabler/icons-react'
import api from '../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ProfitLossPage() {
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(new Date().getFullYear(), new Date().getMonth(), 1), // first day of month
    new Date(),
  ])

  const from = dateRange[0]?.toISOString().split('T')[0]
  const to = dateRange[1]?.toISOString().split('T')[0]

  const { data, isLoading } = useQuery({
    queryKey: ['profit-loss', from, to],
    queryFn: () => api.get('/reports/profit-loss', { params: { from, to } }).then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const sd = data?.salesData || {}
  const ed = data?.expenseData || {}
  const netProfit = (sd.totalSales || 0) - (sd.totalCogs || 0) - (ed.totalExpenses || 0)

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap={8}>
          <IconReportMoney size={24} color="var(--app-primary)" />
          <Text size="xl" fw={800}>งบกำไรขาดทุน (P&L)</Text>
        </Group>
        <DatePickerInput type="range" placeholder="เลือกช่วงเวลา" size="sm"
          value={dateRange} onChange={setDateRange}
          locale="th" valueFormat="DD MMM YYYY"
          style={{ width: 300 }} />
      </Group>

      {/* KPI Cards */}
      <SimpleGrid cols={4}>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconArrowUp size={18} color="var(--app-success)" />
            <Text size="xs" c="dimmed" fw={600}>รายได้จากการขาย</Text>
          </Group>
          <Text size="xl" fw={800} c="green">฿{fmt(sd.totalSales || 0)}</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconArrowDown size={18} color="var(--app-accent)" />
            <Text size="xs" c="dimmed" fw={600}>ต้นทุนขาย</Text>
          </Group>
          <Text size="xl" fw={800} c="cyan">฿{fmt(sd.totalCogs || 0)}</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconArrowDown size={18} color="orange" />
            <Text size="xs" c="dimmed" fw={600}>ค่าใช้จ่าย</Text>
          </Group>
          <Text size="xl" fw={800} c="orange">฿{fmt(ed.totalExpenses || 0)}</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder
          style={{ border: `2px solid ${netProfit >= 0 ? 'var(--app-success)' : 'var(--app-danger)'}` }}>
          <Group gap={8} mb={4}>
            <IconEqual size={18} color={netProfit >= 0 ? 'var(--app-success)' : 'var(--app-danger)'} />
            <Text size="xs" c="dimmed" fw={600}>กำไร (ขาดทุน) สุทธิ</Text>
          </Group>
          <Text size="xl" fw={800} c={netProfit >= 0 ? 'green' : 'red'}>
            ฿{fmt(netProfit)}
          </Text>
        </Card>
      </SimpleGrid>

      {/* Revenue Detail */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="green" variant="filled" size="lg">รายได้</Badge>
        </Group>
        <Table striped>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td><Text size="sm" fw={600}>รายได้จากการขาย</Text></Table.Td>
              <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(sd.totalSales || 0)}</Text></Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td><Text size="sm" c="dimmed" pl={20}>ส่วนลดรวม</Text></Table.Td>
              <Table.Td ta="right"><Text size="sm" c="red">-฿{fmt(sd.totalDiscount || 0)}</Text></Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td><Text size="sm" c="dimmed" pl={20}>ภาษีขาย (VAT)</Text></Table.Td>
              <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(sd.totalVat || 0)}</Text></Table.Td>
            </Table.Tr>
            {/* Journal-based revenue */}
            {(data?.revenue || []).map((r: any) => (
              <Table.Tr key={r.id}>
                <Table.Td>
                  <Text size="sm" c="dimmed" pl={20}>{r.account_code} — {r.name}</Text>
                </Table.Td>
                <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(r.amount))}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--app-border)' }}>
              <Table.Th><Text fw={700}>รวมรายได้</Text></Table.Th>
              <Table.Th ta="right"><Text fw={700} c="green">฿{fmt(sd.totalSales || 0)}</Text></Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Card>

      {/* COGS */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="cyan" variant="filled" size="lg">ต้นทุนขาย</Badge>
        </Group>
        <Table striped>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td><Text size="sm" fw={600}>ต้นทุนสินค้าที่ขาย (COGS)</Text></Table.Td>
              <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(sd.totalCogs || 0)}</Text></Table.Td>
            </Table.Tr>
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--app-border)' }}>
              <Table.Th><Text fw={700}>กำไรขั้นต้น (Gross Profit)</Text></Table.Th>
              <Table.Th ta="right">
                <Text fw={700} c={(sd.grossProfit || 0) >= 0 ? 'green' : 'red'}>
                  ฿{fmt(sd.grossProfit || 0)}
                </Text>
              </Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Card>

      {/* Expenses Detail */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="orange" variant="filled" size="lg">ค่าใช้จ่าย</Badge>
        </Group>
        <Table striped>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td><Text size="sm" fw={600}>ค่าใช้จ่ายรวม</Text></Table.Td>
              <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(ed.totalExpenses || 0)}</Text></Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td><Text size="sm" c="dimmed" pl={20}>ภาษีซื้อ (VAT)</Text></Table.Td>
              <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(ed.totalVat || 0)}</Text></Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td><Text size="sm" c="dimmed" pl={20}>ภาษีหัก ณ ที่จ่าย (WHT)</Text></Table.Td>
              <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(ed.totalWht || 0)}</Text></Table.Td>
            </Table.Tr>
            {/* Journal-based expenses */}
            {(data?.expenses || []).map((e: any) => (
              <Table.Tr key={e.id}>
                <Table.Td>
                  <Text size="sm" c="dimmed" pl={20}>{e.account_code} — {e.name}</Text>
                </Table.Td>
                <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(e.amount))}</Text></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--app-border)' }}>
              <Table.Th><Text fw={700}>รวมค่าใช้จ่าย</Text></Table.Th>
              <Table.Th ta="right"><Text fw={700} c="orange">฿{fmt(ed.totalExpenses || 0)}</Text></Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Card>

      {/* Net Profit */}
      <Card shadow="xs" padding="lg" radius="md" withBorder
        style={{ border: `2px solid ${netProfit >= 0 ? 'var(--app-success)' : 'var(--app-danger)'}`,
                 background: netProfit >= 0 ? 'rgba(5,150,105,0.03)' : 'rgba(239,68,68,0.03)' }}>
        <Group justify="space-between">
          <Text size="lg" fw={800}>กำไร (ขาดทุน) สุทธิ</Text>
          <Text size="xl" fw={800} c={netProfit >= 0 ? 'green' : 'red'}>
            ฿{fmt(netProfit)}
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mt={4}>
          = รายได้ ฿{fmt(sd.totalSales || 0)} − ต้นทุน ฿{fmt(sd.totalCogs || 0)} − ค่าใช้จ่าย ฿{fmt(ed.totalExpenses || 0)}
        </Text>
      </Card>
    </Stack>
  )
}
