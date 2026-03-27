const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')
const { writeAuditLog } = require('../../middleware/auditLog')

router.use(auth, companyGuard)

// === CHART OF ACCOUNTS ===

// GET /api/accounting/accounts
router.get('/accounts', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    if (page > 0) {
      const [countResult] = await executeQuery(
        'SELECT COUNT(*) as total FROM accounts WHERE company_id = ?', [req.user.companyId]
      )
      const total = countResult.total

      const accounts = await executeQuery(
        `SELECT a.*, p.name as parent_name, p.account_code as parent_code
         FROM accounts a
         LEFT JOIN accounts p ON a.parent_id = p.id
         WHERE a.company_id = ?
         ORDER BY a.account_code LIMIT ? OFFSET ?`,
        [req.user.companyId, limit, offset]
      )
      res.json({ data: accounts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const accounts = await executeQuery(
        `SELECT a.*, p.name as parent_name, p.account_code as parent_code
         FROM accounts a
         LEFT JOIN accounts p ON a.parent_id = p.id
         WHERE a.company_id = ?
         ORDER BY a.account_code LIMIT 500`,
        [req.user.companyId]
      )
      res.json(accounts)
    }
  } catch (error) {
    console.error('Get accounts error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/accounting/accounts
router.post('/accounts', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const { accountCode, name, accountType, parentId, description } = req.body
    const result = await executeQuery(
      `INSERT INTO accounts (company_id, account_code, name, account_type, parent_id, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, accountCode, name, accountType, parentId || null, description || null]
    )
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'account', entityId: result.insertId,
      description: `เพิ่มบัญชี "${accountCode} - ${name}"`,
      newValues: { accountCode, name, accountType, parentId, description },
      req,
    })

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
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { from, to, status, accountId } = req.query
    let whereClause = 'WHERE e.company_id = ?'
    const baseParams = [req.user.companyId]

    if (from) { whereClause += ' AND e.expense_date >= ?'; baseParams.push(from) }
    if (to) { whereClause += ' AND e.expense_date <= ?'; baseParams.push(to) }
    if (status) { whereClause += ' AND e.status = ?'; baseParams.push(status) }
    if (accountId) { whereClause += ' AND e.account_id = ?'; baseParams.push(accountId) }

    let expenses
    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM expenses e ${whereClause}`, baseParams
      )
      const total = countResult.total

      expenses = await executeQuery(
        `SELECT e.*, a.account_code, a.name as account_name, u.full_name as created_by_name
         FROM expenses e
         LEFT JOIN accounts a ON e.account_id = a.id
         LEFT JOIN users u ON e.created_by = u.id
         ${whereClause} ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )

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

      res.json({ data: expenses, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      expenses = await executeQuery(
        `SELECT e.*, a.account_code, a.name as account_name, u.full_name as created_by_name
         FROM expenses e
         LEFT JOIN accounts a ON e.account_id = a.id
         LEFT JOIN users u ON e.created_by = u.id
         ${whereClause} ORDER BY e.expense_date DESC, e.id DESC LIMIT 500`,
        baseParams
      )

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
    }
  } catch (error) {
    console.error('Get expenses error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/accounting/expenses — supports multi-line items
router.post('/expenses', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const {
      vendorName, taxId, contactId, expenseDate, dueDate, paymentMethod, paymentChannelId, paymentStatus,
      referenceNumber, taxInvoiceNumber, taxInvoiceDate, taxPeriod,
      note, status: docStatus, items, adjustments
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

    // Process adjustments (always credit-side)
    let adjTotal = 0
    const validAdjustments = (adjustments || []).filter(a => a.accountId && parseFloat(a.amount) > 0)
    validAdjustments.forEach(a => {
      adjTotal += parseFloat(a.amount) || 0
    })

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

      // Adjustment journal lines (always credit)
      for (const adj of validAdjustments) {
        const adjAmt = parseFloat(adj.amount) || 0
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, 0, ?, ?)`,
          [journalEntryId, adj.accountId, adjAmt,
            adj.description || 'ปรับปรุงรายการ']
        )
      }

      // Credit: Cash/Bank (account 1100) — adjusted for adjustment items
      const netPayment = totalAmount + totalVat - totalWht - adjTotal
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

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'expense', entityId: expenseId,
      description: `สร้างค่าใช้จ่าย ${expenseNumber} (${finalStatus})`,
      newValues: { expenseNumber, amount: totalAmount + totalVat, vendorName, status: finalStatus, itemCount: items.length },
      req,
    })

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
router.patch('/expenses/:id/approve', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
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

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'expense', entityId: expenseId,
      description: `อนุมัติค่าใช้จ่าย ${expense.expense_number}`,
      oldValues: { status: 'draft' },
      newValues: { status: 'approved', journalEntryId },
      req,
    })

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
router.patch('/expenses/:id/void', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
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

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'VOID', entityType: 'expense', entityId: expenseId,
      description: `ยกเลิกค่าใช้จ่าย ${expense.expense_number}`,
      oldValues: { status: expense.status, amount: expense.amount },
      newValues: { status: 'voided' },
      req,
    })

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
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { from, to, status } = req.query
    let whereClause = 'WHERE je.company_id = ?'
    const baseParams = [req.user.companyId]

    if (from) { whereClause += ' AND je.entry_date >= ?'; baseParams.push(from) }
    if (to) { whereClause += ' AND je.entry_date <= ?'; baseParams.push(to) }
    if (status) { whereClause += ' AND je.status = ?'; baseParams.push(status) }

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM journal_entries je ${whereClause}`, baseParams
      )
      const total = countResult.total

      const entries = await executeQuery(
        `SELECT je.*, u.full_name as created_by_name
         FROM journal_entries je
         LEFT JOIN users u ON je.created_by = u.id
         ${whereClause} ORDER BY je.entry_date DESC, je.id DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: entries, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const entries = await executeQuery(
        `SELECT je.*, u.full_name as created_by_name
         FROM journal_entries je
         LEFT JOIN users u ON je.created_by = u.id
         ${whereClause} ORDER BY je.entry_date DESC, je.id DESC LIMIT 500`,
        baseParams
      )
      res.json(entries)
    }
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

