import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Switch, NumberInput, Button, Group, Text, Stack, Divider, Loader, Badge,
  Card, SimpleGrid, Textarea, Modal, Select, PasswordInput, ActionIcon, Tooltip,
  Table, Menu,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconBuilding, IconPhone, IconReceipt, IconDeviceFloppy, IconPercentage, IconId, IconWand,
  IconUsers, IconUserPlus, IconShieldCheck, IconDotsVertical, IconTrash, IconEdit, IconUserOff,
  IconUserCheck, IconEye, IconPrinter, IconCash, IconSettings, IconInfoCircle, IconTags, IconPlus,
  IconGripVertical, IconCheck, IconX,
} from '@tabler/icons-react'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

/* ── Role helpers ── */
const ROLE_MAP: Record<string, { label: string; color: string; desc: string }> = {
  owner:      { label: 'เจ้าของ',          color: 'red',    desc: 'เข้าถึงทุกส่วนของระบบ' },
  admin:      { label: 'ผู้ดูแลระบบ',       color: 'violet', desc: 'จัดการระบบและผู้ใช้งาน' },
  manager:    { label: 'ผู้จัดการ',          color: 'blue',   desc: 'ดูรายงาน จัดการสต๊อก' },
  cashier:    { label: 'พนักงานขาย (แคชเชียร์)', color: 'green',  desc: 'ใช้ POS ขายหน้าร้าน' },
  accountant: { label: 'พนักงานบัญชี',       color: 'orange', desc: 'จัดการค่าใช้จ่าย รายงาน' },
  staff:      { label: 'พนักงานทั่วไป',      color: 'gray',   desc: 'เข้าถึงเฉพาะส่วนพื้นฐาน' },
}
const ASSIGNABLE_ROLES = Object.entries(ROLE_MAP)
  .filter(([k]) => k !== 'owner')
  .map(([value, { label }]) => ({ value, label }))

