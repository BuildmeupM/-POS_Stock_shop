const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')
const { createJournalEntry, voidJournalEntry } = require('../../utils/journal')
const { writeAuditLog } = require('../../middleware/auditLog')

router.use(auth, companyGuard)

// GET /api/returns — list returns
router.get('/', async (req, res) => {
  try {
    const { from, to, status } = req.query
    let query = `
      SELECT sr.*, s.invoice_number, c.name as customer_name, u.full_name as created_by_name
      FROM sale_returns sr
      LEFT JOIN sales s ON sr.sale_id = s.id
      LEFT JOIN customers c ON sr.customer_id = c.id
      LEFT JOIN users u ON sr.created_by = u.id
      WHERE sr.company_id = ?`
    const params = [req.user.companyId]

    if (from) { query += ' AND sr.return_date >= ?'; params.push(from) }
    if (to) { query += ' AND sr.return_date <= ?'; params.push(to) }
    if (status) { query += ' AND sr.status = ?'; params.push(status) }

    query += ' ORDER BY sr.created_at DESC LIMIT 200'
    const returns = await executeQuery(query, params)
    res.json(returns)
  } catch (error) {
    console.error('List returns error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/returns/sale/:saleId — get sale info for creating a return
router.get('/sale/:saleId', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const saleId = req.params.saleId

    // Get the sale
    const sales = await executeQuery(
      `SELECT s.*, c.name as customer_name FROM sales s
       LEFT JOIN customers c ON s.customer_id = c.id
       WHERE s.id = ? AND s.company_id = ? AND s.status = 'completed'`,
      [saleId, companyId]
    )
    if (sales.length === 0) {
      return res.status(404).json({ message: 'ไม่พบบิลขายหรือบิลถูกยกเลิกแล้ว' })
    }

    // Get sale items
    const items = await executeQuery(
      `SELECT si.*, COALESCE(p.name, si.service_name, 'ค่าบริการ') as product_name, p.sku
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = ?`,
      [saleId]
    )

    // Get already returned quantities for this sale
    const returnedItems = await executeQuery(
      `SELECT sri.sale_item_id, SUM(sri.quantity) as returned_quantity
       FROM sale_return_items sri
       JOIN sale_returns sr ON sri.return_id = sr.id
       WHERE sr.sale_id = ? AND sr.status != 'voided'
       GROUP BY sri.sale_item_id`,
      [saleId]
    )
    const returnedMap = {}
    for (const ri of returnedItems) {
      returnedMap[ri.sale_item_id] = ri.returned_quantity
    }

    // Attach returned_quantity to each item
    const enrichedItems = items.map(item => ({
      ...item,
      returned_quantity: returnedMap[item.id] || 0,
      returnable_quantity: item.quantity - (returnedMap[item.id] || 0),
    }))

    res.json({ ...sales[0], items: enrichedItems })
  } catch (error) {
    console.error('Get sale for return error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/returns/search-sales — search sales by invoice number for return creation
router.get('/search-sales', async (req, res) => {
  try {
    const { q } = req.query
    const companyId = req.user.companyId
    let query = `
      SELECT s.id, s.invoice_number, s.sold_at, s.net_amount, s.total_amount,
             c.name as customer_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.company_id = ? AND s.status = 'completed'`
    const params = [companyId]

    if (q && q.trim()) {
      query += ' AND (s.invoice_number LIKE ? OR c.name LIKE ?)'
      const s = `%${q.trim()}%`
      params.push(s, s)
    }

    query += ' ORDER BY s.sold_at DESC LIMIT 20'
    const sales = await executeQuery(query, params)
    res.json(sales)
  } catch (error) {
    console.error('Search sales error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/returns/:id — return detail
router.get('/:id', async (req, res) => {
  try {
    const returns = await executeQuery(
      `SELECT sr.*, s.invoice_number, c.name as customer_name, u.full_name as created_by_name
       FROM sale_returns sr
       LEFT JOIN sales s ON sr.sale_id = s.id
       LEFT JOIN customers c ON sr.customer_id = c.id
       LEFT JOIN users u ON sr.created_by = u.id
       WHERE sr.id = ? AND sr.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (returns.length === 0) return res.status(404).json({ message: 'ไม่พบใบรับคืน' })

    const items = await executeQuery(
      `SELECT sri.*, p.name as product_name, p.sku
       FROM sale_return_items sri
       LEFT JOIN products p ON sri.product_id = p.id
       WHERE sri.return_id = ?`,
      [req.params.id]
    )

    res.json({ ...returns[0], items })
  } catch (error) {
    console.error('Get return detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/returns — create return
router.post('/', roleCheck('owner', 'admin', 'manager', 'cashier'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { saleId, reason, refundMethod, items, status: requestedStatus } = req.body
    const companyId = req.user.companyId

    if (!saleId) return res.status(400).json({ message: 'กรุณาระบุบิลขาย' })
    if (!items || items.length === 0) return res.status(400).json({ message: 'กรุณาเพิ่มสินค้าที่ต้องการรับคืน' })

    // Validate sale exists and is completed
    const [sales] = await connection.execute(
      "SELECT * FROM sales WHERE id = ? AND company_id = ? AND status = 'completed'",
      [saleId, companyId]
    )
    if (sales.length === 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'ไม่พบบิลขายหรือบิลถูกยกเลิกแล้ว' })
    }
    const sale = sales[0]

    // Get already returned quantities for this sale
    const [returnedRows] = await connection.execute(
      `SELECT sri.sale_item_id, SUM(sri.quantity) as returned_quantity
       FROM sale_return_items sri
       JOIN sale_returns sr ON sri.return_id = sr.id
       WHERE sr.sale_id = ? AND sr.status != 'voided'
       GROUP BY sri.sale_item_id`,
      [saleId]
    )
    const returnedMap = {}
    for (const ri of returnedRows) {
      returnedMap[ri.sale_item_id] = ri.returned_quantity
    }

    // Validate quantities
    for (const item of items) {
      if (!item.saleItemId) {
        await connection.rollback()
        return res.status(400).json({ message: 'กรุณาระบุรายการสินค้าอ้างอิง' })
      }
      const [saleItems] = await connection.execute(
        'SELECT * FROM sale_items WHERE id = ? AND sale_id = ?',
        [item.saleItemId, saleId]
      )
      if (saleItems.length === 0) {
        await connection.rollback()
        return res.status(400).json({ message: `ไม่พบรายการสินค้าในบิล: ${item.saleItemId}` })
      }

      const saleItem = saleItems[0]
      const alreadyReturned = returnedMap[item.saleItemId] || 0
      const maxReturnable = saleItem.quantity - alreadyReturned

      if (item.quantity > maxReturnable) {
        await connection.rollback()
        return res.status(400).json({
          message: `จำนวนรับคืนเกิน: สินค้า ID ${item.productId} รับคืนได้อีก ${maxReturnable} ชิ้น`
        })
      }
    }

    // Get company settings for VAT
    const [companies] = await connection.execute('SELECT settings FROM companies WHERE id = ?', [companyId])
    const settings = companies[0]?.settings ? JSON.parse(companies[0].settings) : {}
    const vatRate = settings.vat_enabled ? (settings.vat_rate || 7) : 0

    // Calculate totals
    let subtotal = 0
    const returnItems = []
    for (const item of items) {
      const itemSubtotal = (item.unitPrice * item.quantity) - (item.discount || 0)
      subtotal += itemSubtotal

      // Get cost price from original sale item
      const [saleItems] = await connection.execute(
        'SELECT cost_price FROM sale_items WHERE id = ?',
        [item.saleItemId]
      )
      const costPrice = saleItems[0]?.cost_price || 0

      returnItems.push({
        ...item,
        costPrice: parseFloat(costPrice),
        subtotal: itemSubtotal,
      })
    }

    const vatAmount = vatRate > 0 ? (subtotal * vatRate) / (100 + vatRate) : 0
    const netAmount = subtotal
    const roundedVat = Math.round(vatAmount * 100) / 100

    // Generate return number
    const returnNumber = await generateDocNumber('RN', companyId, 'sale_returns', 'return_number')

    const returnStatus = requestedStatus === 'approved' ? 'approved' : 'draft'

    // Insert sale_returns
    const [returnResult] = await connection.execute(
      `INSERT INTO sale_returns (return_number, sale_id, company_id, customer_id, return_date, reason,
       status, subtotal, vat_amount, net_amount, refund_method, refund_amount, created_by)
       VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?)`,
      [returnNumber, saleId, companyId, sale.customer_id || null, reason || null,
       returnStatus, subtotal, roundedVat, netAmount, refundMethod || 'cash', netAmount, req.user.id]
    )
    const returnId = returnResult.insertId

    // Insert sale_return_items
    for (const item of returnItems) {
      await connection.execute(
        `INSERT INTO sale_return_items (return_id, sale_item_id, product_id, quantity, unit_price, cost_price, discount, subtotal, restock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [returnId, item.saleItemId, item.productId, item.quantity, item.unitPrice,
         item.costPrice, item.discount || 0, item.subtotal, item.restock !== false]
      )
    }

    // If approved immediately, do stock restoration + journal entry
    if (returnStatus === 'approved') {
      await processApproval(connection, returnId, companyId, returnNumber, returnItems, netAmount, roundedVat, refundMethod, req.user.id)
    }

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'sale_return', entityId: returnId,
      description: `สร้างใบรับคืน ${returnNumber}`,
      newValues: { returnNumber, saleId, netAmount, refundMethod, status: returnStatus, itemCount: returnItems.length },
      req,
    })

    await connection.commit()

    res.status(201).json({
      message: 'สร้างใบรับคืนสำเร็จ',
      returnId,
      returnNumber,
      netAmount,
    })
  } catch (error) {
    await connection.rollback()
    console.error('Create return error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// PUT /api/returns/:id/approve — approve a draft return
router.put('/:id/approve', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const companyId = req.user.companyId
    const returnId = req.params.id

    // Get return info
    const [returns] = await connection.execute(
      "SELECT * FROM sale_returns WHERE id = ? AND company_id = ? AND status = 'draft'",
      [returnId, companyId]
    )
    if (returns.length === 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'ไม่พบใบรับคืนหรือสถานะไม่ใช่ร่าง' })
    }
    const returnDoc = returns[0]

    // Get return items
    const [returnItems] = await connection.execute(
      'SELECT * FROM sale_return_items WHERE return_id = ?',
      [returnId]
    )

    // Update status
    await connection.execute(
      "UPDATE sale_returns SET status = 'approved' WHERE id = ?",
      [returnId]
    )

    const netAmount = parseFloat(returnDoc.net_amount) || 0
    const vatAmount = parseFloat(returnDoc.vat_amount) || 0

    await processApproval(connection, returnId, companyId, returnDoc.return_number, returnItems, netAmount, vatAmount, returnDoc.refund_method, req.user.id)

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'sale_return', entityId: returnId,
      description: `อนุมัติใบรับคืน ${returnDoc.return_number}`,
      oldValues: { status: 'draft' },
      newValues: { status: 'approved' },
      req,
    })

    await connection.commit()
    res.json({ message: 'อนุมัติใบรับคืนสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Approve return error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// PUT /api/returns/:id/void — void a return
router.put('/:id/void', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const companyId = req.user.companyId
    const returnId = req.params.id

    // Get return info
    const [returns] = await connection.execute(
      "SELECT * FROM sale_returns WHERE id = ? AND company_id = ? AND status IN ('draft', 'approved')",
      [returnId, companyId]
    )
    if (returns.length === 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'ไม่พบใบรับคืนหรือถูกยกเลิกแล้ว' })
    }
    const returnDoc = returns[0]
    const wasApproved = returnDoc.status === 'approved'

    // Update status
    await connection.execute(
      "UPDATE sale_returns SET status = 'voided' WHERE id = ?",
      [returnId]
    )

    // If was approved, reverse stock changes and void journal
    if (wasApproved) {
      // Void journal entry
      if (returnDoc.journal_entry_id) {
        await voidJournalEntry(connection, returnDoc.journal_entry_id)
      }

      // Get return items
      const [returnItems] = await connection.execute(
        'SELECT * FROM sale_return_items WHERE return_id = ?',
        [returnId]
      )

      // Get warehouse
      const [warehouses] = await connection.execute(
        'SELECT id FROM warehouses WHERE company_id = ? AND is_active = TRUE LIMIT 1',
        [companyId]
      )
      const warehouseId = warehouses[0]?.id

      // Reverse stock restoration (deduct stock that was restored)
      for (const item of returnItems) {
        if (!item.restock || !warehouseId) continue

        // Deduct from latest lot
        const [latestLot] = await connection.execute(
          `SELECT id, quantity_remaining FROM stock_lots
           WHERE product_id = ? AND warehouse_id = ? AND quantity_remaining >= ?
           ORDER BY received_at DESC LIMIT 1`,
          [item.product_id, warehouseId, item.quantity]
        )
        if (latestLot.length > 0) {
          await connection.execute(
            'UPDATE stock_lots SET quantity_remaining = quantity_remaining - ? WHERE id = ?',
            [item.quantity, latestLot[0].id]
          )
        }

        // Insert reverse stock transaction
        await connection.execute(
          `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, note, created_by)
           VALUES (?, ?, 'ADJUSTMENT', ?, ?, 'VOID_RETURN', ?, ?, ?)`,
          [item.product_id, warehouseId, -item.quantity, item.cost_price, returnId,
           'ตัดสต๊อกจากยกเลิกใบรับคืน', req.user.id]
        )
      }
    }

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'VOID', entityType: 'sale_return', entityId: returnId,
      description: `ยกเลิกใบรับคืน ${returnDoc.return_number}`,
      oldValues: { status: returnDoc.status },
      newValues: { status: 'voided' },
      req,
    })

    await connection.commit()
    res.json({ message: 'ยกเลิกใบรับคืนสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Void return error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

/**
 * Process approval: restore stock + create journal entry
 */
async function processApproval(connection, returnId, companyId, returnNumber, returnItems, netAmount, vatAmount, refundMethod, userId) {
  // Get warehouse
  const [warehouses] = await connection.execute(
    'SELECT id FROM warehouses WHERE company_id = ? AND is_active = TRUE LIMIT 1',
    [companyId]
  )
  const warehouseId = warehouses[0]?.id

  let totalCostAmount = 0

  // Restore stock for each item
  for (const item of returnItems) {
    const costPrice = parseFloat(item.cost_price) || 0
    totalCostAmount += costPrice * item.quantity

    if (!item.restock || !warehouseId) continue

    // Find latest lot or create new
    const [latestLot] = await connection.execute(
      `SELECT id FROM stock_lots
       WHERE product_id = ? AND warehouse_id = ?
       ORDER BY received_at DESC LIMIT 1`,
      [item.product_id, warehouseId]
    )
    if (latestLot.length > 0) {
      await connection.execute(
        'UPDATE stock_lots SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
        [item.quantity, latestLot[0].id]
      )
    } else {
      await connection.execute(
        `INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit)
         VALUES (?, ?, ?, ?)`,
        [item.product_id, warehouseId, item.quantity, costPrice]
      )
    }

    // Insert stock transaction
    await connection.execute(
      `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, note, created_by)
       VALUES (?, ?, 'RETURN', ?, ?, 'RETURN', ?, ?, ?)`,
      [item.product_id, warehouseId, item.quantity, costPrice, returnId,
       `คืนสต๊อกจากใบรับคืน ${returnNumber}`, userId]
    )
  }

  // Create journal entry (reverse of sale)
  const today = new Date().toISOString().slice(0, 10)
  const revenueAmount = netAmount - vatAmount

  const journalLines = []

  // Debit: Revenue (4100) — reverse revenue
  if (revenueAmount > 0) {
    journalLines.push({
      accountCode: '4100', debit: revenueAmount, credit: 0,
      description: `คืนรายได้จากรับคืนสินค้า ${returnNumber}`,
    })
  }

  // Debit: VAT Payable (2120) — reverse VAT if applicable
  if (vatAmount > 0) {
    journalLines.push({
      accountCode: '2120', debit: vatAmount, credit: 0,
      description: `คืนภาษีขาย ${returnNumber}`,
    })
  }

  // Credit: Cash/Bank (1100) — refund to customer
  if (netAmount > 0) {
    journalLines.push({
      accountCode: '1100', debit: 0, credit: netAmount,
      description: `คืนเงินลูกค้า ${returnNumber} (${refundMethod || 'cash'})`,
    })
  }

  // Reverse COGS: Debit Inventory (1200), Credit COGS (5100)
  if (totalCostAmount > 0) {
    journalLines.push({
      accountCode: '1200', debit: totalCostAmount, credit: 0,
      description: `คืนสต๊อกสินค้า ${returnNumber}`,
    })
    journalLines.push({
      accountCode: '5100', debit: 0, credit: totalCostAmount,
      description: `ลดต้นทุนขาย ${returnNumber}`,
    })
  }

  const journalEntryId = await createJournalEntry(connection, {
    companyId, entryDate: today, description: `รับคืนสินค้า ${returnNumber}`,
    referenceType: 'RETURN', referenceId: returnId, createdBy: userId,
    lines: journalLines,
  })

  // Update return with journal entry id
  if (journalEntryId) {
    await connection.execute(
      'UPDATE sale_returns SET journal_entry_id = ? WHERE id = ?',
      [journalEntryId, returnId]
    )
  }
}

module.exports = router
