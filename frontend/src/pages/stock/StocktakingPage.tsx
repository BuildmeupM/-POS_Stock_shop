import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, TextInput, Group, Modal, Stack, NumberInput, Select,
  Text, Badge, Loader, ActionIcon, Tooltip, Textarea, Card, SimpleGrid,
  MultiSelect,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconClipboardCheck, IconPlus, IconEye, IconCheck, IconX,
  IconSearch, IconArrowUp, IconArrowDown, IconEqual,
} from '@tabler/icons-react'
import api from '../../services/api'
import type { StockCount, StockCountItem, Warehouse, Product } from '../../types'

const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)
const fmtInt = (n: number) => new Intl.NumberFormat('th-TH').format(n)
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'ร่าง', color: 'gray' },
  in_progress: { label: 'กำลังดำเนินการ', color: 'yellow' },
  completed: { label: 'เสร็จสิ้น', color: 'green' },
  voided: { label: 'ยกเลิก', color: 'red' },
}

export default function StocktakingPage() {
  const queryClient = useQueryClient()

  // ---- State ----
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [warehouseFilter, setWarehouseFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  // ---- Data queries ----
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => api.get('/inventory/warehouses').then(r => r.data),
  })

  const { data: stockCounts = [], isLoading } = useQuery<StockCount[]>({
    queryKey: ['stocktaking', statusFilter, warehouseFilter],
    queryFn: () => api.get('/stocktaking', {
      params: {
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(warehouseFilter ? { warehouseId: warehouseFilter } : {}),
      },
    }).then(r => r.data),
  })

  const filtered = useMemo(() => {
    if (!search) return stockCounts
    const s = search.toLowerCase()
    return stockCounts.filter(sc =>
      sc.count_number.toLowerCase().includes(s) ||
      sc.warehouse_name?.toLowerCase().includes(s) ||
      sc.note?.toLowerCase().includes(s)
    )
  }, [stockCounts, search])

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Text size="xl" fw={800}>
          <IconClipboardCheck size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          ตรวจนับสต๊อก
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          สร้างใบตรวจนับ
        </Button>
      </Group>

      {/* Filters */}
      <Group gap="sm">
        <TextInput
          placeholder="ค้นหาเลขที่เอกสาร..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 250 }}
        />
        <Select
          placeholder="สถานะ"
          data={[
            { value: 'draft', label: 'ร่าง' },
            { value: 'in_progress', label: 'กำลังดำเนินการ' },
            { value: 'completed', label: 'เสร็จสิ้น' },
            { value: 'voided', label: 'ยกเลิก' },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          clearable
          style={{ width: 180 }}
        />
        <Select
          placeholder="คลังสินค้า"
          data={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
          value={warehouseFilter}
          onChange={setWarehouseFilter}
          clearable
          style={{ width: 180 }}
        />
      </Group>

      {/* Table */}
      {isLoading ? (
        <Group justify="center" py="xl"><Loader /></Group>
      ) : filtered.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">ไม่พบรายการตรวจนับ</Text>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover withTableBorder withColumnBorders style={{ minWidth: 800 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>เลขที่</Table.Th>
                <Table.Th>วันที่</Table.Th>
                <Table.Th>คลังสินค้า</Table.Th>
                <Table.Th>สถานะ</Table.Th>
                <Table.Th ta="right">จำนวนสินค้า</Table.Th>
                <Table.Th ta="right">ผลต่าง (qty)</Table.Th>
                <Table.Th ta="right">มูลค่าผลต่าง</Table.Th>
                <Table.Th ta="center">จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map(sc => {
                const st = STATUS_MAP[sc.status] || { label: sc.status, color: 'gray' }
                return (
                  <Table.Tr key={sc.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(sc.id)}>
                    <Table.Td fw={600}>{sc.count_number}</Table.Td>
                    <Table.Td>{fmtDate(sc.count_date)}</Table.Td>
                    <Table.Td>{sc.warehouse_name}</Table.Td>
                    <Table.Td><Badge color={st.color} variant="light">{st.label}</Badge></Table.Td>
                    <Table.Td ta="right">{fmtInt(sc.total_items)}</Table.Td>
                    <Table.Td ta="right">{fmtInt(sc.total_variance_qty)}</Table.Td>
                    <Table.Td ta="right">{fmt(parseFloat(String(sc.total_variance_value)) || 0)}</Table.Td>
                    <Table.Td ta="center">
                      <Tooltip label="ดูรายละเอียด">
                        <ActionIcon variant="subtle" onClick={e => { e.stopPropagation(); setDetailId(sc.id) }}>
                          <IconEye size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* Create Modal */}
      <CreateCountModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        warehouses={warehouses}
        queryClient={queryClient}
      />

      {/* Detail Modal */}
      {detailId !== null && (
        <DetailCountModal
          countId={detailId}
          onClose={() => setDetailId(null)}
          queryClient={queryClient}
        />
      )}
    </Stack>
  )
}

// =====================================================================
// Create Count Modal
// =====================================================================
function CreateCountModal({
  opened, onClose, warehouses, queryClient,
}: {
  opened: boolean
  onClose: () => void
  warehouses: Warehouse[]
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [countDate, setCountDate] = useState<Date | null>(new Date())
  const [note, setNote] = useState('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [productMode, setProductMode] = useState<'all' | 'select'>('all')

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-for-stocktaking'],
    queryFn: () => api.get('/products', { params: { active: 'true' } }).then(r => r.data),
    enabled: opened,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/stocktaking', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `สร้างใบตรวจนับ ${res.data.countNumber}`, color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['stocktaking'] })
      resetAndClose()
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' })
    },
  })

  const resetAndClose = () => {
    setWarehouseId(null)
    setCountDate(new Date())
    setNote('')
    setSelectedProductIds([])
    setProductMode('all')
    onClose()
  }

  const handleCreate = () => {
    if (!warehouseId || !countDate) {
      notifications.show({ title: 'ข้อมูลไม่ครบ', message: 'กรุณาเลือกคลังสินค้าและวันที่', color: 'orange' })
      return
    }
    const year = countDate.getFullYear()
    const month = String(countDate.getMonth() + 1).padStart(2, '0')
    const day = String(countDate.getDate()).padStart(2, '0')
    createMutation.mutate({
      warehouseId: parseInt(warehouseId),
      countDate: `${year}-${month}-${day}`,
      note: note || undefined,
      productIds: productMode === 'select' ? selectedProductIds.map(Number) : [],
    })
  }

  return (
    <Modal opened={opened} onClose={resetAndClose} title="สร้างใบตรวจนับสต๊อก" centered size="lg">
      <Stack gap="md">
        <Select
          label="คลังสินค้า"
          placeholder="เลือกคลังสินค้า"
          data={warehouses.map(w => ({ value: String(w.id), label: w.name }))}
          value={warehouseId}
          onChange={setWarehouseId}
          required
        />
        <DatePickerInput
          label="วันที่ตรวจนับ"
          value={countDate}
          onChange={setCountDate}
          required
        />
        <Select
          label="สินค้าที่ตรวจนับ"
          data={[
            { value: 'all', label: 'ทั้งหมด (สินค้าทั้งหมดในคลัง)' },
            { value: 'select', label: 'เลือกเฉพาะ' },
          ]}
          value={productMode}
          onChange={(v) => setProductMode((v as 'all' | 'select') || 'all')}
        />
        {productMode === 'select' && (
          <MultiSelect
            label="เลือกสินค้า"
            placeholder="ค้นหาสินค้า..."
            data={products.map(p => ({ value: String(p.id), label: `${p.sku} - ${p.name}` }))}
            value={selectedProductIds}
            onChange={setSelectedProductIds}
            searchable
            maxDropdownHeight={300}
          />
        )}
        <Textarea
          label="หมายเหตุ"
          placeholder="เช่น ตรวจนับประจำเดือน"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <Group justify="flex-end">
          <Button variant="subtle" onClick={resetAndClose}>ยกเลิก</Button>
          <Button leftSection={<IconPlus size={16} />} onClick={handleCreate} loading={createMutation.isPending}>
            สร้างใบตรวจนับ
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// =====================================================================
// Detail Count Modal
// =====================================================================
function DetailCountModal({
  countId, onClose, queryClient,
}: {
  countId: number
  onClose: () => void
  queryClient: ReturnType<typeof useQueryClient>
}) {
  const { data: detail, isLoading } = useQuery<StockCount>({
    queryKey: ['stocktaking', countId],
    queryFn: () => api.get(`/stocktaking/${countId}`).then(r => r.data),
  })

  // Local editing state for counted quantities
  const [editedItems, setEditedItems] = useState<Record<number, { countedQty: number | null; note: string }>>({})
  const [saving, setSaving] = useState(false)

  const getItemValue = (item: StockCountItem) => {
    if (editedItems[item.id] !== undefined) return editedItems[item.id]
    return { countedQty: item.counted_qty, note: item.note || '' }
  }

  const updateItem = (itemId: number, field: 'countedQty' | 'note', value: any) => {
    setEditedItems(prev => {
      const existing = prev[itemId] || {
        countedQty: detail?.items?.find(i => i.id === itemId)?.counted_qty ?? null,
        note: detail?.items?.find(i => i.id === itemId)?.note || '',
      }
      return { ...prev, [itemId]: { ...existing, [field]: value } }
    })
  }

  // Save counted quantities
  const handleSave = async () => {
    if (!detail?.items) return
    setSaving(true)
    try {
      const itemsPayload = detail.items.map(item => {
        const edited = editedItems[item.id]
        return {
          itemId: item.id,
          countedQty: edited !== undefined ? (edited.countedQty ?? item.counted_qty) : item.counted_qty,
          note: edited !== undefined ? edited.note : (item.note || ''),
        }
      }).filter(i => i.countedQty !== null && i.countedQty !== undefined)

      if (itemsPayload.length === 0) {
        notifications.show({ title: 'ข้อมูลไม่ครบ', message: 'กรุณากรอกจำนวนนับอย่างน้อย 1 รายการ', color: 'orange' })
        setSaving(false)
        return
      }

      await api.put(`/stocktaking/${countId}/items`, { items: itemsPayload })
      notifications.show({ title: 'สำเร็จ', message: 'บันทึกผลนับสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['stocktaking'] })
      setEditedItems({})
    } catch (err: any) {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกได้', color: 'red' })
    } finally {
      setSaving(false)
    }
  }

  // Complete count
  const completeMutation = useMutation({
    mutationFn: () => api.put(`/stocktaking/${countId}/complete`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ยืนยันการตรวจนับสำเร็จ ปรับสต๊อกเรียบร้อยแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['stocktaking'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถยืนยันได้', color: 'red' })
    },
  })

  // Void count
  const voidMutation = useMutation({
    mutationFn: () => api.put(`/stocktaking/${countId}/void`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ยกเลิกใบตรวจนับสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['stocktaking'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถยกเลิกได้', color: 'red' })
    },
  })

  if (isLoading || !detail) {
    return (
      <Modal opened onClose={onClose} title="รายละเอียดการตรวจนับ" centered size="xl">
        <Group justify="center" py="xl"><Loader /></Group>
      </Modal>
    )
  }

  const items = detail.items || []
  const isEditable = detail.status === 'draft' || detail.status === 'in_progress'
  const canComplete = isEditable && items.length > 0 && items.every(i => {
    const val = getItemValue(i)
    return val.countedQty !== null && val.countedQty !== undefined
  })
  const canVoid = detail.status === 'completed' || detail.status === 'in_progress' || detail.status === 'draft'
  const st = STATUS_MAP[detail.status] || { label: detail.status, color: 'gray' }

  // Summary calculations
  const itemsWithVariance = items.filter(i => {
    const val = getItemValue(i)
    if (val.countedQty === null || val.countedQty === undefined) return false
    return (val.countedQty - i.system_qty) !== 0
  })
  const totalVarianceValue = items.reduce((sum, i) => {
    const val = getItemValue(i)
    if (val.countedQty === null || val.countedQty === undefined) return sum
    const variance = val.countedQty - i.system_qty
    return sum + variance * (parseFloat(i.cost_per_unit) || 0)
  }, 0)

  return (
    <Modal opened onClose={onClose} title={`ตรวจนับ: ${detail.count_number}`} centered size="xl"
      styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}>
      <Stack gap="md">
        {/* Header info */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Card withBorder p="sm">
            <Text size="xs" c="dimmed">คลังสินค้า</Text>
            <Text fw={600}>{detail.warehouse_name}</Text>
          </Card>
          <Card withBorder p="sm">
            <Text size="xs" c="dimmed">วันที่ตรวจนับ</Text>
            <Text fw={600}>{fmtDate(detail.count_date)}</Text>
          </Card>
          <Card withBorder p="sm">
            <Text size="xs" c="dimmed">สถานะ</Text>
            <Badge color={st.color} variant="light" size="lg">{st.label}</Badge>
          </Card>
        </SimpleGrid>

        {detail.note && (
          <Card withBorder p="sm">
            <Text size="xs" c="dimmed">หมายเหตุ</Text>
            <Text size="sm">{detail.note}</Text>
          </Card>
        )}

        {/* Summary */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Card withBorder p="sm" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed">สินค้าทั้งหมด</Text>
            <Text size="xl" fw={800}>{items.length}</Text>
          </Card>
          <Card withBorder p="sm" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed">รายการที่มีผลต่าง</Text>
            <Text size="xl" fw={800} c={itemsWithVariance.length > 0 ? 'red' : 'green'}>
              {itemsWithVariance.length}
            </Text>
          </Card>
          <Card withBorder p="sm" style={{ textAlign: 'center' }}>
            <Text size="xs" c="dimmed">มูลค่าผลต่างรวม</Text>
            <Text size="xl" fw={800} c={totalVarianceValue < 0 ? 'red' : totalVarianceValue > 0 ? 'blue' : 'green'}>
              {fmt(totalVarianceValue)}
            </Text>
          </Card>
        </SimpleGrid>

        {/* Items table */}
        <div style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover withTableBorder withColumnBorders style={{ minWidth: 900 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 50 }}>#</Table.Th>
                <Table.Th>สินค้า</Table.Th>
                <Table.Th>SKU</Table.Th>
                <Table.Th ta="right">ในระบบ</Table.Th>
                <Table.Th ta="right" style={{ width: 120 }}>นับได้</Table.Th>
                <Table.Th ta="right">ผลต่าง</Table.Th>
                <Table.Th ta="right">มูลค่าผลต่าง</Table.Th>
                <Table.Th>หมายเหตุ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item, idx) => {
                const val = getItemValue(item)
                const countedQty = val.countedQty
                const variance = countedQty !== null && countedQty !== undefined
                  ? countedQty - item.system_qty
                  : null
                const varianceValue = variance !== null
                  ? variance * (parseFloat(item.cost_per_unit) || 0)
                  : null
                const varianceColor = variance === null ? 'dimmed'
                  : variance === 0 ? 'green'
                  : variance < 0 ? 'red' : 'blue'

                return (
                  <Table.Tr key={item.id}>
                    <Table.Td ta="center">{idx + 1}</Table.Td>
                    <Table.Td fw={500}>{item.product_name}</Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{item.sku}</Text></Table.Td>
                    <Table.Td ta="right">{fmtInt(item.system_qty)}</Table.Td>
                    <Table.Td ta="right">
                      {isEditable ? (
                        <NumberInput
                          value={countedQty ?? ''}
                          onChange={(v) => updateItem(item.id, 'countedQty', v === '' ? null : Number(v))}
                          min={0}
                          size="xs"
                          styles={{ input: { textAlign: 'right', width: 100 } }}
                          placeholder="นับ..."
                        />
                      ) : (
                        <Text>{countedQty !== null && countedQty !== undefined ? fmtInt(countedQty) : '—'}</Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      {variance !== null ? (
                        <Group gap={4} justify="flex-end">
                          {variance > 0 && <IconArrowUp size={14} color="var(--mantine-color-blue-6)" />}
                          {variance < 0 && <IconArrowDown size={14} color="var(--mantine-color-red-6)" />}
                          {variance === 0 && <IconEqual size={14} color="var(--mantine-color-green-6)" />}
                          <Text c={varianceColor} fw={600}>{variance > 0 ? '+' : ''}{fmtInt(variance)}</Text>
                        </Group>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      {varianceValue !== null ? (
                        <Text c={varianceColor} fw={500}>{varianceValue > 0 ? '+' : ''}{fmt(varianceValue)}</Text>
                      ) : (
                        <Text c="dimmed">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isEditable ? (
                        <TextInput
                          value={val.note}
                          onChange={e => updateItem(item.id, 'note', e.target.value)}
                          size="xs"
                          placeholder="หมายเหตุ..."
                        />
                      ) : (
                        <Text size="sm">{val.note || '—'}</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </div>

        {/* Action buttons */}
        <Group justify="flex-end" gap="sm">
          {isEditable && (
            <>
              <Button
                variant="outline"
                onClick={handleSave}
                loading={saving}
                leftSection={<IconCheck size={16} />}
              >
                บันทึกผลนับ
              </Button>
              <Tooltip label={canComplete ? 'ยืนยันและปรับสต๊อก' : 'กรุณาบันทึกผลนับทุกรายการก่อน'}>
                <Button
                  color="green"
                  onClick={() => completeMutation.mutate()}
                  loading={completeMutation.isPending}
                  disabled={!canComplete}
                  leftSection={<IconCheck size={16} />}
                >
                  ยืนยันการตรวจนับ
                </Button>
              </Tooltip>
            </>
          )}
          {canVoid && detail.status !== 'voided' && (
            <Button
              color="red"
              variant="outline"
              onClick={() => {
                if (window.confirm('ต้องการยกเลิกใบตรวจนับนี้หรือไม่?')) {
                  voidMutation.mutate()
                }
              }}
              loading={voidMutation.isPending}
              leftSection={<IconX size={16} />}
            >
              ยกเลิก
            </Button>
          )}
          <Button variant="subtle" onClick={onClose}>ปิด</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
