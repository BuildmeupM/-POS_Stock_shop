import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Button, Group, Text, ActionIcon, Stack, Badge, Loader, Select,
  NumberInput, Modal, SimpleGrid, Kbd, Tooltip, ScrollArea, UnstyledButton
} from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconMinus, IconTrash, IconSearch, IconCash, IconBarcode,
  IconUser, IconPlayerPause, IconPlayerPlay, IconX, IconCheck,
  IconPercentage, IconCreditCard, IconQrcode, IconBuildingBank, IconTool,
  IconPrinter, IconClock, IconShoppingCart, IconPackage, IconCategory, IconReceipt,
  IconWallet, IconStar, IconGift, IconCamera, IconCameraOff,
  IconFlame, IconHistory, IconHeart, IconHeartFilled, IconList, IconLayoutGrid,
  IconChevronRight, IconChevronDown, IconFilter, IconFilterOff
} from '@tabler/icons-react'
import { Html5Qrcode } from 'html5-qrcode'
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner'
import api from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

interface CartItem {
  productId: number; name: string; sku: string
  unitPrice: number; quantity: number; discount: number
  isService?: boolean
}

interface HeldOrder {
  id: number; label: string; items: CartItem[]; customerId: string; heldAt: Date
}

// Category color palette
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

// Wallet channel type → icon/color
const CHANNEL_TYPE_INFO: Record<string, { icon: any; color: string }> = {
  cash:         { icon: IconCash,         color: '#059669' },
  bank_account: { icon: IconBuildingBank,  color: '#2563eb' },
  promptpay:    { icon: IconQrcode,        color: '#6366f1' },
  credit_card:  { icon: IconCreditCard,    color: '#7c3aed' },
  e_wallet:     { icon: IconWallet,        color: '#0d9488' },
  transfer:     { icon: IconBuildingBank,   color: '#2563eb' },
  qr_code:      { icon: IconQrcode,        color: '#0891b2' },
  other:        { icon: IconCash,          color: '#6b7280' },
}

import { getBackendUrl } from '../../services/api'
const posBackendBase = getBackendUrl()

type QuickTab = 'all' | 'best-sellers' | 'recent' | 'favorites'
type ViewMode = 'grid' | 'list'

const PAGE_LIMIT = 50

