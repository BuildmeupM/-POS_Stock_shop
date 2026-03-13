import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Title, Text, Button, Group, Stack, TextInput, Select, Modal,
  ActionIcon, Badge, Switch, Textarea, Card, SimpleGrid, Tooltip,
  ThemeIcon, Divider, Loader
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconPencil, IconTrash, IconCash, IconBuildingBank,
  IconCreditCard, IconQrcode, IconWallet, IconCheck, IconStar,
  IconStarFilled, IconSearch
} from '@tabler/icons-react'
import api from '../services/api'

const channelTypes = [
  { value: 'cash', label: '💵 เงินสด', icon: IconCash, color: 'green' },
  { value: 'bank_account', label: '🏦 บัญชีธนาคาร', icon: IconBuildingBank, color: 'blue' },
  { value: 'promptpay', label: '📱 พร้อมเพย์', icon: IconQrcode, color: 'indigo' },
  { value: 'credit_card', label: '💳 บัตรเครดิต', icon: IconCreditCard, color: 'violet' },
  { value: 'e_wallet', label: '👛 E-Wallet', icon: IconWallet, color: 'teal' },
  { value: 'other', label: '📋 อื่นๆ', icon: IconCash, color: 'gray' },
]

const bankOptions = [
  { value: 'กสิกรไทย (KBANK)', label: '🟢 กสิกรไทย (KBANK)' },
  { value: 'ไทยพาณิชย์ (SCB)', label: '🟣 ไทยพาณิชย์ (SCB)' },
  { value: 'กรุงเทพ (BBL)', label: '🔵 กรุงเทพ (BBL)' },
  { value: 'กรุงไทย (KTB)', label: '🟡 กรุงไทย (KTB)' },
  { value: 'กรุงศรี (BAY)', label: '🟠 กรุงศรี (BAY)' },
  { value: 'ทหารไทยธนชาต (TTB)', label: '🔷 ทหารไทยธนชาต (TTB)' },
  { value: 'ออมสิน (GSB)', label: '🏛️ ออมสิน (GSB)' },
  { value: 'ธ.ก.ส. (BAAC)', label: '🌾 ธ.ก.ส. (BAAC)' },
  { value: 'อื่นๆ', label: '📋 อื่นๆ' },
]

const emptyForm = {
  name: '', type: 'cash' as string, accountName: '', accountNumber: '',
  bankName: '', qrCodeUrl: '', icon: '', isDefault: false, isActive: true, note: '',
}

