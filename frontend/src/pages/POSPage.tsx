import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, ActionIcon, Stack, Badge, Loader, Select,
  NumberInput, Modal, SimpleGrid, Kbd, Tooltip, ScrollArea
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconMinus, IconTrash, IconSearch, IconCash, IconBarcode,
  IconUser, IconPlayerPause, IconPlayerPlay, IconX, IconCheck,
  IconPercentage, IconCreditCard, IconQrcode, IconBuildingBank, IconTool,
  IconPrinter, IconClock, IconShoppingCart, IconPackage, IconCategory
} from '@tabler/icons-react'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

interface CartItem {
  productId: number; name: string; sku: string
  unitPrice: number; quantity: number; discount: number
  isService?: boolean
}

interface HeldOrder {
  id: number; label: string; items: CartItem[]; customerId: string; heldAt: Date
}

// Category color palette — cycles through for each category
const CAT_PALETTE = [
  { bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)', color: '#2563eb', light: '#eff6ff' },
  { bg: 'linear-gradient(135deg, #fef3c7, #fde68a)', color: '#d97706', light: '#fffbeb' },
  { bg: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', color: '#16a34a', light: '#f0fdf4' },
  { bg: 'linear-gradient(135deg, #fce7f3, #fbcfe8)', color: '#db2777', light: '#fdf2f8' },
  { bg: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)', color: '#6366f1', light: '#eef2ff' },
  { bg: 'linear-gradient(135deg, #ffe4e6, #fecdd3)', color: '#e11d48', light: '#fff1f2' },
  { bg: 'linear-gradient(135deg, #ccfbf1, #99f6e4)', color: '#0d9488', light: '#f0fdfa' },
  { bg: 'linear-gradient(135deg, #fef9c3, #fde047)', color: '#ca8a04', light: '#fefce8' },
]

export default function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string>('')
  const [receivedAmount, setReceivedAmount] = useState<number>(0)
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([])
  const [showHeld, setShowHeld] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<any>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showServicePopover, setShowServicePopover] = useState(false)
  const [serviceName, setServiceName] = useState('')
  const [servicePrice, setServicePrice] = useState<number>(0)
  const [billDiscount, setBillDiscount] = useState<number>(0)
  const [billDiscountType, setBillDiscountType] = useState<'baht' | 'percent'>('baht')
  const searchRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { user, activeCompany } = useAuthStore()

  // === Data Queries ===
  const { data: companySettings } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  const vatEnabled = companySettings?.settings?.vat_enabled !== false
  const vatRate = (companySettings?.settings?.vat_rate ?? 7) / 100

  const { data: products, isLoading } = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () => api.get('/products', { params: { search, active: 'true' } }).then(r => r.data),
  })
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/all').then(r => r.data),
  })
  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/sales/customers/all').then(r => r.data),
  })

  // Build category color map
  const catColorMap = useMemo(() => {
    const map: Record<string, typeof CAT_PALETTE[0]> = {}
    categories?.forEach((cat: any, i: number) => {
      map[String(cat.id)] = CAT_PALETTE[i % CAT_PALETTE.length]
    })
    return map
  }, [categories])

  // Build category name map
  const catNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    categories?.forEach((cat: any) => { map[String(cat.id)] = cat.name })
    return map
  }, [categories])

  // === Sale Mutation ===
  const saleMutation = useMutation({
    mutationFn: (data: any) => api.post('/sales', data),
    onSuccess: (res) => {
      const customerName = customers?.find((c: any) => String(c.id) === customerId)?.name || ''
      setLastReceipt({
        ...res.data,
        items: cart.map(c => ({ ...c })),
        paymentMethod, receivedAmount,
        changeAmount: paymentMethod === 'cash' ? receivedAmount - res.data.netAmount : 0,
        customerName,
        companyName: activeCompany?.company_name || 'Bookdee POS',
        cashierName: user?.fullName || '',
        soldAt: new Date().toISOString(),
        vatEnabled, vatAmount: res.data.vatAmount,
        billDiscount: billDiscountAmount,
      })
      setShowReceipt(true)
      setShowPayment(false)
      setCart([]); setCustomerId(''); setReceivedAmount(0); setPaymentMethod(null)
      setBillDiscount(0); setBillDiscountType('baht')
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)

  // === Computed ===
  const filteredProducts = activeCategory === 'all'
    ? products
    : products?.filter((p: any) => String(p.category_id) === activeCategory)

  const itemSubtotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0)
  const itemDiscountTotal = cart.reduce((sum, c) => sum + (c.discount || 0), 0)
  const afterItemDiscount = itemSubtotal - itemDiscountTotal
  const billDiscountAmount = billDiscountType === 'percent'
    ? afterItemDiscount * (billDiscount / 100) : billDiscount
  const subtotal = afterItemDiscount - billDiscountAmount
  const totalDiscount = itemDiscountTotal + billDiscountAmount
  const vatAmount = vatEnabled ? subtotal * vatRate : 0
  const grandTotal = subtotal + vatAmount
  const changeAmount = receivedAmount - grandTotal

  // === Cart Actions ===
  const addToCart = useCallback((p: any) => {
    setCart(prev => {
      const ex = prev.find(c => c.productId === p.id)
      if (ex) return prev.map(c => c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { productId: p.id, name: p.name, sku: p.sku, unitPrice: parseFloat(p.selling_price), quantity: 1, discount: 0 }]
    })
  }, [])

  const updateQty = (pid: number, q: number) => {
    if (q <= 0) { removeItem(pid); return }
    setCart(prev => prev.map(c => c.productId === pid ? { ...c, quantity: q } : c))
  }
  const updateDiscount = (pid: number, d: number) => {
    setCart(prev => prev.map(c => c.productId === pid ? { ...c, discount: d } : c))
  }
  const removeItem = (pid: number) => setCart(prev => prev.filter(c => c.productId !== pid))

  const addServiceItem = () => {
    if (!serviceName.trim() || servicePrice <= 0) {
      notifications.show({ title: 'กรุณากรอกข้อมูลให้ครบ', message: 'ระบุชื่อบริการและราคา', color: 'yellow' })
      return
    }
    setCart(prev => [...prev, { productId: -(Date.now()), name: serviceName.trim(), sku: 'บริการ', unitPrice: servicePrice, quantity: 1, discount: 0, isService: true }])
    setServiceName(''); setServicePrice(0); setShowServicePopover(false)
  }

  const clearCart = () => { setCart([]); setCustomerId(''); setReceivedAmount(0); setPaymentMethod(null); setBillDiscount(0); setBillDiscountType('baht') }

  // === Hold/Resume ===
  const holdOrder = () => {
    if (cart.length === 0) return
    const h: HeldOrder = { id: Date.now(), label: `บิลพัก #${heldOrders.length + 1}`, items: [...cart], customerId, heldAt: new Date() }
    setHeldOrders(prev => [...prev, h]); clearCart()
    notifications.show({ title: 'พักบิลแล้ว', message: h.label, color: 'yellow', autoClose: 2000 })
  }
  const resumeOrder = (h: HeldOrder) => {
    setCart(h.items); setCustomerId(h.customerId)
    setHeldOrders(prev => prev.filter(x => x.id !== h.id)); setShowHeld(false)
  }

  // === Barcode Scanner ===
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    try {
      const res = await api.get('/products', { params: { search: barcode, active: 'true' } })
      const matched = res.data
      const exact = matched.find((p: any) => p.barcode === barcode || p.sku === barcode)
      if (exact) { addToCart(exact); notifications.show({ title: 'สแกนสำเร็จ', message: exact.name, color: 'teal', autoClose: 1500 }) }
      else if (matched.length > 0) addToCart(matched[0])
      else notifications.show({ title: 'ไม่พบสินค้า', message: `บาร์โค้ด: ${barcode}`, color: 'red' })
    } catch { /* ignore */ }
  }, [addToCart])
  const { lastScanned } = useBarcodeScanner(handleBarcodeScan)

  // === Keyboard Shortcuts ===
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'F2') { e.preventDefault(); if (cart.length > 0) setShowPayment(true) }
      if (e.key === 'F3') { e.preventDefault(); holdOrder() }
      if (e.key === 'Escape') { e.preventDefault(); clearCart() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cart, heldOrders])

  // === Checkout ===
  const handleCheckout = () => {
    if (!paymentMethod || cart.length === 0) return
    if (paymentMethod === 'cash' && receivedAmount < grandTotal) {
      notifications.show({ title: 'จำนวนเงินไม่พอ', message: 'กรุณาใส่จำนวนเงินที่รับ', color: 'red' }); return
    }
    saleMutation.mutate({
      items: cart.map(c => ({ productId: c.isService ? null : c.productId, quantity: c.quantity, unitPrice: c.unitPrice, discount: c.discount || 0, isService: c.isService || false, serviceName: c.isService ? c.name : undefined })),
      paymentMethod, customerId: customerId || undefined, discountAmount: totalDiscount,
      receivedAmount: paymentMethod === 'cash' ? receivedAmount : grandTotal,
    })
  }

  const quickCashAmounts = [20, 50, 100, 500, 1000]

  return (
    <>
      <div className="pos2">
        {/* ======== LEFT: Products ======== */}
        <div className="pos2-left">
          {/* Search row */}
          <div className="pos2-search-row">
            <TextInput ref={searchRef} placeholder="ค้นหาสินค้า ชื่อ, SKU, Barcode..."
              leftSection={<IconSearch size={18} />} value={search}
              onChange={e => setSearch(e.target.value)} size="md"
              className="pos2-search" data-barcode="true" />
            <Tooltip label={lastScanned ? `ล่าสุด: ${lastScanned}` : 'Barcode Scanner'}>
              <div className={`pos2-scanner ${lastScanned ? 'active' : ''}`}>
                <IconBarcode size={20} />
              </div>
            </Tooltip>
          </div>

          {/* Category tabs — square tiles */}
          <ScrollArea type="never" className="pos2-cat-scroll">
            <div className="pos2-cat-row">
              <button className={`pos2-cat ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
                style={{ '--cat-color': '#6366f1', '--cat-bg': '#eef2ff' } as React.CSSProperties}>
                <IconCategory size={20} />
                <span>ทั้งหมด</span>
              </button>
              {categories?.map((cat: any, i: number) => {
                const pal = CAT_PALETTE[i % CAT_PALETTE.length]
                return (
                  <button key={cat.id}
                    className={`pos2-cat ${activeCategory === String(cat.id) ? 'active' : ''}`}
                    onClick={() => setActiveCategory(String(cat.id))}
                    style={{ '--cat-color': pal.color, '--cat-bg': pal.light } as React.CSSProperties}>
                    <span>{cat.name}</span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>

          {/* Product Grid + Service Section */}
          <div className="pos2-grid-area">
            {/* === สินค้า === */}
            {isLoading ? (
              <div className="pos2-loading"><Loader size="md" color="indigo" /></div>
            ) : filteredProducts?.length === 0 ? (
              <div className="pos2-empty">
                <IconSearch size={48} stroke={1.2} color="#ccc" />
                <Text c="dimmed" fw={500} mt={8}>ไม่พบสินค้า</Text>
              </div>
            ) : (
              <div className="pos2-grid">
                {filteredProducts?.map((p: any) => {
                  const stock = parseInt(p.total_stock) || 0
                  const outOfStock = stock <= 0
                  const inCart = cart.find(c => c.productId === p.id)
                  const catId = String(p.category_id || '')
                  const pal = catColorMap[catId] || CAT_PALETTE[0]
                  const catName = catNameMap[catId] || ''
                  const initial = p.name?.charAt(0)?.toUpperCase() || '?'

                  return (
                    <div key={p.id}
                      className={`pos2-card ${outOfStock ? 'disabled' : ''} ${inCart ? 'in-cart' : ''}`}
                      onClick={() => !outOfStock && addToCart(p)}>
                      <div className="pos2-card-img" style={{ background: pal.bg }}>
                        <span className="pos2-card-initial" style={{ color: pal.color }}>{initial}</span>
                        {inCart && <span className="pos2-card-badge">{inCart.quantity}</span>}
                        {outOfStock && <span className="pos2-card-oos">หมด</span>}
                      </div>
                      <div className="pos2-card-info">
                        <div className="pos2-card-name">{p.name}</div>
                        <div className="pos2-card-bottom">
                          <span className="pos2-card-price">฿{fmt(parseFloat(p.selling_price))}</span>
                          {catName && <span className="pos2-card-cat" style={{ color: pal.color, background: pal.light }}>{catName}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* === ค่าบริการ (แยกส่วน) === */}
            <div className="pos2-service-section">
              <div className="pos2-service-header">
                <IconTool size={18} color="#0d9488" />
                <span>ค่าแรง / ค่าบริการ</span>
              </div>
              <div className="pos2-service-card" onClick={() => setShowServicePopover(true)}>
                <div className="pos2-service-icon">
                  <IconPlus size={22} />
                </div>
                <div className="pos2-service-text">
                  <div className="pos2-service-title">เพิ่มค่าแรง / ค่าบริการ</div>
                  <div className="pos2-service-desc">เช่น ค่าติดตั้ง, ค่าซ่อม, ค่าขนส่ง</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ======== RIGHT: Cart ======== */}
        <div className="pos2-right">
          {/* Header */}
          <div className="pos2-cart-head">
            <div className="pos2-cart-top">
              <div className="pos2-cart-title">
                <IconShoppingCart size={18} />
                <span>รายการสั่งซื้อ</span>
              </div>
              <div className="pos2-cart-actions">
                <Tooltip label="พักบิล [F3]"><ActionIcon variant="light" color="yellow" size="sm" onClick={holdOrder} disabled={cart.length === 0}><IconPlayerPause size={14} /></ActionIcon></Tooltip>
                {heldOrders.length > 0 && (
                  <Tooltip label={`บิลพัก (${heldOrders.length})`}>
                    <ActionIcon variant="light" color="blue" size="sm" onClick={() => setShowHeld(true)} className="pos2-held-btn">
                      <IconPlayerPlay size={14} />
                      <span className="pos2-held-count">{heldOrders.length}</span>
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip label="ล้าง [Esc]"><ActionIcon variant="light" color="red" size="sm" onClick={clearCart} disabled={cart.length === 0}><IconX size={14} /></ActionIcon></Tooltip>
              </div>
            </div>
            <Select size="xs" placeholder="ลูกค้าทั่วไป (Walk-in)" clearable searchable
              leftSection={<IconUser size={14} />}
              data={(customers || []).map((c: any) => ({ value: String(c.id), label: `${c.name}${c.phone ? ` (${c.phone})` : ''}` }))}
              value={customerId} onChange={v => setCustomerId(v || '')} />
          </div>

          {/* Cart Items */}
          <div className="pos2-cart-body">
            {cart.length === 0 ? (
              <div className="pos2-cart-empty">
                <IconBarcode size={36} stroke={1.2} color="#ccc" />
                <Text size="sm" c="dimmed" fw={500} mt={6}>ยังไม่มีรายการ</Text>
                <Text size="xs" c="dimmed">คลิกสินค้าหรือสแกนบาร์โค้ด</Text>
              </div>
            ) : (
              cart.map((item, idx) => {
                const lineTotal = item.unitPrice * item.quantity - (item.discount || 0)
                return (
                  <div key={item.productId} className={`pos2-ci ${item.isService ? 'service' : ''}`}>
                    {/* Row 1: Name + unit price + delete */}
                    <div className="pos2-ci-row1">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pos2-ci-name">
                          {item.isService && <Badge size="xs" color="teal" variant="light" mr={4}>บริการ</Badge>}
                          {item.name}
                        </div>
                        <div className="pos2-ci-unit-price">฿{fmt(item.unitPrice)} / ชิ้น</div>
                      </div>
                      <ActionIcon size={22} variant="subtle" color="red" onClick={() => removeItem(item.productId)}>
                        <IconTrash size={13} />
                      </ActionIcon>
                    </div>
                    {/* Row 2: Qty controls + discount input + line total */}
                    <div className="pos2-ci-row2">
                      <div className="pos2-ci-mid">
                        <ActionIcon size={26} variant="light" radius="xl" onClick={() => updateQty(item.productId, item.quantity - 1)}><IconMinus size={12} /></ActionIcon>
                        <span className="pos2-ci-qty">{item.quantity}</span>
                        <ActionIcon size={26} variant="light" radius="xl" onClick={() => updateQty(item.productId, item.quantity + 1)}><IconPlus size={12} /></ActionIcon>
                      </div>
                      <div className="pos2-ci-disc-field">
                        <span className="pos2-ci-disc-label">ส่วนลด</span>
                        <NumberInput size="xs" w={70} min={0} hideControls placeholder="฿0"
                          prefix="฿" value={item.discount || ''}
                          onChange={(v) => updateDiscount(item.productId, Number(v) || 0)}
                          styles={{ input: { padding: '2px 6px', fontSize: 12, fontWeight: 600, textAlign: 'center' } }} />
                      </div>
                      <span className="pos2-ci-total">฿{fmt(lineTotal)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="pos2-cart-foot">
            {/* Bill discount */}
            {cart.length > 0 && (
              <div className="pos2-bill-disc">
                <Text size="xs" fw={600} c="red.7">ส่วนลดทั้งบิล</Text>
                <Group gap={4}>
                  <NumberInput size="xs" w={72} min={0} hideControls
                    placeholder={billDiscountType === 'percent' ? '%' : '฿'}
                    prefix={billDiscountType === 'baht' ? '฿' : ''}
                    suffix={billDiscountType === 'percent' ? '%' : ''}
                    value={billDiscount || ''} onChange={v => setBillDiscount(Number(v) || 0)}
                    styles={{ input: { padding: '2px 6px', fontSize: 12, fontWeight: 600 } }} />
                  <ActionIcon size="xs" variant={billDiscountType === 'percent' ? 'filled' : 'light'}
                    color="red" onClick={() => setBillDiscountType(billDiscountType === 'baht' ? 'percent' : 'baht')}>
                    <IconPercentage size={10} />
                  </ActionIcon>
                </Group>
              </div>
            )}

            {/* Totals */}
            <div className="pos2-totals">
              <div className="pos2-tr"><span>ยอดรวม ({cart.length} รายการ)</span><span>฿{fmt(itemSubtotal)}</span></div>
              {totalDiscount > 0 && <div className="pos2-tr disc"><span>ส่วนลด</span><span>-฿{fmt(totalDiscount)}</span></div>}
              {vatEnabled && <div className="pos2-tr"><span>VAT {(vatRate * 100).toFixed(0)}%</span><span>฿{fmt(vatAmount)}</span></div>}
              <div className="pos2-tr grand"><span>ยอดสุทธิ</span><span>฿{fmt(grandTotal)}</span></div>
            </div>

            <Button fullWidth size="lg" disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}
              leftSection={<IconCash size={20} />}
              className="pos2-pay-btn">
              ชำระเงิน ฿{fmt(grandTotal)}
            </Button>
          </div>
        </div>
      </div>

      {/* Shortcut bar */}
      <div className="pos-shortcut-bar">
        <Kbd size="xs">F1</Kbd><span>ค้นหา</span>
        <span className="pos-shortcut-sep" />
        <Kbd size="xs">F2</Kbd><span>ชำระ</span>
        <span className="pos-shortcut-sep" />
        <Kbd size="xs">F3</Kbd><span>พักบิล</span>
        <span className="pos-shortcut-sep" />
        <Kbd size="xs">Esc</Kbd><span>ล้าง</span>
      </div>

      {/* ======== PAYMENT MODAL ======== */}
      <Modal opened={showPayment} onClose={() => setShowPayment(false)} title={null}
        size="lg" centered withCloseButton={false} radius="lg"
        overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
        classNames={{ content: 'pos2-pay-modal' }}>
        <div className="pos2-pay">
          <div className="pos2-pay-head">
            <Text fw={800} size="xl">ชำระเงิน</Text>
            <ActionIcon variant="subtle" size="lg" onClick={() => setShowPayment(false)}><IconX size={20} /></ActionIcon>
          </div>
          <div className="pos2-pay-grid">
            {/* Left: amount */}
            <div className="pos2-pay-amount">
              <div className="pos2-pay-amount-card">
                <Text size="sm" style={{ color: 'rgba(255,255,255,0.6)' }}>ยอดชำระ</Text>
                <div className="pos2-pay-total">฿{fmt(grandTotal)}</div>
              </div>
              {paymentMethod === 'cash' && receivedAmount >= grandTotal && (
                <div className="pos2-pay-change">
                  <Text size="sm" c="dimmed">เงินทอน</Text>
                  <Text size="xl" fw={800} c="green">฿{fmt(changeAmount)}</Text>
                </div>
              )}
            </div>
            {/* Right: methods */}
            <div>
              <Text fw={600} size="sm" mb="sm">ช่องทางชำระเงิน</Text>
              <SimpleGrid cols={2} spacing="sm">
                {[
                  { value: 'cash', label: 'เงินสด', icon: IconCash, color: '#059669' },
                  { value: 'transfer', label: 'โอนเงิน', icon: IconBuildingBank, color: '#2563eb' },
                  { value: 'credit_card', label: 'บัตรเครดิต', icon: IconCreditCard, color: '#7c3aed' },
                  { value: 'qr_code', label: 'QR Code', icon: IconQrcode, color: '#0891b2' },
                ].map(pm => (
                  <button key={pm.value}
                    className={`pos2-pm ${paymentMethod === pm.value ? 'active' : ''}`}
                    style={{ '--pm-color': pm.color } as React.CSSProperties}
                    onClick={() => { setPaymentMethod(pm.value); if (pm.value !== 'cash') setReceivedAmount(grandTotal) }}>
                    <pm.icon size={22} />
                    <span>{pm.label}</span>
                  </button>
                ))}
              </SimpleGrid>
              {paymentMethod === 'cash' && (
                <div style={{ marginTop: 16 }}>
                  <Text fw={600} size="sm" mb={8}>รับเงิน</Text>
                  <div className="pos2-qcash">
                    {quickCashAmounts.map(a => (
                      <button key={a} className={`pos2-qcash-btn ${receivedAmount === a ? 'active' : ''}`}
                        onClick={() => setReceivedAmount(a)}>฿{a}</button>
                    ))}
                    <button className={`pos2-qcash-btn ${receivedAmount === Math.ceil(grandTotal) ? 'active' : ''}`}
                      onClick={() => setReceivedAmount(Math.ceil(grandTotal))}>พอดี</button>
                  </div>
                  <NumberInput size="md" placeholder="จำนวนเงินที่รับ" min={0} decimalScale={2}
                    value={receivedAmount || ''} onChange={v => setReceivedAmount(Number(v) || 0)}
                    leftSection={<IconCash size={18} />}
                    styles={{ input: { fontSize: 18, fontWeight: 700 } }} />
                </div>
              )}
            </div>
          </div>
          <div className="pos2-pay-foot">
            <Button variant="subtle" color="gray" onClick={() => setShowPayment(false)}>ยกเลิก</Button>
            <Button size="lg" disabled={!paymentMethod || (paymentMethod === 'cash' && receivedAmount < grandTotal)}
              loading={saleMutation.isPending} onClick={handleCheckout}
              leftSection={<IconCheck size={20} />}
              className="pos2-pay-confirm">ยืนยันชำระเงิน</Button>
          </div>
        </div>
      </Modal>

      {/* ======== SERVICE MODAL ======== */}
      <Modal opened={showServicePopover} onClose={() => setShowServicePopover(false)}
        title="เพิ่มค่าแรง / ค่าบริการ" size="sm" centered>
        <Stack gap="sm">
          <TextInput size="sm" placeholder="เช่น ค่าแรงติดตั้ง, ค่าบริการซ่อม" label="รายการ"
            value={serviceName} onChange={e => setServiceName(e.target.value)} />
          <NumberInput size="sm" placeholder="0.00" min={0} decimalScale={2} label="ราคา (บาท)"
            prefix="฿" thousandSeparator="," value={servicePrice || ''}
            onChange={v => setServicePrice(Number(v) || 0)} />
          <Button fullWidth size="md" color="teal" leftSection={<IconPlus size={16} />}
            disabled={!serviceName.trim() || servicePrice <= 0} onClick={addServiceItem}>
            เพิ่มรายการ
          </Button>
        </Stack>
      </Modal>

      {/* ======== RECEIPT MODAL ======== */}
      <Modal opened={showReceipt} onClose={() => setShowReceipt(false)} title={null}
        size="sm" centered withCloseButton={false} radius="lg"
        overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}>
        {lastReceipt && (
          <div style={{ padding: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0 16px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#059669,#10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(16,185,129,0.3)' }}>
                <IconCheck size={28} color="white" />
              </div>
              <Text fw={800} size="lg" mt="sm">ชำระเงินสำเร็จ!</Text>
            </div>
            <div style={{ background: 'var(--app-surface-light)', borderRadius: 12, padding: 16 }}>
              <Group justify="space-between" py={4}><Text c="dimmed" size="sm">เลขที่บิล</Text><Text fw={700} size="sm">{lastReceipt.invoiceNumber}</Text></Group>
              <Group justify="space-between" py={4} style={{ borderTop: '1px solid var(--app-border-light)' }}><Text c="dimmed" size="sm">ยอดสุทธิ</Text><Text fw={700} size="sm" c="green">฿{fmt(lastReceipt.netAmount)}</Text></Group>
              {lastReceipt.changeAmount > 0 && (
                <Group justify="space-between" py={4} style={{ borderTop: '1px solid var(--app-border-light)' }}><Text c="dimmed" size="sm">เงินทอน</Text><Text fw={700} size="sm" c="blue">฿{fmt(lastReceipt.changeAmount)}</Text></Group>
              )}
            </div>
            <Group grow mt="lg">
              <Button variant="light" size="md" onClick={() => setShowReceipt(false)}>ปิด</Button>
              <Button leftSection={<IconPrinter size={16} />} color="indigo" size="md"
                onClick={() => {
                  const pc = receiptRef.current; if (!pc) return
                  const pw = window.open('', '_blank', 'width=320,height=600'); if (!pw) return
                  pw.document.write(`<!DOCTYPE html><html><head><title>ใบเสร็จ ${lastReceipt.invoiceNumber}</title><style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Sarabun',sans-serif;width:80mm;margin:0 auto;padding:4mm;color:#222;font-size:13px}.receipt-header{text-align:center;margin-bottom:8px;padding-bottom:8px;border-bottom:2px dashed #888}.receipt-header h1{font-size:18px;font-weight:700;margin-bottom:2px}.receipt-header p{font-size:11px;color:#555}.receipt-info{font-size:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed #aaa}.receipt-info div{display:flex;justify-content:space-between;padding:1px 0}.receipt-items{width:100%;border-collapse:collapse;margin-bottom:8px;font-size:12px}.receipt-items th{text-align:left;border-bottom:1px solid #555;padding:4px 0;font-size:11px}.receipt-items th:last-child,.receipt-items td:last-child{text-align:right}.receipt-items td{padding:3px 0;border-bottom:1px dotted #ddd}.receipt-totals{border-top:2px dashed #888;padding-top:6px;margin-bottom:8px;font-size:13px}.receipt-totals div{display:flex;justify-content:space-between;padding:2px 0}.receipt-totals .grand-total{font-size:18px;font-weight:700;padding:4px 0;border-top:1px solid #333;margin-top:4px}.receipt-payment{border-top:1px dashed #aaa;padding-top:6px;margin-bottom:10px;font-size:12px}.receipt-payment div{display:flex;justify-content:space-between;padding:1px 0}.receipt-footer{text-align:center;font-size:11px;color:#555;padding-top:8px;border-top:2px dashed #888}.receipt-footer p{margin:2px 0}@media print{@page{size:80mm auto;margin:0}body{width:80mm}}</style></head><body>${pc.innerHTML}</body></html>`)
                  pw.document.close(); pw.focus()
                  setTimeout(() => { pw.print(); pw.close() }, 400)
                }}>พิมพ์ใบเสร็จ</Button>
            </Group>
          </div>
        )}
      </Modal>

      {/* Hidden Receipt Template */}
      {lastReceipt && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={receiptRef}>
            <div className="receipt-header"><h1>{lastReceipt.companyName}</h1><p>ใบเสร็จรับเงิน / Receipt</p></div>
            <div className="receipt-info">
              <div><span>เลขที่:</span><span>{lastReceipt.invoiceNumber}</span></div>
              <div><span>วันที่:</span><span>{new Date(lastReceipt.soldAt).toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'})} {new Date(lastReceipt.soldAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</span></div>
              <div><span>แคชเชียร์:</span><span>{lastReceipt.cashierName}</span></div>
              {lastReceipt.customerName && <div><span>ลูกค้า:</span><span>{lastReceipt.customerName}</span></div>}
            </div>
            <table className="receipt-items">
              <thead><tr><th>รายการ</th><th>จน.</th><th>รวม</th></tr></thead>
              <tbody>{lastReceipt.items?.map((item: any, i: number) => (
                <tr key={i}><td>{item.name}<br/><span style={{fontSize:10,color:'#888'}}>@฿{fmt(item.unitPrice)}</span></td><td>{item.quantity}</td><td>{fmt(item.unitPrice*item.quantity-(item.discount||0))}</td></tr>
              ))}</tbody>
            </table>
            <div className="receipt-totals">
              <div><span>ยอดรวม</span><span>฿{fmt(lastReceipt.totalAmount)}</span></div>
              {lastReceipt.discountAmount > 0 && <div><span>ส่วนลด</span><span>-฿{fmt(lastReceipt.discountAmount)}</span></div>}
              {lastReceipt.vatEnabled && lastReceipt.vatAmount > 0 && <div><span>VAT</span><span>฿{fmt(lastReceipt.vatAmount)}</span></div>}
              <div className="grand-total"><span>ยอดสุทธิ</span><span>฿{fmt(lastReceipt.netAmount)}</span></div>
            </div>
            <div className="receipt-payment">
              <div><span>ชำระโดย</span><span>{{cash:'เงินสด',transfer:'โอนเงิน',credit_card:'บัตรเครดิต',qr_code:'QR Code'}[lastReceipt.paymentMethod as string]||lastReceipt.paymentMethod}</span></div>
              {lastReceipt.paymentMethod==='cash'&&lastReceipt.receivedAmount>0&&(<><div><span>รับเงิน</span><span>฿{fmt(lastReceipt.receivedAmount)}</span></div><div style={{fontWeight:700}}><span>เงินทอน</span><span>฿{fmt(lastReceipt.changeAmount)}</span></div></>)}
            </div>
            <div className="receipt-footer"><p style={{fontWeight:700}}>ขอบคุณที่ใช้บริการ</p><p>Thank you & See you again!</p><p style={{marginTop:6,fontSize:10}}>Powered by Bookdee POS</p></div>
          </div>
        </div>
      )}

      {/* ======== HELD ORDERS MODAL ======== */}
      <Modal opened={showHeld} onClose={() => setShowHeld(false)} title={`บิลที่พัก (${heldOrders.length})`} size="md" centered>
        <Stack gap="sm">
          {heldOrders.length === 0 ? <Text ta="center" c="dimmed" py="xl">ไม่มีบิลที่พัก</Text> : (
            heldOrders.map(h => (
              <div key={h.id} className="pos-held-card" onClick={() => resumeOrder(h)}>
                <div className="pos-held-info">
                  <Text fw={700} size="sm">{h.label}</Text>
                  <Group gap="xs"><IconClock size={12} color="var(--app-text-muted)" /><Text size="xs" c="dimmed">{h.items.length} รายการ - {new Date(h.heldAt).toLocaleTimeString('th-TH')}</Text></Group>
                </div>
                <Group gap="sm">
                  <Text fw={700} c="green" size="sm">฿{fmt(h.items.reduce((s,i) => s+i.unitPrice*i.quantity,0))}</Text>
                  <ActionIcon size="sm" variant="light" color="red" onClick={e => { e.stopPropagation(); setHeldOrders(prev => prev.filter(x => x.id !== h.id)) }}><IconTrash size={14} /></ActionIcon>
                </Group>
              </div>
            ))
          )}
        </Stack>
      </Modal>
    </>
  )
}
