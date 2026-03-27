import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Table, Button, TextInput, Group, Modal, Stack, NumberInput, Select,
  Text, Badge, Loader, SimpleGrid, ActionIcon, Tooltip, Image, Divider
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconPlus, IconPackageImport, IconPackageExport, IconEdit, IconTrash,
  IconPackage, IconAlertTriangle, IconPackageOff, IconChecks, IconArrowDown, IconArrowUp,
  IconHistory, IconFilter, IconChevronRight, IconChevronDown, IconTags, IconList,
  IconPhoto, IconUpload, IconX
} from '@tabler/icons-react'
import api from '../../services/api'

/** Images are served via Vite proxy (/uploads → localhost:3001/uploads) */
function getBackendBase(): string {
  return ''
}

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
    <Stack gap="lg" className="stock-page-root">
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
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<string | null>(null)
  const [selectedValues, setSelectedValues] = useState<Record<number, number>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>({})
  const [sidebarSearch, setSidebarSearch] = useState<Record<number, string>>({})
  const [addModal, setAddModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [receiveModal, setReceiveModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const emptyForm = { sku: '', barcode: '', name: '', description: '', categoryId: '', unit: 'ชิ้น', costPrice: 0, sellingPrice: 0, minSellingPrice: 0, minStock: 0, attributes: [] as { groupId: number; valueId: number }[] }
  const [form, setForm] = useState(emptyForm)
  const [receiveForm, setReceiveForm] = useState({ quantity: 0, costPerUnit: 0, sellingPrice: 0, note: '' })
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Debounce search input so API isn't called on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 1000)
    return () => clearTimeout(timer)
  }, [search])

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', debouncedSearch],
    queryFn: () => api.get('/products', { params: { search: debouncedSearch } }).then(r => r.data),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/all').then(r => r.data),
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  const { data: attributeGroups } = useQuery({
    queryKey: ['attribute-groups'],
    queryFn: () => api.get('/products/attribute-groups').then(r => r.data),
  })

  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  const unitOptions: string[] = (company?.settings?.units) || ['ชิ้น', 'กล่อง', 'แพ็ค', 'ขวด', 'ถุง']

  // --- Mutations ---
  const addMutation = useMutation({
    mutationFn: (data: any) => api.post('/products', data),
    onSuccess: async (res) => {
      const newProductId = res.data?.productId
      if (pendingImageFile && newProductId) {
        try {
          const fd = new FormData()
          fd.append('image', pendingImageFile)
          await api.post(`/products/${newProductId}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
          notifications.show({ title: 'สำเร็จ', message: 'เพิ่มสินค้าและอัพโหลดรูปภาพสำเร็จ', color: 'green' })
        } catch {
          notifications.show({ title: 'เพิ่มสินค้าสำเร็จ', message: 'แต่อัพโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่ในหน้าแก้ไข', color: 'yellow' })
        }
      } else {
        notifications.show({ title: 'สำเร็จ', message: 'เพิ่มสินค้าสำเร็จ', color: 'green' })
      }
      setAddModal(false); setForm(emptyForm); setPendingImageFile(null)
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

  // --- Count products per attribute value ---
  const valueCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const p of (products || [])) {
      for (const a of (p.attributes || [])) {
        counts[a.valueId] = (counts[a.valueId] || 0) + 1
      }
    }
    return counts
  }, [products])

  // --- Filtered & computed ---
  const filtered = useMemo(() => {
    let list = products || []
    if (stockFilter === 'low') list = list.filter((p: any) => parseInt(p.total_stock) > 0 && parseInt(p.total_stock) <= p.min_stock)
    if (stockFilter === 'out') list = list.filter((p: any) => parseInt(p.total_stock) <= 0)
    // Filter by selected attribute values (AND: must match ALL selected groups)
    const selectedEntries = Object.entries(selectedValues)
    if (selectedEntries.length > 0) {
      list = list.filter((p: any) =>
        selectedEntries.every(([, valueId]) =>
          (p.attributes || []).some((a: any) => a.valueId === Number(valueId))
        )
      )
    }
    return list
  }, [products, stockFilter, selectedValues])

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
    setEditImageUrl(p.image_url || null)
    setForm({
      sku: p.sku, barcode: p.barcode || '', name: p.name, description: p.description || '',
      categoryId: p.category_id ? String(p.category_id) : '', unit: p.unit || 'ชิ้น',
      costPrice: parseFloat(p.cost_price), sellingPrice: parseFloat(p.selling_price),
      minSellingPrice: parseFloat(p.min_selling_price) || 0, minStock: p.min_stock,
      attributes: (p.attributes || []).map((a: any) => ({ groupId: a.groupId, valueId: a.valueId })),
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

  const toggleGroup = (gId: number) => {
    setExpandedGroups(prev => ({ ...prev, [gId]: !prev[gId] }))
  }

  const selectValue = (groupId: number, valueId: number) => {
    setSelectedValues(prev => {
      const next = { ...prev }
      if (next[groupId] === valueId) {
        delete next[groupId]
      } else {
        next[groupId] = valueId
      }
      return next
    })
  }

  const clearSidebarFilter = () => {
    setSelectedValues({})
  }

  const hasActiveFilter = Object.keys(selectedValues).length > 0

  // Find active labels for breadcrumb
  const activeFilterLabels = useMemo(() => {
    if (!attributeGroups || Object.keys(selectedValues).length === 0) return []
    return Object.entries(selectedValues).map(([gId, vId]) => {
      const g = (attributeGroups as any[]).find((g: any) => g.id === Number(gId))
      if (!g) return ''
      const v = (g.values || []).find((v: any) => v.id === vId)
      return v ? `${g.name}: ${v.value}` : ''
    }).filter(Boolean)
  }, [selectedValues, attributeGroups])

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const GROUP_COLORS = ['blue', 'green', 'violet', 'orange', 'cyan', 'pink', 'teal', 'indigo']

  return (
    <div className="stock-products-wrap">
      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <div className="stat-card" onClick={() => { setStockFilter(null); clearSidebarFilter() }} style={{ cursor: 'pointer' }}>
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
        <div className="stat-card" onClick={() => { setStockFilter(null); clearSidebarFilter() }} style={{ cursor: 'pointer' }}>
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
        <div className="stat-card" onClick={() => { setStockFilter('low'); clearSidebarFilter() }} style={{ cursor: 'pointer' }}>
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
        <div className="stat-card" onClick={() => { setStockFilter('out'); clearSidebarFilter() }} style={{ cursor: 'pointer' }}>
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

      {/* Two-panel Layout */}
      <div className="stock-two-panel">
        {/* === LEFT: Sidebar — Cascading Filter === */}
        <div className="stock-sidebar" style={{ padding: 0 }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid var(--app-border, #e5e7eb)',
            background: 'linear-gradient(135deg, rgba(79,70,229,0.05), rgba(99,102,241,0.02))',
          }}>
            <Group gap={8} mb={8}>
              <IconTags size={18} color="var(--app-primary, #4f46e5)" />
              <Text size="sm" fw={700}>กรองสินค้า</Text>
            </Group>
            <Text size="xs" c="dimmed">เลือกคุณสมบัติเพื่อกรองสินค้า</Text>
          </div>

          {/* All products button */}
          <div style={{ padding: '8px 12px' }}>
            <button className={`stock-sidebar-item stock-sidebar-all ${!hasActiveFilter && !stockFilter ? 'active' : ''}`}
              onClick={() => { clearSidebarFilter(); setStockFilter(null) }}
              style={{ borderRadius: 10, marginBottom: 4 }}>
              <Group gap={8}>
                <IconList size={15} />
                <Text size="sm" fw={500}>สินค้าทั้งหมด</Text>
              </Group>
              <Badge size="sm" variant="light" color="gray" radius="xl">{(products || []).length}</Badge>
            </button>
          </div>

          {/* Attribute Select Filters */}
          <div style={{ padding: '4px 12px 12px' }}>
            {(attributeGroups || []).map((g: any, gi: number) => {
              const color = GROUP_COLORS[gi % GROUP_COLORS.length]
              const values: any[] = g.values || []
              const selectedVal = selectedValues[g.id]
              const selectedLabel = selectedVal ? values.find((v: any) => v.id === selectedVal)?.value : null

              return (
                <div key={g.id} style={{ marginBottom: 10 }}>
                  {/* Group label */}
                  <Group gap={6} mb={4}>
                    <div style={{
                      minWidth: 20, height: 20, borderRadius: '50%',
                      background: `var(--mantine-color-${color}-1)`,
                      color: `var(--mantine-color-${color}-7)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {gi + 1}
                    </div>
                    <Text size="xs" fw={600} c={color}>{g.name}</Text>
                  </Group>

                  {/* Search box if >10 values */}
                  {values.length > 10 && (
                    <TextInput
                      size="xs"
                      placeholder={`ค้นหาใน ${g.name}...`}
                      leftSection={<IconSearch size={12} />}
                      value={sidebarSearch[g.id] || ''}
                      onChange={(e) => setSidebarSearch(prev => ({ ...prev, [g.id]: e.target.value }))}
                      style={{ marginBottom: 6 }}
                    />
                  )}

                  {/* Value pills (clickable) — limited to 10, filtered by search */}
                  {(() => {
                    const searchTerm = (sidebarSearch[g.id] || '').toLowerCase()
                    const filteredVals = searchTerm
                      ? values.filter((v: any) => v.value.toLowerCase().includes(searchTerm))
                      : values
                    const visibleVals = filteredVals.slice(0, 10)
                    const hiddenCount = filteredVals.length - visibleVals.length

                    return (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {visibleVals.map((v: any) => {
                            const count = valueCounts[v.id] || 0
                            const isActive = selectedVal === v.id
                            return (
                              <button key={v.id}
                                onClick={() => { selectValue(g.id, v.id); setStockFilter(null) }}
                                style={{
                                  border: isActive
                                    ? `2px solid var(--mantine-color-${color}-5)`
                                    : '1px solid var(--app-border, #e0e0e0)',
                                  background: isActive
                                    ? `var(--mantine-color-${color}-0)`
                                    : 'var(--app-surface, #fff)',
                                  borderRadius: 20, padding: '4px 10px',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                  transition: 'all 0.15s', fontSize: 12, fontWeight: isActive ? 600 : 400,
                                  color: isActive ? `var(--mantine-color-${color}-7)` : 'inherit',
                                }}>
                                <span>{v.value}</span>
                                <span style={{
                                  fontSize: 10, opacity: 0.6,
                                  background: isActive ? `var(--mantine-color-${color}-2)` : 'rgba(0,0,0,0.06)',
                                  borderRadius: 10, padding: '1px 6px',
                                  fontWeight: 600,
                                }}>{count}</span>
                              </button>
                            )
                          })}
                        </div>
                        {hiddenCount > 0 && (
                          <Text size="xs" c="dimmed" mt={4}>+{hiddenCount} รายการเพิ่มเติม (พิมพ์ค้นหาด้านบน)</Text>
                        )}
                      </>
                    )
                  })()}
                </div>
              )
            })}
          </div>

          {/* Active selections summary */}
          {hasActiveFilter && (
            <div style={{
              padding: '10px 12px', borderTop: '1px solid var(--app-border, #e5e7eb)',
              background: 'rgba(79,70,229,0.03)',
            }}>
              <Group justify="space-between" mb={6}>
                <Text size="xs" fw={600} c="dimmed">ตัวกรองที่เลือก</Text>
                <button onClick={clearSidebarFilter} style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 11, color: '#dc2626', fontWeight: 600,
                }}>ล้างทั้งหมด</button>
              </Group>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {activeFilterLabels.map((label, i) => (
                  <Badge key={i} variant="light" color="indigo" size="sm" radius="xl">
                    {label}
                  </Badge>
                ))}
              </div>
              <Text size="xs" c="dimmed" mt={6}>พบ {filtered.length} รายการ</Text>
            </div>
          )}
        </div>

        {/* === RIGHT: Product List === */}
        <div className="stock-main">
          {/* Top bar: search + actions */}
          <div className="stock-main-topbar">
            <div className="stock-main-topbar-left">
              <TextInput placeholder="ค้นหา SKU, ชื่อสินค้า, คุณสมบัติ..." leftSection={<IconSearch size={16} />}
                value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
              <Select placeholder="สถานะสต๊อก" data={[
                { value: 'low', label: '⚠️ ใกล้หมด' },
                { value: 'out', label: '🔴 หมดสต๊อก' },
              ]} value={stockFilter} onChange={setStockFilter} clearable size="sm" style={{ minWidth: 140 }} />
            </div>
            <Button leftSection={<IconPlus size={16} />} onClick={() => { setForm(emptyForm); setAddModal(true) }}>
              เพิ่มสินค้า
            </Button>
          </div>

          {/* Active filter breadcrumb */}
          {activeFilterLabels.length > 0 && (
            <div className="stock-active-filter">
              <Group gap={6}>
                <IconFilter size={14} />
                <Text size="sm" fw={500}>{activeFilterLabels.join(' → ')}</Text>
                <Badge size="sm" variant="light">{filtered.length} รายการ</Badge>
              </Group>
              <Button size="xs" variant="subtle" color="gray" onClick={clearSidebarFilter}>ล้างตัวกรอง</Button>
            </div>
          )}

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
                    <Table.Th ta="center">รูป</Table.Th>
                    <Table.Th>ชื่อสินค้า</Table.Th>
                    <Table.Th>คุณสมบัติ</Table.Th>
                    <Table.Th ta="center">คงเหลือ</Table.Th>
                    <Table.Th ta="right">ราคาทุน</Table.Th>
                    <Table.Th ta="right">ราคาขาย</Table.Th>
                    <Table.Th ta="right">ราคาขั้นต่ำ</Table.Th>
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
                        <Table.Td>
                          <div>
                            <Text size="sm" fw={600} ff="monospace">{p.sku}</Text>
                            {p.barcode && <Text size="xs" ff="monospace" c="dimmed">{p.barcode}</Text>}
                          </div>
                        </Table.Td>
                        <Table.Td ta="center">
                          {p.image_url ? (
                            <Image src={`${getBackendBase()}${p.image_url}`} alt={p.name}
                              w={36} h={36} radius="sm" fit="cover"
                              style={{ display: 'inline-block', border: '1px solid #e0e0e0' }} />
                          ) : (
                            <IconPhoto size={20} stroke={1.2} color="#ccc" />
                          )}
                        </Table.Td>
                        <Table.Td><Text size="sm" fw={500}>{p.name}</Text></Table.Td>
                        <Table.Td>
                          {(p.attributes && p.attributes.length > 0) ? (
                            <Group gap={4} wrap="wrap">
                              {p.attributes.map((a: any, i: number) => (
                                <Tooltip key={i} label={a.groupName}>
                                  <Badge variant="light" size="xs" color={
                                    GROUP_COLORS[i % GROUP_COLORS.length]
                                  } radius="xl">
                                    {a.valueName}
                                  </Badge>
                                </Tooltip>
                              ))}
                            </Group>
                          ) : p.category_name ? (
                            <Badge variant="light" size="xs" radius="xl">{p.category_name}</Badge>
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
                        <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(cost)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(sell)}</Text></Table.Td>
                        <Table.Td ta="right">
                          {p.min_selling_price && parseFloat(p.min_selling_price) > 0 ? (
                            <Tooltip label="ราคาต่ำสุดที่ขายได้ — ห้ามลดต่ำกว่านี้">
                              <Badge color="orange" variant="light" size="sm" style={{ cursor: 'default' }}>
                                🔒 ฿{fmt(parseFloat(p.min_selling_price))}
                              </Badge>
                            </Tooltip>
                          ) : (
                            <Text size="xs" c="dimmed">—</Text>
                          )}
                        </Table.Td>
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
        </div>
      </div>

      {/* Add Product Modal */}
      <Modal opened={addModal} onClose={() => { setAddModal(false); setPendingImageFile(null) }} title="➕ เพิ่มสินค้าใหม่" size="lg">
        <ProductForm form={form} setForm={setForm} categories={categoryOptions}
          attributeGroups={attributeGroups || []} unitOptions={unitOptions}
          loading={addMutation.isPending}
          onSubmit={() => addMutation.mutate(form)} submitLabel="เพิ่มสินค้า"
          pendingFile={pendingImageFile}
          onPendingFileChange={setPendingImageFile} />
      </Modal>

      {/* Edit Product Modal */}
      <Modal opened={editModal} onClose={() => { setEditModal(false); setEditImageUrl(null) }} title={`✏️ แก้ไข: ${selectedProduct?.name}`} size="lg">
        <ProductForm form={form} setForm={setForm} categories={categoryOptions}
          attributeGroups={attributeGroups || []} unitOptions={unitOptions}
          loading={editMutation.isPending}
          onSubmit={() => editMutation.mutate({ id: selectedProduct?.id, ...form })} submitLabel="บันทึกการแก้ไข" color="blue"
          productId={selectedProduct?.id}
          imageUrl={editImageUrl}
          onImageChange={(url) => { setEditImageUrl(url); queryClient.invalidateQueries({ queryKey: ['products'] }) }} />
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
    </div>
  )
}

