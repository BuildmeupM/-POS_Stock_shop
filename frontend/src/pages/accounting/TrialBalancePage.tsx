import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Text, Group, Table, Badge, Loader, Stack, Divider } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { IconListCheck } from '@tabler/icons-react'
import api from '../../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtDateThai = (d: Date | null) => {
  if (!d) return ''
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function TrialBalancePage() {
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

  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance', from, to],
    queryFn: () => api.get('/reports/trial-balance', { params: { from, to } }).then(r => r.data),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const accounts: any[] = data?.accounts || []
  const t = data?.totals || { bf_debit: 0, bf_credit: 0, mv_debit: 0, mv_credit: 0, end_debit: 0, end_credit: 0 }

  const bfBalanced = Math.abs(t.bf_debit - t.bf_credit) < 0.01
  const mvBalanced = Math.abs(t.mv_debit - t.mv_credit) < 0.01
  const endBalanced = Math.abs(t.end_debit - t.end_credit) < 0.01

  const Cell = ({ value, bold, color }: { value: number; bold?: boolean; color?: string }) => (
    <Table.Td ta="right">
      <Text size="sm" fw={bold ? 700 : 400} c={value > 0 ? (color || undefined) : 'dimmed'}>
        {value > 0 ? fmt(value) : '—'}
      </Text>
    </Table.Td>
  )

  return (
    <Stack gap="lg">
      {/* Report Header */}
      <Card shadow="xs" padding="lg" radius="md" withBorder style={{ background: 'var(--app-surface-light)' }}>
        <Text ta="center" size="lg" fw={800}>{company?.name || 'บริษัท'}</Text>
        <Text ta="center" size="md" fw={700} mt={2}>งบทดลอง</Text>
        {from && to && (
          <Text ta="center" size="sm" c="dimmed" mt={4}>
            สำหรับงวด {fmtDateThai(fromDate)} ถึง {fmtDateThai(toDate)}
          </Text>
        )}
      </Card>

      {/* Date pickers */}
      <Group justify="flex-end">
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

      <Card shadow="xs" padding="lg" radius="md" withBorder>
        {accounts.length === 0 ? (
          <Text ta="center" c="dimmed" py="xl">ยังไม่มีรายการบันทึกบัญชีในช่วงเวลาที่เลือก</Text>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table striped highlightOnHover style={{ minWidth: 950 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th rowSpan={2} style={{ verticalAlign: 'bottom', width: 80 }}>เลขที่</Table.Th>
                  <Table.Th rowSpan={2} style={{ verticalAlign: 'bottom' }}>ชื่อบัญชี</Table.Th>
                  <Table.Th colSpan={2} ta="center"
                    style={{ borderBottom: '2px solid #6366f1', background: 'rgba(99,102,241,0.06)' }}>
                    ยอดยกมา
                  </Table.Th>
                  <Table.Th colSpan={2} ta="center"
                    style={{ borderBottom: '2px solid #059669', background: 'rgba(5,150,105,0.06)' }}>
                    เคลื่อนไหวระหว่างงวด
                  </Table.Th>
                  <Table.Th colSpan={2} ta="center"
                    style={{ borderBottom: '2px solid #0891b2', background: 'rgba(8,145,178,0.06)' }}>
                    ยอดคงเหลือ
                  </Table.Th>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th ta="right" style={{ background: 'rgba(99,102,241,0.03)', width: 110 }}>เดบิต</Table.Th>
                  <Table.Th ta="right" style={{ background: 'rgba(99,102,241,0.03)', width: 110 }}>เครดิต</Table.Th>
                  <Table.Th ta="right" style={{ background: 'rgba(5,150,105,0.03)', width: 110 }}>เดบิต</Table.Th>
                  <Table.Th ta="right" style={{ background: 'rgba(5,150,105,0.03)', width: 110 }}>เครดิต</Table.Th>
                  <Table.Th ta="right" style={{ background: 'rgba(8,145,178,0.03)', width: 110 }}>เดบิต</Table.Th>
                  <Table.Th ta="right" style={{ background: 'rgba(8,145,178,0.03)', width: 110 }}>เครดิต</Table.Th>
                </Table.Tr>
              </Table.Thead>

              <Table.Tbody>
                {accounts.map((acc: any) => (
                  <Table.Tr key={acc.id}>
                    <Table.Td>
                      <Text size="sm" ff="monospace" fw={600}>{acc.account_code}</Text>
                    </Table.Td>
                    <Table.Td><Text size="sm">{acc.name}</Text></Table.Td>
                    <Cell value={acc.bf_debit} />
                    <Cell value={acc.bf_credit} />
                    <Cell value={acc.mv_debit} />
                    <Cell value={acc.mv_credit} />
                    <Cell value={acc.end_debit} />
                    <Cell value={acc.end_credit} />
                  </Table.Tr>
                ))}
              </Table.Tbody>

              <Table.Tfoot>
                <Table.Tr style={{ borderTop: '3px double var(--app-text)' }}>
                  <Table.Th colSpan={2}><Text size="sm" fw={800}>รวม</Text></Table.Th>
                  <Table.Th ta="right"><Text size="sm" fw={800} c="blue">{fmt(t.bf_debit)}</Text></Table.Th>
                  <Table.Th ta="right"><Text size="sm" fw={800} c="red">{fmt(t.bf_credit)}</Text></Table.Th>
                  <Table.Th ta="right"><Text size="sm" fw={800} c="blue">{fmt(t.mv_debit)}</Text></Table.Th>
                  <Table.Th ta="right"><Text size="sm" fw={800} c="red">{fmt(t.mv_credit)}</Text></Table.Th>
                  <Table.Th ta="right"><Text size="sm" fw={800} c="blue">{fmt(t.end_debit)}</Text></Table.Th>
                  <Table.Th ta="right"><Text size="sm" fw={800} c="red">{fmt(t.end_credit)}</Text></Table.Th>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th colSpan={2} />
                  <Table.Th colSpan={2} ta="center">
                    <Badge variant="light" color={bfBalanced ? 'green' : 'red'} size="sm">
                      {bfBalanced ? 'สมดุล' : `ผลต่าง ${fmt(Math.abs(t.bf_debit - t.bf_credit))}`}
                    </Badge>
                  </Table.Th>
                  <Table.Th colSpan={2} ta="center">
                    <Badge variant="light" color={mvBalanced ? 'green' : 'red'} size="sm">
                      {mvBalanced ? 'สมดุล' : `ผลต่าง ${fmt(Math.abs(t.mv_debit - t.mv_credit))}`}
                    </Badge>
                  </Table.Th>
                  <Table.Th colSpan={2} ta="center">
                    <Badge variant="light" color={endBalanced ? 'green' : 'red'} size="sm">
                      {endBalanced ? 'สมดุล' : `ผลต่าง ${fmt(Math.abs(t.end_debit - t.end_credit))}`}
                    </Badge>
                  </Table.Th>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </div>
        )}
      </Card>
    </Stack>
  )
}
