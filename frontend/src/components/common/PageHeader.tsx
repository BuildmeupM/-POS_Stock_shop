import { Group, Text, ActionIcon, Button } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  actions?: React.ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  onBack,
  actions,
}: PageHeaderProps) {
  return (
    <Group justify="space-between" align="center">
      <Group gap="sm">
        {onBack && (
          <ActionIcon variant="light" size="lg" onClick={onBack}>
            <IconArrowLeft size={20} />
          </ActionIcon>
        )}
        <div>
          <Text size="xl" fw={800}>{title}</Text>
          {subtitle && <Text size="sm" c="dimmed">{subtitle}</Text>}
        </div>
      </Group>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  )
}
