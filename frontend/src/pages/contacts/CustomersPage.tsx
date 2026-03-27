import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, Group, Stack, TextInput, Text, Badge, Loader,
  Modal, Select, SimpleGrid, ActionIcon, Tooltip, Menu, SegmentedControl, Tabs, NumberInput
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconSearch, IconUsers, IconPhone,
  IconMail, IconEdit, IconTrash, IconDots, IconFilterOff,
  IconArrowsSplit, IconStar, IconHistory, IconAdjustments, IconReceipt
} from '@tabler/icons-react'
import api from '../../services/api'

const priceLevelLabels: Record<string, { label: string; color: string }> = {
  retail: { label: 'ปลีก', color: 'gray' },
  wholesale: { label: 'ขายส่ง', color: 'blue' },
  vip: { label: 'VIP', color: 'grape' },
}

const fmt = (n: number) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2 }).format(n)
const fmtDate = (d: string) => {
  const dt = new Date(d)
  return dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' }) + ' ' +
    dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

const typeLabels: Record<string, { label: string; color: string }> = {
  customer: { label: 'ลูกค้า', color: 'green' },
  both: { label: 'ทั้งสอง', color: 'grape' },
}

// === Thai address parser ===
const THAI_PROVINCES = [
  'กรุงเทพมหานคร','กรุงเทพฯ','กรุงเทพ','กทม','กทม.',
  'สมุทรปราการ','นนทบุรี','ปทุมธานี','พระนครศรีอยุธยา','อยุธยา','อ่างทอง','ลพบุรี','สิงห์บุรี','ชัยนาท',
  'สระบุรี','ชลบุรี','ระยอง','จันทบุรี','ตราด','ฉะเชิงเทรา','ปราจีนบุรี','นครนายก','สระแก้ว',
  'นครราชสีมา','โคราช','บุรีรัมย์','สุรินทร์','ศรีสะเกษ','อุบลราชธานี','ยโสธร','ชัยภูมิ','อำนาจเจริญ',
  'บึงกาฬ','หนองบัวลำภู','ขอนแก่น','อุดรธานี','เลย','หนองคาย','มหาสารคาม','ร้อยเอ็ด','กาฬสินธุ์',
  'สกลนคร','นครพนม','มุกดาหาร','เชียงใหม่','ลำพูน','ลำปาง','อุตรดิตถ์','แพร่','น่าน','พะเยา',
  'เชียงราย','แม่ฮ่องสอน','นครสวรรค์','อุทัยธานี','กำแพงเพชร','ตาก','สุโขทัย','พิษณุโลก','พิจิตร',
  'เพชรบูรณ์','ราชบุรี','กาญจนบุรี','สุพรรณบุรี','นครปฐม','สมุทรสาคร','สมุทรสงคราม','เพชรบุรี',
  'ประจวบคีรีขันธ์','ประจวบฯ','นครศรีธรรมราช','กระบี่','พังงา','ภูเก็ต','สุราษฎร์ธานี','ระนอง','ชุมพร',
  'สงขลา','สตูล','ตรัง','พัทลุง','ปัตตานี','ยะลา','นราธิวาส',
]

function parseThaiAddress(raw: string) {
  const result = { street: '', subdistrict: '', district: '', province: '', postalCode: '' }
  if (!raw || !raw.trim()) return result

  let text = raw.trim()
    .replace(/\s+/g, ' ')
    // normalize ต., อ., จ., แขวง, เขต prefixes

  // 1. Extract postal code (5 digits)
  const postalMatch = text.match(/(\d{5})/)
  if (postalMatch) {
    result.postalCode = postalMatch[1]
    text = text.replace(postalMatch[0], '').trim()
  }

  // 2. Extract province
  // Try with จ./จังหวัด prefix first
  const provPrefixMatch = text.match(/(?:จ\.|จังหวัด)\s*([^\s,]+(?:\s*[^\s,]+)?)/)
  if (provPrefixMatch) {
    result.province = provPrefixMatch[1].trim()
    text = text.replace(provPrefixMatch[0], '').trim()
  } else {
    // Try matching known province names
    for (const prov of THAI_PROVINCES) {
      if (text.includes(prov)) {
        result.province = prov === 'กรุงเทพฯ' || prov === 'กรุงเทพ' || prov === 'กทม' || prov === 'กทม.'
          ? 'กรุงเทพมหานคร' : prov === 'โคราช' ? 'นครราชสีมา' : prov === 'อยุธยา' ? 'พระนครศรีอยุธยา' : prov
        text = text.replace(prov, '').trim()
        break
      }
    }
  }

  // 3. Extract district (เขต/อ./อำเภอ)
  const distMatch = text.match(/(?:เขต|อ\.|อำเภอ)\s*([^\s,]+(?:\s*[^\s,]+)?)/)
  if (distMatch) {
    result.district = distMatch[1].trim()
    text = text.replace(distMatch[0], '').trim()
  }

  // 4. Extract subdistrict (แขวง/ต./ตำบล)
  const subDistMatch = text.match(/(?:แขวง|ต\.|ตำบล)\s*([^\s,]+(?:\s*[^\s,]+)?)/)
  if (subDistMatch) {
    result.subdistrict = subDistMatch[1].trim()
    text = text.replace(subDistMatch[0], '').trim()
  }

  // 5. If no prefix-based parsing worked for district/subdistrict,
  //    try splitting the remainder by common delimiters
  if (!result.district && !result.subdistrict) {
    // Split by spaces or commas, work backwards from province
    const parts = text.split(/[,/]+/).map(s => s.trim()).filter(Boolean)
    if (parts.length >= 3) {
      result.street = parts.slice(0, -2).join(' ')
      result.subdistrict = parts[parts.length - 2]
      result.district = parts[parts.length - 1]
    } else if (parts.length === 2) {
      result.street = parts[0]
      result.district = parts[1]
    } else {
      result.street = text
    }
  } else {
    // Clean up remaining text as street
    result.street = text.replace(/[,]+$/, '').replace(/^[,]+/, '').trim()
  }

  // Clean trailing/leading commas and spaces
  Object.keys(result).forEach(k => {
    result[k as keyof typeof result] = result[k as keyof typeof result].replace(/^[,\s]+|[,\s]+$/g, '').trim()
  })

  return result
}

export default function CustomersPage() {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [form, setForm] = useState({
    name: '', contactType: 'customer', taxId: '', phone: '', email: '',
    address: '', addressStreet: '', addressSubdistrict: '', addressDistrict: '', addressProvince: '', addressPostalCode: '',
    branch: '', bankAccount: '', bankName: '', priceLevel: 'retail', note: ''
  })
  const [addressMode, setAddressMode] = useState<'combined' | 'separated'>('combined')
  const [detailModal, setDetailModal] = useState(false)
  const [detailContact, setDetailContact] = useState<any>(null)
  const [detailTab, setDetailTab] = useState<string | null>('info')
  const [adjustPoints, setAdjustPoints] = useState<number>(0)
  const [adjustDesc, setAdjustDesc] = useState('')

  const queryClient = useQueryClient()

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts-customers'],
    queryFn: () => api.get('/contacts', { params: { type: 'customer' } }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => editId ? api.put(`/contacts/${editId}`, data) : api.post('/contacts', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: editId ? 'แก้ไขข้อมูลลูกค้าเรียบร้อย' : 'เพิ่มลูกค้าเรียบร้อย', color: 'green' })
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['contacts-customers'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/contacts/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบลูกค้าเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['contacts-customers'] })
    },
  })

  const closeModal = () => {
    setModal(false)
    setEditId(null)
    setForm({ name: '', contactType: 'customer', taxId: '', phone: '', email: '', address: '', addressStreet: '', addressSubdistrict: '', addressDistrict: '', addressProvince: '', addressPostalCode: '', branch: '', bankAccount: '', bankName: '', priceLevel: 'retail', note: '' })
    setAddressMode('combined')
  }

  const openEdit = (c: any) => {
    setEditId(c.id)
    const hasSeparated = c.address_street || c.address_subdistrict || c.address_district || c.address_province || c.address_postal_code
    setAddressMode(hasSeparated ? 'separated' : 'combined')
    setForm({
      name: c.name || '', contactType: c.contact_type || 'customer', taxId: c.tax_id || '',
      phone: c.phone || '', email: c.email || '', address: c.address || '',
      addressStreet: c.address_street || '', addressSubdistrict: c.address_subdistrict || '',
      addressDistrict: c.address_district || '', addressProvince: c.address_province || '',
      addressPostalCode: c.address_postal_code || '',
      branch: c.branch || '', bankAccount: c.bank_account || '', bankName: c.bank_name || '',
      priceLevel: c.price_level || 'retail', note: c.note || ''
    })
    setModal(true)
  }

  // === Detail modal queries (only when detailContact is set) ===
  const { data: loyaltyData, refetch: refetchLoyalty } = useQuery({
    queryKey: ['loyalty-detail', detailContact?.id],
    queryFn: () => api.get(`/loyalty/${detailContact.id}`).then(r => r.data),
    enabled: !!detailContact,
  })

  const { data: purchaseHistory } = useQuery({
    queryKey: ['customer-purchases', detailContact?.id],
    queryFn: () => api.get(`/loyalty/${detailContact.id}/purchases`).then(r => r.data),
    enabled: !!detailContact,
  })

  const adjustMutation = useMutation({
    mutationFn: (data: any) => api.post('/loyalty/adjust', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ปรับแต้มเรียบร้อย', color: 'green' })
      refetchLoyalty()
      queryClient.invalidateQueries({ queryKey: ['contacts-customers'] })
      setAdjustPoints(0)
      setAdjustDesc('')
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถปรับแต้มได้', color: 'red' })
    },
  })

  const openDetail = (c: any) => {
    setDetailContact(c)
    setDetailTab('info')
    setDetailModal(true)
    setAdjustPoints(0)
    setAdjustDesc('')
  }

  const handleSubmit = () => {
    if (!form.name.trim()) {
      notifications.show({ title: 'ข้อมูลไม่ครบ', message: 'กรุณาระบุชื่อลูกค้า', color: 'orange' })
      return
    }
    createMutation.mutate(form)
  }

  const filteredContacts = (contacts || []).filter((c: any) => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return (c.name || '').toLowerCase().includes(q) ||
      (c.tax_id || '').includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
  })

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Text size="xl" fw={800}>👤 ลูกค้า</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setModal(true)}
          variant="gradient" gradient={{ from: 'teal', to: 'green' }} radius="md">
          เพิ่มลูกค้า
        </Button>
      </Group>

      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <div className="stat-card">
          <Group gap={8}>
            <IconUsers size={20} color="var(--app-success)" />
            <span className="stat-card-label">ลูกค้าทั้งหมด</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-success)' }}>{contacts?.length || 0}</div>
          <span className="stat-card-label">ราย</span>
        </div>
        <div className="stat-card">
          <Group gap={8}>
            <IconSearch size={20} color="var(--app-text-dim)" />
            <span className="stat-card-label">แสดงผล</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-text-dim)' }}>{filteredContacts.length}</div>
          <span className="stat-card-label">ราย</span>
        </div>
      </SimpleGrid>

      {/* Search */}
      <div className="stat-card">
        <Group justify="space-between" mb="sm">
          <Group gap={8}>
            <IconSearch size={18} color="var(--app-text-dim)" />
            <Text fw={600} size="sm">ค้นหาลูกค้า</Text>
          </Group>
          {searchText && (
            <Tooltip label="ล้างตัวกรอง">
              <ActionIcon variant="light" color="red" onClick={() => setSearchText('')}>
                <IconFilterOff size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <TextInput placeholder="ค้นหาชื่อ, เลขภาษี, เบอร์โทร..." leftSection={<IconSearch size={14} />}
          value={searchText} onChange={(e) => setSearchText(e.target.value)}
          style={{ maxWidth: 500 }} size="sm" />
      </div>

      {/* Customers Table */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ชื่อลูกค้า</Table.Th>
                <Table.Th ta="center">ประเภท</Table.Th>
                <Table.Th ta="center">ระดับราคา</Table.Th>
                <Table.Th ta="right">แต้มสะสม</Table.Th>
                <Table.Th>เบอร์โทร</Table.Th>
                <Table.Th>อีเมล</Table.Th>
                <Table.Th ta="center">จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredContacts.map((c: any) => {
                const tp = typeLabels[c.contact_type] || typeLabels.customer
                return (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>{c.name}</Text>
                      {c.address && <Text size="xs" c="dimmed" lineClamp={1}>{c.address}</Text>}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Badge color={tp.color} variant="light" size="sm">{tp.label}</Badge>
                    </Table.Td>
                    <Table.Td ta="center">
                      {(() => { const pl = priceLevelLabels[c.price_level] || priceLevelLabels.retail; return <Badge color={pl.color} variant="light" size="sm">{pl.label}</Badge> })()}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Group gap={4} justify="flex-end">
                        <IconStar size={12} color="#ca8a04" />
                        <Text size="sm" fw={600} c="yellow.7">{c.points_balance || 0}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {c.phone ? (
                        <Group gap={4}>
                          <IconPhone size={14} color="var(--app-text-dim)" />
                          <Text size="sm">{c.phone}</Text>
                        </Group>
                      ) : <Text size="sm" c="dimmed">-</Text>}
                    </Table.Td>
                    <Table.Td>
                      {c.email ? (
                        <Group gap={4}>
                          <IconMail size={14} color="var(--app-text-dim)" />
                          <Text size="sm">{c.email}</Text>
                        </Group>
                      ) : <Text size="sm" c="dimmed">-</Text>}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Menu shadow="md" width={160}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray"><IconDots size={16} /></ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconHistory size={14} />} onClick={() => openDetail(c)}>
                            ดูประวัติ
                          </Menu.Item>
                          <Menu.Item leftSection={<IconEdit size={14} />} onClick={() => openEdit(c)}>
                            แก้ไข
                          </Menu.Item>
                          <Menu.Item leftSection={<IconTrash size={14} />} color="red"
                            onClick={() => deleteMutation.mutate(c.id)}>
                            ลบ
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                )
              })}
              {filteredContacts.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <div className="empty-state">
                      <IconUsers size={48} color="var(--app-text-dim)" style={{ opacity: 0.4 }} />
                      <Text c="dimmed" size="sm" mt="sm">
                        {searchText ? 'ไม่พบข้อมูลที่ตรงกับตัวกรอง' : 'ยังไม่มีลูกค้า'}
                      </Text>
                      {!searchText && (
                        <Button variant="light" size="xs" mt="sm" leftSection={<IconPlus size={14} />}
                          onClick={() => setModal(true)}>เพิ่มลูกค้าใหม่</Button>
                      )}
                    </div>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal opened={modal} onClose={closeModal}
        title={editId ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้าใหม่'} size="lg" centered
        styles={{ title: { fontWeight: 700, fontSize: 18 } }}>
        <Stack gap="md">
          <Group grow>
            <TextInput label="ชื่อลูกค้า" placeholder="ชื่อบริษัท/ร้านค้า/ลูกค้า" required
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="ประเภท" data={[
              { value: 'customer', label: 'ลูกค้า' },
              { value: 'both', label: 'ทั้งสอง (ลูกค้า+ผู้จำหน่าย)' },
            ]} value={form.contactType} onChange={(v) => setForm({ ...form, contactType: v || 'customer' })} />
          </Group>

          <Group grow>
            <Select label="ระดับราคา" data={[
              { value: 'retail', label: 'ปลีก (Retail)' },
              { value: 'wholesale', label: 'ขายส่ง (Wholesale)' },
              { value: 'vip', label: 'VIP' },
            ]} value={form.priceLevel} onChange={(v) => setForm({ ...form, priceLevel: v || 'retail' })} />
            <TextInput label="สาขา" placeholder="สำนักงานใหญ่ / สาขาที่ 1"
              value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
          </Group>

          <Group grow>
            <TextInput label="เลขประจำตัวผู้เสียภาษี" placeholder="1234567890123"
              value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </Group>

          <Group grow>
            <TextInput label="เบอร์โทร" placeholder="08X-XXX-XXXX" leftSection={<IconPhone size={14} />}
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <TextInput label="อีเมล" placeholder="email@company.com" leftSection={<IconMail size={14} />}
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Group>

          <div>
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500}>ที่อยู่</Text>
              <SegmentedControl size="xs" value={addressMode}
                onChange={(v: any) => setAddressMode(v)}
                data={[
                  { value: 'combined', label: 'รวมที่อยู่' },
                  { value: 'separated', label: 'แยกที่อยู่' },
                ]} />
            </Group>
            {addressMode === 'combined' ? (
              <Group gap="xs" align="flex-end">
                <TextInput placeholder="เช่น 123 ถ.สุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพฯ 10110"
                  value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  style={{ flex: 1 }} />
                <Tooltip label="กระจายที่อยู่ -> แยกแต่ละช่อง">
                  <Button variant="light" color="indigo" size="sm"
                    leftSection={<IconArrowsSplit size={16} />}
                    disabled={!form.address.trim()}
                    onClick={() => {
                      const parsed = parseThaiAddress(form.address)
                      setForm((f: any) => ({
                        ...f,
                        addressStreet: parsed.street,
                        addressSubdistrict: parsed.subdistrict,
                        addressDistrict: parsed.district,
                        addressProvince: parsed.province,
                        addressPostalCode: parsed.postalCode,
                      }))
                      setAddressMode('separated')
                      notifications.show({
                        title: 'กระจายที่อยู่สำเร็จ',
                        message: 'กรุณาตรวจสอบความถูกต้องและแก้ไขเพิ่มเติม',
                        color: 'indigo',
                        autoClose: 3000,
                      })
                    }}
                    style={{ flexShrink: 0 }}>
                    กระจายที่อยู่
                  </Button>
                </Tooltip>
              </Group>
            ) : (
              <Stack gap="xs">
                <TextInput label="เลขที่/ถนน" placeholder="123 ถ.สุขุมวิท ซ.3"
                  value={form.addressStreet} onChange={(e) => setForm({ ...form, addressStreet: e.target.value })} />
                <Group grow>
                  <TextInput label="แขวง/ตำบล" placeholder="คลองตันเหนือ"
                    value={form.addressSubdistrict} onChange={(e) => setForm({ ...form, addressSubdistrict: e.target.value })} />
                  <TextInput label="เขต/อำเภอ" placeholder="บางกะปิ"
                    value={form.addressDistrict} onChange={(e) => setForm({ ...form, addressDistrict: e.target.value })} />
                </Group>
                <Group grow>
                  <TextInput label="จังหวัด" placeholder="กรุงเทพมหานคร"
                    value={form.addressProvince} onChange={(e) => setForm({ ...form, addressProvince: e.target.value })} />
                  <TextInput label="รหัสไปรษณีย์" placeholder="10260"
                    value={form.addressPostalCode} onChange={(e) => setForm({ ...form, addressPostalCode: e.target.value })} />
                </Group>
              </Stack>
            )}
          </div>

          <Group grow>
            <TextInput label="ธนาคาร" placeholder="ชื่อธนาคาร"
              value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            <TextInput label="เลขที่บัญชี" placeholder="XXX-X-XXXXX-X"
              value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
          </Group>

          <TextInput label="หมายเหตุ" placeholder="หมายเหตุเพิ่มเติม"
            value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

          <Button variant="gradient" gradient={{ from: 'teal', to: 'green' }} size="md" radius="md"
            fullWidth loading={createMutation.isPending} onClick={handleSubmit} mt="sm">
            {editId ? 'บันทึกการแก้ไข' : 'เพิ่มลูกค้า'}
          </Button>
        </Stack>
      </Modal>

      {/* Customer Detail/Loyalty Modal */}
      <Modal opened={detailModal} onClose={() => { setDetailModal(false); setDetailContact(null) }}
        title={detailContact ? `${detailContact.name}` : 'รายละเอียดลูกค้า'}
        size="lg" centered styles={{ title: { fontWeight: 700, fontSize: 18 } }}>
        {detailContact && (
          <Tabs value={detailTab} onChange={setDetailTab}>
            <Tabs.List mb="md">
              <Tabs.Tab value="info" leftSection={<IconUsers size={14} />}>ข้อมูล</Tabs.Tab>
              <Tabs.Tab value="loyalty" leftSection={<IconStar size={14} />}>แต้มสะสม</Tabs.Tab>
              <Tabs.Tab value="purchases" leftSection={<IconReceipt size={14} />}>ประวัติซื้อ</Tabs.Tab>
            </Tabs.List>

            {/* Info Tab */}
            <Tabs.Panel value="info">
              <Stack gap="sm">
                <SimpleGrid cols={2}>
                  <div>
                    <Text size="xs" c="dimmed">ระดับราคา</Text>
                    <Badge color={priceLevelLabels[detailContact.price_level]?.color || 'gray'} variant="light" size="lg" mt={4}>
                      {priceLevelLabels[detailContact.price_level]?.label || 'ปลีก'}
                    </Badge>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">แต้มสะสม</Text>
                    <Group gap={4} mt={4}>
                      <IconStar size={16} color="#ca8a04" />
                      <Text size="lg" fw={700} c="yellow.7">{detailContact.points_balance || 0} แต้ม</Text>
                    </Group>
                  </div>
                </SimpleGrid>
                <SimpleGrid cols={2}>
                  <div><Text size="xs" c="dimmed">เบอร์โทร</Text><Text size="sm">{detailContact.phone || '-'}</Text></div>
                  <div><Text size="xs" c="dimmed">อีเมล</Text><Text size="sm">{detailContact.email || '-'}</Text></div>
                  <div><Text size="xs" c="dimmed">เลขภาษี</Text><Text size="sm">{detailContact.tax_id || '-'}</Text></div>
                  <div><Text size="xs" c="dimmed">สาขา</Text><Text size="sm">{detailContact.branch || '-'}</Text></div>
                </SimpleGrid>
                {detailContact.address && (
                  <div><Text size="xs" c="dimmed">ที่อยู่</Text><Text size="sm">{detailContact.address}</Text></div>
                )}
              </Stack>
            </Tabs.Panel>

            {/* Loyalty Tab */}
            <Tabs.Panel value="loyalty">
              <Stack gap="md">
                <div style={{ textAlign: 'center', padding: '12px 0', background: 'var(--mantine-color-yellow-0)', borderRadius: 8 }}>
                  <Text size="sm" c="dimmed">แต้มสะสมปัจจุบัน</Text>
                  <Text size="xl" fw={800} c="yellow.7">{loyaltyData?.contact?.points_balance || detailContact.points_balance || 0} แต้ม</Text>
                </div>

                {/* Adjust points */}
                <div style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, padding: 12 }}>
                  <Text size="sm" fw={600} mb="xs"><IconAdjustments size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />ปรับแต้มด้วยมือ</Text>
                  <Group gap="sm">
                    <NumberInput size="xs" placeholder="จำนวน (+/-)" value={adjustPoints || ''}
                      onChange={v => setAdjustPoints(Number(v) || 0)} style={{ flex: 1 }} />
                    <TextInput size="xs" placeholder="เหตุผล" value={adjustDesc}
                      onChange={e => setAdjustDesc(e.target.value)} style={{ flex: 2 }} />
                    <Button size="xs" color="orange" disabled={adjustPoints === 0}
                      loading={adjustMutation.isPending}
                      onClick={() => adjustMutation.mutate({ contactId: detailContact.id, points: adjustPoints, description: adjustDesc })}>
                      ปรับ
                    </Button>
                  </Group>
                </div>

                {/* Transaction history */}
                <div>
                  <Text size="sm" fw={600} mb="xs">ประวัติแต้ม</Text>
                  {(loyaltyData?.transactions || []).length === 0 ? (
                    <Text size="sm" c="dimmed" ta="center" py="md">ยังไม่มีประวัติแต้มสะสม</Text>
                  ) : (
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>วันที่</Table.Th>
                          <Table.Th>ประเภท</Table.Th>
                          <Table.Th ta="right">แต้ม</Table.Th>
                          <Table.Th ta="right">คงเหลือ</Table.Th>
                          <Table.Th>รายละเอียด</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {(loyaltyData?.transactions || []).map((t: any) => (
                          <Table.Tr key={t.id}>
                            <Table.Td><Text size="xs">{fmtDate(t.created_at)}</Text></Table.Td>
                            <Table.Td>
                              <Badge size="xs" variant="light" color={t.type === 'earn' ? 'green' : t.type === 'redeem' ? 'red' : 'orange'}>
                                {t.type === 'earn' ? 'สะสม' : t.type === 'redeem' ? 'แลก' : 'ปรับ'}
                              </Badge>
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="sm" fw={600} c={t.points > 0 ? 'green' : 'red'}>
                                {t.points > 0 ? '+' : ''}{t.points}
                              </Text>
                            </Table.Td>
                            <Table.Td ta="right"><Text size="sm">{t.balance_after}</Text></Table.Td>
                            <Table.Td><Text size="xs" c="dimmed" lineClamp={1}>{t.description || '-'}</Text></Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </div>
              </Stack>
            </Tabs.Panel>

            {/* Purchases Tab */}
            <Tabs.Panel value="purchases">
              {(purchaseHistory || []).length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="xl">ยังไม่มีประวัติการซื้อ</Text>
              ) : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>เลขที่บิล</Table.Th>
                      <Table.Th>วันที่</Table.Th>
                      <Table.Th ta="right">ยอดรวม</Table.Th>
                      <Table.Th>ช่องทาง</Table.Th>
                      <Table.Th ta="center">สถานะ</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(purchaseHistory || []).map((s: any) => (
                      <Table.Tr key={s.id}>
                        <Table.Td><Text size="sm" fw={600}>{s.invoice_number}</Text></Table.Td>
                        <Table.Td><Text size="xs">{fmtDate(s.sold_at)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(parseFloat(s.net_amount))}</Text></Table.Td>
                        <Table.Td><Text size="xs">{s.payment_method}</Text></Table.Td>
                        <Table.Td ta="center">
                          <Badge size="xs" variant="light" color={s.status === 'completed' ? 'green' : s.status === 'voided' ? 'red' : 'gray'}>
                            {s.status === 'completed' ? 'สำเร็จ' : s.status === 'voided' ? 'ยกเลิก' : s.status}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Tabs.Panel>
          </Tabs>
        )}
      </Modal>
    </Stack>
  )
}
