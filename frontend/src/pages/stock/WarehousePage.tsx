import { useState, useEffect, useCallback } from 'react'
import {
  Select, TextInput, NumberInput, Button, Modal,
  Textarea, Badge, Tooltip, ActionIcon,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPackage, IconArrowDown, IconArrowUp, IconHistory,
  IconPlus, IconSearch, IconBuildingWarehouse, IconRefresh,
  IconBuilding, IconAlertTriangle, IconCheck, IconX,
  IconAdjustments, IconTrendingUp, IconCurrency,
  IconBoxSeam, IconArrowsLeftRight, IconChevronRight,
} from '@tabler/icons-react'
import api from '../../services/api'

/* ─── Types ───────────────────────────────────────── */
interface Warehouse { id: number; name: string; location?: string }
interface StockItem {
  id: number; sku: string; name: string; unit: string
  min_stock: number; total_stock: number; cost_price: number; selling_price: number
  warehouse_name?: string
}
interface Transaction {
  id: number; product_name: string; sku: string; warehouse_name: string
  type: string; quantity: number; cost_per_unit: number; note?: string
  reference_type?: string; reference_id?: number
  created_by_name?: string; created_at: string
}
interface Summary {
  total_sku: number; total_units: number; total_value: number; low_stock_count: number
}
interface Product { id: number; name: string; sku: string; unit: string }

/* ─── Helpers ─────────────────────────────────────── */
const txTypeConfig: Record<string, { label: string; color: string; icon: any; sign: string }> = {
  IN:        { label: 'รับเข้า',    color: '#10b981', icon: IconArrowDown,        sign: '+' },
  OUT:       { label: 'เบิกออก',   color: '#f59e0b', icon: IconArrowUp,          sign: '-' },
  SALE:      { label: 'ขาย',       color: '#6366f1', icon: IconArrowsLeftRight,   sign: '-' },
  RETURN:    { label: 'คืน',       color: '#06b6d4', icon: IconCheck,             sign: '+' },
  ADJUST:    { label: 'ปรับยอด',   color: '#8b5cf6', icon: IconAdjustments,       sign: '±' },
  TRANSFER:  { label: 'โอน',       color: '#ec4899', icon: IconArrowsLeftRight,   sign: '±' },
  VOID_SALE: { label: 'ยกเลิกขาย', color: '#ef4444', icon: IconX,                sign: '+' },
}