/* ====================================================================
   Shared Product Form
   ==================================================================== */
function ProductForm({ form, setForm, categories, attributeGroups, unitOptions, loading, onSubmit, submitLabel, color,
  productId, imageUrl, onImageChange, pendingFile, onPendingFileChange,
}: {
  form: any; setForm: (f: any) => void; categories: any[]; attributeGroups: any[]; unitOptions: string[]
  loading: boolean; onSubmit: () => void; submitLabel: string; color?: string
  productId?: number | null; imageUrl?: string | null; onImageChange?: (url: string | null) => void
  pendingFile?: File | null; onPendingFileChange?: (file: File | null) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)

  const getAttrValue = (groupId: number) => {
    const attr = (form.attributes || []).find((a: any) => a.groupId === groupId)
    return attr ? String(attr.valueId) : null
  }

  const setAttrValue = (groupId: number, valueId: string | null) => {
    const attrs = (form.attributes || []).filter((a: any) => a.groupId !== groupId)
    if (valueId) attrs.push({ groupId, valueId: parseInt(valueId) })
    setForm({ ...form, attributes: attrs })
  }

  const handleFileSelect = async (file: File) => {
    if (!productId) {
      // โหมดสร้างใหม่: preview ก่อน, parent จะ upload หลังบันทึก
      const url = URL.createObjectURL(file)
      if (pendingPreview) URL.revokeObjectURL(pendingPreview)
      setPendingPreview(url)
      onPendingFileChange?.(file)
      return
    }
    // โหมดแก้ไข: upload ทันที
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post(`/products/${productId}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      onImageChange?.(res.data.imageUrl)
      notifications.show({ title: 'สำเร็จ', message: 'อัพโหลดรูปภาพสำเร็จ', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'อัพโหลดไม่สำเร็จ', color: 'red' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDeleteImage = async () => {
    if (!productId) return
    setUploading(true)
    try {
      await api.delete(`/products/${productId}/image`)
      onImageChange?.(null)
      notifications.show({ title: 'สำเร็จ', message: 'ลบรูปภาพสำเร็จ', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ลบไม่สำเร็จ', color: 'red' })
    } finally { setUploading(false) }
  }

  const handleClearPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingPreview(null)
    onPendingFileChange?.(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const serverImageUrl = imageUrl ? `${getBackendBase()}${imageUrl}` : null
  const displayImage = serverImageUrl || pendingPreview

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
        <Select label="หน่วยนับ" data={unitOptions} value={form.unit}
          onChange={(v) => setForm({ ...form, unit: v || 'ชิ้น' })} searchable />
      </Group>
      {attributeGroups.length > 0 && (
        <Group grow>
          {attributeGroups.map((g: any) => (
            <Select key={g.id} label={g.name}
              data={(g.values || []).map((v: any) => ({ value: String(v.id), label: v.value }))}
              value={getAttrValue(g.id)}
              onChange={(val) => setAttrValue(g.id, val)}
              clearable searchable />
          ))}
        </Group>
      )}

      {/* รูปภาพสินค้า */}
      <Divider label="รูปภาพสินค้า" labelPosition="center" />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {displayImage ? (
          <div style={{ position: 'relative' }}>
            <Image src={displayImage} alt="รูปสินค้า" w={180} h={180} radius="md" fit="cover"
              style={{ border: '1px solid #e0e0e0' }} />
            <ActionIcon size="sm" color="red" variant="filled" radius="xl"
              style={{ position: 'absolute', top: 4, right: 4 }}
              onClick={productId ? handleDeleteImage : handleClearPending}
              loading={uploading}>
              {productId ? <IconTrash size={12} /> : <IconX size={12} />}
            </ActionIcon>
          </div>
        ) : (
          <div style={{
            width: 180, height: 180, borderRadius: 8, border: '2px dashed #ccc',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#aaa', background: '#fafafa', cursor: 'pointer',
          }} onClick={() => fileRef.current?.click()}>
            <IconPhoto size={40} stroke={1.2} />
            <Text size="xs" c="dimmed" mt={4}>คลิกเพื่อเลือกรูปภาพ</Text>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} />
        <Button size="xs" variant="light"
          leftSection={uploading ? <Loader size={14} /> : <IconUpload size={14} />}
          onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? 'กำลังอัพโหลด...' : displayImage ? 'เปลี่ยนรูปภาพ' : 'เลือกรูปภาพ'}
        </Button>
        {!productId && pendingPreview && (
          <Text size="xs" c="dimmed">รูปจะถูกอัพโหลดอัตโนมัติหลังบันทึกสินค้า</Text>
        )}
      </div>

      <Divider label="ราคา" labelPosition="center" />
      <Group grow>
        <NumberInput label="ราคาทุน" min={0} decimalScale={2} value={form.costPrice}
          onChange={(v) => setForm({ ...form, costPrice: Number(v) })} />
        <NumberInput label="ราคาขาย" required min={0} decimalScale={2} value={form.sellingPrice}
          onChange={(v) => setForm({ ...form, sellingPrice: Number(v) })} />
        <NumberInput label="ราคาขายต่ำสุด" min={0} decimalScale={2} value={form.minSellingPrice}
          onChange={(v) => setForm({ ...form, minSellingPrice: Number(v) })} />
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
