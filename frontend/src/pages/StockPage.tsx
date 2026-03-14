import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import {
  Table, Button, TextInput, Group, Modal, Stack, NumberInput, Select,
  Text, Badge, Loader, SimpleGrid, ActionIcon, Tooltip
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconPlus, IconPackageImport, IconPackageExport, IconEdit, IconTrash,
  IconPackage, IconAlertTriangle, IconPackageOff, IconChecks, IconArrowDown, IconArrowUp,
  IconHistory, IconFilter
} from '@tabler/icons-react'
import api from '../services/api'

const TXN_TYPES = [
  { value: 'IN', label: 'รับเข้า', color: 'green' },
  { value: 'OUT', label: 'เบิกออก', color: 'red' },
  { value: 'SALE', label: 'ขาย', color: 'indigo' },
  { value: 'RETURN', label: 'คืน', color: 'orange' },
  { value: 'ADJUST', label: 'ปรับปรุง', color: 'violet' },
  { value: 'TRANSFER', label: 'โอนย้าย', color: 'cyan' },
]

const TXN_LABELS: Record<string, string> = Object.fromEntries(TXN_TYPES.map(t => [t.value, t.label]))
const TXN_CSS: Record<string, string> = { IN: 'txn-in', OUT: 'txn-out', SALE: 'txn-sale', RETURN: 'txn-return', ADJUST: 'txn-adjust', TRANSFER: 'txn-transfer' }

