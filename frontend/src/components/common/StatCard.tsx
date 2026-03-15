import { Group, Text } from '@mantine/core'

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  detail?: string
  color?: string
}

export default function StatCard({
  icon,
  label,
  value,
  detail,
  color = 'var(--app-primary)',
}: StatCardProps) {
  return (
    <div className="stat-card">
      <Group gap={8}>
        {icon}
        <span className="stat-card-label">{label}</span>
      </Group>
      <div className="stat-card-value" style={{ color }}>{value}</div>
      {detail && <span className="stat-card-label">{detail}</span>}
    </div>
  )
}
