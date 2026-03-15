import { Text } from '@mantine/core'

interface OrderStepperProps {
  status: string
  onStepClick: (status: string) => void
  isLoading: boolean
}

const steps = [
  { key: 'pending', label: 'รอยืนยัน', icon: '⏳', desc: 'สร้างออเดอร์' },
  { key: 'confirmed', label: 'ยืนยัน', icon: '✅', desc: 'ยืนยันออเดอร์' },
  { key: 'packing', label: 'แพ็คสินค้า', icon: '📦', desc: 'เตรียมจัดส่ง' },
  { key: 'shipped', label: 'จัดส่งแล้ว', icon: '🚚', desc: 'ส่งพัสดุ' },
  { key: 'delivered', label: 'ได้รับแล้ว', icon: '🏠', desc: 'ลูกค้าได้รับ' },
  { key: 'returned', label: 'คืนสินค้า', icon: '🔄', desc: 'คืนสินค้า' },
]

const statusOrder = ['pending', 'confirmed', 'packing', 'shipped', 'delivered', 'returned']

export default function OrderStepper({ status, onStepClick, isLoading }: OrderStepperProps) {
  const currentIdx = statusOrder.indexOf(status)
  const isCancelled = status === 'cancelled'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '12px 0' }}>
      {steps.map((step, idx) => {
        const isDone = idx < currentIdx || (idx === currentIdx && status === 'delivered')
        const isCurrent = idx === currentIdx && !isCancelled
        const isClickable = !isCancelled && !isLoading && idx !== currentIdx
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1,
              cursor: isClickable ? 'pointer' : 'default', opacity: isLoading ? 0.6 : 1,
            }}
              onClick={() => isClickable && onStepClick(step.key)}
              title={isClickable ? `เปลี่ยนเป็น "${step.label}"` : undefined}
            >
              <div style={{
                width: 52, height: 52, borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 22,
                background: isDone ? '#059669' : isCurrent ? '#4f46e5' : isCancelled ? '#ef4444' : '#f3f4f6',
                color: isDone || isCurrent || isCancelled ? '#fff' : '#9ca3af',
                boxShadow: isCurrent ? '0 0 0 4px rgba(79,70,229,0.2)' : isDone ? '0 0 0 4px rgba(5,150,105,0.15)' : undefined,
                transition: 'all 0.3s ease',
              }}
                onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.transform = 'scale(1.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                {isDone ? '✓' : step.icon}
              </div>
              <Text size="sm" fw={isDone || isCurrent ? 700 : 500}
                c={isDone ? 'green' : isCurrent ? 'indigo' : 'dimmed'}>
                {step.label}
              </Text>
              <Text size="xs" c="dimmed" ta="center" style={{ lineHeight: 1.2 }}>{step.desc}</Text>
            </div>
            {idx < steps.length - 1 && (
              <div style={{
                height: 3, flex: 1, borderRadius: 2, minWidth: 24, marginTop: 25,
                background: isDone ? '#059669' : '#e5e7eb',
                transition: 'background 0.3s ease',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
