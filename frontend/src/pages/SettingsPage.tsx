import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TextInput, Switch, NumberInput, Button, Group, Text,
  Stack, Divider, Loader, Badge, Card, SimpleGrid, Textarea
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconBuilding, IconPhone, IconReceipt, IconDeviceFloppy,
  IconPercentage, IconMapPin, IconId, IconWand
} from '@tabler/icons-react'
import api from '../services/api'

export default function SettingsPage() {
  const queryClient = useQueryClient()

  const { data: company, isLoading } = useQuery({
    queryKey: ['company-current'],
    queryFn: () => api.get('/companies/current').then(r => r.data),
  })

  // Form state
  const [form, setForm] = useState({
    name: '', taxId: '', phone: '',
    addrHouseNo: '', addrVillage: '', addrStreet: '', addrSubdistrict: '', addrDistrict: '',
    addrProvince: '', addrZipCode: '',
    vatEnabled: true, vatRate: 7,
  })
  const [rawAddress, setRawAddress] = useState('')

  const buildAddress = () => {
    const parts = [
      form.addrHouseNo,
      form.addrVillage ? `หมู่บ้าน${form.addrVillage}` : '',
      form.addrStreet,
      form.addrSubdistrict ? `ต.${form.addrSubdistrict}` : '',
      form.addrDistrict ? `อ.${form.addrDistrict}` : '',
      form.addrProvince ? `จ.${form.addrProvince}` : '',
      form.addrZipCode,
    ].filter(Boolean)
    return parts.join(' ')
  }

  const parseAddress = (addr: string) => {
    if (!addr) return { addrHouseNo: '', addrVillage: '', addrStreet: '', addrSubdistrict: '', addrDistrict: '', addrProvince: '', addrZipCode: '' }
    const zip = addr.match(/(\d{5})$/)?.[1] || ''
    const prov = addr.match(/จ\.([^\s]+)/)?.[1] || ''
    const dist = addr.match(/อ\.([^\s]+)/)?.[1] || ''
    const sub = addr.match(/ต\.([^\s]+)/)?.[1] || ''
    const villageMatch = addr.match(/หมู่บ้าน(.+?)(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ต\.|ตำบล|อ\.|อำเภอ|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/)
    const village = villageMatch ? villageMatch[1].trim() : ''
    let remaining = addr.replace(/\d{5}$/, '').replace(/จ\.[^\s]+/, '').replace(/อ\.[^\s]+/, '').replace(/ต\.[^\s]+/, '')
      .replace(/หมู่บ้าน.+?(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ต\.|ตำบล|อ\.|อำเภอ|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/, '').trim()
    const parts = remaining.split(/\s+/)
    const houseNo = parts[0] || ''
    const street = parts.slice(1).join(' ')
    return { addrHouseNo: houseNo, addrVillage: village, addrStreet: street, addrSubdistrict: sub, addrDistrict: dist, addrProvince: prov, addrZipCode: zip }
  }

  // Populate form when data loads
  useEffect(() => {
    if (company) {
      const settings = company.settings || {}
      const addr = parseAddress(company.address || '')
      setForm({
        name: company.name || '',
        taxId: company.tax_id || '',
        phone: company.phone || '',
        ...addr,
        vatEnabled: settings.vat_enabled !== false,
        vatRate: settings.vat_rate ?? 7,
      })
    }
  }, [company])

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/companies/${company.id}`, data),
    onSuccess: () => {
      notifications.show({
        title: '✅ บันทึกสำเร็จ',
        message: 'อัพเดตข้อมูลบริษัทเรียบร้อยแล้ว',
        color: 'green',
      })
      queryClient.invalidateQueries({ queryKey: ['company-current'] })
    },
    onError: () => {
      notifications.show({ title: 'เกิดข้อผิดพลาด', message: 'ไม่สามารถบันทึกได้', color: 'red' })
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      name: form.name,
      taxId: form.taxId,
      address: buildAddress(),
      phone: form.phone,
      settings: {
        vat_enabled: form.vatEnabled,
        vat_rate: form.vatRate,
        currency: 'THB',
        language: 'th',
      },
    })
  }

  if (isLoading) return <Loader style={{ margin: '40px auto', display: 'block' }} />

  return (
    <Stack gap="xl">
      <Group justify="space-between">
        <Text size="xl" fw={800}>⚙️ ตั้งค่าระบบ</Text>
        <Button leftSection={<IconDeviceFloppy size={18} />}
          onClick={handleSave} loading={updateMutation.isPending}
          style={{ background: 'linear-gradient(135deg, #4f46e5, #3730a3)' }}>
          บันทึกการเปลี่ยนแปลง
        </Button>
      </Group>

      {/* Company Info */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <IconBuilding size={20} color="var(--app-primary)" />
          <Text fw={700} size="lg">ข้อมูลบริษัท / ร้านค้า</Text>
        </Group>
        <Stack gap="md">
          <TextInput label="ชื่อบริษัท / ร้านค้า" placeholder="Bookdee Shop" size="md"
            leftSection={<IconBuilding size={16} />}
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <Group grow>
            <TextInput label="เลขประจำตัวผู้เสียภาษี" placeholder="0-0000-00000-00-0" size="md"
              leftSection={<IconId size={16} />}
              value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            <TextInput label="เบอร์โทรศัพท์" placeholder="02-xxx-xxxx" size="md"
              leftSection={<IconPhone size={16} />}
              value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Group>

          <Divider label="ที่อยู่บริษัท" labelPosition="left" />

          {/* Paste & Parse */}
          <Group gap="sm" align="end">
            <Textarea size="sm" placeholder="วางที่อยู่แบบเต็ม เช่น: 123/45 ถ.สุขุมวิท ต.คลองเตย อ.คลองเตย กรุงเทพฯ 10110"
              style={{ flex: 1 }} autosize minRows={1} maxRows={3}
              value={rawAddress} onChange={(e) => setRawAddress(e.target.value)} />
            <Button size="sm" variant="light" color="teal" leftSection={<IconWand size={14} />}
              disabled={!rawAddress.trim()} onClick={() => {
                const addr = rawAddress.trim()
                const zipMatch = addr.match(/(\d{5})/)
                const zip = zipMatch ? zipMatch[1] : ''
                let province = ''
                const provMatch = addr.match(/จ(?:\.|ังหวัด)\s*([^\s,]+)/)
                if (provMatch) province = provMatch[1]
                else if (/กรุงเทพ/.test(addr)) province = 'กรุงเทพมหานคร'
                let district = ''
                const distMatch = addr.match(/(?:อำเภอ|อ\.|เขต)\s*([^\s,]+)/)
                if (distMatch) district = distMatch[1]
                let subdistrict = ''
                const subMatch = addr.match(/(?:ตำบล|ต\.|แขวง)\s*([^\s,]+)/)
                if (subMatch) subdistrict = subMatch[1]
                let village = ''
                const villageMatch = addr.match(/หมู่บ้าน\s*(.+?)(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ตำบล|ต\.|อำเภอ|อ\.|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/)
                if (villageMatch) village = villageMatch[1].trim()
                let street = ''
                const streetMatch = addr.match(/(?:ถนน|ถ\.)\s*([^\s,]*(?:[\-][^\s,]*)*)/)
                if (streetMatch) street = 'ถนน' + streetMatch[1]
                let remaining = addr
                  .replace(/(\d{5})/, '').replace(/จ(?:\.|ังหวัด)\s*[^\s,]+/, '')
                  .replace(/(?:อำเภอ|อ\.|เขต)\s*[^\s,]+/, '').replace(/(?:ตำบล|ต\.|แขวง)\s*[^\s,]+/, '')
                  .replace(/หมู่บ้าน\s*.+?(?=\s*(?:ถนน|ถ\.|ซอย|ซ\.|ตำบล|ต\.|อำเภอ|อ\.|แขวง|เขต|จ\.|จังหวัด|\d{5}|$))/, '')
                  .replace(/(?:ถนน|ถ\.)\s*[^\s,]*(?:[\-][^\s,]*)*/, '')
                  .replace(/กรุงเทพมหานคร/, '').replace(/กรุงเทพฯ/, '')
                  .replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim()
                setForm(prev => ({ ...prev, addrHouseNo: remaining || '', addrVillage: village, addrStreet: street,
                  addrSubdistrict: subdistrict, addrDistrict: district, addrProvince: province, addrZipCode: zip }))
                notifications.show({ title: '✅ กระจายที่อยู่สำเร็จ', message: 'ตรวจสอบและแก้ไขได้ที่ช่องด้านล่าง', color: 'teal', autoClose: 2000 })
              }}>
              กระจายที่อยู่
            </Button>
          </Group>

          <SimpleGrid cols={3}>
            <TextInput label="บ้านเลขที่" placeholder="123/45" size="md"
              value={form.addrHouseNo} onChange={(e) => setForm({ ...form, addrHouseNo: e.target.value })} />
            <TextInput label="หมู่บ้าน / คอนโด" placeholder="คุณาลัย คอร์ทยาร์ด" size="md"
              value={form.addrVillage} onChange={(e) => setForm({ ...form, addrVillage: e.target.value })} />
            <TextInput label="ถนน / ซอย" placeholder="ถนนสุขุมวิท" size="md"
              value={form.addrStreet} onChange={(e) => setForm({ ...form, addrStreet: e.target.value })} />
          </SimpleGrid>
          <SimpleGrid cols={2}>
            <TextInput label="ตำบล / แขวง" placeholder="คลองเตย" size="md"
              value={form.addrSubdistrict} onChange={(e) => setForm({ ...form, addrSubdistrict: e.target.value })} />
            <TextInput label="อำเภอ / เขต" placeholder="คลองเตย" size="md"
              value={form.addrDistrict} onChange={(e) => setForm({ ...form, addrDistrict: e.target.value })} />
          </SimpleGrid>
          <SimpleGrid cols={2}>
            <TextInput label="จังหวัด" placeholder="กรุงเทพมหานคร" size="md"
              value={form.addrProvince} onChange={(e) => setForm({ ...form, addrProvince: e.target.value })} />
            <TextInput label="รหัสไปรษณีย์" placeholder="10110" size="md"
              value={form.addrZipCode} onChange={(e) => setForm({ ...form, addrZipCode: e.target.value })} />
          </SimpleGrid>
        </Stack>
      </Card>

      {/* VAT / Tax Settings */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <IconReceipt size={20} color="var(--app-success)" />
          <Text fw={700} size="lg">ตั้งค่าภาษี</Text>
        </Group>
        <Stack gap="md">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', borderRadius: 12,
            border: `2px solid ${form.vatEnabled ? 'var(--app-success)' : 'var(--app-border)'}`,
            background: form.vatEnabled ? 'rgba(5,150,105,0.04)' : 'var(--app-surface)',
            transition: 'all 0.3s',
          }}>
            <div>
              <Group gap={8}>
                <Text fw={700} size="md">ภาษีมูลค่าเพิ่ม (VAT)</Text>
                <Badge color={form.vatEnabled ? 'green' : 'gray'} variant="light">
                  {form.vatEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" mt={4}>
                {form.vatEnabled
                  ? `คำนวณ VAT ${form.vatRate}% อัตโนมัติในทุกบิลขาย (POS + ออนไลน์)`
                  : 'ไม่คำนวณ VAT ในบิลขาย'}
              </Text>
            </div>
            <Switch size="lg" checked={form.vatEnabled}
              onChange={(e) => setForm({ ...form, vatEnabled: e.target.checked })}
              color="green" />
          </div>

          {form.vatEnabled && (
            <NumberInput label="อัตราภาษี (%)" size="md"
              leftSection={<IconPercentage size={16} />}
              min={0} max={100} decimalScale={2}
              value={form.vatRate}
              onChange={(v) => setForm({ ...form, vatRate: Number(v) || 7 })}
              style={{ maxWidth: 200 }}
            />
          )}

          <div style={{
            padding: 16, borderRadius: 10, background: 'var(--app-surface-light)',
            border: '1px solid var(--app-border)',
          }}>
            <Text size="sm" fw={600} mb={4}>📌 ผลกระทบต่อระบบ</Text>
            <Text size="xs" c="dimmed">
              • <strong>POS:</strong> ยอดรวมจะ{form.vatEnabled ? `บวก VAT ${form.vatRate}%` : 'ไม่รวม VAT'} อัตโนมัติ<br/>
              • <strong>ใบเสร็จ:</strong> {form.vatEnabled ? `แสดงแยกยอดสินค้า + VAT ${form.vatRate}%` : 'แสดงยอดรวมเท่านั้น'}<br/>
              • <strong>รายงาน:</strong> {form.vatEnabled ? 'รวมยอด VAT ในรายงานสรุป' : 'ไม่แสดง VAT ในรายงาน'}
            </Text>
          </div>
        </Stack>
      </Card>

      {/* System Info */}
      <Card shadow="xs" padding="lg" radius="md" withBorder>
        <Group gap={8} mb="md">
          <IconMapPin size={20} color="var(--app-accent)" />
          <Text fw={700} size="lg">ข้อมูลระบบ</Text>
        </Group>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Company ID</Text>
            <Text size="sm" ff="monospace">{company?.id?.slice(0, 8)}...</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">สร้างเมื่อ</Text>
            <Text size="sm">{company?.created_at ? new Date(company.created_at).toLocaleDateString('th-TH') : '-'}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">สกุลเงิน</Text>
            <Badge variant="light">THB (บาท)</Badge>
          </Group>
        </Stack>
      </Card>
    </Stack>
  )
}
