const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { validate } = require('../../middleware/validate')
const { createContactSchema } = require('../../middleware/schemas')

router.use(auth, companyGuard)

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { type, search, active } = req.query
    let whereClause = 'WHERE company_id = ?'
    const baseParams = [req.user.companyId]

    if (type) { whereClause += ' AND (contact_type = ? OR contact_type = ?)'; baseParams.push(type, 'both') }
    // Default to active only; pass ?active=false to see inactive/deleted contacts
    const showActive = active === 'false' ? 0 : 1
    whereClause += ' AND is_active = ?'; baseParams.push(showActive)
    if (search) { whereClause += ' AND (name LIKE ? OR tax_id LIKE ? OR phone LIKE ?)'; baseParams.push(`%${search}%`, `%${search}%`, `%${search}%`) }

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM contacts ${whereClause}`, baseParams
      )
      const total = countResult.total

      const contacts = await executeQuery(
        `SELECT * FROM contacts ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: contacts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const contacts = await executeQuery(
        `SELECT * FROM contacts ${whereClause} ORDER BY name ASC LIMIT 500`,
        baseParams
      )
      res.json(contacts)
    }
  } catch (error) {
    console.error('Get contacts error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/contacts
router.post('/', roleCheck('owner', 'admin', 'manager'), validate(createContactSchema), async (req, res) => {
  try {
    const { name, code, contactType, taxId, phone, email, address, addressStreet, addressSubdistrict, addressDistrict, addressProvince, addressPostalCode, branch, bankAccount, bankName, paymentTerms, priceLevel, note } = req.body
    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่อผู้ติดต่อ' })

    const result = await executeQuery(
      `INSERT INTO contacts (company_id, code, name, contact_type, tax_id, phone, email, address, price_level, address_street, address_subdistrict, address_district, address_province, address_postal_code, branch, bank_account, bank_name, payment_terms, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, code || null, name, contactType || 'vendor', taxId || null, phone || null,
       email || null, address || null, priceLevel || 'retail', addressStreet || null, addressSubdistrict || null, addressDistrict || null, addressProvince || null, addressPostalCode || null,
       branch || null, bankAccount || null, bankName || null, paymentTerms || 0, note || null]
    )
    res.status(201).json({ message: 'เพิ่มผู้ติดต่อสำเร็จ', contactId: result.insertId })
  } catch (error) {
    console.error('Create contact error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/contacts/:id
router.put('/:id', roleCheck('owner', 'admin', 'manager'), validate(createContactSchema), async (req, res) => {
  try {
    const { name, code, contactType, taxId, phone, email, address, addressStreet, addressSubdistrict, addressDistrict, addressProvince, addressPostalCode, branch, bankAccount, bankName, paymentTerms, priceLevel, note, isActive } = req.body
    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่อผู้ติดต่อ' })

    await executeQuery(
      `UPDATE contacts SET code=?, name=?, contact_type=?, tax_id=?, phone=?, email=?, address=?, price_level=?, address_street=?, address_subdistrict=?, address_district=?, address_province=?, address_postal_code=?, branch=?, bank_account=?, bank_name=?, payment_terms=?, note=?, is_active=?
       WHERE id=? AND company_id=?`,
      [code || null, name, contactType || 'vendor', taxId || null, phone || null, email || null,
       address || null, priceLevel || 'retail', addressStreet || null, addressSubdistrict || null, addressDistrict || null, addressProvince || null, addressPostalCode || null,
       branch || null, bankAccount || null, bankName || null, paymentTerms || 0, note || null,
       isActive !== undefined ? isActive : true, req.params.id, req.user.companyId]
    )
    res.json({ message: 'แก้ไขผู้ติดต่อสำเร็จ' })
  } catch (error) {
    console.error('Update contact error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/contacts/:id
router.delete('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    await executeQuery('UPDATE contacts SET is_active = FALSE WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId])
    res.json({ message: 'ลบผู้ติดต่อสำเร็จ' })
  } catch (error) {
    console.error('Delete contact error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
