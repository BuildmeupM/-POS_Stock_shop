const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// GET /api/recurring-expenses — List all templates
router.get('/', async (req, res) => {
  try {
    const results = await executeQuery(
      `SELECT re.*, c.name as contact_name
       FROM recurring_expenses re
       LEFT JOIN contacts c ON re.contact_id = c.id
       WHERE re.company_id = ? AND re.is_active = TRUE
       ORDER BY re.created_at DESC`,
      [req.user.companyId]
    )
    res.json(results)
  } catch (error) {
    console.error('Get recurring expenses error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/recurring-expenses — Create template
router.post('/', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const {
      templateName, contactId, description, amount,
      vatAmount, whtAmount, frequency, dayOfMonth, accountCode
    } = req.body

    if (!templateName || !amount) {
      return res.status(400).json({ message: 'กรุณาระบุชื่อเทมเพลตและจำนวนเงิน' })
    }

    // Calculate next_due based on frequency
    const now = new Date()
    let nextDue = new Date(now)
    const day = dayOfMonth || 1

    switch (frequency || 'monthly') {
      case 'daily':
        nextDue.setDate(nextDue.getDate() + 1)
        break
      case 'weekly':
        nextDue.setDate(nextDue.getDate() + 7)
        break
      case 'monthly':
        nextDue.setMonth(nextDue.getMonth() + 1)
        nextDue.setDate(Math.min(day, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()))
        break
      case 'quarterly':
        nextDue.setMonth(nextDue.getMonth() + 3)
        nextDue.setDate(Math.min(day, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()))
        break
      case 'yearly':
        nextDue.setFullYear(nextDue.getFullYear() + 1)
        nextDue.setDate(Math.min(day, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()))
        break
    }

    const nextDueStr = nextDue.toISOString().split('T')[0]

    const result = await executeQuery(
      `INSERT INTO recurring_expenses
        (company_id, template_name, contact_id, description, amount, vat_amount, wht_amount,
         frequency, day_of_month, account_code, is_active, next_due, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)`,
      [
        req.user.companyId, templateName, contactId || null, description || null,
        amount, vatAmount || 0, whtAmount || 0,
        frequency || 'monthly', dayOfMonth || 1, accountCode || null,
        nextDueStr, req.user.id
      ]
    )

    res.status(201).json({ message: 'สร้างเทมเพลตรายจ่ายประจำสำเร็จ', id: result.insertId })
  } catch (error) {
    console.error('Create recurring expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/recurring-expenses/:id — Update template
router.put('/:id', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const {
      templateName, contactId, description, amount,
      vatAmount, whtAmount, frequency, dayOfMonth, accountCode
    } = req.body

    // Verify ownership
    const existing = await executeQuery(
      'SELECT id FROM recurring_expenses WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (existing.length === 0) {
      return res.status(404).json({ message: 'ไม่พบเทมเพลต' })
    }

    await executeQuery(
      `UPDATE recurring_expenses SET
        template_name = ?, contact_id = ?, description = ?, amount = ?,
        vat_amount = ?, wht_amount = ?, frequency = ?, day_of_month = ?, account_code = ?
       WHERE id = ? AND company_id = ?`,
      [
        templateName, contactId || null, description || null, amount,
        vatAmount || 0, whtAmount || 0, frequency || 'monthly', dayOfMonth || 1,
        accountCode || null, req.params.id, req.user.companyId
      ]
    )

    res.json({ message: 'อัพเดตเทมเพลตสำเร็จ' })
  } catch (error) {
    console.error('Update recurring expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/recurring-expenses/:id — Soft-delete
router.delete('/:id', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const existing = await executeQuery(
      'SELECT id FROM recurring_expenses WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (existing.length === 0) {
      return res.status(404).json({ message: 'ไม่พบเทมเพลต' })
    }

    await executeQuery(
      'UPDATE recurring_expenses SET is_active = FALSE WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )

    res.json({ message: 'ลบเทมเพลตสำเร็จ' })
  } catch (error) {
    console.error('Delete recurring expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/recurring-expenses/:id/generate — Generate expense from template
router.post('/:id/generate', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [templates] = await connection.execute(
      `SELECT re.*, c.name as contact_name
       FROM recurring_expenses re
       LEFT JOIN contacts c ON re.contact_id = c.id
       WHERE re.id = ? AND re.company_id = ? AND re.is_active = TRUE`,
      [req.params.id, req.user.companyId]
    )

    if (templates.length === 0) {
      await connection.rollback()
      connection.release()
      return res.status(404).json({ message: 'ไม่พบเทมเพลต' })
    }

    const template = templates[0]
    const companyId = req.user.companyId

    // Generate expense number
    const expenseNumber = await generateDocNumber('EXP', companyId, 'expenses', 'expense_number')

    // Create expense
    const [expResult] = await connection.execute(
      `INSERT INTO expenses
        (company_id, expense_number, expense_date, vendor_name, contact_id, description,
         amount, vat_amount, wht_amount, payment_method, status, created_by)
       VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, 'cash', 'approved', ?)`,
      [
        companyId, expenseNumber, template.contact_name || null, template.contact_id,
        template.description || template.template_name,
        template.amount, template.vat_amount, template.wht_amount, req.user.id
      ]
    )

    // Create expense item
    if (template.account_code) {
      // Find account by code
      const [accounts] = await connection.execute(
        'SELECT id FROM accounts WHERE company_id = ? AND account_code = ? LIMIT 1',
        [companyId, template.account_code]
      )
      const accountId = accounts.length > 0 ? accounts[0].id : null

      if (accountId) {
        await connection.execute(
          `INSERT INTO expense_items (expense_id, account_id, description, quantity, unit_price, amount)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [expResult.insertId, accountId, template.description || template.template_name, template.amount, template.amount]
        )
      }
    }

    // Update last_generated and next_due
    const now = new Date()
    let nextDue = new Date(now)
    const day = template.day_of_month || 1

    switch (template.frequency) {
      case 'daily':
        nextDue.setDate(nextDue.getDate() + 1)
        break
      case 'weekly':
        nextDue.setDate(nextDue.getDate() + 7)
        break
      case 'monthly':
        nextDue.setMonth(nextDue.getMonth() + 1)
        nextDue.setDate(Math.min(day, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()))
        break
      case 'quarterly':
        nextDue.setMonth(nextDue.getMonth() + 3)
        nextDue.setDate(Math.min(day, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()))
        break
      case 'yearly':
        nextDue.setFullYear(nextDue.getFullYear() + 1)
        nextDue.setDate(Math.min(day, new Date(nextDue.getFullYear(), nextDue.getMonth() + 1, 0).getDate()))
        break
    }

    await connection.execute(
      `UPDATE recurring_expenses SET last_generated = CURDATE(), next_due = ? WHERE id = ?`,
      [nextDue.toISOString().split('T')[0], template.id]
    )

    await connection.commit()
    connection.release()

    res.json({
      message: 'สร้างค่าใช้จ่ายจากเทมเพลตสำเร็จ',
      expenseId: expResult.insertId,
      expenseNumber
    })
  } catch (error) {
    await connection.rollback()
    connection.release()
    console.error('Generate expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