const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)
const fmtDate = (d: string) => {
  const dt = new Date(d)
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' +
    dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export default function StockPage() {
  const [activeTab, setActiveTab] = useState<'products' | 'movement'>('products')

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Text size="xl" fw={800}>📦 สต๊อกสินค้า</Text>
        <div className="stock-tabs">
          <button className={`stock-tab ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}>
            <IconPackage size={16} /> สินค้าทั้งหมด
          </button>
          <button className={`stock-tab ${activeTab === 'movement' ? 'active' : ''}`}
            onClick={() => setActiveTab('movement')}>
            <IconHistory size={16} /> เคลื่อนไหวสต๊อก
          </button>
        </div>
      </Group>

      {activeTab === 'products' ? <ProductsTab /> : <MovementTab />}
    </Stack>
  )
}

/* ====================================================================
   TAB 1: Products
   ==================================================================== */
function ProductsTab() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [stockFilter, setStockFilter] = useState<string | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [receiveModal, setReceiveModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const emptyForm = { sku: '', barcode: '', name: '', description: '', categoryId: '', unit: 'ชิ้น', costPrice: 0, sellingPrice: 0, minStock: 0 }
  const [form, setForm] = useState(emptyForm)
  const [receiveForm, setReceiveForm] = useState({ quantity: 0, costPerUnit: 0, sellingPrice: 0, note: '' })
  const queryClient = useQueryClient()

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => api.get('/products', { params: { search } }).then(r => r.data),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/all').then(r => r.data),
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  // --- Mutations ---
  const addMutation = useMutation({
    mutationFn: (data: any) => api.post('/products', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'เพิ่มสินค้าสำเร็จ', color: 'green' })
      setAddModal(false); setForm(emptyForm)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเพิ่มได้', color: 'red' }),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => api.put(`/products/${id}`, data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'แก้ไขสินค้าสำเร็จ', color: 'green' })
      setEditModal(false); setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถแก้ไขได้', color: 'red' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบสินค้าสำเร็จ', color: 'green' })
      setDeleteModal(false); setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' }),
  })

  const receiveMutation = useMutation({
    mutationFn: (data: any) => api.post('/inventory/receive', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'รับสินค้าเข้าสต๊อกสำเร็จ', color: 'green' })
      setReceiveModal(false); setReceiveForm({ quantity: 0, costPerUnit: 0, sellingPrice: 0, note: '' }); setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถรับเข้าได้', color: 'red' }),
  })

  // --- Filtered & computed ---
  const filtered = useMemo(() => {
    let list = products || []
    if (categoryFilter) list = list.filter((p: any) => String(p.category_id) === categoryFilter)
    if (stockFilter === 'low') list = list.filter((p: any) => parseInt(p.total_stock) > 0 && parseInt(p.total_stock) <= p.min_stock)
    if (stockFilter === 'out') list = list.filter((p: any) => parseInt(p.total_stock) <= 0)
    return list
  }, [products, categoryFilter, stockFilter])

  const stats = useMemo(() => {
    const all = products || []
    return {
      total: all.length,
      active: all.filter((p: any) => p.is_active).length,
      low: all.filter((p: any) => { const s = parseInt(p.total_stock); return s > 0 && s <= p.min_stock }).length,
      out: all.filter((p: any) => parseInt(p.total_stock) <= 0).length,
    }
  }, [products])

  const categoryOptions = (categories || []).map((c: any) => ({ value: String(c.id), label: c.name }))

  const openEdit = (p: any) => {
    setSelectedProduct(p)
    setForm({
      sku: p.sku, barcode: p.barcode || '', name: p.name, description: p.description || '',
      categoryId: p.category_id ? String(p.category_id) : '', unit: p.unit || 'ชิ้น',
      costPrice: parseFloat(p.cost_price), sellingPrice: parseFloat(p.selling_price), minStock: p.min_stock,
    })
    setEditModal(true)
  }

  const getStockLevel = (stock: number, minStock: number) => {
    if (stock <= 0) return 'danger'
    if (stock <= minStock) return 'warning'
    return 'good'
  }

  const getStockPercent = (stock: number, minStock: number) => {
    if (minStock <= 0) return stock > 0 ? 100 : 0
    const pct = (stock / (minStock * 3)) * 100
    return Math.min(100, Math.max(0, pct))
  }

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <>
      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <div className="stat-card" onClick={() => setStockFilter(null)} style={{ cursor: 'pointer' }}>
          <Group gap={10}>
            <div className="stat-card-icon" style={{ background: 'rgba(79,70,229,0.1)' }}>
              <IconPackage size={20} color="#4f46e5" />
            </div>
            <div>
              <span className="stat-card-label">สินค้าทั้งหมด</span>
              <div className="stat-card-value" style={{ fontSize: 24, color: '#4f46e5' }}>{stats.total}</div>
            </div>
          </Group>
        </div>
        <div className="stat-card" onClick={() => setStockFilter(null)} style={{ cursor: 'pointer' }}>
          <Group gap={10}>
            <div className="stat-card-icon" style={{ background: 'rgba(5,150,105,0.1)' }}>
              <IconChecks size={20} color="#059669" />
            </div>
            <div>
              <span className="stat-card-label">Active</span>
              <div className="stat-card-value" style={{ fontSize: 24, color: '#059669' }}>{stats.active}</div>
            </div>
          </Group>
        </div>
        <div className="stat-card" onClick={() => setStockFilter('low')} style={{ cursor: 'pointer' }}>
          <Group gap={10}>
            <div className="stat-card-icon" style={{ background: 'rgba(217,119,6,0.1)' }}>
              <IconAlertTriangle size={20} color="#d97706" />
            </div>
            <div>
              <span className="stat-card-label">ใกล้หมด</span>
              <div className="stat-card-value" style={{ fontSize: 24, color: '#d97706' }}>{stats.low}</div>
            </div>
          </Group>
        </div>
        <div className="stat-card" onClick={() => setStockFilter('out')} style={{ cursor: 'pointer' }}>
          <Group gap={10}>
            <div className="stat-card-icon" style={{ background: 'rgba(220,38,38,0.1)' }}>
              <IconPackageOff size={20} color="#dc2626" />
            </div>
            <div>
              <span className="stat-card-label">หมดสต๊อก</span>
              <div className="stat-card-value" style={{ fontSize: 24, color: '#dc2626' }}>{stats.out}</div>
            </div>
          </Group>
        </div>
      </SimpleGrid>

      {/* Filters */}
      <div className="stock-filter-bar">
        <TextInput placeholder="ค้นหาสินค้า (ชื่อ, SKU, Barcode)..." leftSection={<IconSearch size={16} />}
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select placeholder="หมวดหมู่ทั้งหมด" data={categoryOptions} value={categoryFilter}
          onChange={setCategoryFilter} clearable leftSection={<IconFilter size={14} />} />
        <Select placeholder="สถานะสต๊อก" data={[
          { value: 'low', label: '⚠️ ใกล้หมด' },
          { value: 'out', label: '🔴 หมดสต๊อก' },
        ]} value={stockFilter} onChange={setStockFilter} clearable />
        <Button leftSection={<IconPlus size={16} />} onClick={() => { setForm(emptyForm); setAddModal(true) }}>
          เพิ่มสินค้า
        </Button>
      </div>

      {/* Products Table */}
      {filtered.length === 0 ? (
        <div className="stat-card">
          <div className="empty-state">
            <IconPackage size={48} />
            <Text fw={600} size="lg">ไม่พบสินค้า</Text>
            <Text size="sm" c="dimmed">ยังไม่มีสินค้าในระบบ หรือไม่ตรงกับตัวกรอง</Text>
          </div>
        </div>
      ) : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>SKU</Table.Th>
                <Table.Th>ชื่อสินค้า</Table.Th>
                <Table.Th>หมวดหมู่</Table.Th>
                <Table.Th ta="center">คงเหลือ</Table.Th>
                <Table.Th ta="right">ราคาทุน</Table.Th>
                <Table.Th ta="right">ราคาขาย</Table.Th>
                <Table.Th ta="right">Margin</Table.Th>
                <Table.Th ta="center">จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((p: any) => {
                const stock = parseInt(p.total_stock) || 0
                const cost = parseFloat(p.cost_price) || 0
                const sell = parseFloat(p.selling_price) || 0
                const margin = sell > 0 ? ((sell - cost) / sell * 100) : 0
                const level = getStockLevel(stock, p.min_stock)

                return (
                  <Table.Tr key={p.id}>
                    <Table.Td><Text size="sm" fw={600} ff="monospace">{p.sku}</Text></Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>{p.name}</Text>
                      {p.barcode && <Text size="xs" c="dimmed">Barcode: {p.barcode}</Text>}
                    </Table.Td>
                    <Table.Td>
                      {p.category_name ? (
                        <Badge variant="light" size="sm">{p.category_name}</Badge>
                      ) : (
                        <Text size="xs" c="dimmed">-</Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Badge color={level === 'good' ? 'green' : level === 'warning' ? 'yellow' : 'red'}
                        variant="light" size="sm">
                        {stock} {p.unit}
                      </Badge>
                      <div className="stock-indicator">
                        <div className={`stock-indicator-fill ${level}`}
                          style={{ width: `${getStockPercent(stock, p.min_stock)}%` }} />
                      </div>
                    </Table.Td>
                    <Table.Td ta="right">฿{fmt(cost)}</Table.Td>
                    <Table.Td ta="right" fw={600}>฿{fmt(sell)}</Table.Td>
                    <Table.Td ta="right">
                      <Badge color={margin >= 30 ? 'green' : margin >= 15 ? 'yellow' : 'red'}
                        variant="light" size="sm">
                        {margin.toFixed(1)}%
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="center">
                      <Group gap={4} justify="center">
                        <Tooltip label="รับเข้าสต๊อก">
                          <ActionIcon size="sm" variant="light" color="green"
                            onClick={() => { setSelectedProduct(p); setReceiveForm({ quantity: 0, costPerUnit: cost, sellingPrice: sell, note: '' }); setReceiveModal(true) }}>
                            <IconPackageImport size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="แก้ไข">
                          <ActionIcon size="sm" variant="light" color="blue" onClick={() => openEdit(p)}>
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="ลบ">
                          <ActionIcon size="sm" variant="light" color="red"
                            onClick={() => { setSelectedProduct(p); setDeleteModal(true) }}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* Add Product Modal */}
      <Modal opened={addModal} onClose={() => setAddModal(false)} title="➕ เพิ่มสินค้าใหม่" size="lg">
        <ProductForm form={form} setForm={setForm} categories={categoryOptions}
          loading={addMutation.isPending}
          onSubmit={() => addMutation.mutate(form)} submitLabel="เพิ่มสินค้า" />
      </Modal>

      {/* Edit Product Modal */}
      <Modal opened={editModal} onClose={() => setEditModal(false)} title={`✏️ แก้ไข: ${selectedProduct?.name}`} size="lg">
        <ProductForm form={form} setForm={setForm} categories={categoryOptions}
          loading={editMutation.isPending}
          onSubmit={() => editMutation.mutate({ id: selectedProduct?.id, ...form })} submitLabel="บันทึกการแก้ไข" color="blue" />
      </Modal>

      {/* Receive Stock Modal */}
      <Modal opened={receiveModal} onClose={() => setReceiveModal(false)} title={`📥 รับสินค้าเข้า: ${selectedProduct?.name}`} size="md">
        <Stack gap="md">
          <Select label="คลังสินค้า" data={(warehouses || []).map((w: any) => ({ value: String(w.id), label: w.name }))}
            defaultValue={warehouses?.[0]?.id ? String(warehouses[0].id) : undefined} />
          <NumberInput label="จำนวน" required min={1} value={receiveForm.quantity}
            onChange={(v) => setReceiveForm({ ...receiveForm, quantity: Number(v) })} />
          <Group grow>
            <NumberInput label="ราคาทุนต่อหน่วย" required min={0} decimalScale={2} value={receiveForm.costPerUnit}
              onChange={(v) => setReceiveForm({ ...receiveForm, costPerUnit: Number(v) })} />
            <NumberInput label="ราคาขาย" required min={0} decimalScale={2} value={receiveForm.sellingPrice}
              onChange={(v) => setReceiveForm({ ...receiveForm, sellingPrice: Number(v) })} />
          </Group>
          {/* Real-time Margin Calculation */}
          {(() => {
            const cost = receiveForm.costPerUnit || 0
            const sell = receiveForm.sellingPrice || 0
            const profit = sell - cost
            const margin = sell > 0 ? (profit / sell * 100) : 0
            const marginColor = margin >= 30 ? '#059669' : margin >= 15 ? '#d97706' : '#dc2626'
            const marginBg = margin >= 30 ? 'rgba(5,150,105,0.08)' : margin >= 15 ? 'rgba(217,119,6,0.08)' : 'rgba(220,38,38,0.08)'
            return (
              <div style={{
                background: marginBg, borderRadius: 10, padding: '12px 16px',
                border: `1px solid ${marginColor}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <Text size="xs" c="dimmed" mb={2}>กำไรต่อหน่วย</Text>
                  <Text size="lg" fw={700} c={profit >= 0 ? 'green' : 'red'}>
                    ฿{fmt(profit)}
                  </Text>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text size="xs" c="dimmed" mb={2}>Margin</Text>
                  <Badge size="lg" variant="light"
                    color={margin >= 30 ? 'green' : margin >= 15 ? 'yellow' : 'red'}
                    style={{ fontSize: 16, fontWeight: 700 }}>
                    {margin.toFixed(1)}%
                  </Badge>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Text size="xs" c="dimmed" mb={2}>มูลค่ารวม (ทุน)</Text>
                  <Text size="sm" fw={600}>
                    ฿{fmt(cost * (receiveForm.quantity || 0))}
                  </Text>
                </div>
              </div>
            )
          })()}
          <TextInput label="หมายเหตุ" value={receiveForm.note}
            onChange={(e) => setReceiveForm({ ...receiveForm, note: e.target.value })} />
          <Button fullWidth loading={receiveMutation.isPending} color="green"
            leftSection={<IconPackageImport size={18} />}
            onClick={() => receiveMutation.mutate({
              productId: selectedProduct?.id,
              warehouseId: warehouses?.[0]?.id,
              ...receiveForm,
            })}>
            รับเข้าสต๊อก
          </Button>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal opened={deleteModal} onClose={() => setDeleteModal(false)} title="🗑️ ยืนยันลบสินค้า" size="sm" centered>
        <Stack gap="md">
          <Text>ต้องการลบสินค้า <strong>{selectedProduct?.name}</strong> ใช่หรือไม่?</Text>
          <Text size="sm" c="dimmed">สินค้าจะถูกซ่อนจากระบบ (Soft Delete) สามารถกู้คืนได้</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteModal(false)}>ยกเลิก</Button>
            <Button color="red" loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(selectedProduct?.id)}>
              ลบสินค้า
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

