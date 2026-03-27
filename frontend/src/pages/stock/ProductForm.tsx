import { useRef, useState } from 'react'
import {
  Stack, Group, TextInput, NumberInput, Button, Select, SimpleGrid, Divider,
  Image, Text, ActionIcon, Loader
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconTag, IconPhoto, IconTrash, IconUpload, IconX } from '@tabler/icons-react'
import { ATTR_COLORS } from '../../utils/constants'
import api from '../../services/api'
import type { ProductFormData, AttributeGroup, AttributeValue } from '../../types'

/** Images are served via Vite proxy (/uploads → localhost:3001/uploads) */
function getBackendBaseUrl(): string {
  return ''
}

interface ProductFormProps {
  form: ProductFormData
  setForm: (f: ProductFormData) => void
  attrGroups: AttributeGroup[]
  loading: boolean
  onSubmit: () => void
  submitLabel: string
  color?: string
  productId?: number | null
  imageUrl?: string | null
  onImageChange?: (url: string | null) => void
  /** ไฟล์ที่รอ upload (โหมดสร้างใหม่ — ยังไม่มี productId) */
  pendingFile?: File | null
  onPendingFileChange?: (file: File | null) => void
}

export default function ProductForm({
  form, setForm, attrGroups, loading, onSubmit, submitLabel, color,
  productId, imageUrl, onImageChange,
  pendingFile, onPendingFileChange,
}: ProductFormProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)

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

  const handleImageUpload = async (file: File) => {
    if (!productId) {
      // โหมดสร้างใหม่: เก็บไฟล์ไว้ก่อน — parent จะ upload หลังบันทึกสินค้า
      const previewUrl = URL.createObjectURL(file)
      setPendingPreview(previewUrl)
      onPendingFileChange?.(file)
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await api.post(`/products/${productId}/image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onImageChange?.(res.data.imageUrl)
      notifications.show({ title: 'สำเร็จ', message: 'อัพโหลดรูปภาพสำเร็จ', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'อัพโหลดรูปภาพไม่สำเร็จ', color: 'red' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleImageDelete = async () => {
    if (!productId) return
    setUploading(true)
    try {
      await api.delete(`/products/${productId}/image`)
      onImageChange?.(null)
      notifications.show({ title: 'สำเร็จ', message: 'ลบรูปภาพสำเร็จ', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ลบรูปภาพไม่สำเร็จ', color: 'red' })
    } finally {
      setUploading(false)
    }
  }

  const handleClearPending = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingPreview(null)
    onPendingFileChange?.(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ถ้าเป็นโหมดแก้ไข ใช้ URL จาก server; ถ้าสร้างใหม่ ใช้ preview จาก ObjectURL
  const fullImageUrl = imageUrl ? `${getBackendBaseUrl()}${imageUrl}` : null
  const displayImage = fullImageUrl || pendingPreview

  return (
    <Stack gap="md">
      <Group grow>
        <TextInput label="SKU" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <TextInput label="Barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
      </Group>
      <TextInput label="ชื่อสินค้า" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <TextInput label="รายละเอียด" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <TextInput label="หน่วยนับ" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />

      {/* Product Image — แสดงเสมอ ไม่ว่าจะโหมดสร้างหรือแก้ไข */}
      <>
        <Divider label="รูปภาพสินค้า" labelPosition="center" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {displayImage ? (
            <div style={{ position: 'relative' }}>
              <Image src={displayImage} alt="รูปสินค้า" w={180} h={180} radius="md" fit="cover"
                style={{ border: '1px solid #e0e0e0' }} />
              <ActionIcon size="sm" color="red" variant="filled" radius="xl"
                style={{ position: 'absolute', top: 4, right: 4 }}
                onClick={productId ? handleImageDelete : handleClearPending}
                loading={uploading}>
                {productId ? <IconTrash size={12} /> : <IconX size={12} />}
              </ActionIcon>
            </div>
          ) : (
            <div style={{
              width: 180, height: 180, borderRadius: 8, border: '2px dashed #ccc',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: '#aaa', background: '#fafafa',
            }}>
              <IconPhoto size={40} stroke={1.2} />
              <Text size="xs" c="dimmed" mt={4}>ยังไม่มีรูปภาพ</Text>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]) }} />
          <Button size="xs" variant="light" leftSection={uploading ? <Loader size={14} /> : <IconUpload size={14} />}
            onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'กำลังอัพโหลด...' : displayImage ? 'เปลี่ยนรูปภาพ' : 'เลือกรูปภาพ'}
          </Button>
          {!productId && pendingPreview && (
            <Text size="xs" c="dimmed">รูปจะถูกอัพโหลดอัตโนมัติหลังบันทึกสินค้า</Text>
          )}
        </div>
      </>

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
