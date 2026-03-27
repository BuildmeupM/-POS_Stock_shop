import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Text, Group, Stack, Table, Badge, Loader, Button, Modal,
  Select, TextInput, Textarea, Divider, ThemeIcon,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconPlus, IconCheck, IconBuildingBank, IconScale,
} from '@tabler/icons-react'
import api from '../../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Reconciliation {
  id: number
  channel_id: number
  channel_name: string
  channel_type: string
  period_from: string
  period_to: string
  statement_balance: string
  system_balance: string
  difference: string
  status: string
  note: string | null
  reconciled_by_name: string | null
  reconciled_at: string | null
  created_at: string
}

interface Channel {
  id: number
  name: string
  type: string
}

export default function BankReconciliationPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({
    channelId: '',
    periodFrom: null as Date | null,
    periodTo: null as Date | null,
    statementBalance: '',
    note: '',
  })

  const { data: reconciliations = [], isLoading } = useQuery({
    queryKey: ['reconciliations'],
    queryFn: () => api.get('/reconciliation').then(r => r.data),
  })

  const { data: channels = [] } = useQuery({
    queryKey: ['wallet-channels'],
    queryFn: () => api.get('/wallet', { params: { active: 'true' } }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/reconciliation', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'สร้างรายการกระทบยอดสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] })
      setCreateOpen(false)
      setForm({ channelId: '', periodFrom: null, periodTo: null, statementBalance: '', note: '' })
    },
    onError: (err: any) => {
      notifications.show({
        title: 'ผิดพลาด',
        message: err.response?.data?.message || 'ไม่สามารถสร้างรายการได้',
        color: 'red',
      })
    },
  })

  const reconcileMutation = useMutation({
    mutationFn: (id: number) => api.put(`/reconciliation/${id}/reconcile`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'กระทบยอดสำเร็จ', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] })
    },
    onError: (err: any) => {
      notifications.show({
        title: 'ผิดพลาด',
        message: err.response?.data?.message || 'ไม่สามารถกระทบยอดได้',
        color: 'red',
      })
    },
  })

  const handleCreate = () => {
    if (!form.channelId || !form.periodFrom || !form.periodTo || !form.statementBalance) {
      notifications.show({ title: 'ข้อมูลไม่ครบ', message: 'กรุณากรอกข้อมูลให้ครบถ้วน', color: 'orange' })
      return
    }
    createMutation.mutate({
      channelId: parseInt(form.channelId),
      periodFrom: form.periodFrom.toISOString().split('T')[0],
      periodTo: form.periodTo.toISOString().split('T')[0],
      statementBalance: parseFloat(form.statementBalance),
      note: form.note || null,
    })
  }

  const fmtDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <Group gap="xs">
          <ThemeIcon variant="light" color="blue" size="lg" radius="md">
            <IconScale size={20} />
          </ThemeIcon>
          <div>
            <Text size="lg" fw={800}>กระทบยอดบัญชีธนาคาร</Text>
            <Text size="xs" c="dimmed">เปรียบเทียบยอด Statement กับยอดในระบบ</Text>
          </div>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOpen(true)}>
          สร้างรายการใหม่
        </Button>
      </Group>

      {/* List */}
      {isLoading ? (
        <Loader style={{ margin: '40px auto', display: 'block' }} />
      ) : reconciliations.length === 0 ? (
        <Card shadow="xs" padding="xl" radius="md" withBorder>
          <Text ta="center" c="dimmed" py="xl">ยังไม่มีรายการกระทบยอด</Text>
        </Card>
      ) : (
        <Card shadow="xs" padding="lg" radius="md" withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ช่องทาง</Table.Th>
                <Table.Th>ช่วงเวลา</Table.Th>
                <Table.Th ta="right">ยอด Statement</Table.Th>
                <Table.Th ta="right">ยอดในระบบ</Table.Th>
                <Table.Th ta="right">ส่วนต่าง</Table.Th>
                <Table.Th ta="center">สถานะ</Table.Th>
                <Table.Th ta="center">จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {reconciliations.map((r: Reconciliation) => {
                const diff = parseFloat(r.difference) || 0
                return (
                  <Table.Tr key={r.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconBuildingBank size={16} />
                        <div>
                          <Text size="sm" fw={600}>{r.channel_name}</Text>
                          <Text size="xs" c="dimmed">{r.channel_type}</Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{fmtDate(r.period_from)} - {fmtDate(r.period_to)}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600}>฿{fmt(parseFloat(r.statement_balance))}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600}>฿{fmt(parseFloat(r.system_balance))}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={700}
                        c={diff === 0 ? 'green' : Math.abs(diff) < 100 ? 'yellow' : 'red'}>
                        ฿{fmt(diff)}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="center">
                      <Badge variant="light" size="sm"
                        color={r.status === 'reconciled' ? 'green' : 'orange'}>
                        {r.status === 'reconciled' ? 'กระทบยอดแล้ว' : 'ร่าง'}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="center">
                      {r.status === 'draft' && (
                        <Button size="xs" variant="light" color="green"
                          leftSection={<IconCheck size={14} />}
                          loading={reconcileMutation.isPending}
                          onClick={() => reconcileMutation.mutate(r.id)}>
                          กระทบยอด
                        </Button>
                      )}
                      {r.status === 'reconciled' && r.reconciled_by_name && (
                        <Text size="xs" c="dimmed">{r.reconciled_by_name}</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                )
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* Create Modal */}
      <Modal opened={createOpen} onClose={() => setCreateOpen(false)}
        title="สร้างรายการกระทบยอดใหม่" centered size="md">
        <Stack gap="md">
          <Select
            label="ช่องทางชำระเงิน"
            placeholder="เลือกช่องทาง"
            data={channels.map((c: Channel) => ({
              value: String(c.id),
              label: `${c.name} (${c.type})`,
            }))}
            value={form.channelId}
            onChange={(v) => setForm({ ...form, channelId: v || '' })}
            searchable
          />
          <Group grow>
            <DatePickerInput
              label="ตั้งแต่วันที่"
              placeholder="เลือกวันที่"
              value={form.periodFrom}
              onChange={(d) => setForm({ ...form, periodFrom: d })}
              locale="th" valueFormat="DD MMMM YYYY"
            />
            <DatePickerInput
              label="ถึงวันที่"
              placeholder="เลือกวันที่"
              value={form.periodTo}
              onChange={(d) => setForm({ ...form, periodTo: d })}
              locale="th" valueFormat="DD MMMM YYYY"
            />
          </Group>
          <TextInput
            label="ยอดตาม Bank Statement"
            placeholder="0.00"
            type="number"
            value={form.statementBalance}
            onChange={(e) => setForm({ ...form, statementBalance: e.target.value })}
          />
          <Textarea
            label="หมายเหตุ"
            placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <Divider />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setCreateOpen(false)}>ยกเลิก</Button>
            <Button leftSection={<IconPlus size={16} />}
              loading={createMutation.isPending}
              onClick={handleCreate}>
              สร้างรายการ
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
