import { Text } from '@mantine/core'

interface DocumentStepperProps {
  status: string
  onStepClick?: (stepKey: string) => void
}

const steps = [
  { key: 'po', label: 'ใบสั่งซื้อ', icon: '📋', desc: 'สร้างและอนุมัติ', doneStatuses: ['approved', 'partial', 'received', 'invoiced', 'paid'] },
  { key: 'grn', label: 'รับสินค้า', icon: '📥', desc: 'ตรวจรับเข้าคลัง', doneStatuses: ['received', 'invoiced', 'paid'] },
  { key: 'inv', label: 'ใบแจ้งหนี้', icon: '📄', desc: 'บันทึกหนี้ค้างจ่าย', doneStatuses: ['invoiced', 'paid'] },
  { key: 'pay', label: 'ชำระเงิน', icon: '💰', desc: 'จ่ายเงินให้ผู้ขาย', doneStatuses: ['paid'] },
]

export default function DocumentStepper({ status, onStepClick }: DocumentStepperProps) {
  const currentIdx = status === 'draft' ? 0
    : status === 'approved' ? 1
    : ['partial', 'received'].includes(status) ? 2
    : status === 'invoiced' ? 3
    : status === 'paid' ? 4
    : 0

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '12px 0' }}>
      {steps.map((step, idx) => {
        const isDone = step.doneStatuses.includes(status)
        const isCurrent = idx === currentIdx
        const isClickable = isCurrent && !isDone && onStepClick && status !== 'cancelled'
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
              <div
                onClick={isClickable ? () => onStepClick(step.key) : undefined}
                style={{
                  width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                  cursor: isClickable ? 'pointer' : 'default',
                  background: isDone ? '#059669' : isCurrent ? '#4f46e5' : '#f3f4f6',
                  color: isDone || isCurrent ? '#fff' : '#9ca3af',
                  boxShadow: isClickable ? '0 0 0 4px rgba(79,70,229,0.3), 0 4px 12px rgba(79,70,229,0.2)'
                    : isDone ? '0 0 0 4px rgba(5,150,105,0.15)'
                    : undefined,
                  transition: 'all 0.3s ease',
                  transform: isClickable ? 'scale(1)' : undefined,
                }}
                onMouseEnter={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.transform = 'scale(1.12)'
                    e.currentTarget.style.boxShadow = '0 0 0 6px rgba(79,70,229,0.35), 0 6px 20px rgba(79,70,229,0.3)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (isClickable) {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(79,70,229,0.3), 0 4px 12px rgba(79,70,229,0.2)'
                  }
                }}
              >
                {isDone ? '✓' : step.icon}
              </div>
              <Text size="sm" fw={isDone || isCurrent ? 700 : 500}
                c={isDone ? 'green' : isCurrent ? 'indigo' : 'dimmed'}>
                {step.label}
              </Text>
              <Text size="xs" c={isClickable ? 'indigo' : 'dimmed'} ta="center" style={{ lineHeight: 1.2 }}>
                {isClickable ? '👆 คลิกเพื่อดำเนินการ' : step.desc}
              </Text>
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
