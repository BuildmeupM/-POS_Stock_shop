import {
  Stack, Group, TextInput, NumberInput, Button, Select, SimpleGrid, Divider
} from '@mantine/core'
import { IconTag } from '@tabler/icons-react'
import { ATTR_COLORS } from '../../utils/constants'
import type { ProductFormData, AttributeGroup, AttributeValue } from '../../types'

interface ProductFormProps {
  form: ProductFormData
  setForm: (f: ProductFormData) => void
  attrGroups: AttributeGroup[]
  loading: boolean
  onSubmit: () => void
  submitLabel: string
  color?: string
}

export default function ProductForm({ form, setForm, attrGroups, loading, onSubmit, submitLabel, color }: ProductFormProps) {
  const getAttrValue = (groupId: number): string | null => {
    const attr = form.attributes.find((a) => a.groupId === groupId)
    return attr ? String(attr.valueId) : null
  }

  const setAttrValue = (groupId: number, valueId: string | null) => {
    const existing = form.attributes.filter((a) => a.groupId !== groupId)
    if (valueId) {
      existing.push({ groupId, valueId: parseInt(valueId) })
    }
    setForm({ ...form, attributes: existing })
  }

  return (
    <Stack gap="md">
      <Group grow>
        <TextInput label="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <TextInput label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
      </Group>
      <TextInput label="ชื่อสินค้า" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <TextInput label="รายละเอียด" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <TextInput label="หน่วยนับ" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />

      {/* Dynamic Attribute Selects */}
      {attrGroups.length > 0 && (
        <>
          <Divider label="แอตทริบิวต์สินค้า" labelPosition="center" />
          <SimpleGrid cols={{ base: 1, sm: attrGroups.length >= 3 ? 3 : attrGroups.length }}>
            {attrGroups.map((g: AttributeGroup, idx: number) => (
              <Select key={g.id} label={g.name}
                data={g.values.map((v: AttributeValue) => ({ value: String(v.id), label: v.value }))}
                value={getAttrValue(g.id)} onChange={(v) => setAttrValue(g.id, v)}
                clearable searchable placeholder={`เลือก${g.name}...`}
                leftSection={<IconTag size={14} color={ATTR_COLORS[idx % ATTR_COLORS.length]} />} />
            ))}
          </SimpleGrid>
        </>
      )}

      <Divider label="ราคา" labelPosition="center" />
      <Group grow>
        <NumberInput label="ราคาขาย" required min={0} decimalScale={2} value={form.sellingPrice}
          onChange={(v) => setForm({ ...form, sellingPrice: Number(v) })} />
        <NumberInput label="ราคาขายต่ำสุด" min={0} decimalScale={2} value={form.minSellingPrice}
          onChange={(v) => setForm({ ...form, minSellingPrice: Number(v) })}
          description="ราคาต่ำสุดที่ยอมขายได้" />
        <NumberInput label="ราคาทุน" min={0} decimalScale={2} value={form.costPrice}
          onChange={(v) => setForm({ ...form, costPrice: Number(v) })} />
      </Group>
      <NumberInput label="สต๊อกขั้นต่ำ (แจ้งเตือนเมื่อต่ำกว่า)" min={0} value={form.minStock}
        onChange={(v) => setForm({ ...form, minStock: Number(v) })} />
      <Button fullWidth loading={loading} onClick={onSubmit} color={color}>
        {submitLabel}
      </Button>
    </Stack>
  )
}
