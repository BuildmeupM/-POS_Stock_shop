import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Text, Group, Table, Badge, Loader, Stack, SimpleGrid } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconReceiptTax, IconArrowUp, IconArrowDown, IconReceipt } from '@tabler/icons-react'
import api from '../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function TaxSummaryPage() {
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    new Date(),
  ])

  const from = dateRange[0]?.toISOString().split('T')[0]
  const to = dateRange[1]?.toISOString().split('T')[0]

  const { data, isLoading } = useQuery({
    queryKey: ['tax-summary', from, to],
    queryFn: () => api.get('/reports/tax-summary', { params: { from, to } }).then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const d = data || {}
  const vatPayable = (d.vatPayable || 0)

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap={8}>
          <IconReceiptTax size={24} color="var(--app-primary)" />
          <Text size="xl" fw={800}>รายงานภาษี</Text>
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
            <Text size="xs" c="dimmed" fw={600}>ภาษีขาย (Output VAT)</Text>
          </Group>
          <Text size="xl" fw={800} c="green">฿{fmt(d.totalOutputVat || 0)}</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconArrowDown size={18} color="orange" />
            <Text size="xs" c="dimmed" fw={600}>ภาษีซื้อ (Input VAT)</Text>
          </Group>
          <Text size="xl" fw={800} c="orange">฿{fmt(d.totalInputVat || 0)}</Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder
          style={{ border: `2px solid ${vatPayable >= 0 ? 'var(--app-danger)' : 'var(--app-success)'}` }}>
          <Group gap={8} mb={4}>
            <IconReceipt size={18} color={vatPayable >= 0 ? 'var(--app-danger)' : 'var(--app-success)'} />
            <Text size="xs" c="dimmed" fw={600}>{vatPayable >= 0 ? 'VAT ต้องจ่าย' : 'VAT ขอคืน'}</Text>
          </Group>
          <Text size="xl" fw={800} c={vatPayable >= 0 ? 'red' : 'green'}>
            ฿{fmt(Math.abs(vatPayable))}
          </Text>
        </Card>
        <Card shadow="xs" padding="md" radius="md" withBorder>
          <Group gap={8} mb={4}>
            <IconReceiptTax size={18} color="violet" />
            <Text size="xs" c="dimmed" fw={600}>ภาษีหัก ณ ที่จ่าย (WHT)</Text>
          </Group>
          <Text size="xl" fw={800} c="violet">฿{fmt(d.totalWht || 0)}</Text>
        </Card>
      </SimpleGrid>

      {/* VAT Calculation */}
      <Card shadow="xs" padding="lg" radius="md" withBorder
        style={{ background: 'rgba(99,102,241,0.02)' }}>
        <Text size="sm" fw={700} mb={8}>การคำนวณ VAT</Text>
        <Text size="sm" c="dimmed">
          ภาษีขาย ฿{fmt(d.totalOutputVat || 0)} − ภาษีซื้อ ฿{fmt(d.totalInputVat || 0)} = {' '}
          <Text span fw={700} c={vatPayable >= 0 ? 'red' : 'green'}>
            {vatPayable >= 0 ? 'VAT ต้องจ่าย' : 'VAT ขอคืน'} ฿{fmt(Math.abs(vatPayable))}
          </Text>
        </Text>
      </Card>

      {/* Output VAT (ภาษีขาย) */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="green" variant="filled" size="lg">ภาษีขาย (Output VAT)</Badge>
          <Text size="sm" c="dimmed">จากการขายสินค้า</Text>
        </Group>
        {(d.outputVat || []).length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">ไม่มีข้อมูล</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>งวด</Table.Th>
                <Table.Th ta="right">จำนวนใบ</Table.Th>
                <Table.Th ta="right">ยอดขาย</Table.Th>
                <Table.Th ta="right">ภาษีขาย</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(d.outputVat || []).map((r: any) => (
                <Table.Tr key={r.period}>
                  <Table.Td><Text size="sm" fw={600}>{r.period}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm">{r.invoice_count}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(r.total_sales))}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm" fw={600} c="green">฿{fmt(parseFloat(r.vat_amount))}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={3}>รวม</Table.Th>
                <Table.Th ta="right"><Text fw={700} c="green">฿{fmt(d.totalOutputVat || 0)}</Text></Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        )}
      </Card>

      {/* Input VAT (ภาษีซื้อ) */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="orange" variant="filled" size="lg">ภาษีซื้อ (Input VAT)</Badge>
          <Text size="sm" c="dimmed">จากค่าใช้จ่าย</Text>
        </Group>
        {(d.inputVat || []).length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">ไม่มีข้อมูล</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>งวด</Table.Th>
                <Table.Th ta="right">จำนวนใบ</Table.Th>
                <Table.Th ta="right">ยอดซื้อ</Table.Th>
                <Table.Th ta="right">ภาษีซื้อ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(d.inputVat || []).map((r: any) => (
                <Table.Tr key={r.period}>
                  <Table.Td><Text size="sm" fw={600}>{r.period}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm">{r.invoice_count}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(r.total_amount))}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm" fw={600} c="orange">฿{fmt(parseFloat(r.vat_amount))}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={3}>รวม</Table.Th>
                <Table.Th ta="right"><Text fw={700} c="orange">฿{fmt(d.totalInputVat || 0)}</Text></Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        )}
      </Card>

      {/* WHT (ภาษีหัก ณ ที่จ่าย) */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <Badge color="violet" variant="filled" size="lg">ภาษีหัก ณ ที่จ่าย (WHT)</Badge>
        </Group>
        {(d.wht || []).length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">ไม่มีข้อมูล</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>งวด</Table.Th>
                <Table.Th ta="right">จำนวนรายการ</Table.Th>
                <Table.Th ta="right">ภาษีหัก ณ ที่จ่าย</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(d.wht || []).map((r: any) => (
                <Table.Tr key={r.period}>
                  <Table.Td><Text size="sm" fw={600}>{r.period}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm">{r.doc_count}</Text></Table.Td>
                  <Table.Td ta="right"><Text size="sm" fw={600} c="violet">฿{fmt(parseFloat(r.wht_amount))}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={2}>รวม</Table.Th>
                <Table.Th ta="right"><Text fw={700} c="violet">฿{fmt(d.totalWht || 0)}</Text></Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        )}
      </Card>
    </Stack>
  )
}
