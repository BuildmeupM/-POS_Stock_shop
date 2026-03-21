import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Badge, Loader, Select,
  Table, ActionIcon, Tooltip, Card, Pagination, SimpleGrid, Menu,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconFilterOff, IconPlus, IconFileInvoice, IconReceipt,
  IconFileText, IconDotsVertical, IconEye, IconCheck, IconX, IconCash,
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt, fmtDateTime as fmtDate } from '../utils/formatters'

const PAGE_SIZE = 15

const DOC_TYPE_MAP: Record<string, { label: string; color: string; icon: any }> = {
  quotation: { label: 'ใบเสนอราคา', color: 'blue', icon: IconFileText },
  invoice:   { label: 'ใบแจ้งหนี้', color: 'indigo', icon: IconFileInvoice },
  delivery:  { label: 'ใบส่งของ', color: 'cyan', icon: IconFileInvoice },
  receipt:   { label: 'ใบเสร็จรับเงิน', color: 'green', icon: IconReceipt },
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:    { label: 'ร่าง', color: 'gray' },
  approved: { label: 'อนุมัติ', color: 'blue' },
  sent:     { label: 'ส่งแล้ว', color: 'cyan' },
  accepted: { label: 'ยอมรับ', color: 'green' },
  rejected: { label: 'ปฏิเสธ', color: 'red' },
  voided:   { label: 'ยกเลิก', color: 'red' },
}

const PAY_MAP: Record<string, { label: string; color: string }> = {
  unpaid:  { label: 'ยังไม่ชำระ', color: 'yellow' },
  partial: { label: 'ชำระบางส่วน', color: 'orange' },
  paid:    { label: 'ชำระแล้ว', color: 'green' },
}

