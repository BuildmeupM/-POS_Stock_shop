import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Stack, Group, TextInput, Button, Text, Badge, ActionIcon, Tooltip, Divider, Loader
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus, IconTrash, IconTag, IconX } from '@tabler/icons-react'
import api from '../../services/api'
import { ATTR_COLORS } from '../../utils/constants'
import type { AttributeGroup, AttributeValue } from '../../types'

interface AttrGroupsManagerProps {
  onClose: () => void
}

export default function AttrGroupsManager({ onClose }: AttrGroupsManagerProps) {
  const [newGroupName, setNewGroupName] = useState('')
  const [newValues, setNewValues] = useState<Record<number, string>>({})
  const queryClient = useQueryClient()

  const { data: groups, isLoading } = useQuery<AttributeGroup[]>({
    queryKey: ['attribute-groups'],
    queryFn: () => api.get('/products/attribute-groups').then(r => r.data),
  })

  const addGroupMutation = useMutation({
    mutationFn: (name: string) => api.post('/products/attribute-groups', { name }),
    onSuccess: () => {
      setNewGroupName('')
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      notifications.show({ title: 'สำเร็จ', message: 'สร้างกลุ่มสำเร็จ', color: 'green' })
    },
  })

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/attribute-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
      notifications.show({ title: 'สำเร็จ', message: 'ลบกลุ่มสำเร็จ', color: 'green' })
    },
  })

  const addValueMutation = useMutation({
    mutationFn: ({ groupId, value }: { groupId: number; value: string }) =>
      api.post(`/products/attribute-groups/${groupId}/values`, { value }),
    onSuccess: (_, variables) => {
      setNewValues({ ...newValues, [variables.groupId]: '' })
      queryClient.invalidateQueries({ queryKey: ['attribute-groups'] })
    },
  })

  const deleteValueMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/products/attribute-values/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attribute-groups'] }),
  })

  if (isLoading) return <Loader style={{ margin: '20px auto', display: 'block' }} />

  return (
    <Stack gap="md">
      {/* Add new group */}
      <Group>
        <TextInput placeholder="ชื่อกลุ่มใหม่ (เช่น แบรนด์, ประเภท, สี...)" value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)} style={{ flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && newGroupName.trim()) addGroupMutation.mutate(newGroupName.trim()) }} />
        <Button leftSection={<IconPlus size={16} />} loading={addGroupMutation.isPending}
          onClick={() => newGroupName.trim() && addGroupMutation.mutate(newGroupName.trim())}>
          เพิ่มกลุ่ม
        </Button>
      </Group>

      {(groups || []).length === 0 && (
        <div className="empty-state" style={{ padding: '20px 0' }}>
          <IconTag size={40} />
          <Text size="sm" c="dimmed">ยังไม่มีกลุ่มแอตทริบิวต์ กรุณาสร้างกลุ่มใหม่</Text>
        </div>
      )}

      {(groups || []).map((g: AttributeGroup, gIdx: number) => (
        <div key={g.id} style={{
          border: '1px solid var(--mantine-color-default-border)',
          borderRadius: 8, padding: 16, background: 'var(--mantine-color-body)'
        }}>
          <Group justify="space-between" mb="sm">
            <Group gap={8}>
              <Badge variant="filled" color={ATTR_COLORS[gIdx % ATTR_COLORS.length]} size="lg">
                {g.name}
              </Badge>
              <Text size="xs" c="dimmed">{(g.values || []).length} ค่า</Text>
            </Group>
            <Tooltip label="ลบกลุ่มนี้">
              <ActionIcon size="sm" variant="light" color="red"
                onClick={() => { if (confirm(`ต้องการลบกลุ่ม "${g.name}" ?`)) deleteGroupMutation.mutate(g.id) }}>
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>

          {/* Values */}
          <Group gap={6} mb="sm" style={{ flexWrap: 'wrap' }}>
            {(g.values || []).map((v: AttributeValue) => (
              <Badge key={v.id} variant="light" size="md"
                color={ATTR_COLORS[gIdx % ATTR_COLORS.length]}
                rightSection={
                  <ActionIcon size={14} variant="transparent" color="red"
                    onClick={() => deleteValueMutation.mutate(v.id)}>
                    <IconX size={10} />
                  </ActionIcon>
                }>
                {v.value}
              </Badge>
            ))}
          </Group>

          {/* Add value */}
          <Group gap="xs">
            <TextInput size="xs" placeholder={`เพิ่มค่าใหม่ใน "${g.name}"...`}
              value={newValues[g.id] || ''}
              onChange={(e) => setNewValues({ ...newValues, [g.id]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (newValues[g.id] || '').trim()) {
                  addValueMutation.mutate({ groupId: g.id, value: newValues[g.id].trim() })
                }
              }}
              style={{ flex: 1 }} />
            <Button size="xs" variant="light" leftSection={<IconPlus size={12} />}
              onClick={() => (newValues[g.id] || '').trim() && addValueMutation.mutate({ groupId: g.id, value: newValues[g.id].trim() })}>
              เพิ่ม
            </Button>
          </Group>
        </div>
      ))}

      <Divider />
      <Button variant="light" fullWidth onClick={onClose}>ปิด</Button>
    </Stack>
  )
}