/* ====================================================================
   Shared Product Form
   ==================================================================== */
function ProductForm({ form, setForm, categories, loading, onSubmit, submitLabel, color }: {
  form: any; setForm: (f: any) => void; categories: any[]
  loading: boolean; onSubmit: () => void; submitLabel: string; color?: string
}) {
  return (
    <Stack gap="md">
      <Group grow>
        <TextInput label="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <TextInput label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
      </Group>
      <TextInput label="ชื่อสินค้า" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <TextInput label="รายละเอียด" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <Group grow>
        <Select label="หมวดหมู่" data={categories} value={form.categoryId} onChange={(v) => setForm({ ...form, categoryId: v || '' })} clearable searchable />
        <TextInput label="หน่วยนับ" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
      </Group>
      <Group grow>
        <NumberInput label="ราคาทุน" min={0} decimalScale={2} value={form.costPrice}
          onChange={(v) => setForm({ ...form, costPrice: Number(v) })} />
        <NumberInput label="ราคาขาย" required min={0} decimalScale={2} value={form.sellingPrice}
          onChange={(v) => setForm({ ...form, sellingPrice: Number(v) })} />
      </Group>
      <NumberInput label="สต๊อกขั้นต่ำ (แจ้งเตือนเมื่อต่ำกว่า)" min={0} value={form.minStock}
        onChange={(v) => setForm({ ...form, minStock: Number(v) })} />
      <Button fullWidth loading={loading} onClick={onSubmit} color={color}>
        {submitLabel}
      </Button>
    </Stack>
  )
}

