import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, TextInput, Group, Modal, Stack, NumberInput, Select,
  Text, Loader, SimpleGrid
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconPackageExport, IconArrowDown, IconArrowUp,
  IconHistory, IconFilter
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt, fmtDateTime as fmtDate } from '../../utils/formatters'
import { TXN_TYPES, TXN_LABELS, TXN_CSS } from '../../utils/constants'
import type { StockTransaction, Product, Warehouse, IssueFormData, TransactionParams, ApiError } from '../../types'

export default function MovementTab() {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null])
  const [productSearch, setProductSearch] = useState('')
  const [issueModal, setIssueModal] = useState(false)
  const [issueForm, setIssueForm] = useState<IssueFormData>({ productId: '', warehouseId: '', quantity: 0, note: '' })
  const queryClient = useQueryClient()

  const params: TransactionParams = {}
  if (typeFilter) params.type = typeFilter
  if (dateRange[0]) params.from = dateRange[0].toISOString().slice(0, 10)
  if (dateRange[1]) params.to = dateRange[1].toISOString().slice(0, 10)

  const { data: transactions, isLoading } = useQuery<StockTransaction[]>({
    queryKey: ['transactions', typeFilter, dateRange[0]?.getTime(), dateRange[1]?.getTime()],
    queryFn: () => api.get('/inventory/transactions', { params }).then(r => r.data),
  })

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products-all'],
    queryFn: () => api.get('/products').then(r => r.data),
  })

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  const issueMutation = useMutation({
    mutationFn: (data: { productId: number; warehouseId: number; quantity: number; note: string }) =>
      api.post('/inventory/issue', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'เบิกสินค้าสำเร็จ', color: 'green' })
      setIssueModal(false); setIssueForm({ productId: '', warehouseId: '', quantity: 0, note: '' })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: ApiError) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเบิกได้', color: 'red' }),
  })

  // --- Filtered ---
  const filtered = useMemo(() => {
    let list = transactions || []
    if (productSearch) {
      const q = productSearch.toLowerCase()
      list = list.filter((t) => t.product_name?.toLowerCase().includes(q) || t.sku?.toLowerCase().includes(q))
    }
    return list
  }, [transactions, productSearch])

  // --- Stats ---
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const all = transactions || []
    const todayTxns = all.filter((t) => t.created_at?.slice(0, 10) === today)
    return {
      inToday: todayTxns.filter((t) => t.type === 'IN').reduce((s, t) => s + Math.abs(t.quantity), 0),
      outToday: todayTxns.filter((t) => ['OUT', 'SALE'].includes(t.type)).reduce((s, t) => s + Math.abs(t.quantity), 0),
      total: all.length,
    }
  }, [transactions])

  const productOptions = (products || []).map((p) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))
  const warehouseOptions = (warehouses || []).map((w) => ({ value: String(w.id), label: w.name }))

  return (
    <>
      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <div className="stat-card">
          <Group gap={10}>
            <div className="stat-card-icon" style={{ background: 'rgba(5,150,105,0.1)' }}>
              <IconArrowDown size={20} color="#059669" />
            </div>
            <div>
              <span className="stat-card-label">รับเข้าวันนี้</span>
              <div className="stat-card-value" style={{ fontSize: 24, color: '#059669' }}>+{stats.inToday}</div>
            </div>
          </Group>
        </div>
        <div className="stat-card">
          <Group gap={10}>
            <div className="stat-card-icon" style={{ background: 'rgba(220,38,38,0.1)' }}>
              <IconArrowUp size={20} color="#dc2626" />
            </div>
            <div>
              <span className="stat-card-label">เบิก/ขายวันนี้</span>
              <div className="stat-card-value" style={{ fontSize: 24, color: '#dc2626' }}>-{stats.outToday}</div>
            </div>
          </Group>
        </div>
        <div className="stat-card">
          <Group gap={10}>
            <div className="stat-card-icon" style={{ background: 'rgba(79,70,229,0.1)' }}>
              <IconHistory size={20} color="#4f46e5" />
            </div>
            <div>
              <span className="stat-card-label">รายการทั้งหมด</span>
              <div className="stat-card-value" style={{ fontSize: 24, color: '#4f46e5' }}>{stats.total}</div>
            </div>
          </Group>
        </div>
      </SimpleGrid>

      {/* Filters */}
      <div className="stock-filter-bar">
        <TextInput placeholder="ค้นหาสินค้า..." leftSection={<IconSearch size={16} />}
          value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
        <Select placeholder="ประเภททั้งหมด" data={TXN_TYPES.map(t => ({ value: t.value, label: t.label }))}
          value={typeFilter} onChange={setTypeFilter} clearable leftSection={<IconFilter size={14} />} />
        <DatePickerInput type="range" placeholder="ช่วงวันที่" value={dateRange}
          onChange={setDateRange} clearable locale="th" />
        <Button leftSection={<IconPackageExport size={16} />} color="red" variant="light"
          onClick={() => {
            setIssueForm({ productId: '', warehouseId: warehouses?.[0]?.id ? String(warehouses[0].id) : '', quantity: 0, note: '' })
            setIssueModal(true)
          }}>
          เบิกออก
        </Button>
      </div>

      {/* Transactions Table */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : filtered.length === 0 ? (
        <div className="stat-card">
          <div className="empty-state">
            <IconHistory size={48} />
            <Text fw={600} size="lg">ไม่มีรายการเคลื่อนไหว</Text>
            <Text size="sm" c="dimmed">ยังไม่มีการรับเข้า/เบิกออก หรือไม่ตรงกับตัวกรอง</Text>
          </div>
        </div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>วันที่/เวลา</Table.Th>
                <Table.Th>SKU</Table.Th>
                <Table.Th>สินค้า</Table.Th>
                <Table.Th>คลัง</Table.Th>
                <Table.Th ta="center">ประเภท</Table.Th>
                <Table.Th ta="right">จำนวน</Table.Th>
                <Table.Th ta="right">ราคาทุน/หน่วย</Table.Th>
                <Table.Th>หมายเหตุ</Table.Th>
                <Table.Th>ผู้ทำรายการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((t) => {
                const isIn = ['IN', 'RETURN'].includes(t.type)
                return (
                  <Table.Tr key={t.id}>
                    <Table.Td><Text size="xs">{fmtDate(t.created_at)}</Text></Table.Td>
                    <Table.Td><Text size="sm" ff="monospace" fw={600}>{t.sku}</Text></Table.Td>
                    <Table.Td><Text size="sm">{t.product_name}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{t.warehouse_name}</Text></Table.Td>
                    <Table.Td ta="center">
                      <span className={`txn-badge ${TXN_CSS[t.type] || ''}`}>
                        {TXN_LABELS[t.type] || t.type}
                      </span>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={700} c={isIn ? 'green' : 'red'}>
                        {isIn ? '+' : ''}{t.quantity}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {t.cost_per_unit ? `฿${fmt(parseFloat(t.cost_per_unit))}` : '-'}
                    </Table.Td>
                    <Table.Td><Text size="xs" c="dimmed" lineClamp={1}>{t.note || '-'}</Text></Table.Td>
                    <Table.Td><Text size="xs">{t.created_by_name || '-'}</Text></Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* Issue Stock Modal */}
      <Modal opened={issueModal} onClose={() => setIssueModal(false)} title="📤 เบิกสินค้าออก" size="md">
        <Stack gap="md">
          <Select label="สินค้า" required data={productOptions} value={issueForm.productId}
            onChange={(v) => setIssueForm({ ...issueForm, productId: v || '' })} searchable />
          <Select label="คลังสินค้า" required data={warehouseOptions} value={issueForm.warehouseId}
            onChange={(v) => setIssueForm({ ...issueForm, warehouseId: v || '' })} />
          <NumberInput label="จำนวน" required min={1} value={issueForm.quantity}
            onChange={(v) => setIssueForm({ ...issueForm, quantity: Number(v) })} />
          <TextInput label="หมายเหตุ" value={issueForm.note}
            onChange={(e) => setIssueForm({ ...issueForm, note: e.target.value })} />
          <Button fullWidth loading={issueMutation.isPending} color="red"
            leftSection={<IconPackageExport size={18} />}
            onClick={() => issueMutation.mutate({
              productId: parseInt(issueForm.productId),
              warehouseId: parseInt(issueForm.warehouseId),
              quantity: issueForm.quantity,
              note: issueForm.note,
            })}>
            เบิกออก
          </Button>
        </Stack>
      </Modal>
    </>
  )
}
