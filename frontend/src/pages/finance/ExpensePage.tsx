import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Group, Stack, Text, Badge, Loader, SimpleGrid,
  ActionIcon, Tooltip, TextInput, Select, Menu, Modal, NumberInput, Textarea
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconReceipt, IconFileText, IconClock, IconPercentage,
  IconSearch, IconFilterOff, IconCash, IconCreditCard, IconTransfer,
  IconReceiptOff, IconCheck, IconX, IconDots, IconRepeat, IconTrash,
  IconEdit, IconPlayerPlay, IconCalendarRepeat,
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt } from '../../utils/formatters'

const paymentMethodLabels: Record<string, { label: string; color: string; icon: any }> = {
  cash: { label: 'เงินสด', color: 'green', icon: IconCash },
  transfer: { label: 'โอนเงิน', color: 'blue', icon: IconTransfer },
  credit_card: { label: 'บัตรเครดิต', color: 'grape', icon: IconCreditCard },
}

const statusConfig: Record<string, { label: string; color: string }> = {
  approved: { label: 'อนุมัติ', color: 'green' },
  draft: { label: 'ร่าง', color: 'gray' },
  pending: { label: 'รอดำเนินการ', color: 'yellow' },
  voided: { label: 'ยกเลิก', color: 'red' },
}

const frequencyLabels: Record<string, string> = {
  daily: 'รายวัน',
  weekly: 'รายสัปดาห์',
  monthly: 'รายเดือน',
  quarterly: 'รายไตรมาส',
  yearly: 'รายปี',
}