/* ====================================================================
   TAB 2: Stock Movement
   ==================================================================== */
function MovementTab() {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null])
  const [productSearch, setProductSearch] = useState('')
  const [issueModal, setIssueModal] = useState(false)
  const [issueForm, setIssueForm] = useState({ productId: '', warehouseId: '', quantity: 0, note: '' })
  const queryClient = useQueryClient()

  const params: any = {}
  if (typeFilter) params.type = typeFilter
  if (dateRange[0]) params.from = dateRange[0].toISOString().slice(0, 10)
  if (dateRange[1]) params.to = dateRange[1].toISOString().slice(0, 10)

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', typeFilter, dateRange[0]?.getTime(), dateRange[1]?.getTime()],
    queryFn: () => api.get('/inventory/transactions', { params }).then(r => r.data),
  })

  const { data: products } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api.get('/products').then(r => r.data),
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  const issueMutation = useMutation({
    mutationFn: (data: any) => api.post('/inventory/issue', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'เบิกสินค้าสำเร็จ', color: 'green' })
      setIssueModal(false); setIssueForm({ productId: '', warehouseId: '', quantity: 0, note: '' })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเบิกได้', color: 'red' }),
  })

  // --- Filtered ---
  const filtered = useMemo(() => {
    let list = transactions || []
    if (productSearch) {
      const q = productSearch.toLowerCase()
      list = list.filter((t: any) => t.product_name?.toLowerCase().includes(q) || t.sku?.toLowerCase().includes(q))
    }
    return list
  }, [transactions, productSearch])

  // --- Stats ---
  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const all = transactions || []
    const todayTxns = all.filter((t: any) => t.created_at?.slice(0, 10) === today)
    return {
      inToday: todayTxns.filter((t: any) => t.type === 'IN').reduce((s: number, t: any) => s + Math.abs(t.quantity), 0),
      outToday: todayTxns.filter((t: any) => ['OUT', 'SALE'].includes(t.type)).reduce((s: number, t: any) => s + Math.abs(t.quantity), 0),
      total: all.length,
    }
  }, [transactions])

  const productOptions = (products || []).map((p: any) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))
  const warehouseOptions = (warehouses || []).map((w: any) => ({ value: String(w.id), label: w.name }))

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
              {filtered.map((t: any) => {
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
