import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Card, Text, Group, Stack, Loader, Divider, SimpleGrid, ThemeIcon,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import {
  IconArrowUpRight, IconArrowDownRight, IconBuildingBank, IconCash,
  IconShoppingCart, IconReceipt, IconTruckDelivery,
} from '@tabler/icons-react'
import api from '../../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CashFlowPage() {
  const [fromDate, setFromDate] = useState<Date | null>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  )
  const [toDate, setToDate] = useState<Date | null>(new Date())

  const from = fromDate?.toISOString().split('T')[0]
  const to = toDate?.toISOString().split('T')[0]

  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['cashflow', from, to],
    queryFn: () => api.get('/reports/cashflow', { params: { from, to } }).then(r => r.data),
  })

  const fmtDateThai = (d: Date | null) =>
    d ? d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  return (
    <Stack gap="lg">
      {/* Header */}
      <Card shadow="xs" padding="lg" radius="md" withBorder style={{ background: 'var(--app-surface-light)' }}>
        <Text ta="center" size="lg" fw={800}>{company?.name || 'บริษัท'}</Text>
        <Text ta="center" size="md" fw={700} mt={2}>งบกระแสเงินสด</Text>
        {from && to && (
          <Text ta="center" size="sm" c="dimmed" mt={4}>
            สำหรับงวด {fmtDateThai(fromDate)} ถึง {fmtDateThai(toDate)}
          </Text>
        )}
      </Card>

      {/* Date Controls */}
      <Group justify="flex-end" gap="xs">
        <Text size="sm" fw={500}>ตั้งแต่</Text>
        <DatePickerInput placeholder="วันที่เริ่มต้น" size="sm"
          value={fromDate} onChange={setFromDate}
          locale="th" valueFormat="DD MMMM YYYY"
          style={{ width: 180 }} />
        <Text size="sm" fw={500}>ถึง</Text>
        <DatePickerInput placeholder="ถึงวันที่" size="sm"
          value={toDate} onChange={setToDate}
          locale="th" valueFormat="DD MMMM YYYY"
          style={{ width: 180 }} />
      </Group>

      {isLoading ? (
        <Loader style={{ margin: '40px auto', display: 'block' }} />
      ) : data ? (
        <>
          {/* Operating Activities */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap="xs" mb="md">
              <ThemeIcon variant="light" color="green" size="lg" radius="md">
                <IconCash size={20} />
              </ThemeIcon>
              <Text size="md" fw={700}>กิจกรรมดำเนินงาน (Operating Activities)</Text>
            </Group>

            <Stack gap="sm" pl="md">
              <Group justify="space-between">
                <Group gap="xs">
                  <IconShoppingCart size={16} color="var(--mantine-color-green-6)" />
                  <Text size="sm">เงินสดรับจากการขาย</Text>
                </Group>
                <Text size="sm" fw={600} c="green">฿{fmt(data.operating.salesCash)}</Text>
              </Group>
              <Group justify="space-between">
                <Group gap="xs">
                  <IconReceipt size={16} color="var(--mantine-color-red-6)" />
                  <Text size="sm">เงินสดจ่ายค่าใช้จ่าย</Text>
                </Group>
                <Text size="sm" fw={600} c="red">฿{fmt(data.operating.expensesCash)}</Text>
              </Group>
              <Divider />
              <Group justify="space-between">
                <Text size="sm" fw={700}>กระแสเงินสดสุทธิจากการดำเนินงาน</Text>
                <Text size="sm" fw={700} c={data.operating.netOperating >= 0 ? 'green' : 'red'}>
                  ฿{fmt(data.operating.netOperating)}
                </Text>
              </Group>
            </Stack>
          </Card>

          {/* Investing Activities */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap="xs" mb="md">
              <ThemeIcon variant="light" color="blue" size="lg" radius="md">
                <IconTruckDelivery size={20} />
              </ThemeIcon>
              <Text size="md" fw={700}>กิจกรรมลงทุน (Investing Activities)</Text>
            </Group>

            <Stack gap="sm" pl="md">
              <Group justify="space-between">
                <Group gap="xs">
                  <IconTruckDelivery size={16} color="var(--mantine-color-orange-6)" />
                  <Text size="sm">เงินสดจ่ายซื้อสินค้า/วัตถุดิบ</Text>
                </Group>
                <Text size="sm" fw={600} c="red">฿{fmt(data.investing.purchasePayments)}</Text>
              </Group>
              <Divider />
              <Group justify="space-between">
                <Text size="sm" fw={700}>กระแสเงินสดสุทธิจากกิจกรรมลงทุน</Text>
                <Text size="sm" fw={700} c={data.investing.netInvesting >= 0 ? 'green' : 'red'}>
                  ฿{fmt(data.investing.netInvesting)}
                </Text>
              </Group>
            </Stack>
          </Card>

          {/* Financing Activities */}
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            <Group gap="xs" mb="md">
              <ThemeIcon variant="light" color="violet" size="lg" radius="md">
                <IconBuildingBank size={20} />
              </ThemeIcon>
              <Text size="md" fw={700}>กิจกรรมจัดหาเงิน (Financing Activities)</Text>
            </Group>

            <Stack gap="sm" pl="md">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">ยังไม่มีรายการ</Text>
                <Text size="sm" fw={600}>฿{fmt(0)}</Text>
              </Group>
              <Divider />
              <Group justify="space-between">
                <Text size="sm" fw={700}>กระแสเงินสดสุทธิจากกิจกรรมจัดหาเงิน</Text>
                <Text size="sm" fw={700}>฿{fmt(data.financing.netFinancing)}</Text>
              </Group>
            </Stack>
          </Card>

          {/* Summary */}
          <Card shadow="xs" padding="lg" radius="md" withBorder
            style={{ background: 'var(--app-surface-light)' }}>
            <SimpleGrid cols={3}>
              <Card padding="md" radius="md" withBorder>
                <Text size="xs" c="dimmed" mb={4}>เงินสดต้นงวด</Text>
                <Text size="xl" fw={800}>฿{fmt(data.beginningCash)}</Text>
              </Card>
              <Card padding="md" radius="md" withBorder>
                <Group gap={4} align="center">
                  <Text size="xs" c="dimmed" mb={4}>เพิ่ม (ลด) สุทธิ</Text>
                  {data.netChange >= 0 ? (
                    <IconArrowUpRight size={14} color="var(--mantine-color-green-6)" />
                  ) : (
                    <IconArrowDownRight size={14} color="var(--mantine-color-red-6)" />
                  )}
                </Group>
                <Text size="xl" fw={800} c={data.netChange >= 0 ? 'green' : 'red'}>
                  ฿{fmt(data.netChange)}
                </Text>
              </Card>
              <Card padding="md" radius="md" withBorder>
                <Text size="xs" c="dimmed" mb={4}>เงินสดปลายงวด</Text>
                <Text size="xl" fw={800} c="blue">฿{fmt(data.endingCash)}</Text>
              </Card>
            </SimpleGrid>
          </Card>
        </>
      ) : (
        <Text ta="center" c="dimmed" py="xl">ไม่มีข้อมูล</Text>
      )}
    </Stack>
  )
}
