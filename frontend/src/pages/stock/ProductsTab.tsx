import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import {
  Table, Button, TextInput, Group, Modal, Stack, NumberInput, Select,
  Text, Badge, Loader, SimpleGrid, ActionIcon, Tooltip, Image
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconSearch, IconPlus, IconPackageImport, IconEdit, IconTrash,
  IconPackage, IconAlertTriangle, IconPackageOff, IconChecks, IconArrowDown,
  IconFilter, IconSettings, IconX, IconPhoto, IconFileSpreadsheet, IconUpload, IconDownload
} from '@tabler/icons-react'
import api from '../../services/api'
import { fmt } from '../../utils/formatters'
import { downloadExcel, uploadProductsExcel } from '../../utils/exportHelpers'
import { ATTR_COLORS } from '../../utils/constants'
import ProductForm from './ProductForm'
import AttrGroupsManager from './AttrGroupsManager'
import type {
  Product, ProductAttribute, AttributeGroup, AttributeValue,
  Warehouse, ProductFormData, ReceiveFormData, ApiError
} from '../../types'

const emptyForm: ProductFormData = {
  sku: '', barcode: '', name: '', description: '', unit: 'ชิ้น',
  costPrice: 0, sellingPrice: 0, minSellingPrice: 0, minStock: 0,
  attributes: [],
}

