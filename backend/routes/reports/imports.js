const express = require('express')
const router = express.Router()
const XLSX = require('xlsx')
const multer = require('multer')
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { writeAuditLog } = require('../../middleware/auditLog')

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    if (allowedMimes.includes(file.mimetype) ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true)
    } else {
      cb(new Error('กรุณาอัปโหลดไฟล์ Excel (.xlsx หรือ .xls) เท่านั้น'))
    }
  },
})

router.use(auth, companyGuard)

// Column name mapping (support both with and without asterisk markers)
const COLUMN_MAP = {
  'sku*': 'sku', 'sku': 'sku',
  'barcode': 'barcode',
  'ชื่อสินค้า*': 'name', 'ชื่อสินค้า': 'name',
  'หน่วย*': 'unit', 'หน่วย': 'unit',
  'ราคาทุน*': 'costPrice', 'ราคาทุน': 'costPrice',
  'ราคาขาย*': 'sellingPrice', 'ราคาขาย': 'sellingPrice',
  'ราคาขายขั้นต่ำ': 'minSellingPrice',
  'สต๊อกขั้นต่ำ': 'minStock',
}

function normalizeRow(rawRow) {
  const row = {}
  for (const [key, value] of Object.entries(rawRow)) {
    const normalizedKey = key.trim().toLowerCase()
    for (const [colKey, fieldName] of Object.entries(COLUMN_MAP)) {
      if (normalizedKey === colKey.toLowerCase()) {
        row[fieldName] = value
        break
      }
    }
  }
  return row
}

// ====================================================================
// IMPORT: Products from Excel
// POST /api/imports/products
// ====================================================================
router.post('/products', roleCheck('owner', 'admin', 'manager'), uploadMemory.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาอัปโหลดไฟล์ Excel' })
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) {
      return res.status(400).json({ message: 'ไฟล์ Excel ว่างเปล่า' })
    }

    const rawData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName])
    if (rawData.length === 0) {
      return res.status(400).json({ message: 'ไม่พบข้อมูลในไฟล์ กรุณาตรวจสอบแบบฟอร์ม' })
    }

    const errors = []
    let imported = 0
    let updated = 0
    let skipped = 0

    for (let i = 0; i < rawData.length; i++) {
      const rowNum = i + 2 // Excel row (header is row 1)
      const row = normalizeRow(rawData[i])

      // Validate required fields
      const rowErrors = []
      if (!row.sku || String(row.sku).trim() === '') rowErrors.push('ไม่มี SKU')
      if (!row.name || String(row.name).trim() === '') rowErrors.push('ไม่มีชื่อสินค้า')
      if (!row.unit || String(row.unit).trim() === '') rowErrors.push('ไม่มีหน่วย')

      const costPrice = parseFloat(row.costPrice)
      const sellingPrice = parseFloat(row.sellingPrice)

      if (isNaN(costPrice) || costPrice < 0) rowErrors.push('ราคาทุนไม่ถูกต้อง')
      if (isNaN(sellingPrice) || sellingPrice <= 0) rowErrors.push('ราคาขายไม่ถูกต้อง')

      if (rowErrors.length > 0) {
        errors.push(`แถว ${rowNum}: ${rowErrors.join(', ')}`)
        skipped++
        continue
      }

      const sku = String(row.sku).trim()
      const name = String(row.name).trim()
      const unit = String(row.unit).trim()
      const barcode = row.barcode ? String(row.barcode).trim() : null
      const minSellingPrice = parseFloat(row.minSellingPrice) || 0
      const minStock = parseInt(row.minStock) || 0

      try {
        // Check if product with this SKU already exists for this company
        const existing = await executeQuery(
          'SELECT id FROM products WHERE sku = ? AND company_id = ?',
          [sku, req.user.companyId]
        )

        if (existing.length > 0) {
          // Update existing product
          await executeQuery(
            `UPDATE products SET barcode = COALESCE(?, barcode), name = ?, unit = ?,
             cost_price = ?, selling_price = ?, min_selling_price = ?, min_stock = ?,
             is_active = TRUE
             WHERE id = ? AND company_id = ?`,
            [barcode, name, unit, costPrice, sellingPrice, minSellingPrice, minStock,
             existing[0].id, req.user.companyId]
          )
          updated++
        } else {
          // Insert new product
          await executeQuery(
            `INSERT INTO products (company_id, sku, barcode, name, unit, cost_price, selling_price, min_selling_price, min_stock)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.companyId, sku, barcode, name, unit, costPrice, sellingPrice, minSellingPrice, minStock]
          )
          imported++
        }
      } catch (dbError) {
        errors.push(`แถว ${rowNum} (SKU: ${sku}): ${dbError.message}`)
        skipped++
      }
    }

    await writeAuditLog({
      companyId: req.user.companyId,
      userId: req.user.id,
      userName: req.user.fullName,
      action: 'IMPORT',
      entityType: 'product',
      entityId: null,
      description: `นำเข้าสินค้าจาก Excel: เพิ่มใหม่ ${imported}, อัพเดต ${updated}, ข้าม ${skipped}`,
      newValues: { imported, updated, skipped, totalRows: rawData.length },
      req,
    })

    res.json({
      message: 'นำเข้าสินค้าสำเร็จ',
      imported,
      updated,
      skipped,
      total: rawData.length,
      errors,
    })
  } catch (error) {
    console.error('Import products error:', error)
    if (error.message && error.message.includes('กรุณาอัปโหลด')) {
      return res.status(400).json({ message: error.message })
    }
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการนำเข้าสินค้า' })
  }
})

module.exports = router
