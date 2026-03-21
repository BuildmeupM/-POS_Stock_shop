import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Text, Group, Table, Badge, Loader, Stack, SimpleGrid } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconScale, IconBuildingBank, IconCreditCard, IconPigMoney } from '@tabler/icons-react'
import api from '../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState<Date | null>(new Date())

  const asOfStr = asOf?.toISOString().split('T')[0]

  const { data, isLoading } = useQuery({
    queryKey: ['balance-sheet', asOfStr],
    queryFn: () => api.get('/reports/balance-sheet', { params: { asOf: asOfStr } }).then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const d = data || {}

  const renderAccountTable = (items: any[], totalLabel: string, totalAmount: number, color: string) => (
    <Table striped>
      <Table.Tbody>
        {items.length === 0 ? (
          <Table.Tr>
            <Table.Td colSpan={2}><Text size="sm" c="dimmed" ta="center">ยังไม่มีข้อมูล</Text></Table.Td>
          </Table.Tr>
        ) : items.map((a: any) => (
          <Table.Tr key={a.id}>
            <Table.Td>
              <Group gap={8}>
                <Text size="xs" ff="monospace" c="dimmed">{a.account_code}</Text>
                <Text size="sm">{a.name}</Text>
              </Group>
            </Table.Td>
            <Table.Td ta="right">
              <Text size="sm" fw={500}>฿{fmt(a.balance)}</Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr style={{ borderTop: '2px solid var(--app-border)' }}>
          <Table.Th><Text fw={700}>{totalLabel}</Text></Table.Th>
          <Table.Th ta="right"><Text fw={700} c={color}>฿{fmt(totalAmount)}</Text></Table.Th>
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  )

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap={8}>
          <IconScale size={24} color="var(--app-primary)" />
          <Text size="xl" fw={800}>งบดุล (Balance Sheet)</Text>
        </Group>
        <DatePickerInput placeholder="ณ วันที่" size="sm"
          value={asOf} onChange={setAsOf}
          locale="th" valueFormat="DD MMM YYYY"
          style={{ width: 200 }} />
      </Group>

      {/* KPI */}
      <SimpleGrid cols={3}>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconBuildingBank size={18} color="var(--app-primary)" />
            <Text size="xs" c="dimmed" fw={600}>สินทรัพย์รวม</Text>
          </Group>
          <Text size="xl" fw={800} c="blue">฿{fmt(d.totalAssets || 0)}</Text>
          {d.inventoryValue > 0 && (
            <Text size="xs" c="dimmed" mt={2}>สินค้าคงเหลือ: ฿{fmt(d.inventoryValue)}</Text>
          )}
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconCreditCard size={18} color="red" />
            <Text size="xs" c="dimmed" fw={600}>หนี้สินรวม</Text>
          </Group>
          <Text size="xl" fw={800} c="red">฿{fmt(d.totalLiabilities || 0)}</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconPigMoney size={18} color="var(--app-success)" />
            <Text size="xs" c="dimmed" fw={600}>ส่วนของเจ้าของ</Text>
          </Group>
          <Text size="xl" fw={800} c="violet">฿{fmt(d.totalEquity || 0)}</Text>
        </Card>
      </SimpleGrid>

      {/* Balance check */}
      <Card shadow="xs" padding="md" radius="md" withBorder
        style={{ border: '2px solid var(--app-primary)', background: 'rgba(99,102,241,0.03)' }}>
        <Group justify="space-between">
          <div>
            <Text size="sm" fw={700}>สมการบัญชี: สินทรัพย์ = หนี้สิน + ส่วนของเจ้าของ</Text>
            <Text size="xs" c="dimmed">
              ฿{fmt(d.totalAssets || 0)} = ฿{fmt(d.totalLiabilities || 0)} + ฿{fmt(d.totalEquity || 0)}
              {' '}= ฿{fmt(d.totalLiabilitiesAndEquity || 0)}
            </Text>
          </div>
          <Badge size="lg" variant="light"
            color={Math.abs((d.totalAssets || 0) - (d.totalLiabilitiesAndEquity || 0)) < 0.01 ? 'green' : 'red'}>
            {Math.abs((d.totalAssets || 0) - (d.totalLiabilitiesAndEquity || 0)) < 0.01
              ? 'สมดุล' : 'ไม่สมดุล'}
          </Badge>
        </Group>
      </Card>

      {/* Assets */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="blue" variant="filled" size="lg">สินทรัพย์</Badge>
        </Group>
        {renderAccountTable(d.assets || [], 'รวมสินทรัพย์', d.totalAssets || 0, 'blue')}
      </Card>

      {/* Liabilities */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="red" variant="filled" size="lg">หนี้สิน</Badge>
        </Group>
        {renderAccountTable(d.liabilities || [], 'รวมหนี้สิน', d.totalLiabilities || 0, 'red')}
      </Card>

      {/* Equity */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="violet" variant="filled" size="lg">ส่วนของเจ้าของ</Badge>
        </Group>
        {renderAccountTable(d.equity || [], 'รวมส่วนของเจ้าของ', d.totalEquity || 0, 'violet')}
      </Card>
    </Stack>
  )
}