export default function ExpensePage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'expenses' | 'recurring'>('expenses')

  // Filters
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAccountId, setFilterAccountId] = useState('')
  const [searchText, setSearchText] = useState('')

  const queryClient = useQueryClient()

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses', filterFrom, filterTo, filterStatus, filterAccountId],
    queryFn: () => {
      const params: any = {}
      if (filterFrom) params.from = filterFrom
      if (filterTo) params.to = filterTo
      if (filterStatus) params.status = filterStatus
      if (filterAccountId) params.accountId = filterAccountId
      return api.get('/accounting/expenses', { params }).then(r => r.data)
    },
  })

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/accounting/expenses/${id}/approve`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'อนุมัติค่าใช้จ่ายสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถอนุมัติได้', color: 'red' })
    },
  })

  const voidMutation = useMutation({
    mutationFn: (id: number) => api.patch(`/accounting/expenses/${id}/void`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกค่าใช้จ่ายสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถยกเลิกได้', color: 'red' })
    },
  })

  const [deleteId, setDeleteId] = useState<number | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/accounting/expenses/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบค่าใช้จ่ายสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setDeleteId(null)
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' })
    },
  })

  const deleteTarget = (expenses || []).find((e: any) => e.id === deleteId)

  const expenseAccounts = accounts?.filter((a: any) => a.account_type === 'expense') || []

  const filteredExpenses = useMemo(() => {
    if (!expenses) return []
    if (!searchText.trim()) return expenses
    const q = searchText.toLowerCase()
    return expenses.filter((e: any) =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.vendor_name || '').toLowerCase().includes(q) ||
      (e.expense_number || '').toLowerCase().includes(q) ||
      (e.account_name || '').toLowerCase().includes(q)
    )
  }, [expenses, searchText])

  const stats = useMemo(() => {
    if (!expenses) return { monthTotal: 0, monthCount: 0, draftCount: 0, monthVat: 0 }
    const now = new Date()
    const cm = now.getMonth(), cy = now.getFullYear()
    let monthTotal = 0, monthCount = 0, draftCount = 0, monthVat = 0
    expenses.forEach((e: any) => {
      const d = new Date(e.expense_date)
      if (d.getMonth() === cm && d.getFullYear() === cy) {
        monthTotal += parseFloat(e.amount) || 0
        monthCount++
        monthVat += parseFloat(e.vat_amount) || 0
      }
      if (e.status === 'draft') draftCount++
    })
    return { monthTotal, monthCount, draftCount, monthVat }
  }, [expenses])

  const resetFilters = () => { setFilterFrom(''); setFilterTo(''); setFilterStatus(''); setFilterAccountId(''); setSearchText('') }
  const hasActiveFilters = filterFrom || filterTo || filterStatus || filterAccountId || searchText

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="md">
          <Text size="xl" fw={800}>ค่าใช้จ่าย</Text>
          {/* Tab bar */}
          <div className="recurring-tab-bar">
            <button
              className={`recurring-tab ${activeTab === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              <IconReceipt size={16} />
              รายจ่าย
            </button>
            <button
              className={`recurring-tab ${activeTab === 'recurring' ? 'active' : ''}`}
              onClick={() => setActiveTab('recurring')}
            >
              <IconRepeat size={16} />
              รายจ่ายประจำ
            </button>
          </div>
        </Group>
        {activeTab === 'expenses' && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/expenses/create')}
            variant="gradient" gradient={{ from: 'indigo', to: 'violet' }} radius="md">
            บันทึกค่าใช้จ่าย
          </Button>
        )}
      </Group>

      {activeTab === 'expenses' ? (
        <>
          {/* Summary Cards */}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
            <div className="stat-card">
              <Group gap={8}>
                <IconReceipt size={20} color="var(--app-danger)" />
                <span className="stat-card-label">ค่าใช้จ่ายเดือนนี้</span>
              </Group>
              <div className="stat-card-value" style={{ color: 'var(--app-danger)' }}>฿{fmt(stats.monthTotal)}</div>
              <span className="stat-card-label">{stats.monthCount} รายการ</span>
            </div>
            <div className="stat-card">
              <Group gap={8}>
                <IconFileText size={20} color="var(--app-primary)" />
                <span className="stat-card-label">จำนวนรายการทั้งหมด</span>
              </Group>
              <div className="stat-card-value" style={{ color: 'var(--app-primary)' }}>{filteredExpenses.length}</div>
              <span className="stat-card-label">รายการ</span>
            </div>
            <div className="stat-card">
              <Group gap={8}>
                <IconClock size={20} color="var(--app-warning)" />
                <span className="stat-card-label">รอดำเนินการ (ร่าง)</span>
              </Group>
              <div className="stat-card-value" style={{ color: 'var(--app-warning)' }}>{stats.draftCount}</div>
              <span className="stat-card-label">รายการ</span>
            </div>
            <div className="stat-card">
              <Group gap={8}>
                <IconPercentage size={20} color="var(--app-accent)" />
                <span className="stat-card-label">VAT เดือนนี้</span>
              </Group>
              <div className="stat-card-value" style={{ color: 'var(--app-accent)' }}>฿{fmt(stats.monthVat)}</div>
              <span className="stat-card-label">ภาษีมูลค่าเพิ่ม</span>
            </div>
          </SimpleGrid>

          {/* Filter */}
          <div className="stat-card">
            <Group justify="space-between" mb="sm">
              <Group gap={8}>
                <IconSearch size={18} color="var(--app-text-dim)" />
                <Text fw={600} size="sm">ค้นหาและกรองข้อมูล</Text>
              </Group>
              {hasActiveFilters && (
                <Tooltip label="ล้างตัวกรอง">
                  <ActionIcon variant="light" color="red" onClick={resetFilters}><IconFilterOff size={16} /></ActionIcon>
                </Tooltip>
              )}
            </Group>
            <div className="filter-bar">
              <TextInput placeholder="ค้นหารายละเอียด, ผู้ขาย..." leftSection={<IconSearch size={14} />}
                value={searchText} onChange={(e) => setSearchText(e.target.value)}
                style={{ flex: 2, minWidth: 180 }} size="sm" />
              <TextInput type="date" label="จากวันที่" value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)} style={{ flex: 1, minWidth: 140 }} size="sm" />
              <TextInput type="date" label="ถึงวันที่" value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)} style={{ flex: 1, minWidth: 140 }} size="sm" />
              <Select placeholder="บัญชี" label="บัญชี" clearable searchable
                data={expenseAccounts.map((a: any) => ({ value: String(a.id), label: `${a.account_code} - ${a.name}` }))}
                value={filterAccountId} onChange={(v) => setFilterAccountId(v || '')}
                style={{ flex: 1.5, minWidth: 180 }} size="sm" />
              <Select placeholder="สถานะ" label="สถานะ" clearable
                data={[
                  { value: 'draft', label: 'ร่าง' },
                  { value: 'approved', label: 'อนุมัติ' },
                  { value: 'voided', label: 'ยกเลิก' },
                ]}
                value={filterStatus} onChange={(v) => setFilterStatus(v || '')}
                style={{ flex: 1, minWidth: 130 }} size="sm" />
            </div>
          </div>

          {/* Expenses Table */}
          {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
            <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>เลขที่</Table.Th>
                    <Table.Th>วันที่</Table.Th>
                    <Table.Th>ผู้ขาย</Table.Th>
                    <Table.Th>รายละเอียด</Table.Th>
                    <Table.Th ta="center">ชำระเงิน</Table.Th>
                    <Table.Th ta="right">จำนวนเงิน</Table.Th>
                    <Table.Th ta="right">VAT</Table.Th>
                    <Table.Th ta="right">WHT</Table.Th>
                    <Table.Th ta="center">สถานะ</Table.Th>
                    <Table.Th ta="center">จัดการ</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredExpenses.map((e: any) => {
                    const pm = paymentMethodLabels[e.payment_method] || paymentMethodLabels.cash
                    const st = statusConfig[e.status] || statusConfig.draft
                    const vatAmt = parseFloat(e.vat_amount) || 0
                    const whtAmt = parseFloat(e.wht_amount) || 0
                    const itemCount = e.items?.length || 0

                    return (
                      <Table.Tr key={e.id}>
                        <Table.Td>
                          <Text size="sm" fw={700} c="indigo">{e.expense_number}</Text>
                          {itemCount > 1 && <Text size="xs" c="dimmed">{itemCount} รายการ</Text>}
                        </Table.Td>
                        <Table.Td><Text size="sm">{e.expense_date?.split('T')[0]}</Text></Table.Td>
                        <Table.Td><Text size="sm">{e.vendor_name || '-'}</Text></Table.Td>
                        <Table.Td><Text size="sm" lineClamp={1}>{e.description || '-'}</Text></Table.Td>
                        <Table.Td ta="center">
                          <Badge color={pm.color} variant="light" size="sm" leftSection={<pm.icon size={12} />}>
                            {pm.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={700}>฿{fmt(parseFloat(e.amount))}</Text></Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" c={vatAmt > 0 ? 'cyan' : 'dimmed'}>{vatAmt > 0 ? `฿${fmt(vatAmt)}` : '-'}</Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" c={whtAmt > 0 ? 'orange' : 'dimmed'}>{whtAmt > 0 ? `฿${fmt(whtAmt)}` : '-'}</Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Badge color={st.color} variant="light">{st.label}</Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          <Menu shadow="md" width={160}>
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray"><IconDots size={16} /></ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              {e.status === 'draft' && (
                                <Menu.Item leftSection={<IconCheck size={14} />} color="green"
                                  onClick={() => approveMutation.mutate(e.id)}>
                                  อนุมัติ
                                </Menu.Item>
                              )}
                              {e.status !== 'voided' && (
                                <Menu.Item leftSection={<IconX size={14} />} color="orange"
                                  onClick={() => voidMutation.mutate(e.id)}>
                                  ยกเลิก
                                </Menu.Item>
                              )}
                              <Menu.Item leftSection={<IconTrash size={14} />} color="red"
                                onClick={() => setDeleteId(e.id)}>
                                ลบ
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Table.Td>
                      </Table.Tr>
                    )
                  })}
                  {filteredExpenses.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={10}>
                        <div className="empty-state">
                          <IconReceiptOff size={48} color="var(--app-text-dim)" style={{ opacity: 0.4 }} />
                          <Text c="dimmed" size="sm" mt="sm">
                            {hasActiveFilters ? 'ไม่พบข้อมูลที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูลค่าใช้จ่าย'}
                          </Text>
                          {!hasActiveFilters && (
                            <Button variant="light" size="xs" mt="sm" leftSection={<IconPlus size={14} />}
                              onClick={() => navigate('/expenses/create')}>เริ่มบันทึกค่าใช้จ่าย</Button>
                          )}
                        </div>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </div>
          )}
        </>
      ) : (
        <RecurringExpensesTab expenseAccounts={expenseAccounts} />
      )}

      {/* Delete Confirmation Modal */}
      <Modal opened={deleteId !== null} onClose={() => setDeleteId(null)}
        title="ยืนยันการลบ" centered size="sm">
        <Stack gap="md">
          <Text size="sm">
            คุณต้องการลบค่าใช้จ่าย <strong>{deleteTarget?.expense_number}</strong> ใช่หรือไม่?
          </Text>
          <Text size="xs" c="red">การลบจะไม่สามารถกู้คืนได้ (รวมถึงรายการบัญชีที่เกี่ยวข้อง)</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" size="sm" onClick={() => setDeleteId(null)}>ยกเลิก</Button>
            <Button color="red" size="sm" loading={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              ลบรายการ
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

/* ====================================================================
   Recurring Expenses Tab Component
   ==================================================================== */
function RecurringExpensesTab({ expenseAccounts }: { expenseAccounts: any[] }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    templateName: '',
    description: '',
    amount: 0,
    vatAmount: 0,
    whtAmount: 0,
    frequency: 'monthly',
    dayOfMonth: 1,
    accountCode: '',
  })

  const { data: recurring = [], isLoading } = useQuery({
    queryKey: ['recurring-expenses'],
    queryFn: () => api.get('/recurring-expenses').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/recurring-expenses', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'สร้างเทมเพลตรายจ่ายประจำสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
      closeModal()
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.put(`/recurring-expenses/${id}`, data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'อัพเดตเทมเพลตสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
      closeModal()
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถอัพเดตได้', color: 'red' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/recurring-expenses/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบเทมเพลตสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' })
    },
  })

  const generateMutation = useMutation({
    mutationFn: (id: number) => api.post(`/recurring-expenses/${id}/generate`),
    onSuccess: (res: any) => {
      notifications.show({
        title: 'สำเร็จ',
        message: `สร้างค่าใช้จ่าย ${res.data.expenseNumber} สำเร็จ`,
        color: 'green',
      })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างค่าใช้จ่ายได้', color: 'red' })
    },
  })

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setForm({
      templateName: '', description: '', amount: 0, vatAmount: 0, whtAmount: 0,
      frequency: 'monthly', dayOfMonth: 1, accountCode: '',
    })
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({
      templateName: '', description: '', amount: 0, vatAmount: 0, whtAmount: 0,
      frequency: 'monthly', dayOfMonth: 1, accountCode: '',
    })
    setModalOpen(true)
  }

  const openEdit = (item: any) => {
    setEditingId(item.id)
    setForm({
      templateName: item.template_name || '',
      description: item.description || '',
      amount: parseFloat(item.amount) || 0,
      vatAmount: parseFloat(item.vat_amount) || 0,
      whtAmount: parseFloat(item.wht_amount) || 0,
      frequency: item.frequency || 'monthly',
      dayOfMonth: item.day_of_month || 1,
      accountCode: item.account_code || '',
    })
    setModalOpen(true)
  }

  const handleSave = () => {
    if (!form.templateName.trim() || !form.amount) return
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <>
      {/* Header */}
      <Group justify="space-between">
        <Group gap={8}>
          <IconCalendarRepeat size={20} color="var(--app-primary)" />
          <Text fw={700} size="lg">เทมเพลตรายจ่ายประจำ</Text>
          <Badge variant="light" color="indigo" size="lg">{recurring.length} รายการ</Badge>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}
          variant="gradient" gradient={{ from: 'indigo', to: 'violet' }} radius="md">
          เพิ่มเทมเพลต
        </Button>
      </Group>

      {/* Table */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ชื่อเทมเพลต</Table.Th>
                <Table.Th>รายละเอียด</Table.Th>
                <Table.Th ta="right">จำนวนเงิน</Table.Th>
                <Table.Th ta="center">ความถี่</Table.Th>
                <Table.Th ta="center">รหัสบัญชี</Table.Th>
                <Table.Th>สร้างล่าสุด</Table.Th>
                <Table.Th>ครบกำหนดถัดไป</Table.Th>
                <Table.Th ta="center">จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {recurring.map((r: any) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Text size="sm" fw={700}>{r.template_name}</Text>
                    {r.contact_name && <Text size="xs" c="dimmed">{r.contact_name}</Text>}
                  </Table.Td>
                  <Table.Td><Text size="sm" lineClamp={1}>{r.description || '-'}</Text></Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" fw={700}>฿{fmt(parseFloat(r.amount))}</Text>
                    {parseFloat(r.vat_amount) > 0 && (
                      <Text size="xs" c="cyan">VAT: ฿{fmt(parseFloat(r.vat_amount))}</Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="center">
                    <Badge variant="light" color="indigo">
                      {frequencyLabels[r.frequency] || r.frequency}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Text size="sm" ff="monospace">{r.account_code || '-'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{r.last_generated?.split('T')[0] || '-'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600} c={r.next_due && new Date(r.next_due) <= new Date() ? 'red' : undefined}>
                      {r.next_due?.split('T')[0] || '-'}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Group gap={4} justify="center">
                      <Tooltip label="สร้างรายจ่าย">
                        <ActionIcon variant="light" color="green" size="sm"
                          loading={generateMutation.isPending}
                          onClick={() => {
                            if (confirm(`สร้างค่าใช้จ่ายจาก "${r.template_name}" ?`)) {
                              generateMutation.mutate(r.id)
                            }
                          }}>
                          <IconPlayerPlay size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="แก้ไข">
                        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => openEdit(r)}>
                          <IconEdit size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="ลบ">
                        <ActionIcon variant="subtle" color="red" size="sm"
                          onClick={() => {
                            if (confirm(`ต้องการลบเทมเพลต "${r.template_name}" ?`)) {
                              deleteMutation.mutate(r.id)
                            }
                          }}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {recurring.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <div className="empty-state">
                      <IconRepeat size={48} color="var(--app-text-dim)" style={{ opacity: 0.4 }} />
                      <Text c="dimmed" size="sm" mt="sm">ยังไม่มีเทมเพลตรายจ่ายประจำ</Text>
                      <Button variant="light" size="xs" mt="sm" leftSection={<IconPlus size={14} />}
                        onClick={openCreate}>เพิ่มเทมเพลตแรก</Button>
                    </div>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        opened={modalOpen}
        onClose={closeModal}
        title={editingId ? 'แก้ไขเทมเพลตรายจ่ายประจำ' : 'เพิ่มเทมเพลตรายจ่ายประจำ'}
        centered
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="ชื่อเทมเพลต"
            placeholder="เช่น ค่าเช่าร้าน"
            required
            value={form.templateName}
            onChange={(e) => setForm({ ...form, templateName: e.target.value })}
          />
          <Textarea
            label="รายละเอียด"
            placeholder="รายละเอียดเพิ่มเติม"
            autosize
            minRows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Group grow>
            <NumberInput
              label="จำนวนเงิน"
              placeholder="0.00"
              required
              min={0}
              decimalScale={2}
              thousandSeparator=","
              value={form.amount}
              onChange={(v) => setForm({ ...form, amount: Number(v) || 0 })}
            />
            <NumberInput
              label="VAT"
              placeholder="0.00"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              value={form.vatAmount}
              onChange={(v) => setForm({ ...form, vatAmount: Number(v) || 0 })}
            />
            <NumberInput
              label="WHT"
              placeholder="0.00"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              value={form.whtAmount}
              onChange={(v) => setForm({ ...form, whtAmount: Number(v) || 0 })}
            />
          </Group>
          <Group grow>
            <Select
              label="ความถี่"
              data={[
                { value: 'daily', label: 'รายวัน' },
                { value: 'weekly', label: 'รายสัปดาห์' },
                { value: 'monthly', label: 'รายเดือน' },
                { value: 'quarterly', label: 'รายไตรมาส' },
                { value: 'yearly', label: 'รายปี' },
              ]}
              value={form.frequency}
              onChange={(v) => setForm({ ...form, frequency: v || 'monthly' })}
            />
            <NumberInput
              label="วันที่ของเดือน"
              placeholder="1"
              min={1}
              max={28}
              value={form.dayOfMonth}
              onChange={(v) => setForm({ ...form, dayOfMonth: Number(v) || 1 })}
            />
          </Group>
          <Select
            label="รหัสบัญชี"
            placeholder="เลือกบัญชีค่าใช้จ่าย"
            clearable
            searchable
            data={expenseAccounts.map((a: any) => ({
              value: a.account_code,
              label: `${a.account_code} - ${a.name}`,
            }))}
            value={form.accountCode}
            onChange={(v) => setForm({ ...form, accountCode: v || '' })}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={closeModal}>ยกเลิก</Button>
            <Button
              leftSection={editingId ? <IconEdit size={16} /> : <IconPlus size={16} />}
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!form.templateName.trim() || !form.amount}
              onClick={handleSave}
              variant="gradient"
              gradient={{ from: 'indigo', to: 'violet' }}
            >
              {editingId ? 'บันทึก' : 'สร้างเทมเพลต'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
