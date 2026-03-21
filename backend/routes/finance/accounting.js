const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// === CHART OF ACCOUNTS ===

// GET /api/accounting/accounts
router.get('/accounts', async (req, res) => {
  try {
    const accounts = await executeQuery(
      `SELECT a.*, p.name as parent_name, p.account_code as parent_code
       FROM accounts a
       LEFT JOIN accounts p ON a.parent_id = p.id
       WHERE a.company_id = ?
       ORDER BY a.account_code`,
      [req.user.companyId]
    )
    res.json(accounts)
  } catch (error) {
    console.error('Get accounts error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/accounting/accounts
router.post('/accounts', async (req, res) => {
  try {
    const { accountCode, name, accountType, parentId, description } = req.body
    const result = await executeQuery(
      `INSERT INTO accounts (company_id, account_code, name, account_type, parent_id, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, accountCode, name, accountType, parentId || null, description || null]
    )
    res.status(201).json({ message: 'เพิ่มบัญชีสำเร็จ', accountId: result.insertId })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'รหัสบัญชีนี้มีในระบบแล้ว' })
    }
    console.error('Create account error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// === EXPENSES ===

// GET /api/accounting/expenses
router.get('/expenses', async (req, res) => {
  try {
    const { from, to, status, accountId } = req.query
    let query = `
      SELECT e.*, a.account_code, a.name as account_name, u.full_name as created_by_name
      FROM expenses e
      LEFT JOIN accounts a ON e.account_id = a.id
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.company_id = ?`
    const params = [req.user.companyId]

    if (from) { query += ' AND e.expense_date >= ?'; params.push(from) }
    if (to) { query += ' AND e.expense_date <= ?'; params.push(to) }
    if (status) { query += ' AND e.status = ?'; params.push(status) }
    if (accountId) { query += ' AND e.account_id = ?'; params.push(accountId) }

    query += ' ORDER BY e.expense_date DESC, e.id DESC LIMIT 200'
    const expenses = await executeQuery(query, params)

    // Fetch items for all expenses
    if (expenses.length > 0) {
      const expenseIds = expenses.map(e => e.id)
      const items = await executeQuery(
        `SELECT ei.*, a.account_code, a.name as account_name
         FROM expense_items ei
         JOIN accounts a ON ei.account_id = a.id
         WHERE ei.expense_id IN (${expenseIds.map(() => '?').join(',')})`,
        expenseIds
      )
      const itemsByExpense = {}
      items.forEach(item => {
        if (!itemsByExpense[item.expense_id]) itemsByExpense[item.expense_id] = []
        itemsByExpense[item.expense_id].push(item)
      })
      expenses.forEach(e => { e.items = itemsByExpense[e.id] || [] })
    }

    res.json(expenses)
  } catch (error) {
    console.error('Get expenses error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/accounting/expenses — supports multi-line items
router.post('/expenses', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const {
      vendorName, taxId, contactId, expenseDate, dueDate, paymentMethod, paymentChannelId, paymentStatus,
      referenceNumber, taxInvoiceNumber, taxInvoiceDate, taxPeriod,
      note, status: docStatus, items
    } = req.body

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'ต้องมีอย่างน้อย 1 รายการ' })
    }

    const companyId = req.user.companyId
    const finalStatus = docStatus || 'approved'

    // Calculate item amounts
    let totalAmount = 0, totalVat = 0, totalWht = 0
    const processedItems = items.map(item => {
      const qty = parseFloat(item.quantity) || 1
      const unitPrice = parseFloat(item.unitPrice) || 0
      let amount = qty * unitPrice
      let vatAmount = 0
      let whtAmount = 0

      // VAT calculation
      if (item.vatType === 'exclude') {
        vatAmount = amount * ((parseFloat(item.vatRate) || 7) / 100)
      } else if (item.vatType === 'include') {
        const rate = (parseFloat(item.vatRate) || 7) / 100
        vatAmount = amount - (amount / (1 + rate))
        amount = amount - vatAmount
      }

      // WHT calculation (based on amount before VAT)
      const whtRate = parseFloat(item.whtRate) || 0
      if (whtRate > 0) {
        whtAmount = amount * (whtRate / 100)
      }

      totalAmount += amount
      totalVat += vatAmount
      totalWht += whtAmount

      return { ...item, quantity: qty, unitPrice, amount, vatAmount, whtAmount }
    })

    const expenseNumber = await generateDocNumber('EXP', companyId, 'expenses', 'expense_number')

    let journalEntryId = null

    // Create journal entry only for approved expenses
    if (finalStatus === 'approved') {
      const entryNumber = await generateDocNumber('JV', companyId, 'journal_entries', 'entry_number')
      const [journalResult] = await connection.execute(
        `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, reference_type, status, created_by)
         VALUES (?, ?, ?, ?, 'EXPENSE', 'posted', ?)`,
        [companyId, entryNumber, expenseDate, `ค่าใช้จ่าย ${expenseNumber}`, req.user.id]
      )
      journalEntryId = journalResult.insertId

      // Debit: Each expense account
      for (const item of processedItems) {
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, ?, 0, ?)`,
          [journalEntryId, item.accountId, item.amount + item.vatAmount, item.description || null]
        )
      }

      // Credit: Cash/Bank (account 1100)
      const netPayment = totalAmount + totalVat - totalWht
      const [cashAccounts] = await connection.execute(
        "SELECT id FROM accounts WHERE company_id = ? AND account_code = '1100'",
        [companyId]
      )
      if (cashAccounts.length > 0) {
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, 0, ?, ?)`,
          [journalEntryId, cashAccounts[0].id, netPayment, `ค่าใช้จ่าย ${expenseNumber}`]
        )
      }

      // Credit: WHT payable if any (account 2130 or fallback)
      if (totalWht > 0) {
        const [whtAccounts] = await connection.execute(
          "SELECT id FROM accounts WHERE company_id = ? AND account_code = '2130'",
          [companyId]
        )
        if (whtAccounts.length > 0) {
          await connection.execute(
            `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
             VALUES (?, ?, 0, ?, ?)`,
            [journalEntryId, whtAccounts[0].id, totalWht, `หัก ณ ที่จ่าย ${expenseNumber}`]
          )
        }
      }
    }

    // Create expense header
    const firstAccountId = processedItems[0].accountId
    const [expenseResult] = await connection.execute(
      `INSERT INTO expenses (company_id, expense_number, account_id, amount, description, reference_number,
       expense_date, due_date, payment_method, payment_channel_id, payment_status, vendor_name, contact_id, tax_id,
       tax_invoice_number, tax_invoice_date, tax_period,
       vat_amount, wht_amount, wht_type, status, note, created_by, journal_entry_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId, expenseNumber, firstAccountId,
        totalAmount + totalVat, // gross amount
        items.length === 1 ? processedItems[0].description : `ค่าใช้จ่าย ${items.length} รายการ`,
        referenceNumber || null,
        expenseDate, dueDate || null,
        paymentMethod || 'cash', paymentChannelId || null, paymentStatus || 'paid',
        vendorName || null, contactId || null, taxId || null,
        taxInvoiceNumber || null, taxInvoiceDate || null, taxPeriod || null,
        totalVat, totalWht, null,
        finalStatus, note || null,
        req.user.id, journalEntryId
      ]
    )
    const expenseId = expenseResult.insertId

    // Insert expense items
    for (const item of processedItems) {
      await connection.execute(
        `INSERT INTO expense_items (expense_id, account_id, description, quantity, unit_price, amount,
         vat_type, vat_rate, vat_amount, wht_rate, wht_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expenseId, item.accountId, item.description || null,
          item.quantity, item.unitPrice, item.amount,
          item.vatType || 'none', parseFloat(item.vatRate) || 7,
          item.vatAmount, parseFloat(item.whtRate) || 0, item.whtAmount
        ]
      )
    }

    await connection.commit()
    res.status(201).json({
      message: finalStatus === 'draft' ? 'บันทึกร่างสำเร็จ' : 'บันทึกค่าใช้จ่ายสำเร็จ',
      expenseId, expenseNumber
    })
  } catch (error) {
    await connection.rollback()
    console.error('Create expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// PATCH /api/accounting/expenses/:id/approve
router.patch('/expenses/:id/approve', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId
    const expenseId = req.params.id

    // Get expense
    const [expenses] = await connection.execute(
      'SELECT * FROM expenses WHERE id = ? AND company_id = ? AND status = ?',
      [expenseId, companyId, 'draft']
    )
    if (expenses.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรายการร่าง' })
    }
    const expense = expenses[0]

    // Get items
    const [items] = await connection.execute(
      'SELECT * FROM expense_items WHERE expense_id = ?', [expenseId]
    )

    // Create journal entry
    const entryNumber = await generateDocNumber('JV', companyId, 'journal_entries', 'entry_number')
    const [journalResult] = await connection.execute(
      `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, reference_type, status, created_by)
       VALUES (?, ?, ?, ?, 'EXPENSE', 'posted', ?)`,
      [companyId, entryNumber, expense.expense_date, `ค่าใช้จ่าย ${expense.expense_number}`, req.user.id]
    )
    const journalEntryId = journalResult.insertId

    // Debit: Each expense account
    for (const item of items) {
      await connection.execute(
        `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
         VALUES (?, ?, ?, 0, ?)`,
        [journalEntryId, item.account_id, parseFloat(item.amount) + parseFloat(item.vat_amount), item.description]
      )
    }

    // Credit: Cash/Bank
    const totalVat = parseFloat(expense.vat_amount) || 0
    const totalWht = parseFloat(expense.wht_amount) || 0
    const totalAmount = parseFloat(expense.amount) || 0
    const netPayment = totalAmount - totalWht

    const [cashAccounts] = await connection.execute(
      "SELECT id FROM accounts WHERE company_id = ? AND account_code = '1100'", [companyId]
    )
    if (cashAccounts.length > 0) {
      await connection.execute(
        `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
         VALUES (?, ?, 0, ?, ?)`,
        [journalEntryId, cashAccounts[0].id, netPayment, `ค่าใช้จ่าย ${expense.expense_number}`]
      )
    }

    if (totalWht > 0) {
      const [whtAccounts] = await connection.execute(
        "SELECT id FROM accounts WHERE company_id = ? AND account_code = '2130'", [companyId]
      )
      if (whtAccounts.length > 0) {
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, 0, ?, ?)`,
          [journalEntryId, whtAccounts[0].id, totalWht, `หัก ณ ที่จ่าย ${expense.expense_number}`]
        )
      }
    }

    // Update expense status
    await connection.execute(
      'UPDATE expenses SET status = ?, journal_entry_id = ? WHERE id = ?',
      ['approved', journalEntryId, expenseId]
    )

    await connection.commit()
    res.json({ message: 'อนุมัติค่าใช้จ่ายสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Approve expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// PATCH /api/accounting/expenses/:id/void
router.patch('/expenses/:id/void', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId
    const expenseId = req.params.id

    const [expenses] = await connection.execute(
      'SELECT * FROM expenses WHERE id = ? AND company_id = ?',
      [expenseId, companyId]
    )
    if (expenses.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรายการ' })
    }
    const expense = expenses[0]
    if (expense.status === 'voided') {
      return res.status(400).json({ message: 'รายการนี้ถูกยกเลิกแล้ว' })
    }

    // Void journal entry if exists
    if (expense.journal_entry_id) {
      await connection.execute(
        'UPDATE journal_entries SET status = ? WHERE id = ?',
        ['voided', expense.journal_entry_id]
      )
    }

    await connection.execute(
      'UPDATE expenses SET status = ? WHERE id = ?',
      ['voided', expenseId]
    )

    await connection.commit()
    res.json({ message: 'ยกเลิกค่าใช้จ่ายสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Void expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// === JOURNAL ENTRIES ===

// GET /api/accounting/journals
router.get('/journals', async (req, res) => {
  try {
    const { from, to, status } = req.query
    let query = `
      SELECT je.*, u.full_name as created_by_name
      FROM journal_entries je
      LEFT JOIN users u ON je.created_by = u.id
      WHERE je.company_id = ?`
    const params = [req.user.companyId]

    if (from) { query += ' AND je.entry_date >= ?'; params.push(from) }
    if (to) { query += ' AND je.entry_date <= ?'; params.push(to) }
    if (status) { query += ' AND je.status = ?'; params.push(status) }

    query += ' ORDER BY je.entry_date DESC, je.id DESC LIMIT 200'
    const entries = await executeQuery(query, params)
    res.json(entries)
  } catch (error) {
    console.error('Get journals error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/accounting/journals/:id
router.get('/journals/:id', async (req, res) => {
  try {
    const entries = await executeQuery(
      'SELECT * FROM journal_entries WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (entries.length === 0) return res.status(404).json({ message: 'ไม่พบรายการ' })

    const lines = await executeQuery(
      `SELECT jl.*, a.account_code, a.name as account_name
       FROM journal_lines jl JOIN accounts a ON jl.account_id = a.id
       WHERE jl.journal_entry_id = ?`,
      [req.params.id]
    )

    res.json({ ...entries[0], lines })
  } catch (error) {
    console.error('Get journal detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