export default function WalletPage() {
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [nextCode, setNextCode] = useState('')
  const queryClient = useQueryClient()

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get('/wallet').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: any) => editId
      ? api.put(`/wallet/${editId}`, data)
      : api.post('/wallet', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      notifications.show({
        title: editId ? '✅ อัปเดตสำเร็จ' : '✅ เพิ่มช่องทางสำเร็จ',
        message: form.name,
        color: 'green',
      })
      closeModal()
    },
    onError: () => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: 'กรุณาลองอีกครั้ง', color: 'red' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/wallet/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      notifications.show({ title: '🗑️ ลบช่องทางสำเร็จ', message: '', color: 'orange' })
    },
  })

  const openCreate = () => {
    setEditId(null)
    setForm(emptyForm)
    setNextCode('')
    setShowModal(true)
    // Fetch next auto-generated code
    api.get('/wallet/next-code').then(r => setNextCode(r.data.code)).catch(() => {})
  }

  const openEdit = (ch: any) => {
    setEditId(ch.id)
    setNextCode(ch.channel_code || '')
    setForm({
      name: ch.name,
      type: ch.type,
      accountName: ch.account_name || '',
      accountNumber: ch.account_number || '',
      bankName: ch.bank_name || '',
      qrCodeUrl: ch.qr_code_url || '',
      icon: ch.icon || '',
      isDefault: !!ch.is_default,
      isActive: ch.is_active !== false && ch.is_active !== 0,
      note: ch.note || '',
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setNextCode('')
    setForm(emptyForm)
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      notifications.show({ title: 'กรุณาระบุชื่อ', message: '', color: 'yellow' })
      return
    }
    saveMutation.mutate(form)
  }

  const getTypeInfo = (type: string) => channelTypes.find(t => t.value === type) || channelTypes[5]

  const filteredChannels = channels.filter((ch: any) =>
    !search || ch.name.toLowerCase().includes(search.toLowerCase()) ||
    (ch.channel_code && ch.channel_code.toLowerCase().includes(search.toLowerCase())) ||
    (ch.account_number && ch.account_number.includes(search)) ||
    (ch.bank_name && ch.bank_name.toLowerCase().includes(search.toLowerCase()))
  )

  const showBankFields = ['bank_account', 'promptpay'].includes(form.type)

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" align="center">
        <div>
          <Title order={3}>💰 กระเป๋าเงิน</Title>
          <Text size="sm" c="dimmed">จัดการช่องทางรับชำระเงินทั้งหมด</Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate}
          style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>
          เพิ่มช่องทาง
        </Button>
      </Group>

      {/* Search */}
      <TextInput
        placeholder="🔍 ค้นหาช่องทางชำระเงิน..."
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="sm"
      />

      {/* Summary Cards */}
      <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="sm">
        {channelTypes.map(ct => {
          const count = channels.filter((c: any) => c.type === ct.value && c.is_active).length
          return (
            <Card key={ct.value} padding="sm" radius="md" withBorder
              style={{ borderColor: count > 0 ? `var(--mantine-color-${ct.color}-3)` : undefined }}>
              <Group gap={8}>
                <ThemeIcon size="sm" variant="light" color={ct.color} radius="xl">
                  <ct.icon size={14} />
                </ThemeIcon>
                <div>
                  <Text size="xs" c="dimmed">{ct.label.split(' ').slice(1).join(' ')}</Text>
                  <Text size="lg" fw={700}>{count}</Text>
                </div>
              </Group>
            </Card>
          )
        })}
      </SimpleGrid>

      <Divider />

      {/* Channel List */}
      {isLoading ? (
        <Stack align="center" py="xl"><Loader /><Text size="sm" c="dimmed">กำลังโหลด...</Text></Stack>
      ) : filteredChannels.length === 0 ? (
        <Stack align="center" py={60} gap="sm" opacity={0.5}>
          <IconWallet size={48} />
          <Text fw={500}>ยังไม่มีช่องทางชำระเงิน</Text>
          <Text size="sm">กดปุ่ม "เพิ่มช่องทาง" เพื่อเริ่มต้น</Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {filteredChannels.map((ch: any) => {
            const typeInfo = getTypeInfo(ch.type)
            const TypeIcon = typeInfo.icon
            return (
              <Card key={ch.id} padding="md" radius="lg" withBorder
                style={{
                  borderColor: ch.is_default ? `var(--mantine-color-${typeInfo.color}-4)` : undefined,
                  borderWidth: ch.is_default ? 2 : 1,
                  background: ch.is_active ? undefined : 'rgba(0,0,0,0.02)',
                  opacity: ch.is_active ? 1 : 0.6,
                  position: 'relative',
                  overflow: 'visible',
                }}>
                {ch.is_default && (
                  <Badge size="xs" color="yellow" variant="filled"
                    leftSection={<IconStarFilled size={10} />}
                    style={{ position: 'absolute', top: -8, right: 12 }}>
                    ค่าเริ่มต้น
                  </Badge>
                )}

                <Group justify="space-between" mb="sm">
                  <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color={typeInfo.color} radius="xl">
                      <TypeIcon size={20} />
                    </ThemeIcon>
                    <div>
                      <Group gap={4} mb={2}>
                        <Text fw={600} size="sm">{ch.name}</Text>
                        {ch.channel_code && (
                          <Badge size="xs" variant="outline" color="gray" ff="monospace">{ch.channel_code}</Badge>
                        )}
                      </Group>
                      <Badge size="xs" variant="light" color={typeInfo.color}>{typeInfo.label.split(' ').slice(1).join(' ')}</Badge>
                    </div>
                  </Group>
                  <Group gap={4}>
                    <Tooltip label="แก้ไข">
                      <ActionIcon size="sm" variant="light" color="blue" onClick={() => openEdit(ch)}>
                        <IconPencil size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="ลบ">
                      <ActionIcon size="sm" variant="light" color="red"
                        onClick={() => {
                          if (confirm('ต้องการลบช่องทางนี้?')) deleteMutation.mutate(ch.id)
                        }}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>

                {(ch.bank_name || ch.account_number || ch.account_name) && (
                  <Stack gap={2} mb="xs"
                    style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 8, padding: '8px 10px' }}>
                    {ch.bank_name && (
                      <Group gap={4}>
                        <Text size="xs" c="dimmed" w={50}>ธนาคาร</Text>
                        <Text size="xs" fw={500}>{ch.bank_name}</Text>
                      </Group>
                    )}
                    {ch.account_name && (
                      <Group gap={4}>
                        <Text size="xs" c="dimmed" w={50}>ชื่อบัญชี</Text>
                        <Text size="xs" fw={500}>{ch.account_name}</Text>
                      </Group>
                    )}
                    {ch.account_number && (
                      <Group gap={4}>
                        <Text size="xs" c="dimmed" w={50}>เลขบัญชี</Text>
                        <Text size="xs" fw={600} ff="monospace">{ch.account_number}</Text>
                      </Group>
                    )}
                  </Stack>
                )}

                {ch.note && <Text size="xs" c="dimmed" lineClamp={2}>📝 {ch.note}</Text>}

                <Group justify="space-between" mt="xs">
                  <Badge size="xs" variant="dot" color={ch.is_active ? 'green' : 'gray'}>
                    {ch.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </Badge>
                </Group>
              </Card>
            )
          })}
        </SimpleGrid>
      )}

      {/* Create/Edit Modal */}
      <Modal opened={showModal} onClose={closeModal} size="md" centered
        title={editId ? '✏️ แก้ไขช่องทางชำระเงิน' : '➕ เพิ่มช่องทางชำระเงินใหม่'}>
        <Stack gap="sm">
          {nextCode && (
            <TextInput label="รหัสช่องทาง" value={nextCode} readOnly
              styles={{ input: { fontFamily: 'monospace', fontWeight: 700, background: 'var(--mantine-color-gray-0)', color: 'var(--mantine-color-indigo-7)' } }} />
          )}

          <TextInput label="ชื่อช่องทาง" placeholder="เช่น บัญชีกสิกร, พร้อมเพย์ร้าน, เงินสด"
            required value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />

          <Select label="ประเภท" data={channelTypes.map(c => ({ value: c.value, label: c.label }))}
            value={form.type}
            onChange={(v) => setForm(f => ({ ...f, type: v || 'cash' }))} />

          {showBankFields && (
            <>
              <Select label="ธนาคาร" data={bankOptions} clearable searchable
                placeholder="เลือกธนาคาร"
                value={form.bankName}
                onChange={(v) => setForm(f => ({ ...f, bankName: v || '' }))} />
              <TextInput label="ชื่อบัญชี" placeholder="ชื่อ-นามสกุล บนบัญชี"
                value={form.accountName}
                onChange={(e) => setForm(f => ({ ...f, accountName: e.target.value }))} />
              <TextInput label="เลขที่บัญชี" placeholder="xxx-x-xxxxx-x"
                value={form.accountNumber}
                onChange={(e) => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
            </>
          )}

          {form.type === 'promptpay' && (
            <TextInput label="เบอร์โทร / เลขประจำตัว" placeholder="08x-xxx-xxxx"
              value={form.accountNumber}
              onChange={(e) => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
          )}

          <Textarea label="หมายเหตุ" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" rows={2}
            value={form.note}
            onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))} />

          <Switch label="ตั้งเป็นช่องทางเริ่มต้น" color="yellow"
            checked={form.isDefault}
            onChange={(e) => setForm(f => ({ ...f, isDefault: e.currentTarget.checked }))} />

          {editId && (
            <Switch label="เปิดใช้งาน" color="green"
              checked={form.isActive}
              onChange={(e) => setForm(f => ({ ...f, isActive: e.currentTarget.checked }))} />
          )}

          <Divider />

          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={closeModal}>ยกเลิก</Button>
            <Button loading={saveMutation.isPending} onClick={handleSave}
              leftSection={<IconCheck size={16} />}
              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
              {editId ? 'บันทึกการแก้ไข' : 'เพิ่มช่องทาง'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
