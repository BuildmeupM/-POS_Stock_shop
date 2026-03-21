const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')
const { createJournalEntry } = require('../../utils/journal')

router.use(auth, companyGuard)

// GET /api/consignment/settlements
router.get('/', async (req, res) => {
  try {
    const { agreementId, status } = req.query
    let query = `
      SELECT cs.*, ca.agreement_number, c.name as contact_name,
        u.full_name as created_by_name
      FROM consignment_settlements cs
      JOIN consignment_agreements ca ON cs.agreement_id = ca.id
      JOIN contacts c ON ca.contact_id = c.id
      LEFT JOIN users u ON cs.created_by = u.id
      WHERE cs.company_id = ?`
    const params = [req.user.companyId]

    if (agreementId) { query += ' AND cs.agreement_id = ?'; params.push(agreementId) }
    if (status) { query += ' AND cs.status = ?'; params.push(status) }
    query += ' ORDER BY cs.created_at DESC'

    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('Get settlements error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/consignment/settlements — สร้างใบสรุปยอดขาย
router.post('/', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { agreementId, periodFrom, periodTo, note } = req.body
    const companyId = req.user.companyId

    if (!agreementId || !periodFrom || !periodTo) {
      return res.status(400).json({ message: 'กรุณาระบุสัญญาและช่วงเวลา' })
    }

    // Get agreement info
    const agreements = await executeQuery(
      `SELECT ca.*, c.name as contact_name
       FROM consignment_agreements ca JOIN contacts c ON ca.contact_id = c.id
       WHERE ca.id = ? AND ca.company_id = ?`,
      [agreementId, companyId]
    )
    if (agreements.length === 0) return res.status(404).json({ message: 'ไม่พบสัญญา' })
    const agreement = agreements[0]

    // Sum sales in period
    const salesData = await executeQuery(`
      SELECT COALESCE(SUM(ct.quantity * ct.selling_price), 0) as total_sales,
             COALESCE(SUM(ct.commission_amount), 0) as total_commission,
             COALESCE(SUM(ct.quantity * ct.consignor_price), 0) as total_consignor_cost
      FROM consignment_transactions ct
      WHERE ct.agreement_id = ? AND ct.type = 'SALE'
        AND ct.created_at >= ? AND ct.created_at <= DATE_ADD(?, INTERVAL 1 DAY)`,
      [agreementId, periodFrom, periodTo]
    )

    const totalSales = parseFloat(salesData[0].total_sales) || 0
    const totalCommission = parseFloat(salesData[0].total_commission) || 0
    const netPayable = totalSales - totalCommission

    const settlementNumber = await generateDocNumber('CST', companyId, 'consignment_settlements', 'settlement_number')

    const result = await executeQuery(
      `INSERT INTO consignment_settlements (company_id, agreement_id, settlement_number,
        period_from, period_to, total_sales, total_commission, net_payable, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, agreementId, settlementNumber, periodFrom, periodTo,
        totalSales, totalCommission, netPayable, note || null, req.user.id]
    )

    res.status(201).json({
      message: 'สร้างใบสรุปสำเร็จ',
      settlementId: result.insertId,
      settlementNumber,
      totalSales, totalCommission, netPayable,
    })
  } catch (error) {
    console.error('Create settlement error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/consignment/settlements/:id/pay — จ่ายเงินให้ผู้ฝากขาย
router.post('/:id/pay', roleCheck('owner', 'admin'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId
    const settlementId = req.params.id
    const { paymentMethod, paymentChannelId } = req.body

    // Get settlement
    const [settlements] = await connection.execute(
      "SELECT * FROM consignment_settlements WHERE id = ? AND company_id = ? AND status IN ('draft', 'confirmed')",
      [settlementId, companyId]
    )
    if (settlements.length === 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'ไม่พบใบสรุปหรือจ่ายแล้ว' })
    }
    const settlement = settlements[0]
    const netPayable = parseFloat(settlement.net_payable) || 0
    const totalCommission = parseFloat(settlement.total_commission) || 0

    // Create journal entry
    //   Dr. เจ้าหนี้ผู้ฝากขาย (2150) = net_payable
    //   Cr. เงินสด (1100) = net_payable
    let journalEntryId = null
    if (netPayable > 0) {
      journalEntryId = await createJournalEntry(connection, {
        companyId,
        entryDate: new Date().toISOString().slice(0, 10),
        description: `จ่ายเงินฝากขาย ${settlement.settlement_number}`,
        referenceType: 'CONSIGNMENT_PAYMENT',
        referenceId: settlementId,
        createdBy: req.user.id,
        lines: [
          { accountCode: '2150', debit: netPayable, credit: 0, description: `ชำระเจ้าหนี้ฝากขาย ${settlement.settlement_number}` },
          { accountCode: '1100', debit: 0, credit: netPayable, description: `จ่ายเงินฝากขาย ${settlement.settlement_number}` },
        ],
      })
    }

    // Update settlement
    await connection.execute(
      `UPDATE consignment_settlements
       SET status = 'paid', paid_at = NOW(), payment_method = ?, payment_channel_id = ?, journal_entry_id = ?
       WHERE id = ?`,
      [paymentMethod || 'transfer', paymentChannelId || null, journalEntryId, settlementId]
    )

    await connection.commit()
    res.json({ message: 'บันทึกการจ่ายเงินสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Pay settlement error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

module.exports = router
