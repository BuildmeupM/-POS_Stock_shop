const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/reconciliation — List all reconciliations
router.get('/', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const rows = await executeQuery(`
      SELECT br.*, pc.name as channel_name, pc.type as channel_type,
        u.full_name as reconciled_by_name
      FROM bank_reconciliations br
      JOIN payment_channels pc ON br.channel_id = pc.id
      LEFT JOIN users u ON br.reconciled_by = u.id
      WHERE br.company_id = ?
      ORDER BY br.created_at DESC
    `, [companyId])
    res.json(rows)
  } catch (error) {
    console.error('Get reconciliations error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/reconciliation — Create reconciliation
router.post('/', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { channelId, periodFrom, periodTo, statementBalance, note } = req.body

    if (!channelId || !periodFrom || !periodTo || statementBalance === undefined) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' })
    }

    // Calculate system balance from sales payments linked to this channel.
    // Payments live in the `payments` table (per-sale) with payment_channel_id.
    const [salesBalance] = await executeQuery(`
      SELECT COALESCE(SUM(p.amount), 0) as total
      FROM payments p
      JOIN sales s ON p.sale_id = s.id
      WHERE s.company_id = ? AND p.payment_channel_id = ?
        AND s.sold_at >= ? AND s.sold_at <= ?
        AND s.status = 'completed'
    `, [companyId, channelId, periodFrom, periodTo])

    // Also check purchase payments going out via this channel.
    // purchase_payments carries company_id + payment_channel_id + payment_date directly.
    const [purchaseBalance] = await executeQuery(`
      SELECT COALESCE(SUM(pp.amount), 0) as total
      FROM purchase_payments pp
      WHERE pp.company_id = ? AND pp.payment_channel_id = ?
        AND pp.payment_date >= ? AND pp.payment_date <= ?
    `, [companyId, channelId, periodFrom, periodTo])

    const systemBalance = (parseFloat(salesBalance.total) || 0) - (parseFloat(purchaseBalance.total) || 0)
    const stmtBal = parseFloat(statementBalance)
    const difference = stmtBal - systemBalance

    const result = await executeQuery(`
      INSERT INTO bank_reconciliations
        (company_id, channel_id, period_from, period_to, statement_balance, system_balance, difference, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [companyId, channelId, periodFrom, periodTo, stmtBal, systemBalance, difference, note || null])

    res.status(201).json({
      message: 'สร้างรายการกระทบยอดสำเร็จ',
      id: result.insertId,
      systemBalance,
      difference,
    })
  } catch (error) {
    console.error('Create reconciliation error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/reconciliation/:id/reconcile — Mark as reconciled
router.put('/:id/reconcile', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { id } = req.params

    // Verify ownership
    const [existing] = await executeQuery(
      'SELECT id, status FROM bank_reconciliations WHERE id = ? AND company_id = ?',
      [id, companyId]
    )
    if (!existing) {
      return res.status(404).json({ message: 'ไม่พบรายการกระทบยอด' })
    }
    if (existing.status === 'reconciled') {
      return res.status(400).json({ message: 'รายการนี้กระทบยอดแล้ว' })
    }

    await executeQuery(`
      UPDATE bank_reconciliations
      SET status = 'reconciled', reconciled_by = ?, reconciled_at = NOW()
      WHERE id = ? AND company_id = ?
    `, [req.user.id, id, companyId])

    res.json({ message: 'กระทบยอดสำเร็จ' })
  } catch (error) {
    console.error('Reconcile error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
