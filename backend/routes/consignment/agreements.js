const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// GET /api/consignment/agreements
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { status } = req.query
    let whereClause = 'WHERE ca.company_id = ?'
    const baseParams = [req.user.companyId]

    if (status) { whereClause += ' AND ca.status = ?'; baseParams.push(status) }

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM consignment_agreements ca ${whereClause}`, baseParams
      )
      const total = countResult.total

      const rows = await executeQuery(
        `SELECT ca.*, c.name as contact_name, c.phone as contact_phone,
          u.full_name as created_by_name,
          (SELECT COUNT(*) FROM consignment_stock cs WHERE cs.agreement_id = ca.id AND cs.quantity_on_hand > 0) as active_products,
          (SELECT COALESCE(SUM(cs2.quantity_on_hand), 0) FROM consignment_stock cs2 WHERE cs2.agreement_id = ca.id) as total_on_hand
        FROM consignment_agreements ca
        LEFT JOIN contacts c ON ca.contact_id = c.id
        LEFT JOIN users u ON ca.created_by = u.id
        ${whereClause} ORDER BY ca.created_at DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const rows = await executeQuery(
        `SELECT ca.*, c.name as contact_name, c.phone as contact_phone,
          u.full_name as created_by_name,
          (SELECT COUNT(*) FROM consignment_stock cs WHERE cs.agreement_id = ca.id AND cs.quantity_on_hand > 0) as active_products,
          (SELECT COALESCE(SUM(cs2.quantity_on_hand), 0) FROM consignment_stock cs2 WHERE cs2.agreement_id = ca.id) as total_on_hand
        FROM consignment_agreements ca
        LEFT JOIN contacts c ON ca.contact_id = c.id
        LEFT JOIN users u ON ca.created_by = u.id
        ${whereClause} ORDER BY ca.created_at DESC LIMIT 500`,
        baseParams
      )
      res.json(rows)
    }
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

// POST /api/consignment/agreements/:id/renew — ฝากต่อ (Renew/Extend)
router.post('/:id/renew', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId
    const { newStartDate, newEndDate, commissionType, commissionRate, paymentTerms, note } = req.body

    // Get original agreement
    const [origRows] = await connection.execute(
      `SELECT * FROM consignment_agreements WHERE id = ? AND company_id = ? AND status IN ('active', 'expired')`,
      [req.params.id, companyId]
    )
    if (origRows.length === 0) return res.status(400).json({ message: 'ไม่พบสัญญาที่จะฝากต่อ' })
    const orig = origRows[0]

    // Get remaining stock items from original agreement
    const [stockItems] = await connection.execute(
      `SELECT * FROM consignment_stock WHERE agreement_id = ? AND quantity_on_hand > 0`,
      [req.params.id]
    )

    if (stockItems.length === 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'ไม่มีสินค้าคงเหลือที่จะฝากต่อ' })
    }

    // Generate new agreement number
    const renewalNumber = await generateDocNumber('CSA', companyId, 'consignment_agreements', 'agreement_number')

    // Create new agreement
    const startDate = newStartDate || new Date().toISOString().split('T')[0]
    const [newAgResult] = await connection.execute(
      `INSERT INTO consignment_agreements (company_id, contact_id, agreement_number, start_date, end_date,
        commission_type, commission_rate, payment_terms, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, orig.contact_id, renewalNumber, startDate, newEndDate || null,
        commissionType || orig.commission_type, commissionRate ?? orig.commission_rate,
        paymentTerms ?? orig.payment_terms,
        note || `ฝากต่อจากสัญญา ${orig.agreement_number}`, req.user.id]
    )
    const newAgreementId = newAgResult.insertId

    // Transfer remaining stock items to new agreement
    for (const item of stockItems) {
      // Create new stock entry under new agreement
      await connection.execute(
        `INSERT INTO consignment_stock (agreement_id, product_id, quantity_received, quantity_sold, quantity_returned,
          quantity_on_hand, consignor_price, selling_price)
        VALUES (?, ?, ?, 0, 0, ?, ?, ?)`,
        [newAgreementId, item.product_id, item.quantity_on_hand, item.quantity_on_hand,
          item.consignor_price, item.selling_price]
      )

      // Zero out the old stock entry
      await connection.execute(
        `UPDATE consignment_stock SET quantity_on_hand = 0 WHERE id = ?`,
        [item.id]
      )

      // Record transaction: transfer out from old
      await connection.execute(
        `INSERT INTO consignment_transactions (agreement_id, product_id, type, quantity, consignor_price, selling_price, note, created_by)
        VALUES (?, ?, 'RETURN', ?, ?, ?, ?, ?)`,
        [req.params.id, item.product_id, item.quantity_on_hand,
          item.consignor_price, item.selling_price, `โอนไปสัญญาใหม่ ${renewalNumber}`, req.user.id]
      )

      // Record transaction: transfer in to new
      await connection.execute(
        `INSERT INTO consignment_transactions (agreement_id, product_id, type, quantity, consignor_price, selling_price, note, created_by)
        VALUES (?, ?, 'RECEIVE', ?, ?, ?, ?, ?)`,
        [newAgreementId, item.product_id, item.quantity_on_hand,
          item.consignor_price, item.selling_price, `โอนจากสัญญาเดิม ${orig.agreement_number}`, req.user.id]
      )
    }

    // Mark original agreement as renewed
    await connection.execute(
      `UPDATE consignment_agreements SET status = 'expired', note = CONCAT(COALESCE(note, ''), '\nฝากต่อเป็นสัญญา ${renewalNumber}') WHERE id = ?`,
      [req.params.id]
    )

    await connection.commit()

    // Fetch the created agreement with contact info for response
    const newAg = await executeQuery(
      `SELECT ca.*, c.name as contact_name FROM consignment_agreements ca LEFT JOIN contacts c ON ca.contact_id = c.id WHERE ca.id = ?`,
      [newAgreementId]
    )

    res.status(201).json({
      message: 'ฝากต่อสำเร็จ',
      agreement: newAg[0] || { id: newAgreementId, agreement_number: renewalNumber },
      originalAgreement: orig.agreement_number,
      itemsTransferred: stockItems.length,
    })
  } catch (error) {
    await connection.rollback()
    console.error('Renew agreement error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

module.exports = router

