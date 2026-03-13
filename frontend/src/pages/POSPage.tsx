import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, ActionIcon, Stack, Badge, Loader, Select,
  NumberInput, Modal, Divider, SimpleGrid, Kbd, Tooltip
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconMinus, IconTrash, IconSearch, IconCash, IconBarcode,
  IconUser, IconPlayerPause, IconPlayerPlay, IconX, IconCheck, IconReceipt,
  IconPercentage, IconCreditCard, IconQrcode, IconBuildingBank, IconTool
} from '@tabler/icons-react'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import api from '../services/api'

interface CartItem {
  productId: number; name: string; sku: string
  unitPrice: number; quantity: number; discount: number
  isService?: boolean
}

interface HeldOrder {
  id: number; label: string; items: CartItem[]; customerId: string; heldAt: Date
}

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
  const queryClient = useQueryClient()

  // === Data Queries ===
  const { data: companySettings } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
    staleTime: 1000 * 60 * 5, // cache 5 min
  })

  const vatEnabled = companySettings?.settings?.vat_enabled !== false
  const vatRate = (companySettings?.settings?.vat_rate ?? 7) / 100

  const { data: products, isLoading } = useQuery({
    queryKey: ['pos-products', search],
    queryFn: () => api.get('/products', { params: { search, active: 'true' } }).then(r => r.data),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories').then(r => r.data),
  })

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/sales/customers').then(r => r.data),
  })

  // === Sale Mutation ===
  const saleMutation = useMutation({
    mutationFn: (data: any) => api.post('/sales', data),
    onSuccess: (res) => {
      setLastReceipt(res.data)
      setShowReceipt(true)
      setShowPayment(false)
      setCart([])
      setCustomerId('')
      setReceivedAmount(0)
      setPaymentMethod(null)
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)

  // === Computed (VAT linked to Settings) ===
  const filteredProducts = activeCategory === 'all'
    ? products
    : products?.filter((p: any) => String(p.category_id) === activeCategory)

  const itemSubtotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0)
  const itemDiscountTotal = cart.reduce((sum, c) => sum + (c.discount || 0), 0)
  const afterItemDiscount = itemSubtotal - itemDiscountTotal
  const billDiscountAmount = billDiscountType === 'percent'
    ? afterItemDiscount * (billDiscount / 100)
    : billDiscount
  const subtotal = afterItemDiscount - billDiscountAmount
  const totalDiscount = itemDiscountTotal + billDiscountAmount
  const vatAmount = vatEnabled ? subtotal * vatRate : 0
  const grandTotal = subtotal + vatAmount
  const changeAmount = receivedAmount - grandTotal

  // === Cart Actions ===
  const addToCart = useCallback((p: any) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === p.id)
      if (existing) {
        return prev.map((c) => c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, {
        productId: p.id, name: p.name, sku: p.sku,
        unitPrice: parseFloat(p.selling_price), quantity: 1,
        discount: 0,
      }]
    })
  }, [])

  const updateQty = (productId: number, newQty: number) => {
    if (newQty <= 0) { removeItem(productId); return }
    setCart((prev) => prev.map((c) => c.productId === productId ? { ...c, quantity: newQty } : c))
  }

  const updateDiscount = (productId: number, discount: number) => {
    setCart((prev) => prev.map((c) => c.productId === productId ? { ...c, discount } : c))
  }

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId))
  }

  const addServiceItem = () => {
    if (!serviceName.trim() || servicePrice <= 0) {
      notifications.show({ title: 'กรุณากรอกข้อมูลให้ครบ', message: 'ระบุชื่อบริการและราคา', color: 'yellow' })
      return
    }
    const serviceId = -(Date.now()) // negative ID to distinguish from products
    setCart((prev) => [...prev, {
      productId: serviceId, name: serviceName.trim(), sku: 'บริการ',
      unitPrice: servicePrice, quantity: 1,
      discount: 0,
      isService: true,
    }])
    setServiceName('')
    setServicePrice(0)
    setShowServicePopover(false)
    notifications.show({ title: '🔧 เพิ่มค่าบริการ', message: serviceName.trim(), color: 'teal', autoClose: 1500 })
  }

  const clearCart = () => { setCart([]); setCustomerId(''); setReceivedAmount(0); setPaymentMethod(null); setBillDiscount(0); setBillDiscountType('baht') }

  // === Hold/Resume ===
  const holdOrder = () => {
    if (cart.length === 0) return
    const newHeld: HeldOrder = {
      id: Date.now(), label: `บิลพัก #${heldOrders.length + 1}`,
      items: [...cart], customerId, heldAt: new Date(),
    }
    setHeldOrders((prev) => [...prev, newHeld])
    clearCart()
    notifications.show({ title: '⏸️ พักบิลแล้ว', message: newHeld.label, color: 'yellow', autoClose: 2000 })
  }

  const resumeOrder = (held: HeldOrder) => {
    setCart(held.items)
    setCustomerId(held.customerId)
    setHeldOrders((prev) => prev.filter((h) => h.id !== held.id))
    setShowHeld(false)
    notifications.show({ title: '▶️ เรียกบิลกลับ', message: held.label, color: 'blue', autoClose: 2000 })
  }

  // === Barcode Scanner ===
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    try {
      const res = await api.get('/products', { params: { search: barcode, active: 'true' } })
      const matched = res.data
      const exact = matched.find((p: any) => p.barcode === barcode || p.sku === barcode)
      if (exact) {
        addToCart(exact)
        notifications.show({ title: '🔊 สแกนสำเร็จ', message: `${exact.name}`, color: 'teal', autoClose: 1500 })
      } else if (matched.length > 0) {
        addToCart(matched[0])
      } else {
        notifications.show({ title: '❌ ไม่พบสินค้า', message: `บาร์โค้ด: ${barcode}`, color: 'red' })
      }
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
      notifications.show({ title: 'จำนวนเงินไม่พอ', message: 'กรุณาใส่จำนวนเงินที่รับ', color: 'red' })
      return
    }
    saleMutation.mutate({
      items: cart.map(c => ({
        productId: c.isService ? null : c.productId,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        discount: c.discount || 0,
        isService: c.isService || false,
        serviceName: c.isService ? c.name : undefined,
      })),
      paymentMethod,
      customerId: customerId || undefined,
      discountAmount: totalDiscount,
      receivedAmount: paymentMethod === 'cash' ? receivedAmount : grandTotal,
    })
  }

  // === Quick Cash Buttons ===
  const quickCashAmounts = [20, 50, 100, 500, 1000]

  return (
    <>
      <div className="pos-layout">
        {/* === LEFT: Products === */}
        <div className="pos-products">
          {/* Search + Scanner Status */}
          <Group gap="sm" mb="sm">
            <TextInput ref={searchRef} placeholder="ค้นหาสินค้า (ชื่อ, SKU, Barcode)  [F1]"
              leftSection={<IconSearch size={16} />} value={search}
              onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} size="md" />
            <Tooltip label={lastScanned ? `ล่าสุด: ${lastScanned}` : 'ต่อเครื่องสแกนบาร์โค้ด USB'}>
              <div className={`scanner-badge ${lastScanned ? 'scanned' : ''}`}>
                <IconBarcode size={18} />
              </div>
            </Tooltip>
          </Group>

          {/* Category Tabs */}
          <div className="category-tabs" style={{ marginBottom: 16 }}>
            <button className={`category-tab ${activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => setActiveCategory('all')}>
              ทั้งหมด
            </button>
            {categories?.map((cat: any) => (
              <button key={cat.id}
                className={`category-tab ${activeCategory === String(cat.id) ? 'active' : ''}`}
                onClick={() => setActiveCategory(String(cat.id))}>
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
            <div className="product-grid">
              {filteredProducts?.map((p: any) => {
                const stock = parseInt(p.total_stock) || 0
                const outOfStock = stock <= 0
                return (
                  <div key={p.id}
                    className={`product-card ${outOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => !outOfStock && addToCart(p)}>
                    <div className="product-card-img">
                      {p.category_name && (
                        <span className="product-card-cat">{p.category_name}</span>
                      )}
                    </div>
                    <div className="product-card-body">
                      <div className="product-card-name">{p.name}</div>
                      <div className="product-card-price">฿{fmt(parseFloat(p.selling_price))}</div>
                      <div className="product-card-stock">
                        {outOfStock ? (
                          <Badge color="red" variant="filled" size="xs">หมดสต๊อก</Badge>
                        ) : (
                          <span>คงเหลือ {stock} {p.unit}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredProducts?.length === 0 && (
                <Text c="dimmed" ta="center" py="xl" style={{ gridColumn: '1 / -1' }}>ไม่พบสินค้า</Text>
              )}
            </div>
          )}

          {/* === Service Items Section === */}
          <Divider my="sm" label="🔧 ค่าแรง / ค่าบริการ" labelPosition="left" />
          <div className="product-grid">
            <div
              className="product-card"
              style={{ cursor: 'pointer', borderColor: 'rgba(20,184,166,0.3)', background: 'rgba(20,184,166,0.04)' }}
              onClick={() => setShowServicePopover(true)}
            >
              <div className="product-card-img" style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.15), rgba(20,184,166,0.05))' }}>
                <IconTool size={28} color="#14b8a6" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
              </div>
              <div className="product-card-body">
                <div className="product-card-name" style={{ color: '#14b8a6' }}>+ เพิ่มค่าแรง / ค่าบริการ</div>
                <div className="product-card-stock"><span style={{ color: '#14b8a6' }}>คลิกเพื่อกรอกรายการ</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* === RIGHT: Cart === */}
        <div className="pos-cart">
          {/* Customer + Actions */}
          <div className="pos-cart-header">
            <Group justify="space-between" mb={8}>
              <Text fw={700} size="lg">🛒 ตะกร้า</Text>
              <Group gap={4}>
                <Tooltip label="พักบิล [F3]">
                  <ActionIcon size="md" variant="light" color="yellow" onClick={holdOrder} disabled={cart.length === 0}>
                    <IconPlayerPause size={16} />
                  </ActionIcon>
                </Tooltip>
                {heldOrders.length > 0 && (
                  <Tooltip label={`เรียกบิลพัก (${heldOrders.length})`}>
                    <ActionIcon size="md" variant="light" color="blue" onClick={() => setShowHeld(true)} style={{ position: 'relative' }}>
                      <IconPlayerPlay size={16} />
                      <Badge size="xs" color="red" variant="filled" style={{
                        position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16,
                        padding: '0 4px', fontSize: 10,
                      }}>{heldOrders.length}</Badge>
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip label="ล้างตะกร้า [Esc]">
                  <ActionIcon size="md" variant="light" color="red" onClick={clearCart} disabled={cart.length === 0}>
                    <IconX size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            <Select size="xs" placeholder="👤 ลูกค้าทั่วไป (Walk-in)" clearable searchable
              leftSection={<IconUser size={14} />}
              data={(customers || []).map((c: any) => ({
                value: String(c.id), label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
              }))}
              value={customerId} onChange={(v) => setCustomerId(v || '')}
            />
          </div>

          {/* Cart Items */}
          <div className="pos-cart-items">
            {cart.length === 0 ? (
              <Stack align="center" justify="center" h="100%" gap="xs" opacity={0.4}>
                <IconBarcode size={48} />
                <Text size="sm" fw={500}>ยังไม่มีสินค้า</Text>
                <Text size="xs">คลิกสินค้า หรือ สแกนบาร์โค้ด</Text>
              </Stack>
            ) : (
              cart.map((item) => {
                const lineTotal = item.unitPrice * item.quantity
                const afterDisc = lineTotal - (item.discount || 0)
                return (
                  <div key={item.productId} style={{
                    border: '1px solid var(--app-border, #e5e7eb)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    marginBottom: 8,
                    background: item.isService ? 'rgba(20,184,166,0.03)' : 'var(--app-surface, #fff)',
                  }}>
                    {/* Row 1: Name + Delete */}
                    <Group justify="space-between" mb={6}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Group gap={4} wrap="nowrap">
                          {item.isService && <Badge size="xs" color="teal" variant="light">🔧 บริการ</Badge>}
                          <Text size="sm" fw={600} truncate>{item.name}</Text>
                        </Group>
                        <Text size="xs" c="dimmed">฿{fmt(item.unitPrice)} / ชิ้น</Text>
                      </div>
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeItem(item.productId)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                    {/* Row 2: Qty + Discount + Total */}
                    <Group justify="space-between" align="center">
                      <Group gap={4}>
                        <ActionIcon size="xs" variant="light" onClick={() => updateQty(item.productId, item.quantity - 1)}>
                          <IconMinus size={10} />
                        </ActionIcon>
                        <NumberInput size="xs" w={44} min={1} hideControls value={item.quantity}
                          onChange={(v) => updateQty(item.productId, Number(v) || 1)}
                          styles={{ input: { textAlign: 'center', padding: '2px 4px', fontWeight: 600 } }} />
                        <ActionIcon size="xs" variant="light" onClick={() => updateQty(item.productId, item.quantity + 1)}>
                          <IconPlus size={10} />
                        </ActionIcon>
                      </Group>
                      <Group gap={4}>
                        <Text size="xs" c="dimmed">ส่วนลด</Text>
                        <NumberInput size="xs" w={64} min={0} hideControls placeholder="฿0"
                          prefix="฿" value={item.discount || ''}
                          onChange={(v) => updateDiscount(item.productId, Number(v) || 0)}
                          styles={{ input: { padding: '2px 6px', fontSize: 12 } }} />
                      </Group>
                      <Text size="sm" fw={700} style={{ minWidth: 70, textAlign: 'right' }}>
                        ฿{fmt(afterDisc)}
                      </Text>
                    </Group>
                  </div>
                )
              })
            )}
          </div>

          {/* Totals + Payment */}
          <div className="pos-cart-footer">
            {/* Bill-level discount */}
            {cart.length > 0 && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.04)',
                borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.15)',
                marginBottom: 8,
              }}>
                <Group justify="space-between" align="center">
                  <Text size="xs" fw={600} c="red.7">🏷️ ส่วนลดทั้งบิล</Text>
                  <Group gap={4}>
                    <NumberInput size="xs" w={80} min={0} hideControls
                      placeholder={billDiscountType === 'percent' ? '%' : '฿0'}
                      prefix={billDiscountType === 'baht' ? '฿' : ''}
                      suffix={billDiscountType === 'percent' ? '%' : ''}
                      value={billDiscount || ''}
                      onChange={(v) => setBillDiscount(Number(v) || 0)}
                      styles={{ input: { padding: '2px 6px', fontSize: 12, fontWeight: 600 } }} />
                    <ActionIcon size="xs" variant={billDiscountType === 'percent' ? 'filled' : 'light'}
                      color="red" onClick={() => setBillDiscountType(billDiscountType === 'baht' ? 'percent' : 'baht')}>
                      <IconPercentage size={10} />
                    </ActionIcon>
                  </Group>
                </Group>
                {billDiscountAmount > 0 && (
                  <Text size="xs" c="red.6" ta="right" mt={2}>-฿{fmt(billDiscountAmount)}</Text>
                )}
              </div>
            )}

            <div className="cart-totals">
              <div className="cart-total-row">
                <span>ยอดรวม ({cart.length} รายการ)</span>
                <span>฿{fmt(itemSubtotal)}</span>
              </div>
              {itemDiscountTotal > 0 && (
                <div className="cart-total-row discount">
                  <span>ส่วนลดรายการ</span>
                  <span>-฿{fmt(itemDiscountTotal)}</span>
                </div>
              )}
              {billDiscountAmount > 0 && (
                <div className="cart-total-row discount">
                  <span>ส่วนลดทั้งบิล {billDiscountType === 'percent' ? `(${billDiscount}%)` : ''}</span>
                  <span>-฿{fmt(billDiscountAmount)}</span>
                </div>
              )}
              {vatEnabled && (
                <div className="cart-total-row">
                  <span>VAT {(vatRate * 100).toFixed(0)}%</span>
                  <span>฿{fmt(vatAmount)}</span>
                </div>
              )}
              <Divider my={4} />
              <div className="cart-total-row grand">
                <span>ยอดสุทธิ</span>
                <span>฿{fmt(grandTotal)}</span>
              </div>
            </div>
            <Button fullWidth size="lg" disabled={cart.length === 0}
              onClick={() => setShowPayment(true)}
              leftSection={<IconCash size={20} />}
              style={{ background: cart.length > 0 ? 'linear-gradient(135deg, #059669, #047857)' : undefined }}>
              ชำระเงิน ฿{fmt(grandTotal)} [F2]
            </Button>
          </div>
        </div>
      </div>

      {/* === Payment Modal === */}
      <Modal opened={showPayment} onClose={() => setShowPayment(false)} title="💳 ชำระเงิน" size="md" centered>
        <Stack gap="md">
          <div className="cart-totals" style={{ background: 'var(--app-surface-light)', padding: 16, borderRadius: 12 }}>
            <div className="cart-total-row grand" style={{ margin: 0 }}>
              <span>ยอดชำระ</span>
              <span>฿{fmt(grandTotal)}</span>
            </div>
          </div>
          <Text fw={600} size="sm">เลือกช่องทางชำระ</Text>
          <SimpleGrid cols={2} spacing="sm">
            {[
              { value: 'cash', label: 'เงินสด', icon: IconCash, color: '#059669' },
              { value: 'transfer', label: 'โอนเงิน', icon: IconBuildingBank, color: '#2563eb' },
              { value: 'credit_card', label: 'บัตรเครดิต', icon: IconCreditCard, color: '#7c3aed' },
              { value: 'qr_code', label: 'QR Code', icon: IconQrcode, color: '#0891b2' },
            ].map((pm) => (
              <button key={pm.value}
                className={`payment-btn ${paymentMethod === pm.value ? 'active' : ''}`}
                style={{ '--pm-color': pm.color } as React.CSSProperties}
                onClick={() => { setPaymentMethod(pm.value); if (pm.value !== 'cash') setReceivedAmount(grandTotal) }}>
                <pm.icon size={24} />
                <span>{pm.label}</span>
              </button>
            ))}
          </SimpleGrid>

          {paymentMethod === 'cash' && (
            <Stack gap="sm">
              <Text fw={600} size="sm">รับเงิン</Text>
              <Group gap="xs">
                {quickCashAmounts.map((amt) => (
                  <Button key={amt} size="xs" variant={receivedAmount === amt ? 'filled' : 'light'}
                    onClick={() => setReceivedAmount(amt)}>
                    ฿{amt}
                  </Button>
                ))}
              </Group>
              <NumberInput size="md" placeholder="จำนวนเงินที่รับ" min={0} decimalScale={2}
                value={receivedAmount || ''} onChange={(v) => setReceivedAmount(Number(v) || 0)}
                leftSection={<IconCash size={18} />}
                styles={{ input: { fontSize: 18, fontWeight: 700 } }} />
              {receivedAmount >= grandTotal && (
                <div style={{
                  background: 'rgba(5,150,105,0.08)', border: '2px solid var(--app-success)',
                  borderRadius: 12, padding: 16, textAlign: 'center',
                }}>
                  <Text size="sm" c="dimmed">เงินทอน</Text>
                  <Text size="xl" fw={800} c="green">฿{fmt(changeAmount)}</Text>
                </div>
              )}
            </Stack>
          )}

          <Button fullWidth size="lg" disabled={!paymentMethod || (paymentMethod === 'cash' && receivedAmount < grandTotal)}
            loading={saleMutation.isPending} onClick={handleCheckout}
            leftSection={<IconCheck size={20} />}
            style={{ background: paymentMethod ? 'linear-gradient(135deg, #059669, #047857)' : undefined }}>
            ยืนยันชำระเงิน
          </Button>
        </Stack>
      </Modal>

      {/* === Service Item Modal === */}
      <Modal opened={showServicePopover} onClose={() => setShowServicePopover(false)}
        title="🔧 เพิ่มค่าแรง / ค่าบริการ" size="sm" centered>
        <Stack gap="sm">
          <TextInput size="sm" placeholder="เช่น ค่าแรงติดตั้ง, ค่าบริการซ่อม, ค่าขนส่ง"
            label="รายการ" value={serviceName}
            onChange={(e) => setServiceName(e.target.value)} />
          <NumberInput size="sm" placeholder="0.00" min={0} decimalScale={2}
            label="ราคา (บาท)" prefix="฿" thousandSeparator=","
            value={servicePrice || ''}
            onChange={(v) => setServicePrice(Number(v) || 0)} />
          <Button fullWidth size="md" color="teal" leftSection={<IconPlus size={16} />}
            disabled={!serviceName.trim() || servicePrice <= 0}
            onClick={addServiceItem}>
            เพิ่มรายการค่าบริการ
          </Button>
        </Stack>
      </Modal>

      {/* === Receipt Modal === */}
      <Modal opened={showReceipt} onClose={() => setShowReceipt(false)} title="🧾 สรุปบิล" size="sm" centered>
        {lastReceipt && (
          <Stack gap="md" ta="center">
            <div style={{ background: 'rgba(5,150,105,0.06)', borderRadius: 12, padding: 20 }}>
              <IconCheck size={48} color="var(--app-success)" style={{ margin: '0 auto 8px' }} />
              <Text fw={800} size="lg">ชำระเงินสำเร็จ!</Text>
            </div>
            <Stack gap={4}>
              <Group justify="space-between"><Text c="dimmed">เลขที่บิล</Text><Text fw={600}>{lastReceipt.invoiceNumber}</Text></Group>
              <Group justify="space-between"><Text c="dimmed">ยอดสุทธิ</Text><Text fw={700} c="green">฿{fmt(lastReceipt.netAmount)}</Text></Group>
              {lastReceipt.changeAmount > 0 && (
                <Group justify="space-between"><Text c="dimmed">เงินทอน</Text><Text fw={700} c="blue">฿{fmt(lastReceipt.changeAmount)}</Text></Group>
              )}
            </Stack>
            <Button fullWidth variant="light" onClick={() => setShowReceipt(false)} leftSection={<IconReceipt size={16} />}>
              ปิด
            </Button>
          </Stack>
        )}
      </Modal>

      {/* === Held Orders Modal === */}
      <Modal opened={showHeld} onClose={() => setShowHeld(false)} title={`⏸️ บิลที่พัก (${heldOrders.length})`} size="md" centered>
        <Stack gap="sm">
          {heldOrders.length === 0 ? (
            <Text ta="center" c="dimmed" py="xl">ไม่มีบิลที่พัก</Text>
          ) : (
            heldOrders.map((held) => (
              <div key={held.id} className="stat-card" style={{ cursor: 'pointer', padding: 12 }}
                onClick={() => resumeOrder(held)}>
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{held.label}</Text>
                    <Text size="xs" c="dimmed">{held.items.length} รายการ • {new Date(held.heldAt).toLocaleTimeString('th-TH')}</Text>
                  </div>
                  <Group gap={4}>
                    <Text fw={700} c="green">
                      ฿{fmt(held.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}
                    </Text>
                    <ActionIcon size="sm" variant="light" color="red"
                      onClick={(e) => { e.stopPropagation(); setHeldOrders(prev => prev.filter(h => h.id !== held.id)) }}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              </div>
            ))
          )}
        </Stack>
      </Modal>

      {/* Keyboard Shortcuts Legend */}
      <div className="pos-shortcuts">
        <Kbd size="xs">F1</Kbd> ค้นหา
        <Kbd size="xs">F2</Kbd> ชำระ
        <Kbd size="xs">F3</Kbd> พักบิล
        <Kbd size="xs">Esc</Kbd> ล้าง
      </div>
    </>
  )
}
