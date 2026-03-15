import { Text, Stack, Button } from '@mantine/core'
import { IconMoodEmpty, IconPlus } from '@tabler/icons-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon || <IconMoodEmpty size={48} color="var(--app-text-dim)" style={{ opacity: 0.4 }} />}
      <Text fw={600} size="lg" mt="sm">{title}</Text>
      {description && <Text size="sm" c="dimmed">{description}</Text>}
      {actionLabel && onAction && (
        <Button variant="light" size="xs" mt="sm" leftSection={<IconPlus size={14} />}
          onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
