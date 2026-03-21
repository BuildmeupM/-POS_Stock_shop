import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Text, Group, Table, Badge, Loader, Stack, Button, Modal,
  TextInput, Select, Textarea, ActionIcon, Tooltip, Collapse,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconBook2, IconPlus, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import api from '../services/api'

const TYPE_MAP: Record<string, { label: string; color: string; code: string }> = {
  asset:     { label: 'สินทรัพย์',        color: 'blue',   code: '1xxx' },
  liability: { label: 'หนี้สิน',          color: 'red',    code: '2xxx' },
  equity:    { label: 'ส่วนของเจ้าของ',   color: 'violet', code: '3xxx' },
  revenue:   { label: 'รายได้',           color: 'green',  code: '4xxx' },
  expense:   { label: 'ค่าใช้จ่าย',       color: 'orange', code: '5xxx' },
}

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({
    asset: true, liability: true, equity: true, revenue: true, expense: true,
  })
  const [newAccount, setNewAccount] = useState({
    accountCode: '', name: '', accountType: 'asset', parentId: '', description: '',
  })

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: (data: any) => api.post('/accounting/accounts', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'เพิ่มบัญชีเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setAddOpen(false)
      setNewAccount({ accountCode: '', name: '', accountType: 'asset', parentId: '', description: '' })
    },
    onError: (err: any) => {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถเพิ่มได้', color: 'red' })
    },
  })

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  const grouped = Object.keys(TYPE_MAP).map(type => ({
    type,
    ...TYPE_MAP[type],
    items: accounts.filter((a: any) => (a.account_type || a.type) === type),
  }))

  const parentOptions = accounts
    .filter((a: any) => !a.parent_id)
    .map((a: any) => ({ value: String(a.id), label: `${a.account_code} — ${a.name}` }))

  const toggleType = (type: string) => {
    setExpandedTypes(prev => ({ ...prev, [type]: !prev[type] }))
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap={8}>
          <IconBook2 size={24} color="var(--app-primary)" />
          <Text size="xl" fw={800}>ผังบัญชี (Chart of Accounts)</Text>
          <Badge variant="light" size="lg">{accounts.length} บัญชี</Badge>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)}
          style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
          เพิ่มบัญชี
        </Button>
      </Group>

      {grouped.map(g => (
        <Card key={g.type} shadow="xs" padding="lg" radius="md" withBorder>
          <Group
            gap={8} mb={expandedTypes[g.type] ? 'md' : 0}
            style={{ cursor: 'pointer' }}
            onClick={() => toggleType(g.type)}
          >
            {expandedTypes[g.type]
              ? <IconChevronDown size={16} />
              : <IconChevronRight size={16} />
            }
            <Badge color={g.color} variant="filled" size="lg">{g.label}</Badge>
            <Text size="sm" c="dimmed">{g.items.length} รายการ</Text>
            <Text size="xs" c="dimmed" ff="monospace">({g.code})</Text>
          </Group>

          <Collapse in={expandedTypes[g.type]}>
            {g.items.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">ไม่มีบัญชีในหมวดนี้</Text>
            ) : (
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={120}>รหัส</Table.Th>
                    <Table.Th>ชื่อบัญชี</Table.Th>
                    <Table.Th w={150}>บัญชีแม่</Table.Th>
                    <Table.Th w={80} ta="center">สถานะ</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {g.items.map((acc: any) => (
                    <Table.Tr key={acc.id}>
                      <Table.Td>
                        <Text size="sm" ff="monospace" fw={600} c={g.color}>{acc.account_code || acc.code}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" style={{ paddingLeft: acc.parent_id ? 20 : 0 }}>
                          {acc.parent_id && <Text span c="dimmed" size="xs">└ </Text>}
                          {acc.name}
                        </Text>
                        {acc.description && (
                          <Text size="xs" c="dimmed" lineClamp={1}>{acc.description}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {acc.parent_name ? (
                          <Text size="xs" c="dimmed">{acc.parent_code} {acc.parent_name}</Text>
                        ) : (
                          <Text size="xs" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge variant="dot" color={acc.is_active !== false ? 'green' : 'gray'} size="sm">
                          {acc.is_active !== false ? 'ใช้งาน' : 'ปิด'}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Collapse>
        </Card>
      ))}

      {/* Add Account Modal */}
      <Modal opened={addOpen} onClose={() => setAddOpen(false)} title="เพิ่มบัญชีใหม่" centered>
        <Stack gap="md">
          <Group grow>
            <TextInput label="รหัสบัญชี" placeholder="1100" required
              value={newAccount.accountCode}
              onChange={e => setNewAccount({ ...newAccount, accountCode: e.target.value })} />
            <Select label="ประเภท" required
              data={Object.entries(TYPE_MAP).map(([v, { label }]) => ({ value: v, label }))}
              value={newAccount.accountType}
              onChange={v => setNewAccount({ ...newAccount, accountType: v || 'asset' })} />
          </Group>
          <TextInput label="ชื่อบัญชี" placeholder="เงินสด" required
            value={newAccount.name}
            onChange={e => setNewAccount({ ...newAccount, name: e.target.value })} />
          <Select label="บัญชีแม่ (ถ้ามี)" clearable searchable
            data={parentOptions}
            value={newAccount.parentId}
            onChange={v => setNewAccount({ ...newAccount, parentId: v || '' })} />
          <Textarea label="คำอธิบาย" placeholder="รายละเอียดเพิ่มเติม"
            value={newAccount.description}
            onChange={e => setNewAccount({ ...newAccount, description: e.target.value })} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button loading={addMutation.isPending}
              disabled={!newAccount.accountCode || !newAccount.name}
              onClick={() => addMutation.mutate(newAccount)}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              เพิ่มบัญชี
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