// DELETE /api/accounting/expenses/:id
router.delete('/expenses/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId

    const [expenses] = await connection.execute(
      'SELECT * FROM expenses WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    )
    if (expenses.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรายการ' })
    }
    const expense = expenses[0]

    const journalId = expense.journal_entry_id

    // Remove expense first (FK: expense_items → expenses, expenses → journal_entries)
    await connection.execute('DELETE FROM expense_items WHERE expense_id = ?', [req.params.id])
    await connection.execute('DELETE FROM expenses WHERE id = ?', [req.params.id])

    // Then delete linked journal entry (now safe — no FK references remain)
    if (journalId) {
      await connection.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', [journalId])
      await connection.execute('DELETE FROM journal_entries WHERE id = ?', [journalId])
    }

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'DELETE', entityType: 'expense', entityId: req.params.id,
      description: `ลบค่าใช้จ่าย ${expense.expense_number}`,
      oldValues: { expenseNumber: expense.expense_number, amount: expense.amount, status: expense.status },
      req,
    })

    await connection.commit()
    res.json({ message: 'ลบค่าใช้จ่ายสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Delete expense error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// DELETE /api/accounting/journals/:id
router.delete('/journals/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId

    const [entries] = await connection.execute(
      'SELECT * FROM journal_entries WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    )
    if (entries.length === 0) {
      return res.status(404).json({ message: 'ไม่พบรายการ' })
    }
    const entry = entries[0]

    // Nullify FK references from other tables before deleting
    await connection.execute('UPDATE expenses SET journal_entry_id = NULL WHERE journal_entry_id = ? AND company_id = ?', [req.params.id, companyId])
    await connection.execute('UPDATE sales_documents SET journal_entry_id = NULL WHERE journal_entry_id = ? AND company_id = ?', [req.params.id, companyId])
    await connection.execute('UPDATE sale_returns SET journal_entry_id = NULL WHERE journal_entry_id = ? AND company_id = ?', [req.params.id, companyId]).catch(() => {})

    await connection.execute('DELETE FROM journal_lines WHERE journal_entry_id = ?', [req.params.id])
    await connection.execute('DELETE FROM journal_entries WHERE id = ?', [req.params.id])

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'DELETE', entityType: 'journal_entry', entityId: req.params.id,
      description: `ลบรายการบัญชี ${entry.entry_number || `JE-${entry.id}`}`,
      oldValues: { entryNumber: entry.entry_number, status: entry.status, description: entry.description },
      req,
    })

    await connection.commit()
    res.json({ message: 'ลบรายการบัญชีสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Delete journal error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

module.exports = router
