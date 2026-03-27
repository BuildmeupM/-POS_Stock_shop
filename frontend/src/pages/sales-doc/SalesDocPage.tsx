import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Badge, Loader, Select, Modal, Tabs,
  Table, ActionIcon, Tooltip, Card, Pagination, SimpleGrid, Menu, NumberInput, Divider,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconFilterOff, IconPlus, IconFileInvoice, IconReceipt,
  IconFileText, IconDotsVertical, IconEye, IconCheck, IconX, IconCash, IconAlertTriangle,
  IconTrash,
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt, fmtDateTime as fmtDate } from '../../utils/formatters'

const PAGE_SIZE = 15

const DOC_TYPE_MAP: Record<string, { label: string; color: string; icon: any }> = {
  quotation: { label: 'ใบเสนอราคา', color: 'blue', icon: IconFileText },
  invoice:   { label: 'ใบแจ้งหนี้', color: 'indigo', icon: IconFileInvoice },
  delivery:  { label: 'ใบส่งของ', color: 'cyan', icon: IconFileInvoice },
  receipt:   { label: 'ใบเสร็จรับเงิน', color: 'green', icon: IconReceipt },
  receipt_tax: { label: 'ใบเสร็จ/ใบกำกับภาษี', color: 'violet', icon: IconReceipt },
  receipt_abb: { label: 'ใบกำกับภาษีอย่างย่อ', color: 'cyan', icon: IconReceipt },
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
  // Payment modal
  const [payDoc, setPayDoc] = useState<any>(null)
  const [payAmount, setPayAmount] = useState<number>(0)
  const [payMethod, setPayMethod] = useState<string>('cash')
  // Void modal
  const [voidDocId, setVoidDocId] = useState<number | null>(null)
  // Delete modal
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<string>('active')
  // Approve modal
  const [approveDoc, setApproveDoc] = useState<any>(null)
  const [approvePayChannelId, setApprovePayChannelId] = useState<string | null>(null)

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['sales-docs', filterType, filterStatus],
    queryFn: () => {
      const params: any = {}
      if (filterType) params.docType = filterType
      if (filterStatus) params.status = filterStatus
      return api.get('/sales-doc', { params }).then(r => r.data)
    },
  })

  const { data: companySettings } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  const vatEnabled = companySettings?.settings?.vat_enabled !== false

  const { data: paymentChannels = [] } = useQuery({
    queryKey: ['payment-channels'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, payNow, paymentMethod: pm, paymentChannelId: pci }: any) => api.put(`/sales-doc/${id}/approve`, { payNow, paymentMethod: pm, paymentChannelId: pci, amount: approveDoc?.total_amount }),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'อนุมัติเอกสารแล้ว', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-docs'] }); setApproveDoc(null) },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' }),
  })

  const voidMutation = useMutation({
    mutationFn: (id: number) => api.put(`/sales-doc/${id}/void`),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกเอกสารแล้ว', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-docs'] }); setVoidDocId(null) },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/sales-doc/${id}`),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'ลบเอกสารแล้ว', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-docs'] }); queryClient.invalidateQueries({ queryKey: ['sales'] }); setDeleteDocId(null) },
    onError: (e: any) => notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'ไม่สามารถลบเอกสารได้', color: 'red' }),
  })

  const payMutation = useMutation({
    mutationFn: ({ id, amount, paymentMethod: pm }: any) => api.put(`/sales-doc/${id}/pay`, { amount, paymentMethod: pm }),
    onSuccess: () => { notifications.show({ title: 'สำเร็จ', message: 'บันทึกชำระเงินแล้ว', color: 'green' }); queryClient.invalidateQueries({ queryKey: ['sales-docs'] }); setPayDoc(null) },
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

  const activeDocs = filtered.filter((d: any) => d.status !== 'voided')
  const voidedDocs = filtered.filter((d: any) => d.status === 'voided')
  const displayDocs = activeTab === 'voided' ? voidedDocs : activeDocs

  const totalPages = Math.ceil(displayDocs.length / PAGE_SIZE)
  const paginated = displayDocs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
            {vatEnabled && (
              <Menu.Item leftSection={<IconReceipt size={14} />} onClick={() => navigate('/sales-doc/create?type=receipt_tax')}>ใบเสร็จ/ใบกำกับภาษี</Menu.Item>
            )}
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
          <Text size="xs" c="dimmed" ml="auto">{displayDocs.length} เอกสาร</Text>
        </Group>
      </Card>

      {/* Tabs: Active / Voided */}
      <Tabs value={activeTab} onChange={(v) => { setActiveTab(v || 'active'); setPage(1) }}>
        <Tabs.List>
          <Tabs.Tab value="active" leftSection={<IconCheck size={14} />}>
            เอกสารปัจจุบัน <Badge size="xs" variant="light" ml={4}>{activeDocs.length}</Badge>
          </Tabs.Tab>
          <Tabs.Tab value="voided" color="red" leftSection={<IconX size={14} />}>
            เอกสารยกเลิก <Badge size="xs" variant="light" color="red" ml={4}>{voidedDocs.length}</Badge>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

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
                              onClick={() => { setApproveDoc(d); setApprovePayChannelId(null) }}>อนุมัติ</Menu.Item>
                          )}
                          {d.status === 'approved' && d.payment_status !== 'paid' && d.doc_type !== 'quotation' && (
                            <Menu.Item leftSection={<IconCash size={14} />} color="green"
                              onClick={() => { setPayDoc(d); setPayAmount(parseFloat(d.total_amount) - parseFloat(d.paid_amount || 0)); setPayMethod('cash') }}>บันทึกชำระ</Menu.Item>
                          )}
                          {d.status !== 'voided' && (
                            <>
                              <Menu.Divider />
                              <Menu.Item leftSection={<IconX size={14} />} color="red"
                                onClick={() => setVoidDocId(d.id)}>ยกเลิก</Menu.Item>
                            </>
                          )}
                          {(d.status === 'draft' || d.status === 'voided') && (
                            <>
                              {d.status === 'draft' && <Menu.Divider />}
                              <Menu.Item leftSection={<IconTrash size={14} />} color="red"
                                onClick={() => setDeleteDocId(d.id)}>ลบเอกสาร</Menu.Item>
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

      {/* === Payment Modal === */}
      <Modal opened={!!payDoc} onClose={() => setPayDoc(null)} title="บันทึกชำระเงิน" centered size="sm">
        {payDoc && (
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">เลขที่เอกสาร</Text>
              <Text fw={700}>{payDoc.doc_number}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">ยอดรวม</Text>
              <Text fw={700} c="blue">฿{fmt(parseFloat(payDoc.total_amount))}</Text>
            </Group>
            {parseFloat(payDoc.paid_amount) > 0 && (
              <Group justify="space-between">
                <Text size="sm" c="dimmed">ชำระแล้ว</Text>
                <Text fw={600} c="green">฿{fmt(parseFloat(payDoc.paid_amount))}</Text>
              </Group>
            )}
            <Divider />
            <NumberInput label="จำนวนเงินที่ชำระ" value={payAmount} onChange={(v) => setPayAmount(Number(v) || 0)}
              min={0} decimalScale={2} thousandSeparator="," prefix="฿" />
            <Select label="วิธีชำระ" value={payMethod} onChange={(v) => setPayMethod(v || 'cash')}
              data={[{ value: 'cash', label: 'เงินสด' }, { value: 'transfer', label: 'โอนเงิน' }, { value: 'credit_card', label: 'บัตรเครดิต' }, { value: 'qr_code', label: 'QR Code' }]} />
            <Group grow mt="sm">
              <Button variant="light" onClick={() => setPayDoc(null)}>ยกเลิก</Button>
              <Button color="green" loading={payMutation.isPending}
                onClick={() => payMutation.mutate({ id: payDoc.id, amount: payAmount, paymentMethod: payMethod })}
                leftSection={<IconCash size={16} />}>บันทึกชำระ</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* === Void Confirmation Modal === */}
      <Modal opened={!!voidDocId} onClose={() => setVoidDocId(null)} title="ยืนยันยกเลิกเอกสาร" centered size="sm">
        <Stack gap="md">
          <Group gap="sm" style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 16px' }}>
            <IconAlertTriangle size={20} color="#dc2626" />
            <Text size="sm" c="red">การยกเลิกไม่สามารถกู้คืนได้ ต้องการดำเนินการต่อหรือไม่?</Text>
          </Group>
          <Group grow>
            <Button variant="light" onClick={() => setVoidDocId(null)}>ไม่ ปิดหน้านี้</Button>
            <Button color="red" loading={voidMutation.isPending}
              onClick={() => { if (voidDocId) voidMutation.mutate(voidDocId) }}
              leftSection={<IconX size={16} />}>ยืนยัน ยกเลิก</Button>
          </Group>
        </Stack>
      </Modal>

      {/* === Delete Confirmation Modal === */}
      <Modal opened={!!deleteDocId} onClose={() => setDeleteDocId(null)} title="ยืนยันลบเอกสาร" centered size="sm">
        <Stack gap="md">
          <Group gap="sm" style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 16px' }}>
            <IconTrash size={20} color="#dc2626" />
            <div>
              <Text size="sm" fw={600} c="red">ลบเอกสารถาวร</Text>
              <Text size="xs" c="dimmed">เอกสารจะถูกลบออกจากระบบทั้งหมดและไม่สามารถกู้คืนได้</Text>
            </div>
          </Group>
          <Group grow>
            <Button variant="light" onClick={() => setDeleteDocId(null)}>ยกเลิก</Button>
            <Button color="red" loading={deleteMutation.isPending}
              onClick={() => { if (deleteDocId) deleteMutation.mutate(deleteDocId) }}
              leftSection={<IconTrash size={16} />}>ลบเอกสาร</Button>
          </Group>
        </Stack>
      </Modal>

      {/* === Approve + Payment Modal === */}
      <Modal opened={!!approveDoc} onClose={() => setApproveDoc(null)} title="อนุมัติเอกสาร" centered size="sm">
        {approveDoc && (
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">เลขที่เอกสาร</Text>
              <Text fw={700}>{approveDoc.doc_number}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">ประเภท</Text>
              <Badge variant="light" color={DOC_TYPE_MAP[approveDoc.doc_type]?.color || 'gray'}>
                {DOC_TYPE_MAP[approveDoc.doc_type]?.label || approveDoc.doc_type}
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">ยอดรวม</Text>
              <Text fw={700} size="lg" c="blue">฿{fmt(parseFloat(approveDoc.total_amount))}</Text>
            </Group>
            <Divider label="ชำระผ่าน" labelPosition="center" />
            <div>
              <Text size="sm" fw={600} mb={8}>เลือกช่องทางชำระเงิน</Text>
              {paymentChannels.length === 0 ? (
                <Card padding="md" radius="md" withBorder>
                  <Text ta="center" c="dimmed" size="sm">ยังไม่มีช่องทาง — กรุณาเพิ่มในหน้า "กระเป๋าเงิน"</Text>
                </Card>
              ) : (
                <SimpleGrid cols={2} spacing="sm">
                  {paymentChannels.map((ch: any) => {
                    const isSelected = approvePayChannelId === String(ch.id)
                    const typeColors: Record<string, string> = { cash: '#059669', transfer: '#3b82f6', credit_card: '#8b5cf6', qr_code: '#06b6d4' }
                    const typeIcons: Record<string, string> = { cash: '฿', transfer: '🏦', credit_card: '💳', qr_code: '📱' }
                    const typeLabels: Record<string, string> = { cash: 'เงินสด', transfer: 'โอนเงิน', credit_card: 'บัตรเครดิต', qr_code: 'QR Code' }
                    const color = typeColors[ch.type] || '#6b7280'
                    return (
                      <Card key={ch.id} padding="sm" radius="md" withBorder
                        onClick={() => setApprovePayChannelId(String(ch.id))}
                        style={{
                          cursor: 'pointer',
                          border: isSelected ? `2px solid ${color}` : '1px solid var(--app-border)',
                          background: isSelected ? `${color}08` : 'var(--app-surface)',
                          transition: 'all 0.2s',
                        }}>
                        <Group gap={10} wrap="nowrap">
                          <div style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            background: isSelected ? color : `${color}20`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isSelected ? '#fff' : color, fontWeight: 800, fontSize: 14,
                            transition: 'all 0.2s',
                          }}>
                            {typeIcons[ch.type] || '💰'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" fw={700} lineClamp={1}>{ch.name}</Text>
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {ch.bank_name || typeLabels[ch.type] || ch.type}
                              {ch.account_number ? ` • ${ch.account_number}` : ''}
                            </Text>
                          </div>
                          {isSelected && (
                            <div style={{
                              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                              background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <IconCheck size={14} color="#fff" />
                            </div>
                          )}
                        </Group>
                      </Card>
                    )
                  })}
                </SimpleGrid>
              )}
            </div>
            <Group grow mt="sm">
              <Button variant="light" color="gray"
                loading={approveMutation.isPending}
                onClick={() => approveMutation.mutate({ id: approveDoc.id, payNow: false })}>
                อนุมัติ (ยังไม่ชำระ)
              </Button>
              <Button color="blue" disabled={!approvePayChannelId}
                loading={approveMutation.isPending}
                onClick={() => {
                  const ch = paymentChannels.find((c: any) => String(c.id) === approvePayChannelId)
                  approveMutation.mutate({ id: approveDoc.id, payNow: true, paymentMethod: ch?.type || 'cash', paymentChannelId: ch?.id })
                }}
                leftSection={<IconCheck size={16} />}>
                อนุมัติ + ชำระเลย
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  )
}
