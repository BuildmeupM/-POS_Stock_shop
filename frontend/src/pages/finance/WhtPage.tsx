import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, Stack, Badge, Loader, Select, Modal,
  Table, ActionIcon, Tooltip, Card, Pagination, NumberInput, Textarea,
  Divider,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconPlus, IconPrinter, IconX, IconFilter, IconFilterOff,
  IconReceipt, IconReceiptTax, IconCalendar, IconCheck, IconFileInvoice,
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt } from '../../utils/formatters'
import { printWhtCertificate } from '../../utils/printWhtCertificate'
import type { WhtCertificate, Contact } from '../../types'

const PAGE_SIZE = 15

const statusColors: Record<string, { color: string; label: string }> = {
  draft: { color: 'gray', label: 'ร่าง' },
  issued: { color: 'green', label: 'ออกแล้ว' },
  voided: { color: 'red', label: 'ยกเลิก' },
}

const incomeTypes = [
  { value: 'ค่าบริการ', label: 'ค่าบริการ' },
  { value: 'ค่าเช่า', label: 'ค่าเช่า' },
  { value: 'ค่าจ้างทำของ', label: 'ค่าจ้างทำของ' },
  { value: 'ค่าโฆษณา', label: 'ค่าโฆษณา' },
  { value: 'ค่าขนส่ง', label: 'ค่าขนส่ง' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
]

const whtRates = [
  { value: '1', label: '1%' },
  { value: '2', label: '2%' },
  { value: '3', label: '3%' },
  { value: '5', label: '5%' },
  { value: '10', label: '10%' },
  { value: '15', label: '15%' },
]

const currentYear = new Date().getFullYear()
const yearOptions = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - i), label: String(currentYear - i),
}))

const monthOptions = [
  { value: '1', label: 'มกราคม' }, { value: '2', label: 'กุมภาพันธ์' },
  { value: '3', label: 'มีนาคม' }, { value: '4', label: 'เมษายน' },
  { value: '5', label: 'พฤษภาคม' }, { value: '6', label: 'มิถุนายน' },
  { value: '7', label: 'กรกฎาคม' }, { value: '8', label: 'สิงหาคม' },
  { value: '9', label: 'กันยายน' }, { value: '10', label: 'ตุลาคม' },
  { value: '11', label: 'พฤศจิกายน' }, { value: '12', label: 'ธันวาคม' },
]

interface CreateForm {
  formType: string
  contactId: string
  expenseId: string
  paymentDate: Date | null
  incomeType: string
  incomeDescription: string
  paidAmount: number
  whtRate: string
  taxMonth: string
  taxYear: string
}

const emptyForm = (): CreateForm => ({
  formType: 'pnd3',
  contactId: '',
  expenseId: '',
  paymentDate: new Date(),
  incomeType: '',
  incomeDescription: '',
  paidAmount: 0,
  whtRate: '3',
  taxMonth: String(new Date().getMonth() + 1),
  taxYear: String(new Date().getFullYear()),
})

