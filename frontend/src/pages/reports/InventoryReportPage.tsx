import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Card, Text, Group, Table, Badge, Loader, Stack, SimpleGrid, SegmentedControl, Select,
} from '@mantine/core'
import { IconPackage, IconAlertTriangle } from '@tabler/icons-react'
import api from '../../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => n.toLocaleString('th-TH')

type ReportTab = 'valuation' | 'slow-moving'

export default function InventoryReportPage() {
  const [tab, setTab] = useState<ReportTab>('valuation')
  const [slowDays, setSlowDays] = useState('30')

  const { data: company } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  const { data: valuation, isLoading: loadVal } = useQuery({
    queryKey: ['report-inventory-valuation'],
    queryFn: () => api.get('/reports/inventory-valuation').then(r => r.data),
    enabled: tab === 'valuation',
  })

  const { data: slowMoving = [], isLoading: loadSlow } = useQuery({
    queryKey: ['report-slow-moving', slowDays],
    queryFn: () => api.get('/reports/slow-moving', { params: { days: slowDays } }).then(r => r.data),
    enabled: tab === 'slow-moving',
  })

  const isLoading = (tab === 'valuation' && loadVal) || (tab === 'slow-moving' && loadSlow)
  const v = valuation || { products: [], totalCostValue: 0, totalRetailValue: 0, totalQty: 0, potentialProfit: 0 }

  return (
    <Stack gap="lg">
      {/* Report Header */}
      <Card shadow="xs" padding="lg" radius="md" withBorder style={{ background: 'var(--app-surface-light)' }}>
        <Text ta="center" size="lg" fw={800}>{company?.name || 'บริษัท'}</Text>
        <Text ta="center" size="md" fw={700} mt={2}>รายงานสินค้าคงเหลือ</Text>
        <Text ta="center" size="sm" c="dimmed" mt={4}>
          ข้อมูล ณ วันที่ {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </Card>

      {/* Controls */}
      <Group justify="space-between">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as ReportTab)}
          data={[
            { value: 'valuation', label: 'มูลค่าสินค้าคงเหลือ' },
            { value: 'slow-moving', label: 'สินค้าเคลื่อนไหวช้า' },
          ]}
        />
        {tab === 'slow-moving' && (
          <Select size="sm" value={slowDays} onChange={(v) => setSlowDays(v || '30')}
            data={[
              { value: '30', label: 'ไม่ขายใน 30 วัน' },
              { value: '60', label: 'ไม่ขายใน 60 วัน' },
              { value: '90', label: 'ไม่ขายใน 90 วัน' },
            ]}
            style={{ width: 180 }} />
        )}
      </Group>

      {isLoading ? (
        <Loader style={{ margin: '40px auto', display: 'block' }} />
      ) : (
        <>
          {/* ─── มูลค่าสินค้าคงเหลือ ─── */}
          {tab === 'valuation' && (
            <>
              <SimpleGrid cols={4}>
                <Card shadow="xs" padding="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" fw={600}>จำนวนสินค้า</Text>
                  <Text size="xl" fw={800}>{v.products.length} รายการ</Text>
                </Card>
                <Card shadow="xs" padding="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" fw={600}>จำนวนคงเหลือ</Text>
                  <Text size="xl" fw={800}>{fmtInt(v.totalQty)} ชิ้น</Text>
                </Card>
                <Card shadow="xs" padding="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" fw={600}>มูลค่าต้นทุน (FIFO)</Text>
                  <Text size="xl" fw={800} c="blue">฿{fmt(v.totalCostValue)}</Text>
                </Card>
                <Card shadow="xs" padding="md" radius="md" withBorder>
                  <Text size="xs" c="dimmed" fw={600}>มูลค่าขายปลีก</Text>
                  <Text size="xl" fw={800} c="green">฿{fmt(v.totalRetailValue)}</Text>
                  <Text size="xs" c="dimmed" mt={2}>กำไรที่คาดหวัง: ฿{fmt(v.potentialProfit)}</Text>
                </Card>
              </SimpleGrid>

              <Card shadow="xs" padding="lg" radius="md" withBorder>
                {v.products.length === 0 ? (
                  <Text ta="center" c="dimmed" py="xl">ไม่มีสินค้าคงเหลือ</Text>
                ) : (
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>SKU</Table.Th>
                        <Table.Th>สินค้า</Table.Th>
                        <Table.Th ta="center">หน่วย</Table.Th>
                        <Table.Th ta="right">คงเหลือ</Table.Th>
                        <Table.Th ta="right">ต้นทุนเฉลี่ย</Table.Th>
                        <Table.Th ta="right">มูลค่าต้นทุน</Table.Th>
                        <Table.Th ta="right">ราคาขาย</Table.Th>
                        <Table.Th ta="right">มูลค่าขาย</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {v.products.map((p: any, i: number) => {
                        const qty = parseInt(p.qty_on_hand) || 0
                        const costVal = parseFloat(p.cost_value) || 0
                        const retailVal = parseFloat(p.retail_value) || 0
                        const avgCost = qty > 0 ? costVal / qty : 0
                        return (
                          <Table.Tr key={p.id}>
                            <Table.Td><Text size="sm" c="dimmed">{i + 1}</Text></Table.Td>
                            <Table.Td><Text size="sm" ff="monospace">{p.sku}</Text></Table.Td>
                            <Table.Td><Text size="sm" fw={500}>{p.name}</Text></Table.Td>
                            <Table.Td ta="center"><Text size="sm" c="dimmed">{p.unit}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm" fw={600}>{fmtInt(qty)}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(avgCost)}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm" fw={600} c="blue">฿{fmt(costVal)}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(parseFloat(p.selling_price))}</Text></Table.Td>
                            <Table.Td ta="right"><Text size="sm" fw={600} c="green">฿{fmt(retailVal)}</Text></Table.Td>
                          </Table.Tr>
                        )
                      })}
                    </Table.Tbody>
                    <Table.Tfoot>
                      <Table.Tr>
                        <Table.Th colSpan={4}>รวมทั้งหมด</Table.Th>
                        <Table.Th ta="right"><Text fw={700}>{fmtInt(v.totalQty)}</Text></Table.Th>
                        <Table.Th />
                        <Table.Th ta="right"><Text fw={700} c="blue">฿{fmt(v.totalCostValue)}</Text></Table.Th>
                        <Table.Th />
                        <Table.Th ta="right"><Text fw={700} c="green">฿{fmt(v.totalRetailValue)}</Text></Table.Th>
                      </Table.Tr>
                    </Table.Tfoot>
                  </Table>
                )}
              </Card>
            </>
          )}

          {/* ─── สินค้าเคลื่อนไหวช้า ─── */}
          {tab === 'slow-moving' && (
            <>
              <Card shadow="xs" padding="md" radius="md" withBorder
                style={{ border: '2px solid var(--app-warning)', background: 'rgba(245,158,11,0.04)' }}>
                <Group gap={8}>
                  <IconAlertTriangle size={20} color="var(--app-warning)" />
                  <div>
                    <Text size="sm" fw={700}>สินค้าที่ไม่มีการขายใน {slowDays} วันที่ผ่านมา</Text>
                    <Text size="xs" c="dimmed">
                      พบ {slowMoving.length} รายการ มูลค่ารวม ฿{fmt(slowMoving.reduce((s: number, r: any) => s + (parseFloat(r.stock_value) || 0), 0))}
                    </Text>
                  </div>
                </Group>
              </Card>

              <Card shadow="xs" padding="lg" radius="md" withBorder>
                {slowMoving.length === 0 ? (
                  <Text ta="center" c="green" py="xl" fw={600}>ไม่มีสินค้าเคลื่อนไหวช้า — ดีมาก!</Text>
                ) : (
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>SKU</Table.Th>
                        <Table.Th>สินค้า</Table.Th>
                        <Table.Th ta="right">คงเหลือ</Table.Th>
                        <Table.Th ta="right">มูลค่าค้างสต๊อก</Table.Th>
                        <Table.Th ta="right">ราคาขาย</Table.Th>
                        <Table.Th>รับล่าสุด</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {slowMoving.map((r: any, i: number) => (
                        <Table.Tr key={r.id}>
                          <Table.Td><Text size="sm" c="dimmed">{i + 1}</Text></Table.Td>
                          <Table.Td><Text size="sm" ff="monospace">{r.sku}</Text></Table.Td>
                          <Table.Td><Text size="sm" fw={500}>{r.name}</Text></Table.Td>
                          <Table.Td ta="right"><Text size="sm" fw={600}>{fmtInt(parseInt(r.qty_on_hand))}</Text></Table.Td>
                          <Table.Td ta="right"><Text size="sm" fw={600} c="orange">฿{fmt(parseFloat(r.stock_value))}</Text></Table.Td>
                          <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(parseFloat(r.selling_price))}</Text></Table.Td>
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {r.last_received ? new Date(r.last_received).toLocaleDateString('th-TH') : '—'}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                    <Table.Tfoot>
                      <Table.Tr>
                        <Table.Th colSpan={4}>รวม</Table.Th>
                        <Table.Th ta="right">
                          <Text fw={700} c="orange">฿{fmt(slowMoving.reduce((s: number, r: any) => s + (parseFloat(r.stock_value) || 0), 0))}</Text>
                        </Table.Th>
                        <Table.Th colSpan={2} />
                      </Table.Tr>
                    </Table.Tfoot>
                  </Table>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </Stack>
  )
}
