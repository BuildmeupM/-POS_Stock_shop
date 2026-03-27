const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { deductStockFIFO } = require('../../utils/fifo')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// ====================================================================
// GET /api/stocktaking — List all stock counts
// ====================================================================
router.get('/', async (req, res) => {
  try {
    const { status, warehouseId, from, to } = req.query
    let query = `
      SELECT sc.*, w.name as warehouse_name, u.full_name as created_by_name
      FROM stock_counts sc
      JOIN warehouses w ON sc.warehouse_id = w.id
      LEFT JOIN users u ON sc.created_by = u.id
      WHERE sc.company_id = ?`
    const params = [req.user.companyId]

    if (status) { query += ' AND sc.status = ?'; params.push(status) }
    if (warehouseId) { query += ' AND sc.warehouse_id = ?'; params.push(warehouseId) }
    if (from) { query += ' AND sc.count_date >= ?'; params.push(from) }
    if (to) { query += ' AND sc.count_date <= ?'; params.push(to) }

    query += ' ORDER BY sc.created_at DESC LIMIT 200'
    const counts = await executeQuery(query, params)
    res.json(counts)
  } catch (error) {
    console.error('Get stock counts error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ====================================================================
// GET /api/stocktaking/:id — Get stock count detail with items
// ====================================================================
router.get('/:id', async (req, res) => {
  try {
    const counts = await executeQuery(
      `SELECT sc.*, w.name as warehouse_name, u.full_name as created_by_name
       FROM stock_counts sc
       JOIN warehouses w ON sc.warehouse_id = w.id
       LEFT JOIN users u ON sc.created_by = u.id
       WHERE sc.id = ? AND sc.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (counts.length === 0) {
      return res.status(404).json({ message: 'ไม่พบใบตรวจนับ' })
    }

    const items = await executeQuery(
      `SELECT sci.*, p.name as product_name, p.sku
       FROM stock_count_items sci
       JOIN products p ON sci.product_id = p.id
       WHERE sci.count_id = ?
       ORDER BY p.name`,
      [req.params.id]
    )

    res.json({ ...counts[0], items })
  } catch (error) {
    console.error('Get stock count detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ====================================================================
// POST /api/stocktaking — Create new stock count
// ====================================================================
router.post('/', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { warehouseId, countDate, note, productIds } = req.body
    const companyId = req.user.companyId

    if (!warehouseId || !countDate) {
      return res.status(400).json({ message: 'กรุณาเลือกคลังสินค้าและวันที่ตรวจนับ' })
    }

    // Verify warehouse belongs to company
    const [warehouses] = await connection.execute(
      'SELECT id FROM warehouses WHERE id = ? AND company_id = ? AND is_active = TRUE',
      [warehouseId, companyId]
    )
    if (warehouses.length === 0) {
      return res.status(400).json({ message: 'ไม่พบคลังสินค้า' })
    }

    // Generate count number
    const countNumber = await generateDocNumber('SC', companyId, 'stock_counts', 'count_number')

    // Get products to count
    let productsToCount
    if (productIds && productIds.length > 0) {
      // Specific products
      const placeholders = productIds.map(() => '?').join(',')
      const [rows] = await connection.execute(
        `SELECT p.id, p.cost_price,
          COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl WHERE sl.product_id = p.id AND sl.warehouse_id = ?), 0) as system_qty
         FROM products p
         WHERE p.id IN (${placeholders}) AND p.company_id = ? AND p.is_active = TRUE`,
        [warehouseId, ...productIds, companyId]
      )
      productsToCount = rows
    } else {
      // All active products that have stock or exist in this company
      const [rows] = await connection.execute(
        `SELECT p.id, p.cost_price,
          COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl WHERE sl.product_id = p.id AND sl.warehouse_id = ?), 0) as system_qty
         FROM products p
         WHERE p.company_id = ? AND p.is_active = TRUE
         ORDER BY p.name`,
        [warehouseId, companyId]
      )
      productsToCount = rows
    }

    if (productsToCount.length === 0) {
      return res.status(400).json({ message: 'ไม่พบสินค้าที่จะตรวจนับ' })
    }

    // Insert stock_counts header
    const [countResult] = await connection.execute(
      `INSERT INTO stock_counts (count_number, company_id, warehouse_id, count_date, status, note, total_items, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [countNumber, companyId, warehouseId, countDate, note || null, productsToCount.length, req.user.id]
    )
    const countId = countResult.insertId

    // Insert stock_count_items
    for (const product of productsToCount) {
      await connection.execute(
        `INSERT INTO stock_count_items (count_id, product_id, system_qty, counted_qty, variance_qty, cost_per_unit, variance_value)
         VALUES (?, ?, ?, NULL, 0, ?, 0)`,
        [countId, product.id, product.system_qty, parseFloat(product.cost_price) || 0]
      )
    }

    await connection.commit()
    res.status(201).json({ message: 'สร้างใบตรวจนับสำเร็จ', countId, countNumber })
  } catch (error) {
    await connection.rollback()
    console.error('Create stock count error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// ====================================================================
// PUT /api/stocktaking/:id/items — Update counted quantities
// ====================================================================
router.put('/:id/items', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { items } = req.body
    const companyId = req.user.companyId

    // Verify stock count belongs to company and is not completed/voided
    const [counts] = await connection.execute(
      'SELECT id, status FROM stock_counts WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    )
    if (counts.length === 0) {
      return res.status(404).json({ message: 'ไม่พบใบตรวจนับ' })
    }
    if (counts[0].status === 'completed' || counts[0].status === 'voided') {
      return res.status(400).json({ message: 'ไม่สามารถแก้ไขใบตรวจนับที่เสร็จสิ้นหรือยกเลิกแล้ว' })
    }

    // Update each item
    for (const item of items) {
      // Get the system_qty for variance calculation
      const [existingItems] = await connection.execute(
        'SELECT system_qty, cost_per_unit FROM stock_count_items WHERE id = ? AND count_id = ?',
        [item.itemId, req.params.id]
      )
      if (existingItems.length === 0) continue

      const systemQty = existingItems[0].system_qty
      const costPerUnit = parseFloat(existingItems[0].cost_per_unit) || 0
      const countedQty = parseInt(item.countedQty, 10)
      const varianceQty = countedQty - systemQty
      const varianceValue = varianceQty * costPerUnit

      await connection.execute(
        `UPDATE stock_count_items SET counted_qty = ?, variance_qty = ?, variance_value = ?, note = ?
         WHERE id = ? AND count_id = ?`,
        [countedQty, varianceQty, varianceValue, item.note || null, item.itemId, req.params.id]
      )
    }

    // Update status to in_progress if still draft
    if (counts[0].status === 'draft') {
      await connection.execute(
        'UPDATE stock_counts SET status = ? WHERE id = ?',
        ['in_progress', req.params.id]
      )
    }

    // Update totals on header
    const [totals] = await connection.execute(
      `SELECT COUNT(*) as total_items,
              SUM(ABS(variance_qty)) as total_variance_qty,
              SUM(variance_value) as total_variance_value
       FROM stock_count_items WHERE count_id = ?`,
      [req.params.id]
    )
    await connection.execute(
      'UPDATE stock_counts SET total_items = ?, total_variance_qty = ?, total_variance_value = ? WHERE id = ?',
      [totals[0].total_items, totals[0].total_variance_qty || 0, totals[0].total_variance_value || 0, req.params.id]
    )

    await connection.commit()
    res.json({ message: 'บันทึกผลนับสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Update stock count items error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// ====================================================================
// PUT /api/stocktaking/:id/complete — Complete/approve stock count
// ====================================================================
router.put('/:id/complete', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const companyId = req.user.companyId
    const countId = req.params.id

    // Get stock count
    const [counts] = await connection.execute(
      'SELECT * FROM stock_counts WHERE id = ? AND company_id = ?',
      [countId, companyId]
    )
    if (counts.length === 0) {
      return res.status(404).json({ message: 'ไม่พบใบตรวจนับ' })
    }
    const stockCount = counts[0]
    if (stockCount.status === 'completed' || stockCount.status === 'voided') {
      return res.status(400).json({ message: 'ใบตรวจนับนี้ดำเนินการแล้ว' })
    }

    // Get all items
    const [items] = await connection.execute(
      'SELECT * FROM stock_count_items WHERE count_id = ?',
      [countId]
    )

    // Validate all items have been counted
    const uncounted = items.filter(i => i.counted_qty === null)
    if (uncounted.length > 0) {
      return res.status(400).json({ message: `ยังมีสินค้าที่ยังไม่ได้นับ ${uncounted.length} รายการ` })
    }

    // Process variances — adjust stock
    let totalVarianceQty = 0
    let totalVarianceValue = 0
    let totalShortageValue = 0
    let totalSurplusValue = 0

    for (const item of items) {
      const varianceQty = item.variance_qty
      const varianceValue = parseFloat(item.variance_value) || 0
      totalVarianceQty += Math.abs(varianceQty)
      totalVarianceValue += varianceValue

      if (varianceQty === 0) continue

      if (varianceQty > 0) {
        // Surplus: add stock lot
        totalSurplusValue += varianceValue
        const costPerUnit = parseFloat(item.cost_per_unit) || 0

        const [lotResult] = await connection.execute(
          `INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit)
           VALUES (?, ?, ?, ?)`,
          [item.product_id, stockCount.warehouse_id, varianceQty, costPerUnit]
        )

        // Stock transaction
        await connection.execute(
          `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, related_lot_id, note, created_by)
           VALUES (?, ?, 'ADJUST', ?, ?, 'STOCKCOUNT', ?, ?, ?, ?)`,
          [item.product_id, stockCount.warehouse_id, varianceQty, costPerUnit,
           countId, lotResult.insertId, `ตรวจนับ ${stockCount.count_number} — สินค้าเกิน`, req.user.id]
        )
      } else {
        // Shortage: deduct from stock using FIFO
        totalShortageValue += Math.abs(varianceValue)
        const deductQty = Math.abs(varianceQty)

        try {
          const { deductions } = await deductStockFIFO(connection, item.product_id, stockCount.warehouse_id, deductQty)

          for (const d of deductions) {
            await connection.execute(
              `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, related_lot_id, note, created_by)
               VALUES (?, ?, 'ADJUST', ?, ?, 'STOCKCOUNT', ?, ?, ?, ?)`,
              [item.product_id, stockCount.warehouse_id, -d.quantity, d.costPerUnit,
               countId, d.lotId, `ตรวจนับ ${stockCount.count_number} — สินค้าขาด`, req.user.id]
            )
          }
        } catch (fifoError) {
          // If not enough stock, deduct what we can and log the rest
          console.error('FIFO deduction partial fail for product', item.product_id, fifoError.message)
          // Still create the transaction for the attempted deduction
          await connection.execute(
            `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, note, created_by)
             VALUES (?, ?, 'ADJUST', ?, ?, 'STOCKCOUNT', ?, ?, ?)`,
            [item.product_id, stockCount.warehouse_id, -deductQty, parseFloat(item.cost_per_unit) || 0,
             countId, `ตรวจนับ ${stockCount.count_number} — ปรับลดสต๊อก (สต๊อกไม่พอตัด FIFO)`, req.user.id]
          )
        }
      }
    }

    // Create journal entry for total variance
    const hasVariance = totalShortageValue > 0 || totalSurplusValue > 0
    let journalEntryId = null

    if (hasVariance) {
      const entryNumber = await generateDocNumber('JV', companyId, 'journal_entries', 'entry_number')
      const [journalResult] = await connection.execute(
        `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, reference_type, status, created_by)
         VALUES (?, ?, ?, ?, 'STOCKCOUNT', 'posted', ?)`,
        [companyId, entryNumber, stockCount.count_date, `ปรับปรุงสต๊อกจากการตรวจนับ ${stockCount.count_number}`, req.user.id]
      )
      journalEntryId = journalResult.insertId

      // Get account IDs
      const [inventoryAccounts] = await connection.execute(
        "SELECT id FROM accounts WHERE company_id = ? AND account_code = '1200'", [companyId]
      )
      const [stockLossAccounts] = await connection.execute(
        "SELECT id FROM accounts WHERE company_id = ? AND account_code = '5200'", [companyId]
      )
      const [stockGainAccounts] = await connection.execute(
        "SELECT id FROM accounts WHERE company_id = ? AND account_code = '4200'", [companyId]
      )

      const inventoryAccountId = inventoryAccounts.length > 0 ? inventoryAccounts[0].id : null
      const stockLossAccountId = stockLossAccounts.length > 0 ? stockLossAccounts[0].id : null
      const stockGainAccountId = stockGainAccounts.length > 0 ? stockGainAccounts[0].id : null

      // Shortage journal: Debit Stock Loss (5200), Credit Inventory (1200)
      if (totalShortageValue > 0 && stockLossAccountId && inventoryAccountId) {
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, ?, 0, ?)`,
          [journalEntryId, stockLossAccountId, totalShortageValue, `สินค้าขาดจากการตรวจนับ ${stockCount.count_number}`]
        )
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, 0, ?, ?)`,
          [journalEntryId, inventoryAccountId, totalShortageValue, `ลดสินค้าคงเหลือจากตรวจนับ ${stockCount.count_number}`]
        )
      }

      // Surplus journal: Debit Inventory (1200), Credit Stock Gain (4200)
      if (totalSurplusValue > 0 && inventoryAccountId && stockGainAccountId) {
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, ?, 0, ?)`,
          [journalEntryId, inventoryAccountId, totalSurplusValue, `เพิ่มสินค้าคงเหลือจากตรวจนับ ${stockCount.count_number}`]
        )
        await connection.execute(
          `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, 0, ?, ?)`,
          [journalEntryId, stockGainAccountId, totalSurplusValue, `สินค้าเกินจากการตรวจนับ ${stockCount.count_number}`]
        )
      }
    }

    // Update stock_counts header
    await connection.execute(
      `UPDATE stock_counts SET status = 'completed', completed_at = NOW(),
       total_items = ?, total_variance_qty = ?, total_variance_value = ?
       WHERE id = ?`,
      [items.length, totalVarianceQty, totalVarianceValue, countId]
    )

    await connection.commit()
    res.json({ message: 'ยืนยันการตรวจนับสำเร็จ', journalEntryId })
  } catch (error) {
    await connection.rollback()
    console.error('Complete stock count error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// ====================================================================
// PUT /api/stocktaking/:id/void — Void a stock count
// ====================================================================
router.put('/:id/void', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const companyId = req.user.companyId
    const countId = req.params.id

    // Get stock count
    const [counts] = await connection.execute(
      'SELECT * FROM stock_counts WHERE id = ? AND company_id = ?',
      [countId, companyId]
    )
    if (counts.length === 0) {
      return res.status(404).json({ message: 'ไม่พบใบตรวจนับ' })
    }
    const stockCount = counts[0]
    if (stockCount.status === 'voided') {
      return res.status(400).json({ message: 'ใบตรวจนับนี้ถูกยกเลิกแล้ว' })
    }

    // If completed, reverse stock adjustments
    if (stockCount.status === 'completed') {
      const [items] = await connection.execute(
        'SELECT * FROM stock_count_items WHERE count_id = ?',
        [countId]
      )

      for (const item of items) {
        const varianceQty = item.variance_qty
        if (varianceQty === 0) continue

        if (varianceQty > 0) {
          // Was surplus (added stock), now deduct it back
          try {
            const { deductions } = await deductStockFIFO(connection, item.product_id, stockCount.warehouse_id, varianceQty)
            for (const d of deductions) {
              await connection.execute(
                `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, related_lot_id, note, created_by)
                 VALUES (?, ?, 'ADJUST', ?, ?, 'STOCKCOUNT_VOID', ?, ?, ?, ?)`,
                [item.product_id, stockCount.warehouse_id, -d.quantity, d.costPerUnit,
                 countId, d.lotId, `ยกเลิกตรวจนับ ${stockCount.count_number} — คืนสินค้าเกิน`, req.user.id]
              )
            }
          } catch (err) {
            console.error('Void surplus reversal error:', err.message)
          }
        } else {
          // Was shortage (deducted stock), now add it back
          const addBackQty = Math.abs(varianceQty)
          const costPerUnit = parseFloat(item.cost_per_unit) || 0

          const [lotResult] = await connection.execute(
            `INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit)
             VALUES (?, ?, ?, ?)`,
            [item.product_id, stockCount.warehouse_id, addBackQty, costPerUnit]
          )

          await connection.execute(
            `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, related_lot_id, note, created_by)
             VALUES (?, ?, 'ADJUST', ?, ?, 'STOCKCOUNT_VOID', ?, ?, ?, ?)`,
            [item.product_id, stockCount.warehouse_id, addBackQty, costPerUnit,
             countId, lotResult.insertId, `ยกเลิกตรวจนับ ${stockCount.count_number} — คืนสินค้าขาด`, req.user.id]
          )
        }
      }

      // Void journal entry — find by reference
      const [journals] = await connection.execute(
        "SELECT id FROM journal_entries WHERE company_id = ? AND reference_type = 'STOCKCOUNT' AND description LIKE ?",
        [companyId, `%${stockCount.count_number}%`]
      )
      for (const j of journals) {
        await connection.execute(
          'UPDATE journal_entries SET status = ? WHERE id = ?',
          ['voided', j.id]
        )
      }
    }

    // Update status to voided
    await connection.execute(
      'UPDATE stock_counts SET status = ? WHERE id = ?',
      ['voided', countId]
    )

    await connection.commit()
    res.json({ message: 'ยกเลิกใบตรวจนับสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Void stock count error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

module.exports = router