/* ── Settings Tabs config ── */
type TabId = 'company' | 'tax' | 'display' | 'products' | 'users' | 'system'
const TABS: { id: TabId; label: string; icon: any }[] = [
  { id: 'company',  label: 'ข้อมูลร้านค้า',       icon: IconBuilding },
  { id: 'tax',      label: 'ตั้งค่าภาษี',          icon: IconReceipt },
  { id: 'display',  label: 'การแสดงผล',            icon: IconEye },
  { id: 'products', label: 'คุณสมบัติสินค้า',       icon: IconTags },
  { id: 'users',    label: 'จัดการผู้ใช้งาน',       icon: IconUsers },
  { id: 'system',   label: 'ข้อมูลระบบ',            icon: IconInfoCircle },
]

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const activeCompany = useAuthStore(s => s.activeCompany)
  const currentRole = activeCompany?.role || ''

  const [activeTab, setActiveTab] = useState<TabId>('company')

  /* ── Company data ── */
  const { data: company, isLoading } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  const [form, setForm] = useState({
    name: '', taxId: '', phone: '',
    addrHouseNo: '', addrVillage: '', addrStreet: '', addrSubdistrict: '', addrDistrict: '',
    addrProvince: '', addrZipCode: '',
    vatEnabled: true, vatRate: 7,
  })
  const [rawAddress, setRawAddress] = useState('')

  /* ── Display settings (stored in company.settings JSON) ── */
  const [displayForm, setDisplayForm] = useState({
    showProductImage: true,
    receiptShowLogo: true,
    receiptShowAddress: true,
    receiptShowTaxId: true,
    receiptFooterText: 'ขอบคุณที่ใช้บริการ',
    posGridColumns: 4,
    defaultPaymentMethod: 'cash',
  })

  const buildAddress = () => {
    const parts = [
      form.addrHouseNo,
      form.addrVillage ? `หมู่บ้าน${form.addrVillage}` : '',
      form.addrStreet,
      form.addrSubdistrict ? `ต.${form.addrSubdistrict}` : '',
      form.addrDistrict ? `อ.${form.addrDistrict}` : '',
      form.addrProvince ? `จ.${form.addrProvince}` : '',
      form.addrZipCode,
    ].filter(Boolean)
    return parts.join(' ')
  }

  const parseAddress = (addr: string) => {
    if (!addr) return { addrHouseNo: '', addrVillage: '', addrStreet: '', addrSubdistrict: '', addrDistrict: '', addrProvince: '', addrZipCode: '' }
    const zip = addr.match(/(\d{5})$/)?.[1] || ''
    const prov = addr.match(/จ\.([^\s]+)/)?.[1] || ''
    const dist = addr.match(/อ\.([^\s]+)/)?.[1] || ''
    const sub = addr.match(/ต\.([^\s]+)/)?.[1] || ''
    const villageMatch = addr.match(/หมู่บ้าน(.+?)(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ต\.|ตำบล|อ\.|อำเภอ|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/)
    const village = villageMatch ? villageMatch[1].trim() : ''
    let remaining = addr.replace(/\d{5}$/, '').replace(/จ\.[^\s]+/, '').replace(/อ\.[^\s]+/, '').replace(/ต\.[^\s]+/, '')
      .replace(/หมู่บ้าน.+?(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ต\.|ตำบล|อ\.|อำเภอ|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/, '').trim()
    const parts = remaining.split(/\s+/)
    const houseNo = parts[0] || ''
    const street = parts.slice(1).join(' ')
    return { addrHouseNo: houseNo, addrVillage: village, addrStreet: street, addrSubdistrict: sub, addrDistrict: dist, addrProvince: prov, addrZipCode: zip }
  }

  useEffect(() => {
    if (company) {
      const settings = company.settings || {}
      const addr = parseAddress(company.address || '')
      setForm({
        name: company.name || '', taxId: company.tax_id || '', phone: company.phone || '',
        ...addr,
        vatEnabled: settings.vat_enabled !== false,
        vatRate: settings.vat_rate ?? 7,
      })
      setDisplayForm(prev => ({
        ...prev,
        showProductImage: settings.show_product_image !== false,
        receiptShowLogo: settings.receipt_show_logo !== false,
        receiptShowAddress: settings.receipt_show_address !== false,
        receiptShowTaxId: settings.receipt_show_tax_id !== false,
        receiptFooterText: settings.receipt_footer_text || 'ขอบคุณที่ใช้บริการ',
        posGridColumns: settings.pos_grid_columns || 4,
        defaultPaymentMethod: settings.default_payment_method || 'cash',
      }))
    }
  }, [company])

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/companies/${company.id}`, data),
    onSuccess: () => {
      notifications.show({ title: 'บันทึกสำเร็จ', message: 'อัพเดตข้อมูลเรียบร้อยแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['company-current'] })
    },
    onError: () => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })

  const handleSave = () => {
    const existingSettings = company?.settings || {}
    updateMutation.mutate({
      name: form.name, taxId: form.taxId, address: buildAddress(), phone: form.phone,
      settings: {
        ...existingSettings,
        vat_enabled: form.vatEnabled, vat_rate: form.vatRate,
        currency: 'THB', language: 'th',
        show_product_image: displayForm.showProductImage,
        receipt_show_logo: displayForm.receiptShowLogo,
        receipt_show_address: displayForm.receiptShowAddress,
        receipt_show_tax_id: displayForm.receiptShowTaxId,
        receipt_footer_text: displayForm.receiptFooterText,
        pos_grid_columns: displayForm.posGridColumns,
        default_payment_method: displayForm.defaultPaymentMethod,
      },
    })
  }

  /* ── Users management ── */
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['company-users'],
    queryFn: () => api.get('/users').then(r => r.data),
    enabled: activeTab === 'users',
  })

  const [addUserOpen, setAddUserOpen] = useState(false)
  const [editRoleOpen, setEditRoleOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [newUser, setNewUser] = useState({ username: '', password: '', fullName: '', nickName: '', role: 'staff' })
  const [editRole, setEditRole] = useState('')

  const addUserMutation = useMutation({
    mutationFn: (data: any) => api.post('/users', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'เพิ่มผู้ใช้งานเรียบร้อยแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['company-users'] })
      setAddUserOpen(false)
      setNewUser({ username: '', password: '', fullName: '', nickName: '', role: 'staff' })
    },
    onError: (err: any) => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเพิ่มผู้ใช้ได้', color: 'red' })
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) => api.put(`/users/${userId}/role`, { role }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'อัพเดตตำแหน่งเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['company-users'] })
      setEditRoleOpen(false)
    },
    onError: (err: any) => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถอัพเดตได้', color: 'red' })
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (userId: number) => api.put(`/users/${userId}/toggle-active`),
    onSuccess: (res: any) => {
      notifications.show({ title: 'สำเร็จ', message: res.data.message, color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['company-users'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถดำเนินการได้', color: 'red' })
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: (userId: number) => api.delete(`/users/${userId}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบผู้ใช้ออกจากบริษัทแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['company-users'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' })
    },
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const canManageUsers = ['owner', 'admin', 'manager'].includes(currentRole)
  const canEditUsers = ['owner', 'admin'].includes(currentRole)

  return (
    <div className="settings-page">
      {/* ── Header ── */}
      <div className="settings-header">
        <div>
          <Text size="xl" fw={800} className="settings-title">
            <IconSettings size={24} /> ตั้งค่าระบบ
          </Text>
          <Text size="sm" c="dimmed" mt={2}>{company?.name || 'ร้านค้า'}</Text>
        </div>
        {activeTab !== 'users' && activeTab !== 'system' && activeTab !== 'products' && (
          <Button leftSection={<IconDeviceFloppy size={18} />}
            onClick={handleSave} loading={updateMutation.isPending}
            className="settings-save-btn">
            บันทึกการเปลี่ยนแปลง
          </Button>
        )}
      </div>

      <div className="settings-body">
        {/* ── Sidebar Tabs ── */}
        <div className="settings-tabs">
          {TABS.map(tab => (
            <button key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}>
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="settings-content">

          {/* ========== Tab: Company ========== */}
          {activeTab === 'company' && (
            <Card shadow="xs" padding="lg" radius="md" withBorder>
              <Group gap={8} mb="md">
                <IconBuilding size={20} color="var(--app-primary)" />
                <Text fw={700} size="lg">ข้อมูลบริษัท / ร้านค้า</Text>
              </Group>
              <Stack gap="md">
                <TextInput label="ชื่อบริษัท / ร้านค้า" placeholder="Bookdee Shop" size="md"
                  leftSection={<IconBuilding size={16} />}
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Group grow>
                  <TextInput label="เลขประจำตัวผู้เสียภาษี" placeholder="0-0000-00000-00-0" size="md"
                    leftSection={<IconId size={16} />}
                    value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
                  <TextInput label="เบอร์โทรศัพท์" placeholder="02-xxx-xxxx" size="md"
                    leftSection={<IconPhone size={16} />}
                    value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Group>

                <Divider label="ที่อยู่บริษัท" labelPosition="left" />
                <Group gap="sm" align="end">
                  <Textarea size="sm" placeholder="วางที่อยู่แบบเต็ม เช่น: 123/45 ถ.สุขุมวิท ต.คลองเตย อ.คลองเตย กรุงเทพฯ 10110"
                    style={{ flex: 1 }} autosize minRows={1} maxRows={3}
                    value={rawAddress} onChange={(e) => setRawAddress(e.target.value)} />
                  <Button size="sm" variant="light" color="teal" leftSection={<IconWand size={14} />}
                    disabled={!rawAddress.trim()} onClick={() => {
                      const addr = rawAddress.trim()
                      const zipMatch = addr.match(/(\d{5})/)
                      const zip = zipMatch ? zipMatch[1] : ''
                      let province = ''
                      const provMatch = addr.match(/จ(?:\.|ังหวัด)\s*([^\s,]+)/)
                      if (provMatch) province = provMatch[1]
                      else if (/กรุงเทพ/.test(addr)) province = 'กรุงเทพมหานคร'
                      let district = ''
                      const distMatch = addr.match(/(?:อำเภอ|อ\.|เขต)\s*([^\s,]+)/)
                      if (distMatch) district = distMatch[1]
                      let subdistrict = ''
                      const subMatch = addr.match(/(?:ตำบล|ต\.|แขวง)\s*([^\s,]+)/)
                      if (subMatch) subdistrict = subMatch[1]
                      let village = ''
                      const villageMatch = addr.match(/หมู่บ้าน\s*(.+?)(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ตำบล|ต\.|อำเภอ|อ\.|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/)
                      if (villageMatch) village = villageMatch[1].trim()
                      let street = ''
                      const streetMatch = addr.match(/(?:ถนน|ถ\.)\s*([^\s,]*(?:[-][^\s,]*)*)/)
                      if (streetMatch) street = 'ถนน' + streetMatch[1]
                      let remaining = addr
                        .replace(/(\d{5})/, '').replace(/จ(?:\.|ังหวัด)\s*[^\s,]+/, '')
                        .replace(/(?:อำเภอ|อ\.|เขต)\s*[^\s,]+/, '').replace(/(?:ตำบล|ต\.|แขวง)\s*[^\s,]+/, '')
                        .replace(/หมู่บ้าน\s*.+?(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ตำบล|ต\.|อำเภอ|อ\.|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/, '')
                        .replace(/(?:ถนน|ถ\.)\s*[^\s,]*(?:[-][^\s,]*)*/, '')
                        .replace(/กรุงเทพมหานคร/, '').replace(/กรุงเทพฯ/, '')
                        .replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim()
                      setForm(prev => ({ ...prev, addrHouseNo: remaining || '', addrVillage: village, addrStreet: street,
                        addrSubdistrict: subdistrict, addrDistrict: district, addrProvince: province, addrZipCode: zip }))
                      notifications.show({ title: 'กระจายที่อยู่สำเร็จ', message: 'ตรวจสอบและแก้ไขได้ที่ช่องด้านล่าง', color: 'teal', autoClose: 2000 })
                    }}>
                    กระจายที่อยู่
                  </Button>
                </Group>
                <SimpleGrid cols={3}>
                  <TextInput label="บ้านเลขที่" placeholder="123/45" size="md"
                    value={form.addrHouseNo} onChange={(e) => setForm({ ...form, addrHouseNo: e.target.value })} />
                  <TextInput label="หมู่บ้าน / คอนโด" placeholder="คุณาลัย คอร์ทยาร์ด" size="md"
                    value={form.addrVillage} onChange={(e) => setForm({ ...form, addrVillage: e.target.value })} />
                  <TextInput label="ถนน / ซอย" placeholder="ถนนสุขุมวิท" size="md"
                    value={form.addrStreet} onChange={(e) => setForm({ ...form, addrStreet: e.target.value })} />
                </SimpleGrid>
                <SimpleGrid cols={2}>
                  <TextInput label="ตำบล / แขวง" placeholder="คลองเตย" size="md"
                    value={form.addrSubdistrict} onChange={(e) => setForm({ ...form, addrSubdistrict: e.target.value })} />
                  <TextInput label="อำเภอ / เขต" placeholder="คลองเตย" size="md"
                    value={form.addrDistrict} onChange={(e) => setForm({ ...form, addrDistrict: e.target.value })} />
                </SimpleGrid>
                <SimpleGrid cols={2}>
                  <TextInput label="จังหวัด" placeholder="กรุงเทพมหานคร" size="md"
                    value={form.addrProvince} onChange={(e) => setForm({ ...form, addrProvince: e.target.value })} />
                  <TextInput label="รหัสไปรษณีย์" placeholder="10110" size="md"
                    value={form.addrZipCode} onChange={(e) => setForm({ ...form, addrZipCode: e.target.value })} />
                </SimpleGrid>
              </Stack>
            </Card>
          )}

          {/* ========== Tab: Tax ========== */}
          {activeTab === 'tax' && (
            <Card shadow="xs" padding="lg" radius="md" withBorder>
              <Group gap={8} mb="md">
                <IconReceipt size={20} color="var(--app-success)" />
                <Text fw={700} size="lg">ตั้งค่าภาษี</Text>
              </Group>
              <Stack gap="md">
                <div className="settings-toggle-row" style={{
                  borderColor: form.vatEnabled ? 'var(--app-success)' : 'var(--app-border)',
                  background: form.vatEnabled ? 'rgba(5,150,105,0.04)' : 'var(--app-surface)',
                }}>
                  <div>
                    <Group gap={8}>
                      <Text fw={700} size="md">ภาษีมูลค่าเพิ่ม (VAT)</Text>
                      <Badge color={form.vatEnabled ? 'green' : 'gray'} variant="light">
                        {form.vatEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed" mt={4}>
                      {form.vatEnabled
                        ? `คำนวณ VAT ${form.vatRate}% อัตโนมัติในทุกบิลขาย`
                        : 'ไม่คำนวณ VAT ในบิลขาย'}
                    </Text>
                  </div>
                  <Switch size="lg" checked={form.vatEnabled}
                    onChange={(e) => setForm({ ...form, vatEnabled: e.target.checked })}
                    color="green" />
                </div>
                {form.vatEnabled && (
                  <NumberInput label="อัตราภาษี (%)" size="md"
                    leftSection={<IconPercentage size={16} />}
                    min={0} max={100} decimalScale={2}
                    value={form.vatRate}
                    onChange={(v) => setForm({ ...form, vatRate: Number(v) || 7 })}
                    style={{ maxWidth: 200 }} />
                )}
                <div className="settings-info-box">
                  <Text size="sm" fw={600} mb={4}>ผลกระทบต่อระบบ</Text>
                  <Text size="xs" c="dimmed">
                    <strong>POS:</strong> ยอดรวมจะ{form.vatEnabled ? `บวก VAT ${form.vatRate}%` : 'ไม่รวม VAT'} อัตโนมัติ<br/>
                    <strong>ใบเสร็จ:</strong> {form.vatEnabled ? `แสดงแยกยอดสินค้า + VAT ${form.vatRate}%` : 'แสดงยอดรวมเท่านั้น'}<br/>
                    <strong>รายงาน:</strong> {form.vatEnabled ? 'รวมยอด VAT ในรายงานสรุป' : 'ไม่แสดง VAT ในรายงาน'}
                  </Text>
                </div>
              </Stack>
            </Card>
          )}

          {/* ========== Tab: Display ========== */}
          {activeTab === 'display' && (
            <Stack gap="lg">
              {/* POS Settings */}
              <Card shadow="xs" padding="lg" radius="md" withBorder>
                <Group gap={8} mb="md">
                  <IconCash size={20} color="var(--app-primary)" />
                  <Text fw={700} size="lg">ตั้งค่าหน้า POS</Text>
                </Group>
                <Stack gap="md">
                  <div className="settings-toggle-row" style={{
                    borderColor: displayForm.showProductImage ? 'var(--app-primary)' : 'var(--app-border)',
                    background: displayForm.showProductImage ? 'rgba(99,102,241,0.04)' : 'var(--app-surface)',
                  }}>
                    <div>
                      <Text fw={600} size="sm">แสดงรูปภาพสินค้า</Text>
                      <Text size="xs" c="dimmed">แสดงรูปภาพสินค้าในหน้า POS (ถ้ามี)</Text>
                    </div>
                    <Switch checked={displayForm.showProductImage}
                      onChange={(e) => setDisplayForm({ ...displayForm, showProductImage: e.target.checked })}
                      color="indigo" />
                  </div>
                  <SimpleGrid cols={2}>
                    <NumberInput label="จำนวนคอลัมน์สินค้า" size="md"
                      min={2} max={6} value={displayForm.posGridColumns}
                      onChange={(v) => setDisplayForm({ ...displayForm, posGridColumns: Number(v) || 4 })} />
                    <Select label="ช่องทางชำระเริ่มต้น" size="md"
                      value={displayForm.defaultPaymentMethod}
                      onChange={(v) => setDisplayForm({ ...displayForm, defaultPaymentMethod: v || 'cash' })}
                      data={[
                        { value: 'cash', label: 'เงินสด' },
                        { value: 'transfer', label: 'โอนเงิน' },
                        { value: 'credit', label: 'บัตรเครดิต' },
                      ]} />
                  </SimpleGrid>
                </Stack>
              </Card>

              {/* Receipt Settings */}
              <Card shadow="xs" padding="lg" radius="md" withBorder>
                <Group gap={8} mb="md">
                  <IconPrinter size={20} color="var(--app-accent)" />
                  <Text fw={700} size="lg">ตั้งค่าใบเสร็จ</Text>
                </Group>
                <Stack gap="md">
                  <div className="settings-toggle-row" style={{
                    borderColor: displayForm.receiptShowLogo ? 'var(--app-accent)' : 'var(--app-border)',
                    background: displayForm.receiptShowLogo ? 'rgba(236,72,153,0.04)' : 'var(--app-surface)',
                  }}>
                    <div>
                      <Text fw={600} size="sm">แสดงโลโก้บนใบเสร็จ</Text>
                      <Text size="xs" c="dimmed">แสดงโลโก้ร้านค้าที่ด้านบนของใบเสร็จ</Text>
                    </div>
                    <Switch checked={displayForm.receiptShowLogo}
                      onChange={(e) => setDisplayForm({ ...displayForm, receiptShowLogo: e.target.checked })}
                      color="pink" />
                  </div>
                  <div className="settings-toggle-row" style={{
                    borderColor: displayForm.receiptShowAddress ? 'var(--app-accent)' : 'var(--app-border)',
                    background: displayForm.receiptShowAddress ? 'rgba(236,72,153,0.04)' : 'var(--app-surface)',
                  }}>
                    <div>
                      <Text fw={600} size="sm">แสดงที่อยู่บนใบเสร็จ</Text>
                      <Text size="xs" c="dimmed">แสดงที่อยู่ร้านค้าบนใบเสร็จ</Text>
                    </div>
                    <Switch checked={displayForm.receiptShowAddress}
                      onChange={(e) => setDisplayForm({ ...displayForm, receiptShowAddress: e.target.checked })}
                      color="pink" />
                  </div>
                  <div className="settings-toggle-row" style={{
                    borderColor: displayForm.receiptShowTaxId ? 'var(--app-accent)' : 'var(--app-border)',
                    background: displayForm.receiptShowTaxId ? 'rgba(236,72,153,0.04)' : 'var(--app-surface)',
                  }}>
                    <div>
                      <Text fw={600} size="sm">แสดงเลขผู้เสียภาษีบนใบเสร็จ</Text>
                      <Text size="xs" c="dimmed">แสดงเลขประจำตัวผู้เสียภาษีบนใบเสร็จ</Text>
                    </div>
                    <Switch checked={displayForm.receiptShowTaxId}
                      onChange={(e) => setDisplayForm({ ...displayForm, receiptShowTaxId: e.target.checked })}
                      color="pink" />
                  </div>
                  <Textarea label="ข้อความท้ายใบเสร็จ" size="md"
                    placeholder="ขอบคุณที่ใช้บริการ"
                    autosize minRows={2} maxRows={4}
                    value={displayForm.receiptFooterText}
                    onChange={(e) => setDisplayForm({ ...displayForm, receiptFooterText: e.target.value })} />
                </Stack>
              </Card>
            </Stack>
          )}

          {/* ========== Tab: Product Attributes ========== */}
          {activeTab === 'products' && <ProductAttributesTab />}

          {/* ========== Tab: Users ========== */}
          {activeTab === 'users' && (
            <Stack gap="lg">
              {/* Header */}
              <Card shadow="xs" padding="lg" radius="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Group gap={8}>
                    <IconUsers size={20} color="var(--app-primary)" />
                    <Text fw={700} size="lg">ผู้ใช้งานในระบบ</Text>
                    <Badge variant="light" color="indigo" size="lg">{users.length} คน</Badge>
                  </Group>
                  {canEditUsers && (
                    <Button leftSection={<IconUserPlus size={16} />}
                      onClick={() => setAddUserOpen(true)}
                      className="settings-save-btn">
                      เพิ่มผู้ใช้งาน
                    </Button>
                  )}
                </Group>

                {/* Role legend */}
                <div className="settings-role-legend">
                  {Object.entries(ROLE_MAP).map(([key, { label, color, desc }]) => (
                    <Tooltip key={key} label={desc} position="bottom" withArrow>
                      <Badge variant="light" color={color} size="md" style={{ cursor: 'help' }}>
                        {label}
                      </Badge>
                    </Tooltip>
                  ))}
                </div>
              </Card>

              {/* Users Table */}
              <Card shadow="xs" padding="lg" radius="md" withBorder>
                {usersLoading ? (
                  <Loader style={{ margin: '40px auto', display: 'block' }} />
                ) : users.length === 0 ? (
                  <Text ta="center" c="dimmed" py="xl">ยังไม่มีผู้ใช้งาน</Text>
                ) : (
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>ชื่อ-สกุล</Table.Th>
                        <Table.Th>Username</Table.Th>
                        <Table.Th>ตำแหน่ง</Table.Th>
                        <Table.Th>สถานะ</Table.Th>
                        <Table.Th>เข้าร่วมเมื่อ</Table.Th>
                        {canEditUsers && <Table.Th ta="right">จัดการ</Table.Th>}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {users.map((u: any) => {
                        const roleMeta = ROLE_MAP[u.role] || ROLE_MAP.staff
                        const isMe = u.id === currentUser?.id
                        return (
                          <Table.Tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}>
                            <Table.Td>
                              <Group gap={8}>
                                <div className="settings-user-avatar">
                                  {(u.nick_name || u.full_name || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <Text size="sm" fw={600}>{u.full_name} {isMe && <Badge size="xs" variant="outline" color="indigo" ml={4}>คุณ</Badge>}</Text>
                                  {u.nick_name && <Text size="xs" c="dimmed">{u.nick_name}</Text>}
                                </div>
                              </Group>
                            </Table.Td>
                            <Table.Td><Text size="sm" ff="monospace">{u.username}</Text></Table.Td>
                            <Table.Td>
                              <Badge variant="light" color={roleMeta.color}>{roleMeta.label}</Badge>
                            </Table.Td>
                            <Table.Td>
                              <Badge variant="dot" color={u.is_active ? 'green' : 'red'}>
                                {u.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Text size="xs" c="dimmed">
                                {u.joined_at ? new Date(u.joined_at).toLocaleDateString('th-TH') : '-'}
                              </Text>
                            </Table.Td>
                            {canEditUsers && (
                              <Table.Td>
                                <Group gap={4} justify="flex-end">
                                  {u.role !== 'owner' && !isMe && (
                                    <Menu shadow="md" width={180}>
                                      <Menu.Target>
                                        <ActionIcon variant="subtle" color="gray">
                                          <IconDotsVertical size={16} />
                                        </ActionIcon>
                                      </Menu.Target>
                                      <Menu.Dropdown>
                                        <Menu.Item leftSection={<IconEdit size={14} />}
                                          onClick={() => { setSelectedUser(u); setEditRole(u.role); setEditRoleOpen(true) }}>
                                          เปลี่ยนตำแหน่ง
                                        </Menu.Item>
                                        <Menu.Item
                                          leftSection={u.is_active ? <IconUserOff size={14} /> : <IconUserCheck size={14} />}
                                          color={u.is_active ? 'orange' : 'green'}
                                          onClick={() => toggleActiveMutation.mutate(u.id)}>
                                          {u.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                                        </Menu.Item>
                                        {currentRole === 'owner' && (
                                          <>
                                            <Menu.Divider />
                                            <Menu.Item leftSection={<IconTrash size={14} />} color="red"
                                              onClick={() => { if (confirm('ต้องการลบผู้ใช้นี้ออกจากบริษัท?')) deleteUserMutation.mutate(u.id) }}>
                                              ลบออกจากบริษัท
                                            </Menu.Item>
                                          </>
                                        )}
                                      </Menu.Dropdown>
                                    </Menu>
                                  )}
                                </Group>
                              </Table.Td>
                            )}
                          </Table.Tr>
                        )
                      })}
                    </Table.Tbody>
                  </Table>
                )}
              </Card>

              {/* Permission reference card */}
              <Card shadow="xs" padding="lg" radius="md" withBorder>
                <Group gap={8} mb="md">
                  <IconShieldCheck size={20} color="var(--app-success)" />
                  <Text fw={700} size="lg">สิทธิ์การเข้าถึงตามตำแหน่ง</Text>
                </Group>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ฟีเจอร์</Table.Th>
                      <Table.Th ta="center">เจ้าของ</Table.Th>
                      <Table.Th ta="center">Admin</Table.Th>
                      <Table.Th ta="center">ผู้จัดการ</Table.Th>
                      <Table.Th ta="center">แคชเชียร์</Table.Th>
                      <Table.Th ta="center">บัญชี</Table.Th>
                      <Table.Th ta="center">พนักงาน</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {[
                      { name: 'POS ขายหน้าร้าน',  perms: [true, true, true, true, false, false] },
                      { name: 'ดูรายงานการขาย',    perms: [true, true, true, false, true, false] },
                      { name: 'จัดการสต๊อกสินค้า',  perms: [true, true, true, false, false, false] },
                      { name: 'จัดซื้อสินค้า',      perms: [true, true, true, false, false, false] },
                      { name: 'จัดการค่าใช้จ่าย',   perms: [true, true, true, false, true, false] },
                      { name: 'ตั้งค่าระบบ',        perms: [true, true, false, false, false, false] },
                      { name: 'จัดการผู้ใช้งาน',    perms: [true, true, false, false, false, false] },
                      { name: 'ลบผู้ใช้ออก',       perms: [true, false, false, false, false, false] },
                    ].map((row, i) => (
                      <Table.Tr key={i}>
                        <Table.Td><Text size="sm">{row.name}</Text></Table.Td>
                        {row.perms.map((ok, j) => (
                          <Table.Td key={j} ta="center">
                            <Text size="sm" c={ok ? 'green' : 'dimmed'}>{ok ? '✓' : '—'}</Text>
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card>
            </Stack>
          )}

          {/* ========== Tab: System ========== */}
          {activeTab === 'system' && (
            <Card shadow="xs" padding="lg" radius="md" withBorder>
              <Group gap={8} mb="md">
                <IconInfoCircle size={20} color="var(--app-accent)" />
                <Text fw={700} size="lg">ข้อมูลระบบ</Text>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">Company ID</Text>
                  <Text size="sm" ff="monospace">{company?.id?.slice(0, 8)}...</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">สร้างเมื่อ</Text>
                  <Text size="sm">{company?.created_at ? new Date(company.created_at).toLocaleDateString('th-TH') : '-'}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">สกุลเงิน</Text>
                  <Badge variant="light">THB (บาท)</Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">ตำแหน่งของคุณ</Text>
                  <Badge variant="light" color={ROLE_MAP[currentRole]?.color || 'gray'}>
                    {ROLE_MAP[currentRole]?.label || currentRole}
                  </Badge>
                </Group>
              </Stack>
            </Card>
          )}
        </div>
      </div>

      {/* ── Modal: Add User ── */}
      <Modal opened={addUserOpen} onClose={() => setAddUserOpen(false)} title="เพิ่มผู้ใช้งานใหม่" centered size="md">
        <Stack gap="md">
          <TextInput label="ชื่อ-สกุล" placeholder="สมชาย ใจดี" required
            value={newUser.fullName} onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })} />
          <TextInput label="ชื่อเล่น" placeholder="ชาย"
            value={newUser.nickName} onChange={(e) => setNewUser({ ...newUser, nickName: e.target.value })} />
          <TextInput label="Username" placeholder="somchai" required
            value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
          <PasswordInput label="รหัสผ่าน" placeholder="อย่างน้อย 6 ตัวอักษร" required
            value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          <Select label="ตำแหน่ง" data={ASSIGNABLE_ROLES} required
            value={newUser.role} onChange={(v) => setNewUser({ ...newUser, role: v || 'staff' })}
            renderOption={({ option }) => (
              <Group gap={8}>
                <Badge variant="light" color={ROLE_MAP[option.value]?.color} size="sm">{option.label}</Badge>
                <Text size="xs" c="dimmed">{ROLE_MAP[option.value]?.desc}</Text>
              </Group>
            )} />
          <div className="settings-info-box">
            <Text size="xs" c="dimmed">
              ผู้ใช้งานที่เพิ่มจะสามารถเข้าสู่ระบบด้วย Username / Password ที่กำหนด
              และเข้าถึงได้เฉพาะส่วนที่ตำแหน่งอนุญาต
            </Text>
          </div>
          <Group justify="flex-end" mt="sm">
            <Button variant="subtle" onClick={() => setAddUserOpen(false)}>ยกเลิก</Button>
            <Button leftSection={<IconUserPlus size={16} />}
              loading={addUserMutation.isPending}
              disabled={!newUser.username || !newUser.password || !newUser.fullName}
              onClick={() => addUserMutation.mutate(newUser)}
              className="settings-save-btn">
              เพิ่มผู้ใช้งาน
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Modal: Edit Role ── */}
      <Modal opened={editRoleOpen} onClose={() => setEditRoleOpen(false)}
        title={`เปลี่ยนตำแหน่ง — ${selectedUser?.full_name || ''}`} centered size="sm">
        <Stack gap="md">
          <Select label="ตำแหน่งใหม่" data={ASSIGNABLE_ROLES}
            value={editRole} onChange={(v) => setEditRole(v || 'staff')}
            renderOption={({ option }) => (
              <Group gap={8}>
                <Badge variant="light" color={ROLE_MAP[option.value]?.color} size="sm">{option.label}</Badge>
                <Text size="xs" c="dimmed">{ROLE_MAP[option.value]?.desc}</Text>
              </Group>
            )} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setEditRoleOpen(false)}>ยกเลิก</Button>
            <Button loading={updateRoleMutation.isPending}
              onClick={() => selectedUser && updateRoleMutation.mutate({ userId: selectedUser.id, role: editRole })}
              className="settings-save-btn">
              บันทึก
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  )
}

/* ====================================================================
   Product Attributes Tab Component
   ==================================================================== */
function ProductAttributesTab() {
  const queryClient = useQueryClient()
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroup, setEditingGroup] = useState<number | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const [newValueInputs, setNewValueInputs] = useState<Record<number, string>>({})
  const [editingValue, setEditingValue] = useState<number | null>(null)
  const [editValueName, setEditValueName] = useState('')
  const [deleteGroupModal, setDeleteGroupModal] = useState<any>(null)
  const [deleteValueModal, setDeleteValueModal] = useState<any>(null)
  const [newUnit, setNewUnit] = useState('')
  const [editingUnit, setEditingUnit] = useState<string | null>(null)
  const [editUnitName, setEditUnitName] = useState('')

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['attribute-groups'],
    queryFn: () => api.get('/products/attribute-groups').then(r => r.data),
  })

  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  const units: string[] = (company?.settings?.units) || ['ชิ้น', 'กล่อง', 'แพ็ค', 'ขวด', 'ถุง']

  const saveUnits = (newUnits: string[]) => {
    const settings = { ...(company?.settings || {}), units: newUnits }
    api.put(`/companies/${company?.id}`, { name: company?.name, settings }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['company-current'] })
      notifications.show({ title: 'สำเร็จ', message: 'บันทึกหน่วยนับสำเร็จ', color: 'green' })
    }).catch(() => {
      notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถบันทึกได้', color: 'red' })
    })
  }

  // --- Mutations ---
  const addGroupMutation = useMutation({
    mutationFn: (name: string) => api.post('/products/attribute-groups', { name }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'เพิ่มกลุ่มคุณสมบัติสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      setNewGroupName('')
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเพิ่มได้', color: 'red' }),
  })

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.put(`/products/attribute-groups/${id}`, { name }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'แก้ไขกลุ่มสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      setEditingGroup(null)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถแก้ไขได้', color: 'red' }),
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/attribute-groups/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบกลุ่มสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      setDeleteGroupModal(null)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' }),
  })

  const addValueMutation = useMutation({
    mutationFn: ({ groupId, value }: { groupId: number; value: string }) =>
      api.post(`/products/attribute-groups/${groupId}/values`, { value }),
    onSuccess: (_: any, vars: { groupId: number }) => {
      notifications.show({ title: 'สำเร็จ', message: 'เพิ่มค่าสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      setNewValueInputs(prev => ({ ...prev, [vars.groupId]: '' }))
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเพิ่มได้', color: 'red' }),
  })

  const updateValueMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) =>
      api.put(`/products/attribute-values/${id}`, { value }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'แก้ไขค่าสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      setEditingValue(null)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถแก้ไขได้', color: 'red' }),
  })

  const deleteValueMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/attribute-values/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบค่าสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      setDeleteValueModal(null)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถลบได้', color: 'red' }),
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const GROUP_COLORS = ['blue', 'green', 'violet', 'orange', 'cyan', 'pink', 'teal', 'indigo']

  return (
    <Stack gap="lg">
      {/* Header + Add new group */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <IconTags size={20} color="var(--app-primary)" />
          <Text fw={700} size="lg">กลุ่มคุณสมบัติสินค้า</Text>
          <Badge variant="light" color="indigo" size="lg">{groups.length} กลุ่ม</Badge>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          กำหนดกลุ่มคุณสมบัติ เช่น หมวดสินค้า, แบรนด์, ประเภท เพื่อใช้จัดหมวดหมู่และกรองสินค้าในหน้าสต๊อก
        </Text>
        <Group>
          <TextInput placeholder="ชื่อกลุ่มใหม่ เช่น หมวดสินค้า, แบรนด์, ประเภท..."
            style={{ flex: 1 }}
            value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newGroupName.trim()) addGroupMutation.mutate(newGroupName.trim()) }}
          />
          <Button leftSection={<IconPlus size={16} />}
            loading={addGroupMutation.isPending}
            disabled={!newGroupName.trim()}
            onClick={() => addGroupMutation.mutate(newGroupName.trim())}>
            เพิ่มกลุ่ม
          </Button>
        </Group>
      </Card>

      {/* Attribute Groups List */}
      {groups.length === 0 ? (
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <div style={{ textAlign: 'center', padding: '40px 20px', opacity: 0.6 }}>
            <IconTags size={48} />
            <Text fw={600} size="lg" mt="sm">ยังไม่มีกลุ่มคุณสมบัติ</Text>
            <Text size="sm" c="dimmed">เพิ่มกลุ่มคุณสมบัติด้านบน เช่น "หมวดสินค้า" หรือ "แบรนด์"</Text>
          </div>
        </Card>
      ) : (
        groups.map((g: any, gi: number) => {
          const color = GROUP_COLORS[gi % GROUP_COLORS.length]
          const values: any[] = g.values || []
          return (
            <Card key={g.id} shadow="xs" padding="lg" radius="md" withBorder>
              {/* Group Header */}
              <Group justify="space-between" mb="md">
                <Group gap={8}>
                  <IconGripVertical size={16} color="var(--app-text-dimmed)" style={{ opacity: 0.4 }} />
                  {editingGroup === g.id ? (
                    <Group gap={4}>
                      <TextInput size="sm" value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && editGroupName.trim()) updateGroupMutation.mutate({ id: g.id, name: editGroupName.trim() }) }}
                        style={{ width: 200 }} autoFocus />
                      <ActionIcon size="sm" variant="light" color="green"
                        onClick={() => editGroupName.trim() && updateGroupMutation.mutate({ id: g.id, name: editGroupName.trim() })}>
                        <IconCheck size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="light" color="gray" onClick={() => setEditingGroup(null)}>
                        <IconX size={14} />
                      </ActionIcon>
                    </Group>
                  ) : (
                    <>
                      <Text fw={700} size="md">{g.name}</Text>
                      <Badge variant="light" color={color} size="sm">{values.length} ค่า</Badge>
                    </>
                  )}
                </Group>
                {editingGroup !== g.id && (
                  <Group gap={4}>
                    <Tooltip label="แก้ไขชื่อกลุ่ม">
                      <ActionIcon size="sm" variant="light" color="blue"
                        onClick={() => { setEditingGroup(g.id); setEditGroupName(g.name) }}>
                        <IconEdit size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="ลบกลุ่ม">
                      <ActionIcon size="sm" variant="light" color="red"
                        onClick={() => setDeleteGroupModal(g)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                )}
              </Group>

              {/* Values List */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {values.map((v: any) => (
                  <div key={v.id}>
                    {editingValue === v.id ? (
                      <Group gap={4}>
                        <TextInput size="xs" value={editValueName}
                          onChange={(e) => setEditValueName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && editValueName.trim()) updateValueMutation.mutate({ id: v.id, value: editValueName.trim() }) }}
                          style={{ width: 120 }} autoFocus />
                        <ActionIcon size="xs" variant="light" color="green"
                          onClick={() => editValueName.trim() && updateValueMutation.mutate({ id: v.id, value: editValueName.trim() })}>
                          <IconCheck size={12} />
                        </ActionIcon>
                        <ActionIcon size="xs" variant="light" color="gray" onClick={() => setEditingValue(null)}>
                          <IconX size={12} />
                        </ActionIcon>
                      </Group>
                    ) : (
                      <Badge variant="light" color={color} size="lg"
                        style={{ cursor: 'pointer', paddingRight: 6 }}
                        rightSection={
                          <Group gap={2} ml={4}>
                            <ActionIcon size={16} variant="transparent" color={color}
                              onClick={(e) => { e.stopPropagation(); setEditingValue(v.id); setEditValueName(v.value) }}>
                              <IconEdit size={10} />
                            </ActionIcon>
                            <ActionIcon size={16} variant="transparent" color="red"
                              onClick={(e) => { e.stopPropagation(); setDeleteValueModal(v) }}>
                              <IconX size={10} />
                            </ActionIcon>
                          </Group>
                        }>
                        {v.value}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Value Input */}
              <Group gap={8}>
                <TextInput size="sm" placeholder={`เพิ่มค่าใน "${g.name}"...`}
                  style={{ flex: 1 }}
                  value={newValueInputs[g.id] || ''}
                  onChange={(e) => setNewValueInputs(prev => ({ ...prev, [g.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (newValueInputs[g.id] || '').trim()) {
                      addValueMutation.mutate({ groupId: g.id, value: (newValueInputs[g.id] || '').trim() })
                    }
                  }}
                />
                <Button size="sm" variant="light" color={color} leftSection={<IconPlus size={14} />}
                  disabled={!(newValueInputs[g.id] || '').trim()}
                  loading={addValueMutation.isPending}
                  onClick={() => addValueMutation.mutate({ groupId: g.id, value: (newValueInputs[g.id] || '').trim() })}>
                  เพิ่ม
                </Button>
              </Group>
            </Card>
          )
        })
      )}

      {/* ====== Units Management ====== */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <IconSettings size={20} color="var(--app-accent)" />
          <Text fw={700} size="lg">หน่วยนับสินค้า</Text>
          <Badge variant="light" color="pink" size="lg">{units.length} หน่วย</Badge>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          กำหนดหน่วยนับที่ใช้กับสินค้า เช่น ชิ้น, กล่อง, ขวด, แพ็ค — จะแสดงเป็นตัวเลือกในฟอร์มเพิ่ม/แก้ไขสินค้า
        </Text>

        {/* Existing Units */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {units.map((u: string) => (
            <div key={u}>
              {editingUnit === u ? (
                <Group gap={4}>
                  <TextInput size="xs" value={editUnitName}
                    onChange={(e) => setEditUnitName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editUnitName.trim() && editUnitName.trim() !== u) {
                        saveUnits(units.map(x => x === u ? editUnitName.trim() : x))
                        setEditingUnit(null)
                      }
                    }}
                    style={{ width: 100 }} autoFocus />
                  <ActionIcon size="xs" variant="light" color="green"
                    onClick={() => {
                      if (editUnitName.trim() && editUnitName.trim() !== u) {
                        saveUnits(units.map(x => x === u ? editUnitName.trim() : x))
                      }
                      setEditingUnit(null)
                    }}>
                    <IconCheck size={12} />
                  </ActionIcon>
                  <ActionIcon size="xs" variant="light" color="gray" onClick={() => setEditingUnit(null)}>
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              ) : (
                <Badge variant="light" color="pink" size="lg"
                  style={{ cursor: 'pointer', paddingRight: 6 }}
                  rightSection={
                    <Group gap={2} ml={4}>
                      <ActionIcon size={16} variant="transparent" color="pink"
                        onClick={() => { setEditingUnit(u); setEditUnitName(u) }}>
                        <IconEdit size={10} />
                      </ActionIcon>
                      <ActionIcon size={16} variant="transparent" color="red"
                        onClick={() => {
                          if (units.length <= 1) {
                            notifications.show({ title: 'ไม่สามารถลบได้', message: 'ต้องมีหน่วยนับอย่างน้อย 1 หน่วย', color: 'orange' })
                            return
                          }
                          saveUnits(units.filter(x => x !== u))
                        }}>
                        <IconX size={10} />
                      </ActionIcon>
                    </Group>
                  }>
                  {u}
                </Badge>
              )}
            </div>
          ))}
        </div>

        {/* Add Unit Input */}
        <Group gap={8}>
          <TextInput size="sm" placeholder="เพิ่มหน่วยนับใหม่ เช่น โหล, คู่, เมตร..."
            style={{ flex: 1 }}
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newUnit.trim() && !units.includes(newUnit.trim())) {
                saveUnits([...units, newUnit.trim()])
                setNewUnit('')
              }
            }}
          />
          <Button size="sm" variant="light" color="pink" leftSection={<IconPlus size={14} />}
            disabled={!newUnit.trim() || units.includes(newUnit.trim())}
            onClick={() => {
              saveUnits([...units, newUnit.trim()])
              setNewUnit('')
            }}>
            เพิ่ม
          </Button>
        </Group>
      </Card>

      {/* Delete Group Confirmation */}
      <Modal opened={!!deleteGroupModal} onClose={() => setDeleteGroupModal(null)} title="ลบกลุ่มคุณสมบัติ" size="sm" centered>
        <Stack gap="md">
          <Text>ต้องการลบกลุ่ม <strong>{deleteGroupModal?.name}</strong> และค่าทั้งหมดในกลุ่มนี้ใช่หรือไม่?</Text>
          <Text size="sm" c="dimmed">สินค้าที่เคยเลือกค่าในกลุ่มนี้จะไม่แสดงคุณสมบัตินี้อีกต่อไป</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteGroupModal(null)}>ยกเลิก</Button>
            <Button color="red" loading={deleteGroupMutation.isPending}
              onClick={() => deleteGroupMutation.mutate(deleteGroupModal?.id)}>
              ลบกลุ่ม
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Value Confirmation */}
      <Modal opened={!!deleteValueModal} onClose={() => setDeleteValueModal(null)} title="ลบค่าคุณสมบัติ" size="sm" centered>
        <Stack gap="md">
          <Text>ต้องการลบค่า <strong>{deleteValueModal?.value}</strong> ใช่หรือไม่?</Text>
          <Text size="sm" c="dimmed">สินค้าที่เคยเลือกค่านี้จะไม่แสดงคุณสมบัตินี้อีกต่อไป</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteValueModal(null)}>ยกเลิก</Button>
            <Button color="red" loading={deleteValueMutation.isPending}
              onClick={() => deleteValueMutation.mutate(deleteValueModal?.id)}>
              ลบค่า
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