export default function WhtPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filterForm, setFilterForm] = useState<string | null>(null)
  const [filterYear, setFilterYear] = useState<string | null>(null)
  const [filterMonth, setFilterMonth] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateForm>(emptyForm())

  // === Data ===
  const { data: certs = [], isLoading } = useQuery({
    queryKey: ['wht-certs', filterForm, filterYear, filterMonth],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (filterForm) params.formType = filterForm
      if (filterYear) params.taxYear = filterYear
      if (filterMonth) params.taxMonth = filterMonth
      return api.get('/wht', { params }).then(r => r.data)
    },
  })

  const { data: summary = [] } = useQuery({
    queryKey: ['wht-summary', filterYear],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (filterYear) params.taxYear = filterYear
      return api.get('/wht/summary', { params }).then(r => r.data)
    },
  })

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-vendor'],
    queryFn: () => api.get('/contacts', { params: { type: 'vendor' } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const { data: companySettings } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  // === Mutations ===
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/wht', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `สร้างหนังสือรับรอง ${res.data.certificateNumber}`, color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['wht-certs'] })
      queryClient.invalidateQueries({ queryKey: ['wht-summary'] })
      setShowCreate(false)
      setForm(emptyForm())
    },
    onError: (e: any) => {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' })
    },
  })

  const issueMutation = useMutation({
    mutationFn: (id: number) => api.put(`/wht/${id}/issue`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ออกหนังสือรับรองแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['wht-certs'] })
      queryClient.invalidateQueries({ queryKey: ['wht-summary'] })
    },
    onError: (e: any) => {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' })
    },
  })

  const voidMutation = useMutation({
    mutationFn: (id: number) => api.put(`/wht/${id}/void`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกหนังสือรับรองแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['wht-certs'] })
      queryClient.invalidateQueries({ queryKey: ['wht-summary'] })
    },
    onError: (e: any) => {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || '', color: 'red' })
    },
  })

  // === Computed ===
  const whtAmount = form.paidAmount * (parseFloat(form.whtRate) || 0) / 100

  const filtered = useMemo(() => {
    if (!search) return certs
    const s = search.toLowerCase()
    return certs.filter((c: WhtCertificate) =>
      c.certificate_number?.toLowerCase().includes(s) ||
      c.contact_name?.toLowerCase().includes(s) ||
      c.income_type?.toLowerCase().includes(s)
    )
  }, [certs, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalSummary = useMemo(() => {
    const active = certs.filter((c: WhtCertificate) => c.status !== 'voided')
    return {
      count: active.length,
      totalPaid: active.reduce((s: number, c: WhtCertificate) => s + parseFloat(c.paid_amount || '0'), 0),
      totalWht: active.reduce((s: number, c: WhtCertificate) => s + parseFloat(c.wht_amount || '0'), 0),
    }
  }, [certs])

  const hasFilters = !!filterForm || !!filterYear || !!filterMonth || !!search
  const clearFilters = () => { setSearch(''); setFilterForm(null); setFilterYear(null); setFilterMonth(null); setPage(1) }

  const handleCreate = () => {
    if (!form.contactId || !form.incomeType || form.paidAmount <= 0 || !form.paymentDate) {
      notifications.show({ title: 'กรุณากรอกข้อมูล', message: 'ข้อมูลที่จำเป็นยังไม่ครบ', color: 'orange' })
      return
    }
    createMutation.mutate({
      formType: form.formType,
      contactId: parseInt(form.contactId),
      expenseId: form.expenseId ? parseInt(form.expenseId) : null,
      paymentDate: form.paymentDate.toISOString().split('T')[0],
      incomeType: form.incomeType,
      incomeDescription: form.incomeDescription || null,
      paidAmount: form.paidAmount,
      whtRate: parseFloat(form.whtRate),
      whtAmount,
      taxMonth: parseInt(form.taxMonth),
      taxYear: parseInt(form.taxYear),
    })
  }

  const handlePrint = async (cert: WhtCertificate) => {
    const contact = contacts.find((c: Contact) => c.id === cert.contact_id) || {} as Contact
    printWhtCertificate({
      company: {
        name: companySettings?.name || '',
        taxId: companySettings?.tax_id || '',
        address: companySettings?.address || '',
        branch: companySettings?.settings?.branch_name || '',
        phone: companySettings?.phone || '',
      },
      payee: {
        name: cert.contact_name || '',
        taxId: cert.contact_tax_id || contact.tax_id || '',
        address: cert.contact_address || contact.address || '',
      },
      certificateNumber: cert.certificate_number,
      formType: cert.form_type as 'pnd3' | 'pnd53',
      paymentDate: cert.payment_date,
      incomeType: cert.income_type,
      incomeDescription: cert.income_description,
      paidAmount: parseFloat(cert.paid_amount),
      whtRate: parseFloat(cert.wht_rate),
      whtAmount: parseFloat(cert.wht_amount),
      taxMonth: cert.tax_month,
      taxYear: cert.tax_year,
    })
  }

  const contactOptions = contacts.map((c: Contact) => ({
    value: String(c.id), label: `${c.name}${c.tax_id ? ` (${c.tax_id})` : ''}`,
  }))

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="xl" fw={800}>หนังสือรับรองหัก ณ ที่จ่าย</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setShowCreate(true)}>
          สร้างหนังสือรับรอง
        </Button>
      </Group>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="stat-card">
          <Group gap={6}><IconReceiptTax size={16} color="var(--app-primary)" /><Text size="xs" c="dimmed">จำนวนหนังสือรับรอง</Text></Group>
          <Text fw={800} size="xl" c="blue" mt={4}>{totalSummary.count}</Text>
          <Text size="xs" c="dimmed">ฉบับ (ไม่รวมยกเลิก)</Text>
        </div>
        <div className="stat-card">
          <Group gap={6}><IconReceipt size={16} color="#059669" /><Text size="xs" c="dimmed">ยอดจ่ายทั้งหมด</Text></Group>
          <Text fw={800} size="xl" c="green" mt={4}>{fmt(totalSummary.totalPaid)}</Text>
          <Text size="xs" c="dimmed">บาท</Text>
        </div>
        <div className="stat-card">
          <Group gap={6}><IconFileInvoice size={16} color="#7c3aed" /><Text size="xs" c="dimmed">ภาษีหัก ณ ที่จ่าย</Text></Group>
          <Text fw={800} size="xl" style={{ color: '#7c3aed' }} mt={4}>{fmt(totalSummary.totalWht)}</Text>
          <Text size="xs" c="dimmed">บาท</Text>
        </div>
      </div>

      {/* Period Summary */}
      {summary.length > 0 && (
        <Card shadow="xs" padding="sm" radius="md" withBorder>
          <Text fw={700} size="sm" mb={8}>สรุปตามงวดภาษี</Text>
          <Table verticalSpacing={6} horizontalSpacing="md" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>งวด</Table.Th>
                <Table.Th>แบบ</Table.Th>
                <Table.Th ta="center">จำนวน</Table.Th>
                <Table.Th ta="right">ยอดจ่าย</Table.Th>
                <Table.Th ta="right">ภาษีหัก</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summary.map((s: any, i: number) => (
                <Table.Tr key={i}>
                  <Table.Td>{monthOptions.find(m => m.value === String(s.tax_month))?.label} {s.tax_year}</Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color={s.form_type === 'pnd3' ? 'blue' : 'violet'}>{s.form_type === 'pnd3' ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53'}</Badge></Table.Td>
                  <Table.Td ta="center">{s.cert_count}</Table.Td>
                  <Table.Td ta="right">{fmt(parseFloat(s.total_paid))}</Table.Td>
                  <Table.Td ta="right" fw={700}>{fmt(parseFloat(s.total_wht))}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* Filters */}
      <Card shadow="xs" padding="sm" radius="md" withBorder>
        <Group gap="sm" wrap="wrap">
          <IconFilter size={16} color="var(--app-text-dim)" />
          <TextInput size="xs" placeholder="ค้นหาเลขที่ / ผู้รับเงิน" style={{ width: 200 }}
            leftSection={<IconSearch size={14} />}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          <Select size="xs" placeholder="แบบ" clearable style={{ width: 130 }}
            data={[{ value: 'pnd3', label: 'ภ.ง.ด.3' }, { value: 'pnd53', label: 'ภ.ง.ด.53' }]}
            value={filterForm} onChange={(v) => { setFilterForm(v); setPage(1) }} />
          <Select size="xs" placeholder="ปี" clearable style={{ width: 100 }}
            data={yearOptions}
            value={filterYear} onChange={(v) => { setFilterYear(v); setPage(1) }} />
          <Select size="xs" placeholder="เดือน" clearable style={{ width: 130 }}
            data={monthOptions}
            value={filterMonth} onChange={(v) => { setFilterMonth(v); setPage(1) }} />
          {hasFilters && (
            <Tooltip label="ล้างตัวกรอง">
              <ActionIcon size="sm" variant="light" color="red" onClick={clearFilters}>
                <IconFilterOff size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Card>

      {/* Table */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <Card shadow="xs" padding={0} radius="md" withBorder>
          <Table.ScrollContainer minWidth={900}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>เลขที่</Table.Th>
                  <Table.Th>แบบ</Table.Th>
                  <Table.Th>ผู้รับเงิน</Table.Th>
                  <Table.Th>ประเภทเงินได้</Table.Th>
                  <Table.Th ta="right">ยอดจ่าย</Table.Th>
                  <Table.Th ta="center">อัตรา</Table.Th>
                  <Table.Th ta="right">ภาษีหัก</Table.Th>
                  <Table.Th ta="center">งวด</Table.Th>
                  <Table.Th ta="center">สถานะ</Table.Th>
                  <Table.Th ta="center" style={{ width: 160 }}>จัดการ</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {paginated.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={10}>
                      <Text ta="center" c="dimmed" py="xl">ไม่พบหนังสือรับรอง</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  paginated.map((cert: WhtCertificate) => {
                    const st = statusColors[cert.status] || statusColors.draft
                    return (
                      <Table.Tr key={cert.id}>
                        <Table.Td>
                          <Text size="sm" fw={600} ff="monospace">{cert.certificate_number}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light" color={cert.form_type === 'pnd3' ? 'blue' : 'violet'}>
                            {cert.form_type === 'pnd3' ? 'ภ.ง.ด.3' : 'ภ.ง.ด.53'}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{cert.contact_name || '-'}</Text>
                          {cert.contact_tax_id && <Text size="xs" c="dimmed">{cert.contact_tax_id}</Text>}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{cert.income_type}</Text>
                          {cert.income_description && <Text size="xs" c="dimmed" lineClamp={1}>{cert.income_description}</Text>}
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" fw={600}>{fmt(parseFloat(cert.paid_amount))}</Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge size="sm" variant="outline" color="gray">{cert.wht_rate}%</Badge>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" fw={700} c="red">{fmt(parseFloat(cert.wht_amount))}</Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Text size="xs">{monthOptions.find(m => m.value === String(cert.tax_month))?.label?.slice(0, 3)} {cert.tax_year}</Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge color={st.color} variant="light" size="sm">{st.label}</Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Group gap={6} justify="center">
                            <Tooltip label="พิมพ์">
                              <ActionIcon size="sm" variant="light" color="blue" onClick={() => handlePrint(cert)}>
                                <IconPrinter size={14} />
                              </ActionIcon>
                            </Tooltip>
                            {cert.status === 'draft' && (
                              <Tooltip label="ออกหนังสือรับรอง">
                                <ActionIcon size="sm" variant="light" color="green"
                                  loading={issueMutation.isPending}
                                  onClick={() => issueMutation.mutate(cert.id)}>
                                  <IconCheck size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                            {cert.status !== 'voided' && (
                              <Tooltip label="ยกเลิก">
                                <ActionIcon size="sm" variant="light" color="red"
                                  loading={voidMutation.isPending}
                                  onClick={() => voidMutation.mutate(cert.id)}>
                                  <IconX size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
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
      )}

      {/* Create Modal */}
      <Modal opened={showCreate} onClose={() => setShowCreate(false)}
        title="สร้างหนังสือรับรองหัก ณ ที่จ่าย" size="lg" centered>
        <Stack gap="md">
          {/* Form Type */}
          <Select label="ประเภทแบบ" required
            data={[
              { value: 'pnd3', label: 'ภ.ง.ด.3 (บุคคลธรรมดา)' },
              { value: 'pnd53', label: 'ภ.ง.ด.53 (นิติบุคคล)' },
            ]}
            value={form.formType} onChange={(v) => setForm({ ...form, formType: v || 'pnd3' })} />

          {/* Vendor */}
          <Select label="ผู้รับเงิน (ผู้ถูกหักภาษี)" required searchable
            placeholder="เลือกผู้จำหน่าย / ผู้ให้บริการ"
            data={contactOptions}
            value={form.contactId} onChange={(v) => setForm({ ...form, contactId: v || '' })}
            nothingFoundMessage="ไม่พบข้อมูล" />

          {/* Income Type */}
          <Group grow>
            <Select label="ประเภทเงินได้" required
              data={incomeTypes}
              value={form.incomeType} onChange={(v) => setForm({ ...form, incomeType: v || '' })} />
            <Select label="อัตราภาษีหัก ณ ที่จ่าย" required
              data={whtRates}
              value={form.whtRate} onChange={(v) => setForm({ ...form, whtRate: v || '3' })} />
          </Group>

          <Textarea label="รายละเอียดเพิ่มเติม" placeholder="เช่น ค่าบริการออกแบบเว็บไซต์"
            value={form.incomeDescription} onChange={(e) => setForm({ ...form, incomeDescription: e.target.value })} />

          {/* Amount */}
          <Group grow>
            <NumberInput label="จำนวนเงินที่จ่าย (บาท)" required min={0} decimalScale={2}
              thousandSeparator="," placeholder="0.00"
              value={form.paidAmount} onChange={(v) => setForm({ ...form, paidAmount: typeof v === 'number' ? v : 0 })} />
            <div>
              <Text size="sm" fw={500} mb={4}>ภาษีที่หัก ณ ที่จ่าย</Text>
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--app-surface-light, #f8f9fa)',
                border: '1px solid var(--app-border, #dee2e6)',
              }}>
                <Text size="lg" fw={800} c="red">{fmt(whtAmount)} บาท</Text>
                <Text size="xs" c="dimmed">({form.whtRate}% ของ {fmt(form.paidAmount)})</Text>
              </div>
            </div>
          </Group>

          <Divider />

          {/* Date & Period */}
          <Group grow>
            <DatePickerInput label="วันที่จ่ายเงิน" required
              leftSection={<IconCalendar size={14} />}
              value={form.paymentDate} onChange={(v) => setForm({ ...form, paymentDate: v })}
              valueFormat="DD MMM YYYY" />
            <Select label="เดือนภาษี" required
              data={monthOptions}
              value={form.taxMonth} onChange={(v) => setForm({ ...form, taxMonth: v || '' })} />
            <Select label="ปีภาษี" required
              data={yearOptions}
              value={form.taxYear} onChange={(v) => setForm({ ...form, taxYear: v || '' })} />
          </Group>

          {/* Net amount payee receives */}
          <div style={{
            padding: '12px 16px', borderRadius: 8,
            background: '#f0fdf4', border: '1px solid #bbf7d0',
          }}>
            <Group justify="space-between">
              <Text size="sm" c="dimmed">ผู้รับเงินได้รับจริง</Text>
              <Text size="lg" fw={800} c="green">{fmt(form.paidAmount - whtAmount)} บาท</Text>
            </Group>
          </div>

          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button leftSection={<IconPlus size={16} />} loading={createMutation.isPending}
              onClick={handleCreate}>
              สร้างหนังสือรับรอง
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
