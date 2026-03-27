import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, Group, Stack, TextInput, Text, Badge, Loader,
  Modal, Select, SimpleGrid, ActionIcon, Tooltip, Menu, SegmentedControl
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconSearch, IconUsers, IconBuilding, IconPhone,
  IconMail, IconEdit, IconTrash, IconDots, IconFilterOff
} from '@tabler/icons-react'
import api from '../../services/api'

const typeLabels: Record<string, { label: string; color: string }> = {
  vendor: { label: 'ผู้ขาย', color: 'blue' },
  customer: { label: 'ลูกค้า', color: 'green' },
  both: { label: 'ทั้งสอง', color: 'grape' },
}

export default function ContactsPage() {
  const [searchParams] = useSearchParams()
  const urlType = searchParams.get('type') || ''

  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [filterType, setFilterType] = useState(urlType)
  const [form, setForm] = useState({
    name: '', contactType: urlType || 'vendor', taxId: '', phone: '', email: '',
    address: '', addressStreet: '', addressSubdistrict: '', addressDistrict: '', addressProvince: '', addressPostalCode: '',
    branch: '', bankAccount: '', bankName: '', note: ''
  })
  const [addressMode, setAddressMode] = useState<'combined' | 'separated'>('combined')

  // Sync filter with URL param when navigating via sidebar
  useEffect(() => {
    setFilterType(urlType)
  }, [urlType])

  const queryClient = useQueryClient()

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.get('/contacts').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => editId ? api.put(`/contacts/${editId}`, data) : api.post('/contacts', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: editId ? 'แก้ไขผู้ติดต่อเรียบร้อย' : 'เพิ่มผู้ติดต่อเรียบร้อย', color: 'green' })
      closeModal()
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/contacts/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบผู้ติดต่อเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
  })

  const closeModal = () => {
    setModal(false)
    setEditId(null)
    setForm({ name: '', contactType: 'vendor', taxId: '', phone: '', email: '', address: '', addressStreet: '', addressSubdistrict: '', addressDistrict: '', addressProvince: '', addressPostalCode: '', branch: '', bankAccount: '', bankName: '', note: '' })
    setAddressMode('combined')
  }

  const openEdit = (c: any) => {
    setEditId(c.id)
    const hasSeparated = c.address_street || c.address_subdistrict || c.address_district || c.address_province || c.address_postal_code
    setAddressMode(hasSeparated ? 'separated' : 'combined')
    setForm({
      name: c.name || '', contactType: c.contact_type || 'vendor', taxId: c.tax_id || '',
      phone: c.phone || '', email: c.email || '', address: c.address || '',
      addressStreet: c.address_street || '', addressSubdistrict: c.address_subdistrict || '',
      addressDistrict: c.address_district || '', addressProvince: c.address_province || '',
      addressPostalCode: c.address_postal_code || '',
      branch: c.branch || '', bankAccount: c.bank_account || '', bankName: c.bank_name || '', note: c.note || ''
    })
    setModal(true)
  }

  const handleSubmit = () => {
    if (!form.name.trim()) {
      notifications.show({ title: 'ข้อมูลไม่ครบ', message: 'กรุณาระบุชื่อผู้ติดต่อ', color: 'orange' })
      return
    }
    createMutation.mutate(form)
  }

  const filteredContacts = (contacts || []).filter((c: any) => {
    if (filterType && c.contact_type !== filterType) return false
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return (c.name || '').toLowerCase().includes(q) ||
      (c.tax_id || '').includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
  })

  const stats = {
    total: contacts?.length || 0,
    vendors: contacts?.filter((c: any) => c.contact_type === 'vendor' || c.contact_type === 'both').length || 0,
    customers: contacts?.filter((c: any) => c.contact_type === 'customer' || c.contact_type === 'both').length || 0,
  }

  const hasActiveFilters = searchText || filterType

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Text size="xl" fw={800}>👥 ผู้ติดต่อ</Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setModal(true)}
          variant="gradient" gradient={{ from: 'teal', to: 'cyan' }} radius="md">
          เพิ่มผู้ติดต่อ
        </Button>
      </Group>

      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
        <div className="stat-card">
          <Group gap={8}>
            <IconUsers size={20} color="var(--app-primary)" />
            <span className="stat-card-label">ผู้ติดต่อทั้งหมด</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-primary)' }}>{stats.total}</div>
          <span className="stat-card-label">ราย</span>
        </div>
        <div className="stat-card">
          <Group gap={8}>
            <IconBuilding size={20} color="var(--app-accent)" />
            <span className="stat-card-label">ผู้ขาย/ผู้ให้บริการ</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-accent)' }}>{stats.vendors}</div>
          <span className="stat-card-label">ราย</span>
        </div>
        <div className="stat-card">
          <Group gap={8}>
            <IconUsers size={20} color="var(--app-success)" />
            <span className="stat-card-label">ลูกค้า</span>
          </Group>
          <div className="stat-card-value" style={{ color: 'var(--app-success)' }}>{stats.customers}</div>
          <span className="stat-card-label">ราย</span>
        </div>
      </SimpleGrid>

      {/* Filter */}
      <div className="stat-card">
        <Group justify="space-between" mb="sm">
          <Group gap={8}>
            <IconSearch size={18} color="var(--app-text-dim)" />
            <Text fw={600} size="sm">ค้นหาผู้ติดต่อ</Text>
          </Group>
          {hasActiveFilters && (
            <Tooltip label="ล้างตัวกรอง">
              <ActionIcon variant="light" color="red" onClick={() => { setSearchText(''); setFilterType('') }}>
                <IconFilterOff size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <div className="filter-bar">
          <TextInput placeholder="ค้นหาชื่อ, เลขภาษี, เบอร์โทร..." leftSection={<IconSearch size={14} />}
            value={searchText} onChange={(e) => setSearchText(e.target.value)}
            style={{ flex: 3, minWidth: 200 }} size="sm" />
          <Select placeholder="ประเภท" label="ประเภท" clearable
            data={[
              { value: 'vendor', label: 'ผู้ขาย' },
              { value: 'customer', label: 'ลูกค้า' },
              { value: 'both', label: 'ทั้งสอง' },
            ]}
            value={filterType} onChange={(v) => setFilterType(v || '')}
            style={{ flex: 1, minWidth: 130 }} size="sm" />
        </div>
      </div>

      {/* Contacts Table */}
      {isLoading ? <Loader style={{ margin: '40px auto', display: 'block' }} /> : (
        <div className="stat-card" style={{ padding: 0, overflow: 'auto' }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ชื่อผู้ติดต่อ</Table.Th>
                <Table.Th ta="center">ประเภท</Table.Th>
                <Table.Th>เลขประจำตัวผู้เสียภาษี</Table.Th>
                <Table.Th>เบอร์โทร</Table.Th>
                <Table.Th>อีเมล</Table.Th>
                <Table.Th>สาขา</Table.Th>
                <Table.Th ta="center">จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredContacts.map((c: any) => {
                const tp = typeLabels[c.contact_type] || typeLabels.vendor
                return (
                  <Table.Tr key={c.id}>
                    <Table.Td>
                      <Text size="sm" fw={600}>{c.name}</Text>
                      {c.address && <Text size="xs" c="dimmed" lineClamp={1}>{c.address}</Text>}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Badge color={tp.color} variant="light" size="sm">{tp.label}</Badge>
                    </Table.Td>
                    <Table.Td><Text size="sm">{c.tax_id || '-'}</Text></Table.Td>
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
                    <Table.Td><Text size="sm">{c.branch || '-'}</Text></Table.Td>
                    <Table.Td ta="center">
                      <Menu shadow="md" width={140}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray"><IconDots size={16} /></ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
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
                        {hasActiveFilters ? 'ไม่พบข้อมูลที่ตรงกับตัวกรอง' : 'ยังไม่มีผู้ติดต่อ'}
                      </Text>
                      {!hasActiveFilters && (
                        <Button variant="light" size="xs" mt="sm" leftSection={<IconPlus size={14} />}
                          onClick={() => setModal(true)}>เพิ่มผู้ติดต่อใหม่</Button>
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
        title={editId ? '✏️ แก้ไขผู้ติดต่อ' : '➕ เพิ่มผู้ติดต่อใหม่'} size="lg" centered
        styles={{ title: { fontWeight: 700, fontSize: 18 } }}>
        <Stack gap="md">
          <Group grow>
            <TextInput label="ชื่อผู้ติดต่อ" placeholder="ชื่อบริษัท/ร้านค้า/ผู้ขาย" required
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="ประเภท" data={[
              { value: 'vendor', label: '🏭 ผู้ขาย/ผู้ให้บริการ' },
              { value: 'customer', label: '👤 ลูกค้า' },
              { value: 'both', label: '🔄 ทั้งสอง' },
            ]} value={form.contactType} onChange={(v) => setForm({ ...form, contactType: v || 'vendor' })} />
          </Group>

          <Group grow>
            <TextInput label="เลขประจำตัวผู้เสียภาษี" placeholder="1234567890123"
              value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            <TextInput label="สาขา" placeholder="สำนักงานใหญ่ / สาขาที่ 1"
              value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
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
              <TextInput placeholder="ที่อยู่เต็ม"
                value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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

          <Button variant="gradient" gradient={{ from: 'teal', to: 'cyan' }} size="md" radius="md"
            fullWidth loading={createMutation.isPending} onClick={handleSubmit} mt="sm">
            {editId ? '💾 บันทึกการแก้ไข' : '✅ เพิ่มผู้ติดต่อ'}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
