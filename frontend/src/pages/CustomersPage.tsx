import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Table, Button, Group, Stack, TextInput, Text, Badge, Loader,
  Modal, Select, SimpleGrid, ActionIcon, Tooltip, Menu, SegmentedControl
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconSearch, IconUsers, IconPhone,
  IconMail, IconEdit, IconTrash, IconDots, IconFilterOff
} from '@tabler/icons-react'
import api from '../services/api'

const typeLabels: Record<string, { label: string; color: string }> = {
  customer: { label: 'ลูกค้า', color: 'green' },
  both: { label: 'ทั้งสอง', color: 'grape' },
}

export default function CustomersPage() {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [form, setForm] = useState({
    name: '', contactType: 'customer', taxId: '', phone: '', email: '',
    address: '', addressStreet: '', addressSubdistrict: '', addressDistrict: '', addressProvince: '', addressPostalCode: '',
    branch: '', bankAccount: '', bankName: '', note: ''
  })
  const [addressMode, setAddressMode] = useState<'combined' | 'separated'>('combined')

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
    setForm({ name: '', contactType: 'customer', taxId: '', phone: '', email: '', address: '', addressStreet: '', addressSubdistrict: '', addressDistrict: '', addressProvince: '', addressPostalCode: '', branch: '', bankAccount: '', bankName: '', note: '' })
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
      branch: c.branch || '', bankAccount: c.bank_account || '', bankName: c.bank_name || '', note: c.note || ''
    })
    setModal(true)
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
                <Table.Th>เลขประจำตัวผู้เสียภาษี</Table.Th>
                <Table.Th>เบอร์โทร</Table.Th>
                <Table.Th>อีเมล</Table.Th>
                <Table.Th>สาขา</Table.Th>
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
        title={editId ? '✏️ แก้ไขลูกค้า' : '➕ เพิ่มลูกค้าใหม่'} size="lg" centered
        styles={{ title: { fontWeight: 700, fontSize: 18 } }}>
        <Stack gap="md">
          <Group grow>
            <TextInput label="ชื่อลูกค้า" placeholder="ชื่อบริษัท/ร้านค้า/ลูกค้า" required
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="ประเภท" data={[
              { value: 'customer', label: '👤 ลูกค้า' },
              { value: 'both', label: '🔄 ทั้งสอง (ลูกค้า+ผู้จำหน่าย)' },
            ]} value={form.contactType} onChange={(v) => setForm({ ...form, contactType: v || 'customer' })} />
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

          <Button variant="gradient" gradient={{ from: 'teal', to: 'green' }} size="md" radius="md"
            fullWidth loading={createMutation.isPending} onClick={handleSubmit} mt="sm">
            {editId ? '💾 บันทึกการแก้ไข' : '✅ เพิ่มลูกค้า'}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
