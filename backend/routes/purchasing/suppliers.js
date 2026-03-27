const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// GET /api/suppliers — list suppliers
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { search, active } = req.query
    let whereClause = 'WHERE company_id = ?'
    const baseParams = [req.user.companyId]

    if (search) {
      whereClause += ' AND (name LIKE ? OR code LIKE ? OR contact_name LIKE ? OR phone LIKE ?)'
      baseParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (active !== undefined) {
      whereClause += ' AND is_active = ?'
      baseParams.push(active === 'true')
    }

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM suppliers ${whereClause}`, baseParams
      )
      const total = countResult.total

      const suppliers = await executeQuery(
        `SELECT * FROM suppliers ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: suppliers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const suppliers = await executeQuery(
        `SELECT * FROM suppliers ${whereClause} ORDER BY name ASC LIMIT 500`,
        baseParams
      )
      res.json(suppliers)
    }
  } catch (error) {
    console.error('Get suppliers error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  try {
    const rows = await executeQuery(
      'SELECT * FROM suppliers WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบข้อมูล Supplier' })
    res.json(rows[0])
  } catch (error) {
    console.error('Get supplier error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/suppliers
router.post('/', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, contactName, phone, email, taxId, address, paymentTerms, bankAccount, bankName, note } = req.body
    if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อ Supplier' })

    const code = await generateDocNumber('SUP', req.user.companyId, 'suppliers', 'code')

    const result = await executeQuery(
      `INSERT INTO suppliers (company_id, code, name, contact_name, phone, email, tax_id, address, payment_terms, bank_account, bank_name, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, code, name, contactName || null, phone || null, email || null,
       taxId || null, address || null, paymentTerms || 0, bankAccount || null, bankName || null, note || null]
    )

    res.status(201).json({ message: 'เพิ่ม Supplier สำเร็จ', supplierId: result.insertId, code })
  } catch (error) {
    console.error('Create supplier error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/suppliers/:id
router.put('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, contactName, phone, email, taxId, address, paymentTerms, bankAccount, bankName, note, isActive } = req.body

    await executeQuery(
      `UPDATE suppliers SET name = ?, contact_name = ?, phone = ?, email = ?, tax_id = ?,
       address = ?, payment_terms = ?, bank_account = ?, bank_name = ?, note = ?, is_active = ?
       WHERE id = ? AND company_id = ?`,
      [name, contactName || null, phone || null, email || null, taxId || null,
       address || null, paymentTerms || 0, bankAccount || null, bankName || null, note || null,
       isActive !== undefined ? isActive : true, req.params.id, req.user.companyId]
    )

    res.json({ message: 'อัพเดต Supplier สำเร็จ' })
  } catch (error) {
    console.error('Update supplier error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/suppliers/:id (soft delete)
router.delete('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    await executeQuery(
      'UPDATE suppliers SET is_active = FALSE WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    res.json({ message: 'ลบ Supplier สำเร็จ' })
  } catch (error) {
    console.error('Delete supplier error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
