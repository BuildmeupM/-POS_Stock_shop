import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Text, Group, Table, Badge, Loader, Stack, Modal, Button,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconCalculator, IconEye, IconTrash } from '@tabler/icons-react'
import api from '../../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function JournalsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data: journals = [], isLoading } = useQuery({
    queryKey: ['journals'],
    queryFn: () => api.get('/accounting/journals').then(r => r.data),
  })

  const { data: detail } = useQuery({
    queryKey: ['journal-detail', selectedId],
    queryFn: () => api.get(`/accounting/journals/${selectedId}`).then(r => r.data),
    enabled: selectedId !== null,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/accounting/journals/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'ลบรายการบัญชีแล้ว', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['journals'] })
      setDeleteId(null)
    },
    onError: () => {
      notifications.show({ title: 'ผิดพลาด', message: 'ไม่สามารถลบรายการได้', color: 'red' })
    },
  })

  const deleteTarget = journals.find((j: any) => j.id === deleteId)

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <Stack gap="lg">
      <Group gap={8}>
        <IconCalculator size={24} color="var(--app-primary)" />
        <Text size="xl" fw={800}>สมุดบัญชี (Journal Entries)</Text>
        <Badge variant="light" size="lg">{journals.length} รายการ</Badge>
      </Group>

      <Card shadow="xs" padding="lg" radius="md" withBorder>
        {journals.length === 0 ? (
          <Text ta="center" c="dimmed" py="xl">ยังไม่มีรายการบันทึกบัญชี</Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>วันที่</Table.Th>
                <Table.Th>เลขที่</Table.Th>
                <Table.Th>อ้างอิง</Table.Th>
                <Table.Th>คำอธิบาย</Table.Th>
                <Table.Th ta="center">สถานะ</Table.Th>
                <Table.Th ta="center">จัดการ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {journals.map((j: any) => (
                <Table.Tr key={j.id}>
                  <Table.Td>
                    <Text size="sm">{new Date(j.entry_date || j.created_at).toLocaleDateString('th-TH')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace" fw={600}>{j.entry_number || `JE-${j.id}`}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">{j.reference || '-'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1}>{j.description || '-'}</Text>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Badge variant="light" color={j.status === 'voided' ? 'red' : 'green'} size="sm">
                      {j.status === 'voided' ? 'ยกเลิก' : 'ปกติ'}
                    </Badge>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Group gap={4} justify="center">
                      <Button variant="subtle" size="xs" leftSection={<IconEye size={14} />}
                        onClick={() => setSelectedId(j.id)}>
                        ดู
                      </Button>
                      <Button variant="subtle" size="xs" color="red" leftSection={<IconTrash size={14} />}
                        onClick={() => setDeleteId(j.id)}>
                        ลบ
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal opened={selectedId !== null} onClose={() => setSelectedId(null)}
        title={`รายละเอียด — ${detail?.entry_number || ''}`} centered size="lg">
        {detail ? (
          <Stack gap="md">
            <Group>
              <Text size="sm" c="dimmed">วันที่:</Text>
              <Text size="sm" fw={600}>{new Date(detail.entry_date || detail.created_at).toLocaleDateString('th-TH')}</Text>
            </Group>
            {detail.description && (
              <Group>
                <Text size="sm" c="dimmed">คำอธิบาย:</Text>
                <Text size="sm">{detail.description}</Text>
              </Group>
            )}
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>บัญชี</Table.Th>
                  <Table.Th ta="right">เดบิต</Table.Th>
                  <Table.Th ta="right">เครดิต</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(detail.lines || []).map((line: any, i: number) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <Text size="sm">{line.account_name || line.account_code || `Account #${line.account_id}`}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600} c={parseFloat(line.debit) > 0 ? 'blue' : 'dimmed'}>
                        {parseFloat(line.debit) > 0 ? `฿${fmt(parseFloat(line.debit))}` : '-'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={600} c={parseFloat(line.credit) > 0 ? 'red' : 'dimmed'}>
                        {parseFloat(line.credit) > 0 ? `฿${fmt(parseFloat(line.credit))}` : '-'}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Th>รวม</Table.Th>
                  <Table.Th ta="right">
                    <Text fw={700} c="blue">
                      ฿{fmt((detail.lines || []).reduce((s: number, l: any) => s + parseFloat(l.debit || 0), 0))}
                    </Text>
                  </Table.Th>
                  <Table.Th ta="right">
                    <Text fw={700} c="red">
                      ฿{fmt((detail.lines || []).reduce((s: number, l: any) => s + parseFloat(l.credit || 0), 0))}
                    </Text>
                  </Table.Th>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Stack>
        ) : (
          <Loader style={{ margin: '20px auto', display: 'block' }} />
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal opened={deleteId !== null} onClose={() => setDeleteId(null)}
        title="ยืนยันการลบ" centered size="sm">
        <Stack gap="md">
          <Text size="sm">
            คุณต้องการลบรายการบัญชี <strong>{deleteTarget?.entry_number || `JE-${deleteTarget?.id}`}</strong> ใช่หรือไม่?
          </Text>
          <Text size="xs" c="red">การลบจะไม่สามารถกู้คืนได้</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" size="sm" onClick={() => setDeleteId(null)}>ยกเลิก</Button>
            <Button color="red" size="sm" loading={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              ลบรายการ
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
