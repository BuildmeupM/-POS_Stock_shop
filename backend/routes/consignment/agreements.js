const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// GET /api/consignment/agreements
router.get('/', async (req, res) => {
  try {
    const { status } = req.query
    let query = `
      SELECT ca.*, c.name as contact_name, c.phone as contact_phone,
        u.full_name as created_by_name,
        (SELECT COUNT(*) FROM consignment_stock cs WHERE cs.agreement_id = ca.id AND cs.quantity_on_hand > 0) as active_products,
        (SELECT COALESCE(SUM(cs2.quantity_on_hand), 0) FROM consignment_stock cs2 WHERE cs2.agreement_id = ca.id) as total_on_hand
      FROM consignment_agreements ca
      LEFT JOIN contacts c ON ca.contact_id = c.id
      LEFT JOIN users u ON ca.created_by = u.id
      WHERE ca.company_id = ?`
    const params = [req.user.companyId]

    if (status) { query += ' AND ca.status = ?'; params.push(status) }
    query += ' ORDER BY ca.created_at DESC'

    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('Get agreements error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/consignment/agreements/:id
router.get('/:id', async (req, res) => {
  try {
    const rows = await executeQuery(
      `SELECT ca.*, c.name as contact_name, c.phone as contact_phone,
        c.email as contact_email, c.address as contact_address
      FROM consignment_agreements ca
      LEFT JOIN contacts c ON ca.contact_id = c.id
      WHERE ca.id = ? AND ca.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบสัญญา' })

    const stock = await executeQuery(
      `SELECT cs.*, p.name as product_name, p.sku
      FROM consignment_stock cs
      JOIN products p ON cs.product_id = p.id
      WHERE cs.agreement_id = ?
      ORDER BY cs.received_at DESC`,
      [req.params.id]
    )

    res.json({ ...rows[0], stock })
  } catch (error) {
    console.error('Get agreement detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/consignment/agreements
router.post('/', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { contactId, startDate, endDate, commissionType, commissionRate, paymentTerms, note } = req.body

    if (!contactId || !startDate) {
      return res.status(400).json({ message: 'กรุณาเลือกผู้ฝากขายและวันที่เริ่มต้น' })
    }

    const agreementNumber = await generateDocNumber('CSA', req.user.companyId, 'consignment_agreements', 'agreement_number')

    const result = await executeQuery(
      `INSERT INTO consignment_agreements (company_id, contact_id, agreement_number, start_date, end_date,
        commission_type, commission_rate, payment_terms, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, contactId, agreementNumber, startDate, endDate || null,
        commissionType || 'percent', commissionRate || 0, paymentTerms || 30,
        note || null, req.user.id]
    )

    res.status(201).json({ message: 'สร้างสัญญาฝากขายสำเร็จ', agreementId: result.insertId, agreementNumber })
  } catch (error) {
    console.error('Create agreement error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/consignment/agreements/:id
router.put('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { contactId, startDate, endDate, commissionType, commissionRate, paymentTerms, status, note } = req.body

    const setCols = []
    const params = []
    if (contactId) { setCols.push('contact_id = ?'); params.push(contactId) }
    if (startDate) { setCols.push('start_date = ?'); params.push(startDate) }
    if (endDate !== undefined) { setCols.push('end_date = ?'); params.push(endDate || null) }
    if (commissionType) { setCols.push('commission_type = ?'); params.push(commissionType) }
    if (commissionRate !== undefined) { setCols.push('commission_rate = ?'); params.push(commissionRate) }
    if (paymentTerms !== undefined) { setCols.push('payment_terms = ?'); params.push(paymentTerms) }
    if (status) { setCols.push('status = ?'); params.push(status) }
    if (note !== undefined) { setCols.push('note = ?'); params.push(note || null) }

    if (setCols.length === 0) return res.status(400).json({ message: 'ไม่มีข้อมูลที่ต้องแก้ไข' })

    params.push(req.params.id, req.user.companyId)
    await executeQuery(`UPDATE consignment_agreements SET ${setCols.join(', ')} WHERE id = ? AND company_id = ?`, params)

    res.json({ message: 'แก้ไขสัญญาสำเร็จ' })
  } catch (error) {
    console.error('Update agreement error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