export default function ProductsTab() {
  const [search, setSearch] = useState('')
  const [attrFilters, setAttrFilters] = useState<Record<string, string | null>>({})
  const [stockFilter, setStockFilter] = useState<string | null>(null)
  const [groupByAttr, setGroupByAttr] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [addModal, setAddModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [receiveModal, setReceiveModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [attrGroupsModal, setAttrGroupsModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; skipped: number; errors: string[] } | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormData>(emptyForm)
  const [receiveForm, setReceiveForm] = useState<ReceiveFormData>({ quantity: 0, costPerUnit: 0, note: '' })
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null)
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const queryClient = useQueryClient()

  /** Derive the backend base URL (without /api) from the axios instance */
  const backendBase = '' // /uploads served via Vite proxy


  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['products', search],
    queryFn: () => api.get('/products', { params: { search } }).then(r => r.data),
  })

  const { data: attrGroups } = useQuery<AttributeGroup[]>({
    queryKey: ['attribute-groups'],
    queryFn: () => api.get('/products/attribute-groups').then(r => r.data),
  })

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  // --- Mutations ---
  const addMutation = useMutation({
    mutationFn: (data: ProductFormData) => api.post('/products', data),
    onSuccess: async (res) => {
      const newProductId = res.data?.productId
      // Auto-upload รูปที่เลือกไว้ (ถ้ามี)
      if (pendingImageFile && newProductId) {
        try {
          const formData = new FormData()
          formData.append('image', pendingImageFile)
          await api.post(`/products/${newProductId}/image`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
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
    onError: (err: ApiError) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเพิ่มได้', color: 'red' }),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, ...data }: ProductFormData & { id: number }) => api.put(`/products/${id}`, data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'แก้ไขสินค้าสำเร็จ', color: 'green' })
      setEditModal(false); setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: ApiError) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถแก้ไขได้', color: 'red' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบสินค้าสำเร็จ', color: 'green' })
      setDeleteModal(false); setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: ApiError) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' }),
  })

  const receiveMutation = useMutation({
    mutationFn: (data: { productId: number; warehouseId: number; quantity: number; costPerUnit: number; note: string }) =>
      api.post('/inventory/receive', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'รับสินค้าเข้าสต๊อกสำเร็จ', color: 'green' })
      setReceiveModal(false); setReceiveForm({ quantity: 0, costPerUnit: 0, note: '' }); setSelectedProduct(null)
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (err: ApiError) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถรับเข้าได้', color: 'red' }),
  })

  // --- Filtered & computed ---
  const filtered = useMemo(() => {
    let list = products || []
    for (const [groupId, valueId] of Object.entries(attrFilters)) {
      if (valueId) {
        list = list.filter((p) =>
          (p.attributes || []).some((a) => String(a.groupId) === groupId && String(a.valueId) === valueId)
        )
      }
    }
    if (stockFilter === 'low') list = list.filter((p) => parseInt(p.total_stock) > 0 && parseInt(p.total_stock) <= p.min_stock)
    if (stockFilter === 'out') list = list.filter((p) => parseInt(p.total_stock) <= 0)
    return list
  }, [products, attrFilters, stockFilter])

  // Group products by selected attribute
  const groupedProducts = useMemo(() => {
    if (!groupByAttr) return null
    const selectedGroup = (attrGroups || []).find((g) => String(g.id) === groupByAttr)
    if (!selectedGroup) return null

    const groups: { label: string; color: string; count: number; products: Product[] }[] = []
    const groupIdx = (attrGroups || []).findIndex((g) => String(g.id) === groupByAttr)

    for (const val of selectedGroup.values) {
      const prods = filtered.filter((p) =>
        (p.attributes || []).some((a) => a.groupId === selectedGroup.id && a.valueId === val.id)
      )
      if (prods.length > 0) {
        groups.push({
          label: val.value,
          color: ATTR_COLORS[groupIdx % ATTR_COLORS.length],
          count: prods.length,
          products: prods,
        })
      }
    }

    // Products without this attribute
    const unassigned = filtered.filter((p) =>
      !(p.attributes || []).some((a) => a.groupId === selectedGroup.id)
    )
    if (unassigned.length > 0) {
      groups.push({ label: 'ไม่ระบุ', color: 'gray', count: unassigned.length, products: unassigned })
    }

    return { groupName: selectedGroup.name, sections: groups }
  }, [filtered, groupByAttr, attrGroups])

  const stats = useMemo(() => {
    const all = products || []
    return {
      total: all.length,
      active: all.filter((p) => p.is_active).length,
      low: all.filter((p) => { const s = parseInt(p.total_stock); return s > 0 && s <= p.min_stock }).length,
      out: all.filter((p) => parseInt(p.total_stock) <= 0).length,
    }
  }, [products])

  const toggleChip = (groupId: string, valueId: string) => {
    setAttrFilters(prev => ({
      ...prev,
      [groupId]: prev[groupId] === valueId ? null : valueId,
    }))
  }

  const hasActiveFilters = Object.values(attrFilters).some(v => v !== null) || stockFilter !== null

  const clearAllFilters = () => {
    setAttrFilters({})
    setStockFilter(null)
  }

  const toggleCollapse = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const openEdit = (p: Product) => {
    setSelectedProduct(p)
    setEditImageUrl(p.image_url || null)
    setForm({
      sku: p.sku, barcode: p.barcode || '', name: p.name, description: p.description || '',
      unit: p.unit || 'ชิ้น',
      costPrice: parseFloat(p.cost_price), sellingPrice: parseFloat(p.selling_price),
      minSellingPrice: parseFloat(p.min_selling_price || '0'), minStock: p.min_stock,
      attributes: (p.attributes || []).map((a) => ({ groupId: a.groupId, valueId: a.valueId })),
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

  // Shared product row renderer
  const renderProductRow = (p: Product) => {
    const stock = parseInt(p.total_stock) || 0
    const cost = parseFloat(p.cost_price) || 0
    const sell = parseFloat(p.selling_price) || 0
    const minSell = parseFloat(p.min_selling_price || '0')
    const margin = sell > 0 ? ((sell - cost) / sell * 100) : 0
    const level = getStockLevel(stock, p.min_stock)

    const thumbUrl = p.image_url ? `${backendBase}${p.image_url}` : null

    return (
      <Table.Tr key={p.id}>
        <Table.Td><Text size="sm" fw={600} ff="monospace">{p.sku}</Text></Table.Td>
        <Table.Td ta="center">
          {thumbUrl ? (
            <Image src={thumbUrl} alt={p.name} w={36} h={36} radius="sm" fit="cover"
              style={{ display: 'inline-block', border: '1px solid #e0e0e0' }} />
          ) : (
            <IconPhoto size={20} stroke={1.2} color="#ccc" />
          )}
        </Table.Td>
        <Table.Td>
          <Text size="sm" fw={500}>{p.name}</Text>
          {p.barcode && <Text size="xs" c="dimmed">Barcode: {p.barcode}</Text>}
        </Table.Td>
        <Table.Td>
          <Group gap={4} style={{ flexWrap: 'wrap' }}>
            {(p.attributes || []).length > 0 ? (
              (p.attributes || []).map((a: ProductAttribute, idx: number) => (
                <Tooltip key={idx} label={a.groupName}>
                  <Badge variant="light" size="sm"
                    color={ATTR_COLORS[(attrGroups || []).findIndex((g) => g.id === a.groupId) % ATTR_COLORS.length]}>
                    {a.valueName}
                  </Badge>
                </Tooltip>
              ))
            ) : (
              <Text size="xs" c="dimmed">-</Text>
            )}
          </Group>
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
        <Table.Td ta="right" fw={600}>฿{fmt(sell)}</Table.Td>
        <Table.Td ta="right">
          <Text size="sm" c={minSell > 0 ? 'orange' : 'dimmed'}>
            {minSell > 0 ? `฿${fmt(minSell)}` : '-'}
          </Text>
        </Table.Td>
        <Table.Td ta="right">฿{fmt(cost)}</Table.Td>
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
                onClick={() => { setSelectedProduct(p); setReceiveForm({ quantity: 0, costPerUnit: cost, note: '' }); setReceiveModal(true) }}>
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
  }

  const tableHead = (
    <Table.Thead>
      <Table.Tr>
        <Table.Th>SKU</Table.Th>
        <Table.Th ta="center">รูป</Table.Th>
        <Table.Th>ชื่อสินค้า</Table.Th>
        <Table.Th>แอตทริบิวต์</Table.Th>
        <Table.Th ta="center">คงเหลือ</Table.Th>
        <Table.Th ta="right">ราคาขาย</Table.Th>
        <Table.Th ta="right">ราคาขายต่ำสุด</Table.Th>
        <Table.Th ta="right">ราคาทุน</Table.Th>
        <Table.Th ta="right">Margin</Table.Th>
        <Table.Th ta="center">จัดการ</Table.Th>
      </Table.Tr>
    </Table.Thead>
  )

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <>
      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <div className="stat-card" onClick={() => { setStockFilter(null); clearAllFilters() }} style={{ cursor: 'pointer' }}>
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

      {/* Search + Actions Bar */}
      <div className="stock-filter-bar">
        <TextInput placeholder="ค้นหาสินค้า (ชื่อ, SKU, Barcode)..." leftSection={<IconSearch size={16} />}
          value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <Select placeholder="สถานะสต๊อก" data={[
          { value: 'low', label: '⚠️ ใกล้หมด' },
          { value: 'out', label: '🔴 หมดสต๊อก' },
        ]} value={stockFilter} onChange={setStockFilter} clearable style={{ minWidth: 150 }} />
        <Select placeholder="📂 จัดกลุ่มตาม..." data={(attrGroups || []).map((g) => ({ value: String(g.id), label: g.name }))}
          value={groupByAttr} onChange={setGroupByAttr} clearable
          leftSection={<IconFilter size={14} />} style={{ minWidth: 160 }} />
        <Tooltip label="จัดการกลุ่มแอตทริบิวต์">
          <ActionIcon size="lg" variant="light" color="violet" onClick={() => setAttrGroupsModal(true)}>
            <IconSettings size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="ส่งออก Excel">
          <Button variant="light" color="green" leftSection={<IconFileSpreadsheet size={16} />}
            loading={exportLoading}
            onClick={async () => {
              try {
                setExportLoading(true)
                await downloadExcel('/exports/products', 'products.xlsx')
                notifications.show({ title: 'สำเร็จ', message: 'ส่งออกข้อมูลสินค้าสำเร็จ', color: 'green' })
              } catch {
                notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถส่งออกข้อมูลได้', color: 'red' })
              } finally {
                setExportLoading(false)
              }
            }}>
            ส่งออก Excel
          </Button>
        </Tooltip>
        <Tooltip label="นำเข้าสินค้าจาก Excel">
          <Button variant="light" color="orange" leftSection={<IconUpload size={16} />}
            onClick={() => { setImportFile(null); setImportResult(null); setImportModal(true) }}>
            นำเข้า Excel
          </Button>
        </Tooltip>
        <Button leftSection={<IconPlus size={16} />} onClick={() => { setForm(emptyForm); setAddModal(true) }}>
          เพิ่มสินค้า
        </Button>
      </div>

      {/* Attribute Chips Browser */}
      {(attrGroups || []).length > 0 && (
        <div className="attr-chips-browser">
          {(attrGroups || []).map((g: AttributeGroup, gIdx: number) => (
            <div key={g.id} className="attr-chip-group">
              <Text size="xs" fw={700} c="dimmed" className="attr-chip-label">{g.name}</Text>
              <Group gap={6} style={{ flexWrap: 'wrap' }}>
                <button
                  className={`attr-chip ${!attrFilters[g.id] ? 'active' : ''}`}
                  style={{
                    '--chip-color': `var(--mantine-color-${ATTR_COLORS[gIdx % ATTR_COLORS.length]}-6)`,
                    '--chip-bg': `var(--mantine-color-${ATTR_COLORS[gIdx % ATTR_COLORS.length]}-0)`,
                  } as React.CSSProperties}
                  onClick={() => setAttrFilters({ ...attrFilters, [g.id]: null })}
                >
                  ทั้งหมด
                </button>
                {g.values.map((v: AttributeValue) => {
                  const isActive = attrFilters[g.id] === String(v.id)
                  const count = (products || []).filter((p) =>
                    (p.attributes || []).some((a) => a.groupId === g.id && a.valueId === v.id)
                  ).length
                  return (
                    <button key={v.id}
                      className={`attr-chip ${isActive ? 'active' : ''}`}
                      style={{
                        '--chip-color': `var(--mantine-color-${ATTR_COLORS[gIdx % ATTR_COLORS.length]}-6)`,
                        '--chip-bg': `var(--mantine-color-${ATTR_COLORS[gIdx % ATTR_COLORS.length]}-0)`,
                      } as React.CSSProperties}
                      onClick={() => toggleChip(String(g.id), String(v.id))}
                    >
                      {v.value}
                      <span className="attr-chip-count">{count}</span>
                    </button>
                  )
                })}
              </Group>
            </div>
          ))}
          {hasActiveFilters && (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconX size={12} />}
              onClick={clearAllFilters} style={{ alignSelf: 'flex-start' }}>
              ล้างตัวกรอง
            </Button>
          )}
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
      ) : groupedProducts ? (
        /* Grouped View */
        <Stack gap="md">
          {groupedProducts.sections.map((section) => {
            const isCollapsed = collapsedGroups[section.label] || false
            return (
              <div key={section.label} className="stat-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="grouped-section-header" onClick={() => toggleCollapse(section.label)}
                  style={{ cursor: 'pointer' }}>
                  <Group gap={10}>
                    <Badge variant="filled" size="lg" color={section.color}>{section.label}</Badge>
                    <Text size="sm" c="dimmed">{section.count} สินค้า</Text>
                  </Group>
                  {isCollapsed ? <IconPlus size={18} color="gray" /> : <IconArrowDown size={18} color="gray" />}
                </div>
                {!isCollapsed && (
                  <div style={{ overflow: 'auto' }}>
                    <Table striped highlightOnHover>
                      {tableHead}
                      <Table.Tbody>
                        {section.products.map(renderProductRow)}
                      </Table.Tbody>
                    </Table>
                  </div>
                )}
              </div>
            )
          })}
        </Stack>
      ) : (
        /* Flat View */
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            {tableHead}
            <Table.Tbody>
              {filtered.map(renderProductRow)}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* Add Product Modal */}
      <Modal opened={addModal} onClose={() => { setAddModal(false); setPendingImageFile(null) }} title="➕ เพิ่มสินค้าใหม่" size="lg">
        <ProductForm form={form} setForm={setForm} attrGroups={attrGroups || []}
          loading={addMutation.isPending}
          onSubmit={() => addMutation.mutate(form)} submitLabel="เพิ่มสินค้า"
          pendingFile={pendingImageFile}
          onPendingFileChange={setPendingImageFile} />
      </Modal>

      {/* Edit Product Modal */}
      <Modal opened={editModal} onClose={() => setEditModal(false)} title={`✏️ แก้ไข: ${selectedProduct?.name}`} size="lg">
        <ProductForm form={form} setForm={setForm} attrGroups={attrGroups || []}
          loading={editMutation.isPending}
          onSubmit={() => editMutation.mutate({ id: selectedProduct!.id, ...form })} submitLabel="บันทึกการแก้ไข" color="blue"
          productId={selectedProduct?.id || null}
          imageUrl={editImageUrl}
          onImageChange={(url) => { setEditImageUrl(url); queryClient.invalidateQueries({ queryKey: ['products'] }) }} />
      </Modal>

      {/* Receive Stock Modal */}
      <Modal opened={receiveModal} onClose={() => setReceiveModal(false)} title={`📥 รับสินค้าเข้า: ${selectedProduct?.name}`} size="md">
        <Stack gap="md">
          <Select label="คลังสินค้า" data={(warehouses || []).map((w) => ({ value: String(w.id), label: w.name }))}
            defaultValue={warehouses?.[0]?.id ? String(warehouses[0].id) : undefined} />
          <Group grow>
            <NumberInput label="จำนวน" required min={1} value={receiveForm.quantity}
              onChange={(v) => setReceiveForm({ ...receiveForm, quantity: Number(v) })} />
            <NumberInput label="ราคาทุนต่อหน่วย" required min={0} decimalScale={2} value={receiveForm.costPerUnit}
              onChange={(v) => setReceiveForm({ ...receiveForm, costPerUnit: Number(v) })} />
          </Group>
          <TextInput label="หมายเหตุ" value={receiveForm.note}
            onChange={(e) => setReceiveForm({ ...receiveForm, note: e.target.value })} />
          <Button fullWidth loading={receiveMutation.isPending} color="green"
            leftSection={<IconPackageImport size={18} />}
            onClick={() => receiveMutation.mutate({
              productId: selectedProduct!.id,
              warehouseId: warehouses?.[0]?.id || 0,
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
              onClick={() => deleteMutation.mutate(selectedProduct!.id)}>
              ลบสินค้า
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Attribute Groups Management Modal */}
      <Modal opened={attrGroupsModal} onClose={() => setAttrGroupsModal(false)}
        title="⚙️ จัดการกลุ่มแอตทริบิวต์" size="lg">
        <AttrGroupsManager onClose={() => { setAttrGroupsModal(false); queryClient.invalidateQueries({ queryKey: ['attribute-groups'] }) }} />
      </Modal>

      {/* Import Products Modal */}
      <Modal opened={importModal} onClose={() => setImportModal(false)} title="นำเข้าสินค้าจาก Excel" size="md">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            อัปโหลดไฟล์ Excel (.xlsx) เพื่อนำเข้าสินค้า หากมี SKU ซ้ำจะอัพเดตข้อมูลเดิม
          </Text>

          <Button variant="subtle" color="blue" leftSection={<IconDownload size={16} />}
            onClick={async () => {
              try {
                await downloadExcel('/exports/template/products', 'product-import-template.xlsx')
              } catch {
                notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถดาวน์โหลดแบบฟอร์มได้', color: 'red' })
              }
            }}>
            ดาวน์โหลดแบบฟอร์ม (Template)
          </Button>

          <div>
            <Text size="sm" fw={500} mb={4}>เลือกไฟล์ Excel</Text>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                setImportFile(file)
                setImportResult(null)
              }}
              style={{ display: 'block', width: '100%' }}
            />
          </div>

          {importFile && (
            <Text size="sm" c="dimmed">
              ไฟล์ที่เลือก: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
            </Text>
          )}

          <Button
            fullWidth
            leftSection={<IconUpload size={18} />}
            color="orange"
            loading={importLoading}
            disabled={!importFile}
            onClick={async () => {
              if (!importFile) return
              try {
                setImportLoading(true)
                const result = await uploadProductsExcel(importFile)
                setImportResult(result)
                if (result.imported > 0 || result.updated > 0) {
                  queryClient.invalidateQueries({ queryKey: ['products'] })
                  notifications.show({
                    title: 'นำเข้าสำเร็จ',
                    message: `เพิ่มใหม่ ${result.imported} | อัพเดต ${result.updated} | ข้าม ${result.skipped}`,
                    color: 'green',
                  })
                }
              } catch (err: any) {
                notifications.show({
                  title: 'ผิดพลาด',
                  message: err.response?.data?.message || 'ไม่สามารถนำเข้าสินค้าได้',
                  color: 'red',
                })
              } finally {
                setImportLoading(false)
              }
            }}>
            นำเข้าสินค้า
          </Button>

          {importResult && (
            <div style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 8, padding: 12 }}>
              <Text size="sm" fw={600} mb="xs">ผลการนำเข้า</Text>
              <Group gap="lg">
                <div>
                  <Text size="xs" c="dimmed">เพิ่มใหม่</Text>
                  <Text size="lg" fw={700} c="green">{importResult.imported}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">อัพเดต</Text>
                  <Text size="lg" fw={700} c="blue">{importResult.updated}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">ข้าม</Text>
                  <Text size="lg" fw={700} c="red">{importResult.skipped}</Text>
                </div>
              </Group>
              {importResult.errors.length > 0 && (
                <Stack gap={4} mt="sm">
                  <Text size="xs" fw={600} c="red">รายการที่มีปัญหา:</Text>
                  {importResult.errors.map((err, i) => (
                    <Text key={i} size="xs" c="red">{err}</Text>
                  ))}
                </Stack>
              )}
            </div>
          )}
        </Stack>
      </Modal>
    </>
  )
}
