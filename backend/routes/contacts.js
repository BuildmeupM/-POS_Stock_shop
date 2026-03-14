const express = require('express')
const router = express.Router()
const { executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const { type, search, active } = req.query
    let query = 'SELECT * FROM contacts WHERE company_id = ?'
    const params = [req.user.companyId]

    if (type) { query += ' AND (contact_type = ? OR contact_type = ?)'; params.push(type, 'both') }
    if (active !== undefined) { query += ' AND is_active = ?'; params.push(active === 'true' ? 1 : 0) }
    if (search) { query += ' AND (name LIKE ? OR tax_id LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`) }

    query += ' ORDER BY name ASC'
    const contacts = await executeQuery(query, params)
    res.json(contacts)
  } catch (error) {
    console.error('Get contacts error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/contacts
router.post('/', async (req, res) => {
  try {
    const { name, contactType, taxId, phone, email, address, addressStreet, addressSubdistrict, addressDistrict, addressProvince, addressPostalCode, branch, bankAccount, bankName, note } = req.body
    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่อผู้ติดต่อ' })

    const result = await executeQuery(
      `INSERT INTO contacts (company_id, name, contact_type, tax_id, phone, email, address, address_street, address_subdistrict, address_district, address_province, address_postal_code, branch, bank_account, bank_name, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, name, contactType || 'vendor', taxId || null, phone || null,
       email || null, address || null, addressStreet || null, addressSubdistrict || null, addressDistrict || null, addressProvince || null, addressPostalCode || null,
       branch || null, bankAccount || null, bankName || null, note || null]
    )
    res.status(201).json({ message: 'เพิ่มผู้ติดต่อสำเร็จ', contactId: result.insertId })
  } catch (error) {
    console.error('Create contact error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/contacts/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, contactType, taxId, phone, email, address, addressStreet, addressSubdistrict, addressDistrict, addressProvince, addressPostalCode, branch, bankAccount, bankName, note, isActive } = req.body
    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่อผู้ติดต่อ' })

    await executeQuery(
      `UPDATE contacts SET name=?, contact_type=?, tax_id=?, phone=?, email=?, address=?, address_street=?, address_subdistrict=?, address_district=?, address_province=?, address_postal_code=?, branch=?, bank_account=?, bank_name=?, note=?, is_active=?
       WHERE id=? AND company_id=?`,
      [name, contactType || 'vendor', taxId || null, phone || null, email || null,
       address || null, addressStreet || null, addressSubdistrict || null, addressDistrict || null, addressProvince || null, addressPostalCode || null,
       branch || null, bankAccount || null, bankName || null, note || null,
       isActive !== undefined ? isActive : true, req.params.id, req.user.companyId]
    )
    res.json({ message: 'แก้ไขผู้ติดต่อสำเร็จ' })
  } catch (error) {
    console.error('Update contact error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
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