export default function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch] = useDebouncedValue(search, 300)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [posAttrFilters, setPosAttrFilters] = useState<Record<number, string | null>>({})
  const [quickTab, setQuickTab] = useState<QuickTab>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [showCategorySidebar, setShowCategorySidebar] = useState(true)
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [paymentChannelId, setPaymentChannelId] = useState<number | null>(null)
  const [paymentChannelName, setPaymentChannelName] = useState<string>('')
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
  const [showRedeemModal, setShowRedeemModal] = useState(false)
  const [redeemPoints, setRedeemPoints] = useState<number>(0)
  const [loyaltyDiscount, setLoyaltyDiscount] = useState<number>(0)
  const [selectedCustomerInfo, setSelectedCustomerInfo] = useState<{ points_balance?: number; price_level?: string; contact_id?: number } | null>(null)
  const [overridePending, setOverridePending] = useState<{ productId: number; discount: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const receiptRef = useRef<HTMLDivElement>(null)
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const { user, activeCompany } = useAuthStore()
  const navigate = useNavigate()

  // Camera Scanner
  const [cameraOpen, setCameraOpen] = useState(false)
  const cameraRef = useRef<Html5Qrcode | null>(null)
  const cameraDivId = 'pos-camera-scanner'

  // === Data Queries ===
  const { data: companySettings } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })
  const vatEnabled = companySettings?.settings?.vat_enabled !== false
  const vatRate = (companySettings?.settings?.vat_rate ?? 7) / 100

  // Build server-side filter params
  const attrValueIdsParam = useMemo(() => {
    const ids: number[] = []
    if (activeCategory !== 'all') ids.push(Number(activeCategory))
    Object.entries(posAttrFilters).forEach(([, v]) => { if (v) ids.push(Number(v)) })
    return ids.length > 0 ? ids.join(',') : undefined
  }, [activeCategory, posAttrFilters])

  // === INFINITE SCROLL: paginated products ===
  const {
    data: productsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['pos-products', debouncedSearch, attrValueIdsParam],
    queryFn: ({ pageParam = 1 }) =>
      api.get('/products', {
        params: {
          page: pageParam,
          limit: PAGE_LIMIT,
          search: debouncedSearch || undefined,
          active: 'true',
          attrValueIds: attrValueIdsParam,
        },
      }).then(r => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.pagination) return undefined
      const { page, totalPages } = lastPage.pagination
      return page < totalPages ? page + 1 : undefined
    },
    enabled: quickTab === 'all',
  })

  const allProducts = useMemo(() => {
    if (!productsData?.pages) return []
    return productsData.pages.flatMap(p => p.data || p)
  }, [productsData])

  // === Quick Tab queries ===
  const { data: bestSellers = [], isLoading: loadingBest } = useQuery({
    queryKey: ['pos-best-sellers'],
    queryFn: () => api.get('/pos-products/best-sellers', { params: { limit: 30 } }).then(r => r.data),
    staleTime: 1000 * 60 * 3,
    enabled: quickTab === 'best-sellers',
  })

  const { data: recentProducts = [], isLoading: loadingRecent } = useQuery({
    queryKey: ['pos-recent'],
    queryFn: () => api.get('/pos-products/recent', { params: { limit: 30 } }).then(r => r.data),
    staleTime: 1000 * 60 * 2,
    enabled: quickTab === 'recent',
  })

  const { data: favoriteProducts = [], isLoading: loadingFavs } = useQuery({
    queryKey: ['pos-favorites'],
    queryFn: () => api.get('/pos-products/favorites').then(r => r.data),
    staleTime: 1000 * 60 * 2,
    enabled: quickTab === 'favorites',
  })

  // Favorites mutation
  const addFavMutation = useMutation({
    mutationFn: (productId: number) => api.post('/pos-products/favorites', { productId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pos-favorites'] }),
  })
  const removeFavMutation = useMutation({
    mutationFn: (productId: number) => api.delete(`/pos-products/favorites/${productId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pos-favorites'] }),
  })

  const favoriteIds = useMemo(() => new Set((favoriteProducts || []).map((p: any) => p.id)), [favoriteProducts])
  const toggleFavorite = useCallback((productId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (favoriteIds.has(productId)) removeFavMutation.mutate(productId)
    else addFavMutation.mutate(productId)
  }, [favoriteIds, addFavMutation, removeFavMutation])

  // Current displayed products based on tab
  const displayProducts = useMemo(() => {
    if (quickTab === 'best-sellers') return bestSellers
    if (quickTab === 'recent') return recentProducts
    if (quickTab === 'favorites') return favoriteProducts
    return allProducts
  }, [quickTab, allProducts, bestSellers, recentProducts, favoriteProducts])

  const displayLoading = quickTab === 'all' ? isLoading
    : quickTab === 'best-sellers' ? loadingBest
    : quickTab === 'recent' ? loadingRecent
    : loadingFavs

  // Attribute groups & categories
  const { data: attributeGroups } = useQuery({
    queryKey: ['attribute-groups'],
    queryFn: () => api.get('/products/attribute-groups').then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const { data: walletChannels = [] } = useQuery({
    queryKey: ['wallet-active'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  })

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/sales/customers/all').then(r => r.data),
  })

  const firstAttrGroup = useMemo(() => {
    if (!attributeGroups || attributeGroups.length === 0) return null
    return attributeGroups[0]
  }, [attributeGroups])

  const attrCategoryValues = useMemo(() => {
    if (!firstAttrGroup) return []
    return (firstAttrGroup.values || []).map((v: any, i: number) => ({
      id: v.id,
      name: v.value,
      pal: CAT_PALETTE[i % CAT_PALETTE.length],
    }))
  }, [firstAttrGroup])

  // === Infinite scroll trigger ===
  useEffect(() => {
    if (quickTab !== 'all') return
    const el = gridAreaRef.current
    if (!el) return
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage()
      }
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [quickTab, hasNextPage, isFetchingNextPage, fetchNextPage])

  // === Sale Mutation ===
  const saleMutation = useMutation({
    mutationFn: (data: any) => api.post('/sales', data),
    onSuccess: (res) => {
      const customerName = customers?.find((c: any) => String(c.id) === customerId)?.name || ''
      setLastReceipt({
        ...res.data,
        saleId: res.data.id,
        items: cart.map(c => ({ ...c })),
        paymentMethod, receivedAmount,
        changeAmount: paymentMethod === 'cash' ? receivedAmount - res.data.netAmount : 0,
        customerName,
        companyName: activeCompany?.company_name || 'Bookdee POS',
        cashierName: user?.fullName || '',
        soldAt: new Date().toISOString(),
        vatEnabled, vatAmount: res.data.vatAmount,
        billDiscount: billDiscountAmount,
        paymentChannelName,
        pointsEarned: res.data.pointsEarned || 0,
        loyaltyDiscount,
        redeemPoints,
      })
      if (res.data.pointsEarned > 0) {
        notifications.show({
          title: 'สะสมแต้ม',
          message: `ลูกค้าได้รับ +${res.data.pointsEarned} แต้ม`,
          color: 'yellow',
          autoClose: 4000,
        })
      }
      setShowReceipt(true)
      setShowPayment(false)
      setCart([]); setCustomerId(''); setReceivedAmount(0); setPaymentMethod(null)
      setPaymentChannelId(null); setPaymentChannelName('')
      setBillDiscount(0); setBillDiscountType('baht')
      setLoyaltyDiscount(0); setRedeemPoints(0); setSelectedCustomerInfo(null)
      queryClient.resetQueries({ queryKey: ['pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['pos-recent'] })
      queryClient.invalidateQueries({ queryKey: ['pos-best-sellers'] })
      queryClient.invalidateQueries({ queryKey: ['pos-favorites'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })

  const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)

  // === Loyalty ===
  const loyaltySettings = companySettings?.settings || {}
  const pointsPerBaht = loyaltySettings.points_per_baht ?? 1
  const pointsValue = loyaltySettings.points_value ?? 1
  const minRedeemPoints = loyaltySettings.min_redeem_points ?? 100

  useEffect(() => {
    if (!customerId) {
      setSelectedCustomerInfo(null)
      setLoyaltyDiscount(0)
      setRedeemPoints(0)
      return
    }
    const found = (customers || []).find((c: any) => String(c.id) === customerId)
    if (found && found.source === 'contact') {
      setSelectedCustomerInfo({
        points_balance: found.points_balance || 0,
        price_level: found.price_level || 'retail',
        contact_id: found.contact_id,
      })
    } else {
      setSelectedCustomerInfo(null)
    }
    setLoyaltyDiscount(0)
    setRedeemPoints(0)
  }, [customerId, customers])

  const getCustomerPrice = useCallback((p: any): number => {
    const level = selectedCustomerInfo?.price_level
    if (level === 'wholesale' && p.wholesale_price) return parseFloat(p.wholesale_price)
    if (level === 'vip' && p.vip_price) return parseFloat(p.vip_price)
    return parseFloat(p.selling_price)
  }, [selectedCustomerInfo?.price_level])

  useEffect(() => {
    if (!allProducts || allProducts.length === 0 || cart.length === 0) return
    const level = selectedCustomerInfo?.price_level
    setCart(prev => prev.map(item => {
      if (item.isService) return item
      const product = allProducts.find((p: any) => p.id === item.productId)
      if (!product) return item
      let newPrice = parseFloat(product.selling_price)
      if (level === 'wholesale' && product.wholesale_price) newPrice = parseFloat(product.wholesale_price)
      if (level === 'vip' && product.vip_price) newPrice = parseFloat(product.vip_price)
      return { ...item, unitPrice: newPrice }
    }))
  }, [selectedCustomerInfo?.price_level, allProducts])

  // === Computed totals ===
  const itemSubtotal = cart.reduce((sum, c) => sum + c.unitPrice * c.quantity, 0)
  const itemDiscountTotal = cart.reduce((sum, c) => sum + (c.discount || 0), 0)
  const afterItemDiscount = itemSubtotal - itemDiscountTotal
  const billDiscountAmount = billDiscountType === 'percent'
    ? afterItemDiscount * (billDiscount / 100) : billDiscount
  const subtotal = afterItemDiscount - billDiscountAmount - loyaltyDiscount
  const totalDiscount = itemDiscountTotal + billDiscountAmount + loyaltyDiscount
  const vatAmount = vatEnabled ? subtotal * vatRate : 0
  const grandTotal = subtotal + vatAmount
  const changeAmount = receivedAmount - grandTotal

  // === Cart Actions ===
  const addToCart = useCallback((p: any) => {
    const stock = parseInt(p.total_stock) || 0
    const price = getCustomerPrice(p)
    setCart(prev => {
      const ex = prev.find(c => c.productId === p.id)
      const currentQty = ex ? ex.quantity : 0
      if (stock > 0 && currentQty + 1 > stock) {
        notifications.show({
          title: 'สต๊อกไม่พอ',
          message: `${p.name} เหลือเพียง ${stock} ชิ้นในคลัง`,
          color: 'orange', autoClose: 3000,
        })
        return prev
      }
      if (ex) return prev.map(c => c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [...prev, { productId: p.id, name: p.name, sku: p.sku, unitPrice: price, quantity: 1, discount: 0 }]
    })
  }, [getCustomerPrice])

  const updateQty = (pid: number, q: number) => {
    if (q <= 0) { removeItem(pid); return }
    // Check stock limit
    const prod = displayProducts.find((p: any) => p.id === pid)
    const stock = prod ? parseInt(prod.total_stock) || 0 : 0
    if (stock > 0 && q > stock) {
      notifications.show({
        title: 'สต๊อกไม่พอ',
        message: `${prod?.name || 'สินค้า'} เหลือเพียง ${stock} ชิ้นในคลัง`,
        color: 'orange', autoClose: 3000,
      })
      return
    }
    setCart(prev => prev.map(c => c.productId === pid ? { ...c, quantity: q } : c))
  }
  const updateDiscount = (pid: number, d: number) => {
    const item = cart.find(c => c.productId === pid)
    if (!item) return
    const prod = displayProducts.find((p: any) => p.id === pid)
    const minPrice = prod ? (parseFloat(prod.min_selling_price) || 0) : 0

    if (minPrice > 0) {
      const maxDisc = (item.unitPrice - minPrice) * item.quantity
      if (d > maxDisc) {
        const role = activeCompany?.role || ''
        if (role === 'owner' || role === 'admin') {
          setOverridePending({ productId: pid, discount: d })
          return
        }
        notifications.show({
          title: '⚠️ ราคาขั้นต่ำ',
          message: `ลดราคาสูงสุดได้ ฿${(maxDisc).toFixed(2)} (ราคาขั้นต่ำ ฿${minPrice.toFixed(2)}/ชิ้น)`,
          color: 'orange', autoClose: 3500,
        })
        setCart(prev => prev.map(c => c.productId === pid ? { ...c, discount: parseFloat(maxDisc.toFixed(2)) } : c))
        return
      }
    }
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

  const clearCart = () => { setCart([]); setCustomerId(''); setReceivedAmount(0); setPaymentMethod(null); setPaymentChannelId(null); setPaymentChannelName(''); setBillDiscount(0); setBillDiscountType('baht'); setLoyaltyDiscount(0); setRedeemPoints(0); setSelectedCustomerInfo(null) }

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
      const matched = Array.isArray(res.data) ? res.data : res.data.data || []
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

  // === Camera Scanner ===
  const startCamera = useCallback(async () => {
    setCameraOpen(true)
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode(cameraDivId)
        cameraRef.current = html5QrCode
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            handleBarcodeScan(decodedText)
            stopCamera()
          },
          () => {}
        )
      } catch (err) {
        console.error('Camera error:', err)
        notifications.show({ title: 'ไม่สามารถเปิดกล้อง', message: 'กรุณาอนุญาตการเข้าถึงกล้อง', color: 'red' })
        setCameraOpen(false)
      }
    }, 300)
  }, [handleBarcodeScan])

  const stopCamera = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stop().catch(() => {})
      cameraRef.current.clear()
      cameraRef.current = null
    }
    setCameraOpen(false)
  }, [])

  // === Checkout ===
  const handleCheckout = async () => {
    if (!paymentMethod || cart.length === 0) return
    if (paymentMethod === 'cash' && receivedAmount < grandTotal) {
      notifications.show({ title: 'จำนวนเงินไม่พอ', message: 'กรุณาใส่จำนวนเงินที่รับ', color: 'red' }); return
    }
    if (redeemPoints > 0 && selectedCustomerInfo?.contact_id) {
      try {
        await api.post('/loyalty/redeem', { contactId: selectedCustomerInfo.contact_id, points: redeemPoints })
      } catch (err: any) {
        notifications.show({ title: 'แลกแต้มไม่สำเร็จ', message: err.response?.data?.message || 'เกิดข้อผิดพลาด', color: 'red' })
        return
      }
    }
    saleMutation.mutate({
      items: cart.map(c => ({ productId: c.isService ? null : c.productId, quantity: c.quantity, unitPrice: c.unitPrice, discount: c.discount || 0, isService: c.isService || false, serviceName: c.isService ? c.name : undefined })),
      paymentMethod, paymentChannelId: paymentChannelId || undefined,
      customerId: customerId || undefined, discountAmount: totalDiscount,
      receivedAmount: paymentMethod === 'cash' ? receivedAmount : grandTotal,
    })
  }

  const quickCashAmounts = [20, 50, 100, 500, 1000]

  // Count active filters
  const activeFilterCount = Object.values(posAttrFilters).filter(Boolean).length + (activeCategory !== 'all' ? 1 : 0)

  // Product card renderer
  const renderProductCard = (p: any) => {
    const stock = parseInt(p.total_stock) || 0
    const outOfStock = stock <= 0
    const inCart = cart.find(c => c.productId === p.id)
    const firstAttrVal = firstAttrGroup
      ? (p.attributes || []).find((a: any) => a.groupId === firstAttrGroup.id)
      : null
    const matchedCat = firstAttrVal
      ? attrCategoryValues.find((c: any) => c.id === firstAttrVal.valueId)
      : null
    const pal = matchedCat?.pal || CAT_PALETTE[0]
    const catName = matchedCat?.name || ''
    const initial = p.name?.charAt(0)?.toUpperCase() || '?'
    const productImgUrl = p.image_url ? `${posBackendBase}${p.image_url}` : null
    const isFav = favoriteIds.has(p.id)

    if (viewMode === 'list') {
      return (
        <div key={p.id}
          className={`pos2-list-item ${outOfStock ? 'disabled' : ''} ${inCart ? 'in-cart' : ''}`}
          onClick={() => !outOfStock && addToCart(p)}>
          <div className="pos2-list-img" style={{ background: productImgUrl ? 'transparent' : pal.bg }}>
            {productImgUrl ? (
              <img src={productImgUrl} alt={p.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} loading="lazy" />
            ) : (
              <span style={{ fontSize: 18, fontWeight: 900, opacity: 0.35, color: pal.color }}>{initial}</span>
            )}
          </div>
          <div className="pos2-list-info">
            <div className="pos2-list-name">{p.name}</div>
            <div className="pos2-list-meta">
              {catName && <span className="pos2-card-cat" style={{ color: pal.color, background: pal.light }}>{catName}</span>}
              <span className="pos2-list-sku">{p.sku}</span>
              {stock > 0 && stock <= (p.min_stock || 5) && <Badge size="xs" color="orange" variant="light">เหลือน้อย</Badge>}
            </div>
          </div>
          <div className="pos2-list-right">
            <span className="pos2-card-price">฿{fmt(getCustomerPrice(p))}</span>
            {inCart && <Badge size="sm" circle color="indigo">{inCart.quantity}</Badge>}
            {outOfStock && <Badge size="xs" color="red">หมด</Badge>}
          </div>
          <ActionIcon size={24} variant="subtle" color={isFav ? 'red' : 'gray'}
            onClick={(e) => toggleFavorite(p.id, e)} style={{ flexShrink: 0 }}>
            {isFav ? <IconHeartFilled size={14} /> : <IconHeart size={14} />}
          </ActionIcon>
        </div>
      )
    }

    return (
      <div key={p.id}
        className={`pos2-card ${outOfStock ? 'disabled' : ''} ${inCart ? 'in-cart' : ''}`}
        onClick={() => !outOfStock && addToCart(p)}>
        <div className="pos2-card-img" style={{ background: productImgUrl ? 'transparent' : pal.bg }}>
          {productImgUrl ? (
            <img src={productImgUrl} alt={p.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} loading="lazy" />
          ) : (
            <span className="pos2-card-initial" style={{ color: pal.color }}>{initial}</span>
          )}
          {inCart && <span className="pos2-card-badge">{inCart.quantity}</span>}
          {outOfStock && <span className="pos2-card-oos">หมด</span>}
          <ActionIcon size={22} variant="subtle" color={isFav ? 'red' : 'gray'}
            className="pos2-card-fav"
            onClick={(e) => toggleFavorite(p.id, e)}>
            {isFav ? <IconHeartFilled size={13} /> : <IconHeart size={13} />}
          </ActionIcon>
        </div>
        <div className="pos2-card-info">
          <div className="pos2-card-name">{p.name}</div>
          <div className="pos2-card-bottom">
            <span className="pos2-card-price">฿{fmt(getCustomerPrice(p))}</span>
            {stock > 0 && <span className={`pos2-card-stock ${stock <= (p.min_stock || 5) ? 'low' : ''}`}>{stock} ชิ้น</span>}
            {catName && <span className="pos2-card-cat" style={{ color: pal.color, background: pal.light }}>{catName}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="pos2">
        {/* ======== LEFT: Products ======== */}
        <div className="pos2-left">
          {/* Search row */}
          <div className="pos2-search-row">
            <TextInput ref={searchRef} placeholder="ค้นหาสินค้า ชื่อ, SKU, Barcode..."
              leftSection={<IconSearch size={18} />} value={search}
              onChange={e => { setSearch(e.target.value); if (quickTab !== 'all') setQuickTab('all') }}
              size="md" className="pos2-search" data-barcode="true" />
            <Tooltip label="สแกนบาร์โค้ดด้วยกล้อง">
              <ActionIcon size="xl" variant="light" color="indigo"
                onClick={cameraOpen ? stopCamera : startCamera}
                style={{ width: 42, height: 42, flexShrink: 0 }}>
                {cameraOpen ? <IconCameraOff size={20} /> : <IconCamera size={20} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={lastScanned ? `ล่าสุด: ${lastScanned}` : 'Barcode Scanner'}>
              <div className={`pos2-scanner ${lastScanned ? 'active' : ''}`}>
                <IconBarcode size={20} />
              </div>
            </Tooltip>
          </div>

          {/* Camera Scanner View */}
          {cameraOpen && (
            <div style={{
              position: 'relative', marginBottom: 8, borderRadius: 12,
              overflow: 'hidden', border: '2px solid var(--app-primary)',
              background: '#000',
            }}>
              <div id={cameraDivId} style={{ width: '100%' }} />
              <Button size="xs" color="red" variant="filled"
                style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
                onClick={stopCamera}
                leftSection={<IconX size={14} />}>ปิดกล้อง</Button>
            </div>
          )}

          {/* Quick Tabs + View Mode */}
          <div className="pos2-toolbar">
            <div className="pos2-quick-tabs">
              {[
                { key: 'all' as QuickTab, label: 'ทั้งหมด', icon: IconCategory },
                { key: 'best-sellers' as QuickTab, label: 'ขายดี', icon: IconFlame },
                { key: 'recent' as QuickTab, label: 'ล่าสุด', icon: IconHistory },
                { key: 'favorites' as QuickTab, label: 'โปรด', icon: IconHeart },
              ].map(tab => (
                <button key={tab.key}
                  className={`pos2-quick-tab ${quickTab === tab.key ? 'active' : ''}`}
                  onClick={() => { setQuickTab(tab.key); if (tab.key !== 'all') { setSearch(''); setActiveCategory('all'); setPosAttrFilters({}) } }}>
                  <tab.icon size={16} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="pos2-toolbar-right">
              {quickTab === 'all' && (
                <Tooltip label={showCategorySidebar ? 'ซ่อนหมวดหมู่' : 'แสดงหมวดหมู่'}>
                  <ActionIcon size="sm" variant={activeFilterCount > 0 ? 'filled' : 'light'} color="indigo"
                    onClick={() => setShowCategorySidebar(v => !v)}>
                    {activeFilterCount > 0 ? <IconFilter size={14} /> : <IconFilterOff size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
              <div className="pos2-view-toggle">
                <ActionIcon size="sm" variant={viewMode === 'grid' ? 'filled' : 'subtle'} color="indigo"
                  onClick={() => setViewMode('grid')}>
                  <IconLayoutGrid size={14} />
                </ActionIcon>
                <ActionIcon size="sm" variant={viewMode === 'list' ? 'filled' : 'subtle'} color="indigo"
                  onClick={() => setViewMode('list')}>
                  <IconList size={14} />
                </ActionIcon>
              </div>
            </div>
          </div>

          {/* Main content area with optional sidebar */}
          <div className="pos2-content-area">
            {/* Category Sidebar */}
            {showCategorySidebar && quickTab === 'all' && (
              <div className="pos2-sidebar">
                <ScrollArea style={{ height: '100%' }} type="auto" scrollbarSize={4}>
                  {/* First attr group as main categories */}
                  <UnstyledButton className={`pos2-sidebar-item ${activeCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveCategory('all')}>
                    <IconCategory size={16} />
                    <span>ทั้งหมด</span>
                    {productsData?.pages?.[0]?.pagination?.total != null && (
                      <Badge size="xs" variant="light" color="gray" ml="auto">{productsData.pages[0].pagination.total}</Badge>
                    )}
                  </UnstyledButton>
                  {attrCategoryValues.map((cat: any) => (
                    <UnstyledButton key={cat.id}
                      className={`pos2-sidebar-item ${activeCategory === String(cat.id) ? 'active' : ''}`}
                      onClick={() => setActiveCategory(activeCategory === String(cat.id) ? 'all' : String(cat.id))}>
                      <div className="pos2-sidebar-dot" style={{ background: cat.pal.color }} />
                      <span>{cat.name}</span>
                    </UnstyledButton>
                  ))}

                  {/* Additional attribute filters */}
                  {(attributeGroups || []).length > 1 && (
                    <div className="pos2-sidebar-filters">
                      {(attributeGroups || []).slice(1).map((g: any) => (
                        <Select key={g.id}
                          size="xs"
                          label={g.name}
                          placeholder="ทั้งหมด"
                          data={(g.values || []).map((v: any) => ({ value: String(v.id), label: v.value }))}
                          value={posAttrFilters[g.id] || null}
                          onChange={(val) => setPosAttrFilters(prev => ({ ...prev, [g.id]: val }))}
                          clearable
                          styles={{ label: { fontSize: 11, fontWeight: 600, marginBottom: 2 } }}
                        />
                      ))}
                      {activeFilterCount > 0 && (
                        <Button size="xs" variant="subtle" color="gray" fullWidth mt={4}
                          onClick={() => { setActiveCategory('all'); setPosAttrFilters({}) }}
                          leftSection={<IconX size={12} />}>
                          ล้างตัวกรอง
                        </Button>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            {/* Product Grid / List + Service Section */}
            <div className="pos2-grid-area" ref={gridAreaRef}>
              {displayLoading ? (
                <div className="pos2-loading"><Loader size="md" color="indigo" /></div>
              ) : displayProducts?.length === 0 ? (
                <div className="pos2-empty">
                  {quickTab === 'favorites' ? (
                    <>
                      <IconHeart size={48} stroke={1.2} color="#ccc" />
                      <Text c="dimmed" fw={500} mt={8}>ยังไม่มีรายการโปรด</Text>
                      <Text c="dimmed" size="xs">กดไอคอน ♥ บนสินค้าเพื่อเพิ่ม</Text>
                    </>
                  ) : quickTab === 'recent' ? (
                    <>
                      <IconHistory size={48} stroke={1.2} color="#ccc" />
                      <Text c="dimmed" fw={500} mt={8}>ยังไม่มีรายการขายล่าสุด</Text>
                    </>
                  ) : quickTab === 'best-sellers' ? (
                    <>
                      <IconFlame size={48} stroke={1.2} color="#ccc" />
                      <Text c="dimmed" fw={500} mt={8}>ยังไม่มีข้อมูลสินค้าขายดี</Text>
                    </>
                  ) : (
                    <>
                      <IconSearch size={48} stroke={1.2} color="#ccc" />
                      <Text c="dimmed" fw={500} mt={8}>ไม่พบสินค้า</Text>
                    </>
                  )}
                </div>
              ) : viewMode === 'list' ? (
                <div className="pos2-list">
                  {displayProducts.map(renderProductCard)}
                </div>
              ) : (
                <div className="pos2-grid">
                  {displayProducts.map(renderProductCard)}
                </div>
              )}

              {/* Infinite scroll loading */}
              {quickTab === 'all' && isFetchingNextPage && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                  <Loader size="sm" color="indigo" />
                </div>
              )}

              {/* Total count */}
              {quickTab === 'all' && productsData?.pages?.[0]?.pagination && !isLoading && (
                <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: 12, color: 'var(--app-text-muted)' }}>
                  แสดง {allProducts.length} / {productsData.pages[0].pagination.total} รายการ
                </div>
              )}

              {/* Service Section */}
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
            {/* Loyalty info bar */}
            {selectedCustomerInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', flexWrap: 'wrap' }}>
                {selectedCustomerInfo.price_level && selectedCustomerInfo.price_level !== 'retail' && (
                  <Badge size="sm" variant="filled" color={selectedCustomerInfo.price_level === 'vip' ? 'grape' : 'blue'}>
                    {selectedCustomerInfo.price_level === 'vip' ? 'VIP' : 'ขายส่ง'}
                  </Badge>
                )}
                <Badge size="sm" variant="light" color="yellow" leftSection={<IconStar size={10} />}>
                  {selectedCustomerInfo.points_balance || 0} แต้ม
                </Badge>
                {(selectedCustomerInfo.points_balance || 0) >= minRedeemPoints && cart.length > 0 && (
                  <Button size="compact-xs" variant="light" color="orange"
                    leftSection={<IconGift size={12} />}
                    onClick={() => setShowRedeemModal(true)}>
                    ใช้แต้ม
                  </Button>
                )}
                {loyaltyDiscount > 0 && (
                  <Badge size="sm" variant="filled" color="orange">
                    ส่วนลดแต้ม -฿{fmt(loyaltyDiscount)}
                  </Badge>
                )}
              </div>
            )}
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
                          styles={{ input: { padding: '2px 6px', fontSize: 12, fontWeight: 600, textAlign: 'center',
                            borderColor: (() => {
                              const prod = displayProducts.find((p: any) => p.id === item.productId)
                              const minP = prod ? parseFloat(prod.min_selling_price) || 0 : 0
                              if (minP > 0) {
                                const effPrice = item.unitPrice - (item.discount || 0) / item.quantity
                                if (effPrice < minP) return '#f97316'
                              }
                              return undefined
                            })()
                          } }} />
                      </div>
                      {(() => {
                        if (item.isService) return null
                        const prod = displayProducts.find((p: any) => p.id === item.productId)
                        const minP = prod ? parseFloat(prod.min_selling_price) || 0 : 0
                        if (minP <= 0) return null
                        const effPrice = item.unitPrice - (item.discount || 0) / item.quantity
                        if (effPrice >= minP) return null
                        return (
                          <div style={{
                            position: 'absolute', bottom: -18, left: 0, right: 0,
                            fontSize: 10, color: '#ea580c', fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 3,
                            whiteSpace: 'nowrap',
                          }}>
                            🔒 ขั้นต่ำ ฿{minP.toFixed(2)}/ชิ้น
                          </div>
                        )
                      })()}
                      <span className="pos2-ci-total">฿{fmt(lineTotal)}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="pos2-cart-foot">
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

            <div className="pos2-totals">
              <div className="pos2-tr"><span>ยอดรวม ({cart.length} รายการ)</span><span>฿{fmt(itemSubtotal)}</span></div>
              {(itemDiscountTotal + billDiscountAmount) > 0 && <div className="pos2-tr disc"><span>ส่วนลด</span><span>-฿{fmt(itemDiscountTotal + billDiscountAmount)}</span></div>}
              {loyaltyDiscount > 0 && <div className="pos2-tr disc"><span>ส่วนลดแต้มสะสม ({redeemPoints} แต้ม)</span><span>-฿{fmt(loyaltyDiscount)}</span></div>}
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
            <div>
              <Text fw={600} size="sm" mb="sm">ช่องทางชำระเงิน</Text>
              {walletChannels.length > 0 ? (
                <SimpleGrid cols={2} spacing="sm">
                  {walletChannels.map((ch: any) => {
                    const info = CHANNEL_TYPE_INFO[ch.type] || CHANNEL_TYPE_INFO.other
                    const ChIcon = info.icon
                    const isActive = paymentChannelId === ch.id
                    return (
                      <button key={ch.id}
                        className={`pos2-pm ${isActive ? 'active' : ''}`}
                        style={{ '--pm-color': info.color } as React.CSSProperties}
                        onClick={() => {
                          setPaymentMethod(ch.type === 'bank_account' ? 'transfer' : ch.type)
                          setPaymentChannelId(ch.id)
                          setPaymentChannelName(ch.name)
                          if (ch.type !== 'cash') setReceivedAmount(grandTotal)
                        }}>
                        <ChIcon size={22} />
                        <span>{ch.name}</span>
                        {ch.bank_name && <span style={{ fontSize: 10, opacity: 0.7 }}>{ch.bank_name}</span>}
                      </button>
                    )
                  })}
                </SimpleGrid>
              ) : (
                <SimpleGrid cols={2} spacing="sm">
                  {[
                    { value: 'cash', label: 'เงินสด', icon: IconCash, color: '#059669' },
                    { value: 'transfer', label: 'โอนเงิน', icon: IconBuildingBank, color: '#2563eb' },
                    { value: 'credit_card', label: 'บัตรเครดิต', icon: IconCreditCard, color: '#7c3aed' },
                    { value: 'qr_code', label: 'QR Code', icon: IconQrcode, color: '#0891b2' },
                  ].map(pm => (
                    <button key={pm.value}
                      className={`pos2-pm ${paymentMethod === pm.value && !paymentChannelId ? 'active' : ''}`}
                      style={{ '--pm-color': pm.color } as React.CSSProperties}
                      onClick={() => { setPaymentMethod(pm.value); setPaymentChannelId(null); setPaymentChannelName(pm.label); if (pm.value !== 'cash') setReceivedAmount(grandTotal) }}>
                      <pm.icon size={22} />
                      <span>{pm.label}</span>
                    </button>
                  ))}
                </SimpleGrid>
              )}
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

      {/* ======== MIN PRICE OVERRIDE MODAL ======== */}
      <Modal
        opened={!!overridePending}
        onClose={() => setOverridePending(null)}
        title="🔓 ข้ามราคาขั้นต่ำ (เฉพาะ Owner/Admin)"
        size="sm" centered
        overlayProps={{ backgroundOpacity: 0.4, blur: 3 }}>
        {overridePending && (() => {
          const it = cart.find(c => c.productId === overridePending.productId)
          const prod = displayProducts.find((p: any) => p.id === overridePending.productId)
          const minP = prod ? parseFloat(prod.min_selling_price) || 0 : 0
          const effPrice = it ? it.unitPrice - overridePending.discount / (it.quantity || 1) : 0
          return (
            <Stack gap="md">
              <div style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 10, padding: '12px 16px' }}>
                <Text size="sm" fw={700} c="orange.7" mb={4}>คุณกำลังตั้งราคาต่ำกว่าขั้นต่ำ</Text>
                <Text size="sm">ราคาขั้นต่ำ: <strong>฿{minP.toFixed(2)}/ชิ้น</strong></Text>
                <Text size="sm">ราคาที่ขาย: <strong style={{ color: '#ef4444' }}>฿{effPrice.toFixed(2)}/ชิ้น</strong></Text>
              </div>
              <Text size="xs" c="dimmed">เฉพาะ Owner และ Admin เท่านั้นที่สามารถข้ามราคาขั้นต่ำได้</Text>
              <Group grow>
                <Button variant="light" color="gray" onClick={() => setOverridePending(null)}>ยกเลิก</Button>
                <Button color="orange" onClick={() => {
                  setCart(prev => prev.map(c => c.productId === overridePending.productId ? { ...c, discount: overridePending.discount } : c))
                  notifications.show({ title: 'ข้ามราคาขั้นต่ำ', message: `ราคา ฿${effPrice.toFixed(2)}/ชิ้น (โดย ${activeCompany?.role})`, color: 'orange', autoClose: 3000 })
                  setOverridePending(null)
                }}>ยืนยันข้ามราคาขั้นต่ำ</Button>
              </Group>
            </Stack>
          )
        })()}
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

      {/* ======== REDEEM POINTS MODAL ======== */}
      <Modal opened={showRedeemModal} onClose={() => setShowRedeemModal(false)}
        title="ใช้แต้มสะสมแลกส่วนลด" size="sm" centered>
        <Stack gap="md">
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <Text size="sm" c="dimmed">แต้มสะสมปัจจุบัน</Text>
            <Text size="xl" fw={800} c="yellow.7">{selectedCustomerInfo?.points_balance || 0} แต้ม</Text>
            <Text size="xs" c="dimmed">1 แต้ม = ฿{pointsValue} | ขั้นต่ำ {minRedeemPoints} แต้ม</Text>
          </div>
          <NumberInput size="md" label="จำนวนแต้มที่ต้องการใช้" placeholder="0"
            min={minRedeemPoints} max={selectedCustomerInfo?.points_balance || 0}
            step={10} value={redeemPoints || ''}
            onChange={v => setRedeemPoints(Number(v) || 0)} />
          {redeemPoints > 0 && (
            <Text ta="center" size="sm" fw={600} c="orange">
              ส่วนลด = ฿{fmt(redeemPoints * pointsValue)}
            </Text>
          )}
          <Group grow>
            <Button variant="subtle" color="gray" onClick={() => {
              setRedeemPoints(0); setLoyaltyDiscount(0); setShowRedeemModal(false)
            }}>ยกเลิก</Button>
            <Button color="orange" leftSection={<IconGift size={16} />}
              disabled={redeemPoints < minRedeemPoints || redeemPoints > (selectedCustomerInfo?.points_balance || 0)}
              onClick={() => {
                const discount = redeemPoints * pointsValue
                setLoyaltyDiscount(discount)
                setShowRedeemModal(false)
                notifications.show({ title: 'ใช้แต้มสำเร็จ', message: `แลก ${redeemPoints} แต้ม = ส่วนลด ฿${fmt(discount)}`, color: 'orange', autoClose: 3000 })
              }}>
              ยืนยันใช้แต้ม
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ======== RECEIPT MODAL ======== */}
      <Modal opened={showReceipt} onClose={() => setShowReceipt(false)} title={null}
        size="sm" centered withCloseButton={false} radius="lg"
        overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}>
        {lastReceipt && (
          <div style={{ padding: 4 }}>
            <div style={{ background: '#fff', border: '1px dashed #ccc', borderRadius: 8, padding: '16px 14px', fontFamily: "'Sarabun', sans-serif", color: '#222', fontSize: 13 }}>
              <div style={{ textAlign: 'center', borderBottom: '2px dashed #999', paddingBottom: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{lastReceipt.companyName}</div>
                <div style={{ fontSize: 11, color: '#888' }}>ใบเสร็จอย่างย่อ / Simplified Receipt</div>
              </div>
              <div style={{ fontSize: 12, marginBottom: 8, paddingBottom: 6, borderBottom: '1px dashed #ccc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>เลขที่:</span><span style={{ fontWeight: 600 }}>{lastReceipt.invoiceNumber}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>วันที่:</span><span>{new Date(lastReceipt.soldAt).toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'})} {new Date(lastReceipt.soldAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>แคชเชียร์:</span><span>{lastReceipt.cashierName}</span></div>
                {lastReceipt.customerName && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ลูกค้า:</span><span>{lastReceipt.customerName}</span></div>}
              </div>
              <div style={{ marginBottom: 8 }}>
                {lastReceipt.items?.map((item: any, i: number) => {
                  const lineTotal = item.unitPrice * item.quantity - (item.discount || 0)
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: 12, borderBottom: '1px dotted #e5e5e5' }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name} ×{item.quantity}</span>
                      <span style={{ fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>฿{fmt(lineTotal)}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ borderTop: '2px dashed #999', paddingTop: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>ยอดรวม</span><span>฿{fmt(lastReceipt.totalAmount)}</span></div>
                {lastReceipt.discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#dc2626' }}><span>ส่วนลด</span><span>-฿{fmt(lastReceipt.discountAmount)}</span></div>}
                {lastReceipt.vatEnabled && lastReceipt.vatAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>VAT</span><span>฿{fmt(lastReceipt.vatAmount)}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, borderTop: '1px solid #333', marginTop: 4, paddingTop: 4 }}><span>ยอดสุทธิ</span><span>฿{fmt(lastReceipt.netAmount)}</span></div>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', paddingTop: 6, marginTop: 6, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ชำระโดย</span><span>{lastReceipt.paymentChannelName || {cash:'เงินสด',transfer:'โอนเงิน',credit_card:'บัตรเครดิต',qr_code:'QR Code'}[lastReceipt.paymentMethod as string] || lastReceipt.paymentMethod}</span></div>
                {lastReceipt.paymentMethod==='cash' && lastReceipt.receivedAmount > 0 && (<>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>รับเงิน</span><span>฿{fmt(lastReceipt.receivedAmount)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>เงินทอน</span><span>฿{fmt(lastReceipt.changeAmount)}</span></div>
                </>)}
              </div>
              {(lastReceipt.pointsEarned > 0 || lastReceipt.loyaltyDiscount > 0) && (
                <div style={{ borderTop: '1px dashed #ccc', paddingTop: 6, marginTop: 6, fontSize: 12, textAlign: 'center' }}>
                  {lastReceipt.loyaltyDiscount > 0 && (
                    <div style={{ color: '#ea580c', fontWeight: 600 }}>ใช้แต้ม {lastReceipt.redeemPoints} แต้ม = ส่วนลด ฿{fmt(lastReceipt.loyaltyDiscount)}</div>
                  )}
                  {lastReceipt.pointsEarned > 0 && (
                    <div style={{ color: '#ca8a04', fontWeight: 600 }}>สะสมแต้ม +{lastReceipt.pointsEarned} แต้ม</div>
                  )}
                </div>
              )}
              <div style={{ textAlign: 'center', borderTop: '2px dashed #999', paddingTop: 8, marginTop: 8, fontSize: 11, color: '#888' }}>
                <div style={{ fontWeight: 700, color: '#333' }}>ขอบคุณที่ใช้บริการ</div>
                <div>Thank you & See you again!</div>
              </div>
            </div>

            <Group grow mt="md" gap="sm">
              <Button variant="light" size="md" onClick={() => setShowReceipt(false)}>ปิด</Button>
              <Button leftSection={<IconPrinter size={16} />} color="indigo" size="md"
                onClick={() => {
                  const pc = receiptRef.current; if (!pc) return
                  const pw = window.open('', '_blank', 'width=320,height=600'); if (!pw) return
                  pw.document.write(`<!DOCTYPE html><html><head><title>ใบเสร็จย่อ ${lastReceipt.invoiceNumber}</title><style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Sarabun',sans-serif;width:80mm;margin:0 auto;padding:4mm;color:#222;font-size:13px}.receipt-header{text-align:center;margin-bottom:8px;padding-bottom:8px;border-bottom:2px dashed #888}.receipt-header h1{font-size:16px;font-weight:700;margin-bottom:2px}.receipt-header p{font-size:10px;color:#555}.receipt-info{font-size:11px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed #aaa}.receipt-info div{display:flex;justify-content:space-between;padding:1px 0}.receipt-item{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;border-bottom:1px dotted #ddd}.receipt-item .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.receipt-item .amt{font-weight:600;margin-left:8px;flex-shrink:0}.receipt-totals{border-top:2px dashed #888;padding-top:6px;margin-bottom:8px;font-size:12px}.receipt-totals div{display:flex;justify-content:space-between;padding:2px 0}.receipt-totals .grand-total{font-size:16px;font-weight:700;padding:4px 0;border-top:1px solid #333;margin-top:4px}.receipt-payment{border-top:1px dashed #aaa;padding-top:6px;margin-bottom:10px;font-size:11px}.receipt-payment div{display:flex;justify-content:space-between;padding:1px 0}.receipt-footer{text-align:center;font-size:10px;color:#555;padding-top:8px;border-top:2px dashed #888}.receipt-footer p{margin:2px 0}@media print{@page{size:80mm auto;margin:0}body{width:80mm}}</style></head><body>${pc.innerHTML}</body></html>`)
                  pw.document.close(); pw.focus()
                  setTimeout(() => { pw.print(); pw.close() }, 400)
                }}>พิมพ์ใบเสร็จย่อ</Button>
            </Group>

            <div style={{ borderTop: '1px solid var(--app-border-light)', marginTop: 12, paddingTop: 12 }}>
              <Text size="xs" c="dimmed" mb={6} fw={600}>ออกเอกสารเพิ่มเติม</Text>
              <Group grow gap="sm">
                <Button variant="light" color="green" size="sm"
                  leftSection={<IconReceipt size={14} />}
                  onClick={() => { setShowReceipt(false); navigate(`/sales-doc/create?type=receipt&saleId=${lastReceipt.saleId}`) }}>
                  ใบเสร็จรับเงิน
                </Button>
                {vatEnabled && (
                  <Button variant="light" color="violet" size="sm"
                    leftSection={<IconReceipt size={14} />}
                    onClick={() => { setShowReceipt(false); navigate(`/sales-doc/create?type=receipt_tax&saleId=${lastReceipt.saleId}`) }}>
                    ใบเสร็จ/ใบกำกับภาษี
                  </Button>
                )}
              </Group>
            </div>
          </div>
        )}
      </Modal>

      {/* Hidden Thermal Receipt Print Template */}
      {lastReceipt && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={receiptRef}>
            <div className="receipt-header"><h1>{lastReceipt.companyName}</h1><p>ใบเสร็จอย่างย่อ / Simplified Receipt</p></div>
            <div className="receipt-info">
              <div><span>เลขที่:</span><span>{lastReceipt.invoiceNumber}</span></div>
              <div><span>วันที่:</span><span>{new Date(lastReceipt.soldAt).toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'})} {new Date(lastReceipt.soldAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</span></div>
              <div><span>แคชเชียร์:</span><span>{lastReceipt.cashierName}</span></div>
              {lastReceipt.customerName && <div><span>ลูกค้า:</span><span>{lastReceipt.customerName}</span></div>}
            </div>
            {lastReceipt.items?.map((item: any, i: number) => {
              const lineTotal = item.unitPrice * item.quantity - (item.discount || 0)
              return (<div key={i} className="receipt-item"><span className="name">{item.name} ×{item.quantity}</span><span className="amt">฿{fmt(lineTotal)}</span></div>)
            })}
            <div className="receipt-totals">
              <div><span>ยอดรวม</span><span>฿{fmt(lastReceipt.totalAmount)}</span></div>
              {lastReceipt.discountAmount > 0 && <div><span>ส่วนลด</span><span>-฿{fmt(lastReceipt.discountAmount)}</span></div>}
              {lastReceipt.vatEnabled && lastReceipt.vatAmount > 0 && <div><span>VAT</span><span>฿{fmt(lastReceipt.vatAmount)}</span></div>}
              <div className="grand-total"><span>ยอดสุทธิ</span><span>฿{fmt(lastReceipt.netAmount)}</span></div>
            </div>
            <div className="receipt-payment">
              <div><span>ชำระโดย</span><span>{lastReceipt.paymentChannelName || {cash:'เงินสด',transfer:'โอนเงิน',credit_card:'บัตรเครดิต',qr_code:'QR Code'}[lastReceipt.paymentMethod as string] || lastReceipt.paymentMethod}</span></div>
              {lastReceipt.paymentMethod==='cash'&&lastReceipt.receivedAmount>0&&(<><div><span>รับเงิน</span><span>฿{fmt(lastReceipt.receivedAmount)}</span></div><div style={{fontWeight:700}}><span>เงินทอน</span><span>฿{fmt(lastReceipt.changeAmount)}</span></div></>)}
            </div>
            <div className="receipt-footer"><p style={{fontWeight:700}}>ขอบคุณที่ใช้บริการ</p><p>Thank you & See you again!</p></div>
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
