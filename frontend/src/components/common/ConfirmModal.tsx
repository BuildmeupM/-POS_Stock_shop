import { Modal, Button, Group, Stack, Text } from '@mantine/core'
import { IconTrash, IconAlertTriangle } from '@tabler/icons-react'

interface ConfirmModalProps {
  opened: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  color?: string
  loading?: boolean
  icon?: React.ReactNode
}

export default function ConfirmModal({
  opened, onClose, onConfirm,
  title = '⚠️ ยืนยันการดำเนินการ',
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  color = 'red',
  loading = false,
  icon,
}: ConfirmModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="sm" centered>
      <Stack gap="md">
        <Group gap="sm" align="flex-start">
          {icon || <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />}
          <Text size="sm" style={{ flex: 1 }}>{message}</Text>
        </Group>
        <Group justify="flex-end" gap="sm">
          <Button variant="light" onClick={onClose}>{cancelLabel}</Button>
          <Button color={color} loading={loading} onClick={onConfirm}
            leftSection={<IconTrash size={16} />}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
