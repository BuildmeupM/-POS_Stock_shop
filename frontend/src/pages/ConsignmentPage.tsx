import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Card, Text, Group, Table, Badge, Loader, Stack, Button, Modal, TextInput, NumberInput,
  Select, SimpleGrid, SegmentedControl, Textarea, ActionIcon,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { notifications } from '@mantine/notifications'
import {
  IconContract, IconPackageImport, IconPackageExport, IconCash,
  IconPlus, IconTrash, IconFileInvoice,
} from '@tabler/icons-react'
import api from '../services/api'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = (n: number) => n.toLocaleString('th-TH')
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('th-TH') : '—'

type Tab = 'agreements' | 'stock' | 'settlements'

export default function ConsignmentPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('agreements')

  // ── Data queries ──
  const { data: vendors = [] } = useQuery({
    queryKey: ['contacts-vendors'],
    queryFn: () => api.get('/contacts', { params: { type: 'vendor' } }).then(r => r.data),
  })
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-consignment'],
    queryFn: () => api.get('/products').then(r => r.data),
  })
  const { data: agreements = [], isLoading: loadAg } = useQuery({
    queryKey: ['consignment-agreements'],
    queryFn: () => api.get('/consignment/agreements').then(r => r.data),
  })
  const { data: stock = [], isLoading: loadSt } = useQuery({
    queryKey: ['consignment-stock'],
    queryFn: () => api.get('/consignment/stock').then(r => r.data),
    enabled: tab === 'stock',
  })
  const { data: settlements = [], isLoading: loadSet } = useQuery({
    queryKey: ['consignment-settlements'],
    queryFn: () => api.get('/consignment/settlements').then(r => r.data),
    enabled: tab === 'settlements',
  })

  // ── Modal states ──
  const [addAgOpen, setAddAgOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)

  // ── Agreement form ──
  const [agForm, setAgForm] = useState({ contactId: '', startDate: null as Date | null, endDate: null as Date | null, commissionType: 'percent', commissionRate: 15, paymentTerms: 30, note: '' })

  const createAgMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/agreements', data),
    onSuccess: (res) => {
      notifications.show({ title: 'สำเร็จ', message: `สร้างสัญญา ${res.data.agreementNumber}`, color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-agreements'] })
      setAddAgOpen(false)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' }),
  })

  // ── Receive form ──
  const [recAgId, setRecAgId] = useState('')
  const [recItems, setRecItems] = useState([{ productId: '', quantity: 1, consignorPrice: 0, sellingPrice: 0 }])

  const receiveMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/stock/receive', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'รับสินค้าฝากขายเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-stock'] })
      queryClient.invalidateQueries({ queryKey: ['consignment-agreements'] })
      setReceiveOpen(false)
      setRecItems([{ productId: '', quantity: 1, consignorPrice: 0, sellingPrice: 0 }])
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถรับสินค้าได้', color: 'red' }),
  })

  // ── Return form ──
  const [retAgId, setRetAgId] = useState('')
  const [retItems, setRetItems] = useState([{ productId: '', quantity: 1 }])

  const returnMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/stock/return', data),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'คืนสินค้าเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-stock'] })
      setReturnOpen(false)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถคืนได้', color: 'red' }),
  })

  // ── Settlement form ──
  const [setAgId, setSetAgId] = useState('')
  const [setPeriod, setSetPeriod] = useState<[Date | null, Date | null]>([
    new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date()
  ])

  const settleMutation = useMutation({
    mutationFn: (data: any) => api.post('/consignment/settlements', data),
    onSuccess: (res) => {
      notifications.show({
        title: 'สำเร็จ',
        message: `สร้างใบสรุป ${res.data.settlementNumber} — ยอดจ่าย ฿${fmt(res.data.netPayable)}`,
        color: 'green',
      })
      queryClient.invalidateQueries({ queryKey: ['consignment-settlements'] })
      setSettleOpen(false)
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างได้', color: 'red' }),
  })

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post(`/consignment/settlements/${id}/pay`, { paymentMethod: 'transfer' }),
    onSuccess: () => {
      notifications.show({ title: 'สำเร็จ', message: 'บันทึกจ่ายเงินเรียบร้อย', color: 'green' })
      queryClient.invalidateQueries({ queryKey: ['consignment-settlements'] })
    },
    onError: (err: any) => notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || '', color: 'red' }),
  })

  const agOptions = agreements.filter((a: any) => a.status === 'active').map((a: any) => ({ value: String(a.id), label: `${a.agreement_number} — ${a.contact_name}` }))
  const vendorOptions = vendors.map((v: any) => ({ value: String(v.id), label: v.name }))
  const productOptions = products.map((p: any) => ({ value: String(p.id), label: `${p.sku} — ${p.name}` }))

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap={8}>
          <IconContract size={24} color="var(--app-primary)" />
          <Text size="xl" fw={800}>ระบบฝากขาย (Consignment)</Text>
        </Group>
        <SegmentedControl value={tab} onChange={(v) => setTab(v as Tab)}
          data={[
            { value: 'agreements', label: 'สัญญา' },
            { value: 'stock', label: 'สต๊อกฝากขาย' },
            { value: 'settlements', label: 'สรุปยอด/จ่ายเงิน' },
          ]} />
      </Group>

      {/* ══════ Tab: สัญญา ══════ */}
      {tab === 'agreements' && (
        <>
          <Group justify="flex-end">
            <Button leftSection={<IconPlus size={16} />} onClick={() => setAddAgOpen(true)}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างสัญญาฝากขาย
            </Button>
          </Group>
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            {loadAg ? <Loader style={{ margin: '40px auto', display: 'block' }} /> :
              agreements.length === 0 ? <Text ta="center" c="dimmed" py="xl">ยังไม่มีสัญญาฝากขาย</Text> : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>เลขที่</Table.Th>
                      <Table.Th>ผู้ฝากขาย</Table.Th>
                      <Table.Th ta="center">ค่าคอมฯ</Table.Th>
                      <Table.Th ta="center">สินค้าคงเหลือ</Table.Th>
                      <Table.Th>วันเริ่ม</Table.Th>
                      <Table.Th ta="center">สถานะ</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {agreements.map((a: any) => (
                      <Table.Tr key={a.id}>
                        <Table.Td><Text size="sm" ff="monospace" fw={600}>{a.agreement_number}</Text></Table.Td>
                        <Table.Td><Text size="sm" fw={500}>{a.contact_name}</Text></Table.Td>
                        <Table.Td ta="center">
                          <Badge variant="light" color="violet">
                            {a.commission_type === 'percent' ? `${a.commission_rate}%` : `฿${fmt(parseFloat(a.commission_rate))}/ชิ้น`}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="center"><Text size="sm" fw={600}>{fmtInt(a.total_on_hand || 0)} ชิ้น</Text></Table.Td>
                        <Table.Td><Text size="sm" c="dimmed">{fmtDate(a.start_date)}</Text></Table.Td>
                        <Table.Td ta="center">
                          <Badge color={a.status === 'active' ? 'green' : a.status === 'expired' ? 'orange' : 'red'} variant="light">
                            {a.status === 'active' ? 'ใช้งาน' : a.status === 'expired' ? 'หมดอายุ' : 'ยกเลิก'}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
          </Card>
        </>
      )}

      {/* ══════ Tab: สต๊อกฝากขาย ══════ */}
      {tab === 'stock' && (
        <>
          <Group justify="flex-end" gap="sm">
            <Button leftSection={<IconPackageImport size={16} />} color="teal" onClick={() => setReceiveOpen(true)}>รับสินค้าเข้า</Button>
            <Button leftSection={<IconPackageExport size={16} />} color="orange" variant="light" onClick={() => setReturnOpen(true)}>คืนสินค้า</Button>
          </Group>

          <SimpleGrid cols={3}>
            <Card shadow="xs" padding="md" radius="md" withBorder>
              <Text size="xs" c="dimmed">รายการทั้งหมด</Text>
              <Text size="xl" fw={800}>{stock.length}</Text>
            </Card>
            <Card shadow="xs" padding="md" radius="md" withBorder>
              <Text size="xs" c="dimmed">คงเหลือรวม</Text>
              <Text size="xl" fw={800}>{fmtInt(stock.reduce((s: number, r: any) => s + (parseInt(r.quantity_on_hand) || 0), 0))} ชิ้น</Text>
            </Card>
            <Card shadow="xs" padding="md" radius="md" withBorder>
              <Text size="xs" c="dimmed">มูลค่าขาย (ถ้าขายหมด)</Text>
              <Text size="xl" fw={800} c="green">฿{fmt(stock.reduce((s: number, r: any) => s + (parseInt(r.quantity_on_hand) || 0) * (parseFloat(r.selling_price) || 0), 0))}</Text>
            </Card>
          </SimpleGrid>

          <Card shadow="xs" padding="lg" radius="md" withBorder>
            {loadSt ? <Loader style={{ margin: '40px auto', display: 'block' }} /> :
              stock.length === 0 ? <Text ta="center" c="dimmed" py="xl">ยังไม่มีสินค้าฝากขาย</Text> : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>สินค้า</Table.Th>
                      <Table.Th>สัญญา</Table.Th>
                      <Table.Th ta="right">รับเข้า</Table.Th>
                      <Table.Th ta="right">ขายแล้ว</Table.Th>
                      <Table.Th ta="right">คืนแล้ว</Table.Th>
                      <Table.Th ta="right">คงเหลือ</Table.Th>
                      <Table.Th ta="right">ราคาผู้ฝาก</Table.Th>
                      <Table.Th ta="right">ราคาขาย</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {stock.map((s: any) => (
                      <Table.Tr key={s.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>{s.product_name}</Text>
                          <Text size="xs" c="dimmed" ff="monospace">{s.sku}</Text>
                        </Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{s.agreement_number} — {s.contact_name}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm">{fmtInt(s.quantity_received)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="green">{fmtInt(s.quantity_sold)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="orange">{fmtInt(s.quantity_returned)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={700}>{fmtInt(s.quantity_on_hand)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="dimmed">฿{fmt(parseFloat(s.consignor_price))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={600}>฿{fmt(parseFloat(s.selling_price))}</Text></Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
          </Card>
        </>
      )}

      {/* ══════ Tab: สรุปยอด/จ่ายเงิน ══════ */}
      {tab === 'settlements' && (
        <>
          <Group justify="flex-end">
            <Button leftSection={<IconFileInvoice size={16} />} onClick={() => setSettleOpen(true)}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างใบสรุปยอด
            </Button>
          </Group>
          <Card shadow="xs" padding="lg" radius="md" withBorder>
            {loadSet ? <Loader style={{ margin: '40px auto', display: 'block' }} /> :
              settlements.length === 0 ? <Text ta="center" c="dimmed" py="xl">ยังไม่มีใบสรุป</Text> : (
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>เลขที่</Table.Th>
                      <Table.Th>สัญญา</Table.Th>
                      <Table.Th>ผู้ฝากขาย</Table.Th>
                      <Table.Th>งวด</Table.Th>
                      <Table.Th ta="right">ยอดขาย</Table.Th>
                      <Table.Th ta="right">ค่าคอมฯ</Table.Th>
                      <Table.Th ta="right">ยอดจ่าย</Table.Th>
                      <Table.Th ta="center">สถานะ</Table.Th>
                      <Table.Th ta="center">จัดการ</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {settlements.map((s: any) => (
                      <Table.Tr key={s.id}>
                        <Table.Td><Text size="sm" ff="monospace" fw={600}>{s.settlement_number}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{s.agreement_number}</Text></Table.Td>
                        <Table.Td><Text size="sm">{s.contact_name}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{fmtDate(s.period_from)} — {fmtDate(s.period_to)}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm">฿{fmt(parseFloat(s.total_sales))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" c="violet">฿{fmt(parseFloat(s.total_commission))}</Text></Table.Td>
                        <Table.Td ta="right"><Text size="sm" fw={700} c="blue">฿{fmt(parseFloat(s.net_payable))}</Text></Table.Td>
                        <Table.Td ta="center">
                          <Badge color={s.status === 'paid' ? 'green' : s.status === 'confirmed' ? 'blue' : 'gray'} variant="light">
                            {s.status === 'paid' ? 'จ่ายแล้ว' : s.status === 'confirmed' ? 'ยืนยัน' : 'ร่าง'}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="center">
                          {s.status !== 'paid' && (
                            <Button size="xs" color="green" variant="light"
                              leftSection={<IconCash size={14} />}
                              loading={payMutation.isPending}
                              onClick={() => { if (confirm(`จ่ายเงิน ฿${fmt(parseFloat(s.net_payable))} ?`)) payMutation.mutate(s.id) }}>
                              จ่ายเงิน
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
          </Card>
        </>
      )}

      {/* ══════ Modal: สร้างสัญญา ══════ */}
      <Modal opened={addAgOpen} onClose={() => setAddAgOpen(false)} title="สร้างสัญญาฝากขาย" centered size="md">
        <Stack gap="md">
          <Select label="ผู้ฝากขาย" required searchable data={vendorOptions}
            value={agForm.contactId} onChange={v => setAgForm({ ...agForm, contactId: v || '' })} />
          <Group grow>
            <DatePickerInput label="วันเริ่ม" required value={agForm.startDate} onChange={v => setAgForm({ ...agForm, startDate: v })} locale="th" valueFormat="DD MMMM YYYY" />
            <DatePickerInput label="วันสิ้นสุด" value={agForm.endDate} onChange={v => setAgForm({ ...agForm, endDate: v })} locale="th" valueFormat="DD MMMM YYYY" clearable />
          </Group>
          <Group grow>
            <Select label="ประเภทค่าคอมฯ" data={[{ value: 'percent', label: '% จากยอดขาย' }, { value: 'fixed', label: 'บาท/ชิ้น' }]}
              value={agForm.commissionType} onChange={v => setAgForm({ ...agForm, commissionType: v || 'percent' })} />
            <NumberInput label={agForm.commissionType === 'percent' ? 'อัตรา (%)' : 'จำนวน (฿/ชิ้น)'}
              min={0} value={agForm.commissionRate} onChange={v => setAgForm({ ...agForm, commissionRate: Number(v) || 0 })} />
          </Group>
          <NumberInput label="ระยะจ่ายเงิน (วัน)" min={0} value={agForm.paymentTerms} onChange={v => setAgForm({ ...agForm, paymentTerms: Number(v) || 30 })} />
          <Textarea label="หมายเหตุ" value={agForm.note} onChange={e => setAgForm({ ...agForm, note: e.target.value })} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setAddAgOpen(false)}>ยกเลิก</Button>
            <Button loading={createAgMutation.isPending} disabled={!agForm.contactId || !agForm.startDate}
              onClick={() => createAgMutation.mutate({
                contactId: parseInt(agForm.contactId), startDate: agForm.startDate?.toISOString().split('T')[0],
                endDate: agForm.endDate?.toISOString().split('T')[0] || null,
                commissionType: agForm.commissionType, commissionRate: agForm.commissionRate,
                paymentTerms: agForm.paymentTerms, note: agForm.note,
              })}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างสัญญา
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: รับสินค้า ══════ */}
      <Modal opened={receiveOpen} onClose={() => setReceiveOpen(false)} title="รับสินค้าฝากขาย" centered size="lg">
        <Stack gap="md">
          <Select label="สัญญาฝากขาย" required searchable data={agOptions}
            value={recAgId} onChange={v => setRecAgId(v || '')} />
          {recItems.map((item, i) => (
            <Group key={i} grow align="end">
              <Select label="สินค้า" searchable data={productOptions} value={item.productId}
                onChange={v => { const u = [...recItems]; u[i].productId = v || ''; setRecItems(u) }} />
              <NumberInput label="จำนวน" min={1} value={item.quantity}
                onChange={v => { const u = [...recItems]; u[i].quantity = Number(v) || 1; setRecItems(u) }} />
              <NumberInput label="ราคาผู้ฝาก" min={0} value={item.consignorPrice}
                onChange={v => { const u = [...recItems]; u[i].consignorPrice = Number(v) || 0; setRecItems(u) }} />
              <NumberInput label="ราคาขาย" min={0} value={item.sellingPrice}
                onChange={v => { const u = [...recItems]; u[i].sellingPrice = Number(v) || 0; setRecItems(u) }} />
              {recItems.length > 1 && (
                <ActionIcon color="red" variant="light" onClick={() => setRecItems(recItems.filter((_, j) => j !== i))}>
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          ))}
          <Button variant="light" size="xs" leftSection={<IconPlus size={14} />}
            onClick={() => setRecItems([...recItems, { productId: '', quantity: 1, consignorPrice: 0, sellingPrice: 0 }])}>
            เพิ่มรายการ
          </Button>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setReceiveOpen(false)}>ยกเลิก</Button>
            <Button color="teal" loading={receiveMutation.isPending}
              disabled={!recAgId || recItems.every(i => !i.productId)}
              onClick={() => receiveMutation.mutate({
                agreementId: parseInt(recAgId),
                items: recItems.filter(i => i.productId).map(i => ({ ...i, productId: parseInt(i.productId) })),
              })}>
              รับสินค้า
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: คืนสินค้า ══════ */}
      <Modal opened={returnOpen} onClose={() => setReturnOpen(false)} title="คืนสินค้าให้ผู้ฝากขาย" centered>
        <Stack gap="md">
          <Select label="สัญญาฝากขาย" required searchable data={agOptions}
            value={retAgId} onChange={v => setRetAgId(v || '')} />
          {retItems.map((item, i) => (
            <Group key={i} grow align="end">
              <Select label="สินค้า" searchable data={productOptions} value={item.productId}
                onChange={v => { const u = [...retItems]; u[i].productId = v || ''; setRetItems(u) }} />
              <NumberInput label="จำนวน" min={1} value={item.quantity}
                onChange={v => { const u = [...retItems]; u[i].quantity = Number(v) || 1; setRetItems(u) }} />
            </Group>
          ))}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setReturnOpen(false)}>ยกเลิก</Button>
            <Button color="orange" loading={returnMutation.isPending}
              disabled={!retAgId || retItems.every(i => !i.productId)}
              onClick={() => returnMutation.mutate({
                agreementId: parseInt(retAgId),
                items: retItems.filter(i => i.productId).map(i => ({ ...i, productId: parseInt(i.productId) })),
              })}>
              คืนสินค้า
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ══════ Modal: สร้างใบสรุป ══════ */}
      <Modal opened={settleOpen} onClose={() => setSettleOpen(false)} title="สร้างใบสรุปยอดฝากขาย" centered>
        <Stack gap="md">
          <Select label="สัญญาฝากขาย" required searchable data={agOptions}
            value={setAgId} onChange={v => setSetAgId(v || '')} />
          <Group grow>
            <DatePickerInput label="ตั้งแต่" value={setPeriod[0]} onChange={v => setSetPeriod([v, setPeriod[1]])} locale="th" valueFormat="DD MMMM YYYY" />
            <DatePickerInput label="ถึง" value={setPeriod[1]} onChange={v => setSetPeriod([setPeriod[0], v])} locale="th" valueFormat="DD MMMM YYYY" />
          </Group>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setSettleOpen(false)}>ยกเลิก</Button>
            <Button loading={settleMutation.isPending}
              disabled={!setAgId || !setPeriod[0] || !setPeriod[1]}
              onClick={() => settleMutation.mutate({
                agreementId: parseInt(setAgId),
                periodFrom: setPeriod[0]?.toISOString().split('T')[0],
                periodTo: setPeriod[1]?.toISOString().split('T')[0],
              })}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
              สร้างใบสรุป
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