const fmt = (n: number) => n?.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) ?? '0'
const fmtMoney = (n: number) => `฿${(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function StockStatusBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0) return <Badge color="red" size="xs" variant="filled">หมด</Badge>
  if (stock <= min) return <Badge color="orange" size="xs" variant="light">ต่ำ</Badge>
  return <Badge color="green" size="xs" variant="light">ปกติ</Badge>
}

function StockBar({ stock, min }: { stock: number; min: number }) {
  const pct = min > 0 ? Math.min(100, (stock / (min * 3)) * 100) : stock > 0 ? 100 : 0
  const color = stock <= 0 ? '#ef4444' : stock <= min ? '#f97316' : '#10b981'
  return (
    <div style={{ background: 'var(--app-border)', borderRadius: 4, height: 5, width: 80, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  )
}

/* ─── Main Component ──────────────────────────────── */
export default function WarehousePage() {
  const [tab, setTab] = useState<'stock' | 'move' | 'history'>('stock')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWH, setSelectedWH] = useState<string>('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [stock, setStock] = useState<StockItem[]>([])
  const [txList, setTxList] = useState<Transaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [txTypeFilter, setTxTypeFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [txLoading, setTxLoading] = useState(false)
  const [createWhModal, setCreateWhModal] = useState(false)
  const [newWh, setNewWh] = useState({ name: '', location: '' })
  const [creating, setCreating] = useState(false)

  // Form states
  const [receiveForm, setReceiveForm] = useState({
    productId: '', warehouseId: '', quantity: 1, costPerUnit: 0, batchNumber: '', note: ''
  })
  const [issueForm, setIssueForm] = useState({
    productId: '', warehouseId: '', quantity: 1, note: ''
  })
  const [submitting, setSubmitting] = useState(false)

  /* ── Fetch warehouses ── */
  useEffect(() => {
    api.get('/inventory/warehouses').then(r => {
      setWarehouses(r.data)
      if (r.data.length > 0) setSelectedWH(String(r.data[0].id))
    })
    api.get('/products?limit=500').then(r => setProducts(r.data)).catch(() => {})
  }, [])

  /* ── Fetch stock ── */
  const fetchStock = useCallback(async () => {
    setLoading(true)
    try {
      const [stockRes, summaryRes] = await Promise.all([
        api.get('/inventory/stock', { params: { warehouseId: selectedWH || undefined } }),
        api.get('/inventory/stock-summary', { params: { warehouseId: selectedWH || undefined } }),
      ])
      setStock(stockRes.data)
      setSummary(summaryRes.data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [selectedWH])

  /* ── Fetch transactions ── */
  const fetchTx = useCallback(async () => {
    setTxLoading(true)
    try {
      const res = await api.get('/inventory/transactions', {
        params: { type: txTypeFilter || undefined }
      })
      setTxList(res.data)
    } catch { /* ignore */ } finally { setTxLoading(false) }
  }, [txTypeFilter])

  useEffect(() => { if (tab === 'stock') fetchStock() }, [tab, fetchStock])
  useEffect(() => { if (tab === 'history') fetchTx() }, [tab, fetchTx])

  /* ── Filter stock ── */
  const filteredStock = stock.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.sku?.toLowerCase().includes(search.toLowerCase())
  )

  /* ── Create warehouse ── */
  const handleCreateWH = async () => {
    if (!newWh.name.trim()) return
    setCreating(true)
    try {
      await api.post('/inventory/warehouses', newWh)
      notifications.show({ title: 'สำเร็จ', message: 'สร้างคลังสินค้าใหม่แล้ว', color: 'green' })
      setCreateWhModal(false)
      setNewWh({ name: '', location: '' })
      const r = await api.get('/inventory/warehouses')
      setWarehouses(r.data)
    } catch (e: any) {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'เกิดข้อผิดพลาด', color: 'red' })
    } finally { setCreating(false) }
  }

  /* ── Receive stock ── */
  const handleReceive = async () => {
    if (!receiveForm.productId || !receiveForm.warehouseId || receiveForm.quantity <= 0) {
      notifications.show({ title: 'ผิดพลาด', message: 'กรุณากรอกข้อมูลให้ครบ', color: 'red' }); return
    }
    setSubmitting(true)
    try {
      await api.post('/inventory/receive', {
        productId: Number(receiveForm.productId),
        warehouseId: Number(receiveForm.warehouseId),
        quantity: receiveForm.quantity,
        costPerUnit: receiveForm.costPerUnit,
        batchNumber: receiveForm.batchNumber || null,
        note: receiveForm.note || null,
      })
      notifications.show({ title: '✅ รับสินค้าสำเร็จ', message: `รับสินค้า ${receiveForm.quantity} ชิ้นเข้าคลัง`, color: 'green' })
      setReceiveForm({ productId: '', warehouseId: selectedWH, quantity: 1, costPerUnit: 0, batchNumber: '', note: '' })
      fetchStock()
    } catch (e: any) {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'เกิดข้อผิดพลาด', color: 'red' })
    } finally { setSubmitting(false) }
  }

  /* ── Issue stock ── */
  const handleIssue = async () => {
    if (!issueForm.productId || !issueForm.warehouseId || issueForm.quantity <= 0) {
      notifications.show({ title: 'ผิดพลาด', message: 'กรุณากรอกข้อมูลให้ครบ', color: 'red' }); return
    }
    setSubmitting(true)
    try {
      await api.post('/inventory/issue', {
        productId: Number(issueForm.productId),
        warehouseId: Number(issueForm.warehouseId),
        quantity: issueForm.quantity,
        note: issueForm.note || null,
      })
      notifications.show({ title: '✅ เบิกสินค้าสำเร็จ', message: `เบิกสินค้าออก ${issueForm.quantity} ชิ้น`, color: 'teal' })
      setIssueForm({ productId: '', warehouseId: selectedWH, quantity: 1, note: '' })
      fetchStock()
    } catch (e: any) {
      notifications.show({ title: 'ผิดพลาด', message: e.response?.data?.message || 'เกิดข้อผิดพลาด', color: 'red' })
    } finally { setSubmitting(false) }
  }

  const whOptions = warehouses.map(w => ({ value: String(w.id), label: w.name }))
  const productOptions = products.map(p => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))

  /* ─────────────── Render ─────────────── */
  return (
    <div className="wh-page">
      {/* ─── Top Stats + Header ─── */}
      <div className="wh-header">
        <div className="wh-header-top">
          <div className="wh-title-block">
            <div className="wh-title-icon"><IconBuildingWarehouse size={22} stroke={1.5} /></div>
            <div>
              <h1 className="wh-title">คลังสินค้า</h1>
              <p className="wh-subtitle">จัดการสต๊อก รับเข้า-เบิกออก และประวัติการเคลื่อนไหว</p>
            </div>
          </div>
          <div className="wh-header-actions">
            <Select
              placeholder="ทุกคลัง"
              data={[{ value: '', label: '📦 ทุกคลัง' }, ...whOptions]}
              value={selectedWH}
              onChange={(v) => setSelectedWH(v || '')}
              size="sm"
              style={{ width: 180 }}
              leftSection={<IconBuilding size={14} />}
            />
            <ActionIcon variant="light" size="lg" onClick={tab === 'stock' ? fetchStock : fetchTx} loading={loading || txLoading}>
              <IconRefresh size={16} />
            </ActionIcon>
            <Button leftSection={<IconPlus size={16} />} size="sm" variant="light"
              onClick={() => setCreateWhModal(true)}>
              เพิ่มคลัง
            </Button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="wh-stats">
          <div className="wh-stat-card wh-stat-card--blue">
            <div className="wh-stat-icon"><IconBoxSeam size={20} stroke={1.5} /></div>
            <div className="wh-stat-body">
              <div className="wh-stat-label">SKU ทั้งหมด</div>
              <div className="wh-stat-value">{loading ? '—' : fmt(summary?.total_sku ?? 0)}</div>
              <div className="wh-stat-sub">รายการสินค้า</div>
            </div>
          </div>
          <div className="wh-stat-card wh-stat-card--orange">
            <div className="wh-stat-icon"><IconAlertTriangle size={20} stroke={1.5} /></div>
            <div className="wh-stat-body">
              <div className="wh-stat-label">ต่ำกว่ามาตรฐาน</div>
              <div className="wh-stat-value" style={{ color: (summary?.low_stock_count ?? 0) > 0 ? '#ef4444' : undefined }}>
                {loading ? '—' : fmt(summary?.low_stock_count ?? 0)}
              </div>
              <div className="wh-stat-sub">รายการที่ต้องสั่งซื้อ</div>
            </div>
          </div>
          <div className="wh-stat-card wh-stat-card--teal">
            <div className="wh-stat-icon"><IconPackage size={20} stroke={1.5} /></div>
            <div className="wh-stat-body">
              <div className="wh-stat-label">หน่วยรวม</div>
              <div className="wh-stat-value">{loading ? '—' : fmt(summary?.total_units ?? 0)}</div>
              <div className="wh-stat-sub">ชิ้น/หน่วยในคลัง</div>
            </div>
          </div>
          <div className="wh-stat-card wh-stat-card--purple">
            <div className="wh-stat-icon"><IconCurrency size={20} stroke={1.5} /></div>
            <div className="wh-stat-body">
              <div className="wh-stat-label">มูลค่าสต๊อก</div>
              <div className="wh-stat-value" style={{ fontSize: 18 }}>
                {loading ? '—' : fmtMoney(summary?.total_value ?? 0)}
              </div>
              <div className="wh-stat-sub">ราคาทุนรวม</div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="wh-tabs">
          {([
            { key: 'stock',   label: 'ภาพรวมสต๊อก',      icon: IconPackage },
            { key: 'move',    label: 'รับ / เบิกสินค้า',   icon: IconArrowsLeftRight },
            { key: 'history', label: 'ประวัติการเคลื่อนไหว', icon: IconHistory },
          ] as const).map(t => (
            <button
              key={t.key}
              className={`wh-tab ${tab === t.key ? 'wh-tab--active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <t.icon size={16} stroke={1.8} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tab Content ─── */}
      <div className="wh-content">

        {/* ══ Tab 1: Stock Overview ══ */}
        {tab === 'stock' && (
          <div className="wh-stock-section">
            <div className="wh-search-bar">
              <TextInput
                placeholder="ค้นหาสินค้า (ชื่อ, SKU)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                leftSection={<IconSearch size={15} />}
                style={{ flex: 1, maxWidth: 360 }}
                size="sm"
              />
              <div className="wh-stock-meta">
                {filteredStock.length} รายการ
              </div>
            </div>

            <div className="wh-table-wrap">
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>ชื่อสินค้า</th>
                    <th>คลัง</th>
                    <th style={{ textAlign: 'center' }}>คงเหลือ</th>
                    <th style={{ textAlign: 'center' }}>มาตรฐานขั้นต่ำ</th>
                    <th style={{ textAlign: 'center' }}>ระดับสต๊อก</th>
                    <th style={{ textAlign: 'center' }}>สถานะ</th>
                    <th style={{ textAlign: 'right' }}>ราคาทุน</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--app-text-dim)' }}>กำลังโหลด...</td></tr>
                  ) : filteredStock.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--app-text-dim)' }}>ไม่พบข้อมูล</td></tr>
                  ) : filteredStock.map(item => (
                    <tr key={`${item.id}-${item.warehouse_name}`} className="wh-tr">
                      <td><span className="wh-sku">{item.sku}</span></td>
                      <td className="wh-name">{item.name}</td>
                      <td>
                        <span className="wh-wh-chip">
                          <IconBuildingWarehouse size={11} />
                          {item.warehouse_name || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`wh-qty ${item.total_stock <= 0 ? 'wh-qty--zero' : item.total_stock <= item.min_stock ? 'wh-qty--low' : ''}`}>
                          {fmt(item.total_stock)} {item.unit}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--app-text-dim)', fontSize: 13 }}>
                        {item.min_stock}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <StockBar stock={item.total_stock} min={item.min_stock} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <StockStatusBadge stock={item.total_stock} min={item.min_stock} />
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--app-text-dim)' }}>
                        {fmtMoney(item.cost_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ Tab 2: Receive / Issue ══ */}
        {tab === 'move' && (
          <div className="wh-move-grid">
            {/* Panel: รับสินค้าเข้า */}
            <div className="wh-move-panel wh-move-panel--in">
              <div className="wh-panel-header">
                <div className="wh-panel-icon wh-panel-icon--in">
                  <IconArrowDown size={18} stroke={2} />
                </div>
                <div>
                  <div className="wh-panel-title">รับสินค้าเข้าคลัง</div>
                  <div className="wh-panel-sub">บันทึกสต๊อกสินค้าใหม่ที่รับเข้า</div>
                </div>
              </div>

              <div className="wh-form-body">
                <Select
                  label="สินค้า"
                  placeholder="เลือกสินค้า..."
                  data={productOptions}
                  value={receiveForm.productId}
                  onChange={v => setReceiveForm(f => ({ ...f, productId: v || '' }))}
                  searchable
                  clearable
                  required
                />
                <Select
                  label="คลังสินค้า"
                  data={whOptions}
                  value={receiveForm.warehouseId || selectedWH}
                  onChange={v => setReceiveForm(f => ({ ...f, warehouseId: v || '' }))}
                  required
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <NumberInput
                    label="จำนวนรับเข้า"
                    min={1}
                    value={receiveForm.quantity}
                    onChange={v => setReceiveForm(f => ({ ...f, quantity: Number(v) || 1 }))}
                    required
                  />
                  <NumberInput
                    label="ราคาทุน/หน่วย (฿)"
                    min={0}
                    decimalScale={2}
                    value={receiveForm.costPerUnit}
                    onChange={v => setReceiveForm(f => ({ ...f, costPerUnit: Number(v) || 0 }))}
                  />
                </div>
                <TextInput
                  label="Batch / Lot Number (ไม่บังคับ)"
                  placeholder="เช่น LOT2024-001"
                  value={receiveForm.batchNumber}
                  onChange={e => setReceiveForm(f => ({ ...f, batchNumber: e.target.value }))}
                />
                <Textarea
                  label="หมายเหตุ"
                  placeholder="บันทึกเพิ่มเติม..."
                  value={receiveForm.note}
                  onChange={e => setReceiveForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                />
                <Button
                  fullWidth
                  className="wh-btn-in"
                  loading={submitting}
                  onClick={handleReceive}
                  leftSection={<IconCheck size={16} />}
                >
                  บันทึกรับสินค้าเข้า
                </Button>
              </div>
            </div>

            {/* Panel: เบิกสินค้าออก */}
            <div className="wh-move-panel wh-move-panel--out">
              <div className="wh-panel-header">
                <div className="wh-panel-icon wh-panel-icon--out">
                  <IconArrowUp size={18} stroke={2} />
                </div>
                <div>
                  <div className="wh-panel-title">เบิกสินค้าออก</div>
                  <div className="wh-panel-sub">นำสินค้าออกจากคลัง (ไม่ใช่การขาย)</div>
                </div>
              </div>

              <div className="wh-form-body">
                <Select
                  label="สินค้า"
                  placeholder="เลือกสินค้า..."
                  data={productOptions}
                  value={issueForm.productId}
                  onChange={v => setIssueForm(f => ({ ...f, productId: v || '' }))}
                  searchable
                  clearable
                  required
                />
                <Select
                  label="คลังสินค้า"
                  data={whOptions}
                  value={issueForm.warehouseId || selectedWH}
                  onChange={v => setIssueForm(f => ({ ...f, warehouseId: v || '' }))}
                  required
                />
                <NumberInput
                  label="จำนวนเบิกออก"
                  min={1}
                  value={issueForm.quantity}
                  onChange={v => setIssueForm(f => ({ ...f, quantity: Number(v) || 1 }))}
                  required
                />
                <Textarea
                  label="เหตุผล / หมายเหตุ"
                  placeholder="เช่น เบิกใช้งานภายใน, สินค้าชำรุด..."
                  value={issueForm.note}
                  onChange={e => setIssueForm(f => ({ ...f, note: e.target.value }))}
                  rows={3}
                />
                <Button
                  fullWidth
                  className="wh-btn-out"
                  loading={submitting}
                  onClick={handleIssue}
                  leftSection={<IconArrowUp size={16} />}
                >
                  บันทึกเบิกสินค้าออก
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ══ Tab 3: History ══ */}
        {tab === 'history' && (
          <div className="wh-history-section">
            <div className="wh-history-filters">
              <Select
                placeholder="ทุกประเภท"
                data={[
                  { value: '', label: 'ทุกประเภท' },
                  { value: 'IN', label: 'รับเข้า (IN)' },
                  { value: 'OUT', label: 'เบิกออก (OUT)' },
                  { value: 'SALE', label: 'ขาย (SALE)' },
                  { value: 'RETURN', label: 'คืนสินค้า (RETURN)' },
                  { value: 'ADJUST', label: 'ปรับยอด (ADJUST)' },
                  { value: 'VOID_SALE', label: 'ยกเลิกขาย' },
                ]}
                value={txTypeFilter}
                onChange={v => setTxTypeFilter(v || '')}
                size="sm"
                style={{ width: 200 }}
                clearable
              />
              <Button size="sm" variant="light" leftSection={<IconRefresh size={14} />} onClick={fetchTx}>
                รีเฟรช
              </Button>
              <span className="wh-tx-count">{txList.length} รายการ</span>
            </div>

            <div className="wh-tx-list">
              {txLoading ? (
                <div className="wh-empty">กำลังโหลด...</div>
              ) : txList.length === 0 ? (
                <div className="wh-empty">
                  <IconHistory size={40} stroke={1} style={{ opacity: 0.3 }} />
                  <span>ไม่พบประวัติการเคลื่อนไหว</span>
                </div>
              ) : txList.map(tx => {
                const cfg = txTypeConfig[tx.type] || { label: tx.type, color: '#6b7280', icon: IconPackage, sign: '' }
                const TxIcon = cfg.icon
                const isPositive = tx.quantity > 0
                return (
                  <div key={tx.id} className="wh-tx-item">
                    <div className="wh-tx-icon-wrap" style={{ background: `${cfg.color}18`, color: cfg.color }}>
                      <TxIcon size={16} stroke={2} />
                    </div>
                    <div className="wh-tx-main">
                      <div className="wh-tx-name">{tx.product_name}</div>
                      <div className="wh-tx-meta">
                        <span className="wh-tx-sku">{tx.sku}</span>
                        <span className="wh-tx-dot" />
                        <span><IconBuildingWarehouse size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{tx.warehouse_name}</span>
                        {tx.note && <><span className="wh-tx-dot" /><span style={{ color: 'var(--app-text-muted)' }}>{tx.note}</span></>}
                      </div>
                    </div>
                    <div className="wh-tx-mid">
                      <span className="wh-tx-badge" style={{ background: `${cfg.color}18`, color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className={`wh-tx-qty ${isPositive ? 'wh-tx-qty--pos' : 'wh-tx-qty--neg'}`}>
                      {isPositive ? '+' : ''}{fmt(tx.quantity)}
                    </div>
                    <div className="wh-tx-date">
                      {new Date(tx.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Create Warehouse Modal ─── */}
      <Modal
        opened={createWhModal}
        onClose={() => setCreateWhModal(false)}
        title={<div style={{ fontWeight: 700, fontSize: 16 }}>เพิ่มคลังสินค้าใหม่</div>}
        centered size="sm" radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextInput
            label="ชื่อคลังสินค้า" placeholder="เช่น คลังหลัก, คลังสาขา 2" required
            value={newWh.name} onChange={e => setNewWh(f => ({ ...f, name: e.target.value }))}
          />
          <TextInput
            label="สถานที่ตั้ง (ไม่บังคับ)" placeholder="เช่น ชั้น 2, อาคาร A"
            value={newWh.location} onChange={e => setNewWh(f => ({ ...f, location: e.target.value }))}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button variant="subtle" onClick={() => setCreateWhModal(false)}>ยกเลิก</Button>
            <Button loading={creating} disabled={!newWh.name.trim()} onClick={handleCreateWH}
              leftSection={<IconPlus size={16} />}>
              สร้างคลัง
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
