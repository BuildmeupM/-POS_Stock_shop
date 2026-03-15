import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Group, Stack, Text, Badge, Loader, SimpleGrid,
  ActionIcon, Tooltip, TextInput, Select, Menu
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconReceipt, IconFileText, IconClock, IconPercentage,
  IconSearch, IconFilterOff, IconCash, IconCreditCard, IconTransfer,
  IconReceiptOff, IconCheck, IconX, IconDots
} from '@tabler/icons-react'
import api from '../services/api'
import { fmt } from '../utils/formatters'

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

export default function ExpensePage() {
  const navigate = useNavigate()

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
        <Text size="xl" fw={800}>💰 ค่าใช้จ่าย</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => navigate('/expenses/create')}
          variant="gradient" gradient={{ from: 'indigo', to: 'violet' }} radius="md">
          บันทึกค่าใช้จ่าย
        </Button>
      </Group>

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
                      {e.status !== 'voided' && (
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
                            <Menu.Item leftSection={<IconX size={14} />} color="red"
                              onClick={() => voidMutation.mutate(e.id)}>
                              ยกเลิก
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      )}
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
    </Stack>
  )
}
