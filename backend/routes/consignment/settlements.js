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
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { agreementId, status } = req.query
    let whereClause = 'WHERE cs.company_id = ?'
    const baseParams = [req.user.companyId]

    if (agreementId) { whereClause += ' AND cs.agreement_id = ?'; baseParams.push(agreementId) }
    if (status) { whereClause += ' AND cs.status = ?'; baseParams.push(status) }

    const fromClause = `FROM consignment_settlements cs
      JOIN consignment_agreements ca ON cs.agreement_id = ca.id
      JOIN contacts c ON ca.contact_id = c.id
      LEFT JOIN users u ON cs.created_by = u.id`

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM consignment_settlements cs ${whereClause}`, baseParams
      )
      const total = countResult.total

      const rows = await executeQuery(
        `SELECT cs.*, ca.agreement_number, c.name as contact_name,
          u.full_name as created_by_name
        ${fromClause} ${whereClause} ORDER BY cs.created_at DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const rows = await executeQuery(
        `SELECT cs.*, ca.agreement_number, c.name as contact_name,
          u.full_name as created_by_name
        ${fromClause} ${whereClause} ORDER BY cs.created_at DESC LIMIT 500`,
        baseParams
      )
      res.json(rows)
    }
  } catch (error) {
    console.error('Get settlements error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// Helper: calculate sales data for a period
async function calcSalesData(agreementId, periodFrom, periodTo) {
  const salesData = await executeQuery(`
    SELECT COALESCE(SUM(ct.quantity * ct.selling_price), 0) as total_sales,
           COALESCE(SUM(ct.commission_amount), 0) as total_commission,
           COALESCE(SUM(ct.quantity * ct.consignor_price), 0) as total_consignor_cost,
           COUNT(*) as sale_count
    FROM consignment_transactions ct
    WHERE ct.agreement_id = ? AND ct.type = 'SALE'
      AND ct.created_at >= ? AND ct.created_at <= DATE_ADD(?, INTERVAL 1 DAY)`,
    [agreementId, periodFrom, periodTo]
  )
  const totalSales = parseFloat(salesData[0].total_sales) || 0
  const totalCommission = parseFloat(salesData[0].total_commission) || 0
  return {
    totalSales,
    totalCommission,
    netPayable: totalSales - totalCommission,
    saleCount: parseInt(salesData[0].sale_count) || 0,
  }
}

// POST /api/consignment/settlements/preview — ดูตัวอย่างยอดก่อนสร้าง
router.post('/preview', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { agreementId, periodFrom, periodTo } = req.body
    if (!agreementId || !periodFrom || !periodTo) {
      return res.status(400).json({ message: 'กรุณาระบุสัญญาและช่วงเวลา' })
    }

    const data = await calcSalesData(agreementId, periodFrom, periodTo)

    // Also get line items for preview
    const items = await executeQuery(`
      SELECT ct.*, p.name as product_name, p.sku,
        s.invoice_number as sale_number, s.sold_at as sale_date
      FROM consignment_transactions ct
      JOIN products p ON ct.product_id = p.id
      LEFT JOIN sales s ON ct.sale_id = s.id
      WHERE ct.agreement_id = ? AND ct.type = 'SALE'
        AND ct.created_at >= ? AND ct.created_at <= DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY ct.created_at DESC`,
      [agreementId, periodFrom, periodTo]
    )

    res.json({ ...data, items })
  } catch (error) {
    console.error('Preview settlement error:', error)
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

    // Check for overlapping settlement period
    const overlaps = await executeQuery(
      `SELECT id, settlement_number, period_from, period_to
       FROM consignment_settlements
       WHERE agreement_id = ? AND company_id = ? AND status != 'cancelled'
         AND period_from <= ? AND period_to >= ?`,
      [agreementId, companyId, periodTo, periodFrom]
    )
    if (overlaps.length > 0) {
      const ov = overlaps[0]
      return res.status(400).json({
        message: `ช่วงเวลาซ้ำกับใบสรุป ${ov.settlement_number} (${ov.period_from.toISOString().slice(0,10)} — ${ov.period_to.toISOString().slice(0,10)})`,
      })
    }

    // Sum sales in period
    const { totalSales, totalCommission, netPayable, saleCount } = await calcSalesData(agreementId, periodFrom, periodTo)

    // Prevent creating settlement with no sales
    if (saleCount === 0) {
      return res.status(400).json({ message: 'ไม่มียอดขายสินค้าฝากขายในช่วงเวลานี้ กรุณาขายสินค้าผ่าน POS ก่อน' })
    }

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
      totalSales, totalCommission, netPayable, saleCount,
    })
  } catch (error) {
    console.error('Create settlement error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/consignment/settlements/:id — รายละเอียดใบสรุปพร้อมรายการขาย
router.get('/:id', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const rows = await executeQuery(
      `SELECT cs.*, ca.agreement_number, c.name as contact_name,
        ca.commission_type, ca.commission_rate, u.full_name as created_by_name
      FROM consignment_settlements cs
      JOIN consignment_agreements ca ON cs.agreement_id = ca.id
      JOIN contacts c ON ca.contact_id = c.id
      LEFT JOIN users u ON cs.created_by = u.id
      WHERE cs.id = ? AND cs.company_id = ?`,
      [req.params.id, companyId]
    )
    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบใบสรุป' })
    const settlement = rows[0]

    // Get line items (individual sales in this period)
    const items = await executeQuery(`
      SELECT ct.*, p.name as product_name, p.sku,
        s.invoice_number as sale_number, s.sold_at as sale_date
      FROM consignment_transactions ct
      JOIN products p ON ct.product_id = p.id
      LEFT JOIN sales s ON ct.sale_id = s.id
      WHERE ct.agreement_id = ? AND ct.type = 'SALE'
        AND ct.created_at >= ? AND ct.created_at <= DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY ct.created_at DESC`,
      [settlement.agreement_id, settlement.period_from, settlement.period_to]
    )

    res.json({ ...settlement, items })
  } catch (error) {
    console.error('Get settlement detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/consignment/settlements/:id/pay — จ่ายเงินให้ผู้ฝากขาย
router.post('/:id/pay', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
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

    // Prevent paying zero amount
    if (netPayable <= 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'ยอดจ่ายเป็น ฿0 ไม่สามารถบันทึกจ่ายเงินได้' })
    }

    // Create journal entry
    //   Dr. เจ้าหนี้ผู้ฝากขาย (2150) = net_payable
    //   Cr. เงินสด (1100) = net_payable
    const journalEntryId = await createJournalEntry(connection, {
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

// DELETE /api/consignment/settlements/:id — ลบใบสรุปที่ยังไม่จ่าย
router.delete('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const result = await executeQuery(
      "DELETE FROM consignment_settlements WHERE id = ? AND company_id = ? AND status = 'draft'",
      [req.params.id, req.user.companyId]
    )
    if (result.affectedRows === 0) return res.status(400).json({ message: 'ไม่สามารถลบได้ (อาจจ่ายแล้วหรือไม่พบ)' })
    res.json({ message: 'ลบใบสรุปสำเร็จ' })
  } catch (error) {
    console.error('Delete settlement error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
