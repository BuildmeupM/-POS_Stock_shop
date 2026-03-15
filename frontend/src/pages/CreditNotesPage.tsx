import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TextInput, Group, Text, Stack, Badge, Loader, Card,
  Table, Tooltip, ActionIcon, Pagination
} from '@mantine/core'
import {
  IconSearch, IconFilterOff, IconFileInvoice, IconEye
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt, fmtDateTime as fmtDate } from '../utils/formatters'

const PAGE_SIZE = 15

export default function CreditNotesPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')



  const { data: creditNotes = [], isLoading } = useQuery({
    queryKey: ['credit-notes'],
    queryFn: () => api.get('/credit-notes').then(r => r.data),
  })

  const filtered = useMemo(() => {
    if (!search) return creditNotes
    const s = search.toLowerCase()
    return creditNotes.filter((cn: any) =>
      cn.credit_note_number?.toLowerCase().includes(s) ||
      cn.customer_name?.toLowerCase().includes(s) ||
      cn.order_number?.toLowerCase().includes(s)
    )
  }, [creditNotes, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusConfig: Record<string, { label: string; color: string }> = {
    draft: { label: 'ร่าง', color: 'gray' },
    approved: { label: 'อนุมัติแล้ว', color: 'green' },
    voided: { label: 'ยกเลิก', color: 'red' },
  }

  if (isLoading) return <Loader style={{ margin: '60px auto', display: 'block' }} />

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="xl" fw={800}>📄 ใบลดหนี้ (Credit Notes)</Text>
        <Text size="sm" c="dimmed">{filtered.length} รายการ</Text>
      </Group>

      {/* Filter */}
      <Card shadow="xs" padding="sm" radius="md" withBorder>
        <Group gap="sm">
          <TextInput size="xs" placeholder="ค้นหาเลข CN / ลูกค้า / เลขออเดอร์" style={{ width: 300 }}
            leftSection={<IconSearch size={14} />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          {search && (
            <Tooltip label="ล้างค้นหา">
              <ActionIcon size="sm" variant="light" color="red" onClick={() => { setSearch(''); setPage(1) }}>
                <IconFilterOff size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Card>

      {/* Table */}
      <Card shadow="xs" padding={0} radius="md" withBorder>
        <Table.ScrollContainer minWidth={800}>
          <Table striped highlightOnHover>
            <Table.Thead style={{ background: 'var(--app-surface-secondary, #f8f9fa)' }}>
              <Table.Tr>
                <Table.Th>เลขใบลดหนี้</Table.Th>
                <Table.Th>วันที่</Table.Th>
                <Table.Th>ออเดอร์อ้างอิง</Table.Th>
                <Table.Th>ลูกค้า</Table.Th>
                <Table.Th>สาเหตุ</Table.Th>
                <Table.Th ta="right">ยอดคืน</Table.Th>
                <Table.Th ta="center">สถานะ</Table.Th>
                <Table.Th ta="center" style={{ width: 60 }}></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginated.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text ta="center" c="dimmed" py="xl">ไม่พบใบลดหนี้</Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                paginated.map((cn: any) => {
                  const st = statusConfig[cn.status] || statusConfig.draft
                  return (
                    <Table.Tr key={cn.id} style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/orders/${cn.order_id}`)}>
                      <Table.Td>
                        <Group gap={6}>
                          <IconFileInvoice size={14} color="#ef4444" />
                          <Text size="sm" fw={600} ff="monospace" c="red">{cn.credit_note_number}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td><Text size="xs" c="dimmed">{fmtDate(cn.created_at)}</Text></Table.Td>
                      <Table.Td><Text size="sm" ff="monospace">{cn.order_number || '-'}</Text></Table.Td>
                      <Table.Td>
                        <Text size="sm">{cn.customer_name || '-'}</Text>
                        {cn.customer_phone && <Text size="xs" c="dimmed">{cn.customer_phone}</Text>}
                      </Table.Td>
                      <Table.Td><Text size="xs" c="dimmed" lineClamp={1}>{cn.reason || '-'}</Text></Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={700} c="red">฿{fmt(parseFloat(cn.net_amount || 0))}</Text>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge variant="light" color={st.color} size="sm">{st.label}</Badge>
                      </Table.Td>
                      <Table.Td ta="center" onClick={(e: any) => e.stopPropagation()}>
                        <Tooltip label="ดูออเดอร์">
                          <ActionIcon size="sm" variant="light" onClick={() => navigate(`/orders/${cn.order_id}`)}>
                            <IconEye size={14} />
                          </ActionIcon>
                        </Tooltip>
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
    </Stack>
  )
}