export default function SalesDocPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string | null>(null)

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['sales-docs', filterType, filterStatus],
    queryFn: () => {
      const params: any = {}
      if (filterType) params.docType = filterType
      if (filterStatus) params.status = filterStatus
      return api.get('/sales-doc', { params }).then(r => r.data)
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.put(`/sales-doc/${id}/approve`),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'อนุมัติเอกสารแล้ว', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-docs'] }) },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' }),
  })

  const voidMutation = useMutation({
    mutationFn: (id: number) => api.put(`/sales-doc/${id}/void`),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกเอกสารแล้ว', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-docs'] }) },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' }),
  })

  const filtered = useMemo(() => {
    if (!search) return docs
    const s = search.toLowerCase()
    return docs.filter((d: any) =>
      d.doc_number?.toLowerCase().includes(s) ||
      d.customer_name?.toLowerCase().includes(s) ||
      d.customer_name_ref?.toLowerCase().includes(s)
    )
  }, [docs, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Summary
  const summary = useMemo(() => {
    const qt = docs.filter((d: any) => d.doc_type === 'quotation').length
    const iv = docs.filter((d: any) => d.doc_type === 'invoice').length
    const rc = docs.filter((d: any) => d.doc_type === 'receipt').length
    const totalAmount = docs.filter((d: any) => d.doc_type !== 'quotation' && d.status !== 'voided')
      .reduce((s: number, d: any) => s + (parseFloat(d.total_amount) || 0), 0)
    const unpaid = docs.filter((d: any) => d.doc_type === 'invoice' && d.payment_status === 'unpaid' && d.status === 'approved')
      .reduce((s: number, d: any) => s + (parseFloat(d.total_amount) || 0), 0)
    return { qt, iv, rc, totalAmount, unpaid }
  }, [docs])

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="xl" fw={800}>เอกสารขาย</Text>
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button leftSection={<IconPlus size={16} />}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างเอกสาร
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFileText size={14} />} onClick={() => navigate('/sales-doc/create?type=quotation')}>ใบเสนอราคา</Menu.Item>
            <Menu.Item leftSection={<IconFileInvoice size={14} />} onClick={() => navigate('/sales-doc/create?type=invoice')}>ใบแจ้งหนี้ / บิลขาย</Menu.Item>
            <Menu.Item leftSection={<IconFileInvoice size={14} />} onClick={() => navigate('/sales-doc/create?type=delivery')}>ใบส่งของ</Menu.Item>
            <Menu.Item leftSection={<IconReceipt size={14} />} onClick={() => navigate('/sales-doc/create?type=receipt')}>ใบเสร็จรับเงิน</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      {/* Summary */}
      <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="sm">
        <Card shadow="xs" padding="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" fw={600}>ยอดขายรวม</Text>
          <Text size="xl" fw={800} c="green">฿{fmt(summary.totalAmount)}</Text>
        </Card>
        <Card shadow="xs" padding="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" fw={600}>ค้างชำระ</Text>
          <Text size="xl" fw={800} c="orange">฿{fmt(summary.unpaid)}</Text>
        </Card>
        <Card shadow="xs" padding="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" fw={600}>ใบแจ้งหนี้</Text>
          <Text size="xl" fw={800}>{summary.iv}</Text>
        </Card>
        <Card shadow="xs" padding="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" fw={600}>ใบเสนอราคา</Text>
          <Text size="xl" fw={800}>{summary.qt}</Text>
        </Card>
      </SimpleGrid>

      {/* Filters */}
      <Card shadow="xs" padding="sm" radius="md" withBorder>
        <Group gap="sm" wrap="wrap">
          <TextInput size="xs" placeholder="ค้นหาเลขที่ / ลูกค้า" style={{ width: 220 }}
            leftSection={<IconSearch size={14} />}
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          <Select size="xs" placeholder="ประเภท" clearable style={{ width: 140 }}
            data={Object.entries(DOC_TYPE_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
            value={filterType} onChange={v => { setFilterType(v); setPage(1) }} />
          <Select size="xs" placeholder="สถานะ" clearable style={{ width: 120 }}
            data={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
            value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1) }} />
          {(search || filterType || filterStatus) && (
            <ActionIcon size="sm" variant="light" color="red" onClick={() => { setSearch(''); setFilterType(null); setFilterStatus(null); setPage(1) }}>
              <IconFilterOff size={14} />
            </ActionIcon>
          )}
          <Text size="xs" c="dimmed" ml="auto">{filtered.length} เอกสาร</Text>
        </Group>
      </Card>

      {/* Table */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <Card shadow="xs" padding={0} radius="md" withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>เลขที่</Table.Th>
                <Table.Th>ประเภท</Table.Th>
                <Table.Th>ลูกค้า</Table.Th>
                <Table.Th ta="right">ยอดรวม</Table.Th>
                <Table.Th ta="center">สถานะ</Table.Th>
                <Table.Th ta="center">ชำระ</Table.Th>
                <Table.Th ta="center" style={{ width: 80 }}>จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginated.length === 0 ? (
                <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" py="xl">ไม่พบเอกสาร</Text></Table.Td></Table.Tr>
              ) : paginated.map((d: any) => {
                const dt = DOC_TYPE_MAP[d.doc_type] || DOC_TYPE_MAP.invoice
                const st = STATUS_MAP[d.status] || STATUS_MAP.draft
                const pay = PAY_MAP[d.payment_status] || PAY_MAP.unpaid
                return (
                  <Table.Tr key={d.id}>
                    <Table.Td>
                      <Text size="sm" fw={600} ff="monospace" c="indigo"
                        style={{ cursor: 'pointer' }} onClick={() => navigate(`/sales-doc/${d.id}`)}>
                        {d.doc_number}
                      </Text>
                      <Text size="xs" c="dimmed">{fmtDate(d.doc_date)}</Text>
                    </Table.Td>
                    <Table.Td><Badge variant="light" color={dt.color} size="sm">{dt.label}</Badge></Table.Td>
                    <Table.Td><Text size="sm">{d.customer_name || d.customer_name_ref || '-'}</Text></Table.Td>
                    <Table.Td ta="right"><Text size="sm" fw={700} c="green">฿{fmt(parseFloat(d.total_amount))}</Text></Table.Td>
                    <Table.Td ta="center"><Badge variant="light" color={st.color} size="sm">{st.label}</Badge></Table.Td>
                    <Table.Td ta="center">
                      {d.doc_type !== 'quotation' && <Badge variant="light" color={pay.color} size="sm">{pay.label}</Badge>}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Menu shadow="md" width={160}>
                        <Menu.Target>
                          <ActionIcon size="sm" variant="subtle" color="gray"><IconDotsVertical size={14} /></ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconEye size={14} />} onClick={() => navigate(`/sales-doc/${d.id}`)}>ดูรายละเอียด</Menu.Item>
                          {d.status === 'draft' && (
                            <Menu.Item leftSection={<IconCheck size={14} />} color="blue"
                              onClick={() => approveMutation.mutate(d.id)}>อนุมัติ</Menu.Item>
                          )}
                          {d.status === 'approved' && d.payment_status !== 'paid' && d.doc_type !== 'quotation' && (
                            <Menu.Item leftSection={<IconCash size={14} />} color="green"
                              onClick={() => navigate(`/sales-doc/${d.id}`)}>บันทึกชำระ</Menu.Item>
                          )}
                          {d.status !== 'voided' && (
                            <>
                              <Menu.Divider />
                              <Menu.Item leftSection={<IconX size={14} />} color="red"
                                onClick={() => { if (confirm('ยกเลิกเอกสาร?')) voidMutation.mutate(d.id) }}>ยกเลิก</Menu.Item>
                            </>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
          {totalPages > 1 && (
            <Group justify="center" py="md">
              <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
            </Group>
          )}
        </Card>
      )}
    </Stack>
  )
}
