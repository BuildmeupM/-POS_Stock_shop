const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { deductStockFIFO } = require('../../utils/fifo')
const { generateDocNumber } = require('../../utils/docNumber')
const { writeAuditLog } = require('../../middleware/auditLog')


router.use(auth, companyGuard)

// GET /api/inventory/stock — current stock levels
router.get('/stock', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { warehouseId, lowStock } = req.query
    let whereClause = 'WHERE p.company_id = ? AND p.is_active = TRUE'
    const baseParams = [req.user.companyId]

    if (warehouseId) {
      whereClause += ' AND sl.warehouse_id = ?'
      baseParams.push(warehouseId)
    }

    let groupClause = ' GROUP BY p.id, w.id'
    let havingClause = ''
    if (lowStock === 'true') {
      havingClause = ' HAVING total_stock <= p.min_stock'
    }

    const selectFields = `p.id, p.sku, p.name, p.unit, p.min_stock, p.cost_price, p.selling_price,
        COALESCE(SUM(sl.quantity_remaining), 0) as total_stock,
        w.name as warehouse_name`
    const fromClause = `FROM products p
      LEFT JOIN stock_lots sl ON p.id = sl.product_id AND sl.quantity_remaining > 0
      LEFT JOIN warehouses w ON sl.warehouse_id = w.id`

    if (page > 0) {
      const countQuery = `SELECT COUNT(*) as total FROM (SELECT p.id ${fromClause} ${whereClause} ${groupClause} ${havingClause}) as sub`
      const [countResult] = await executeQuery(countQuery, baseParams)
      const total = countResult.total

      const dataQuery = `SELECT ${selectFields} ${fromClause} ${whereClause} ${groupClause} ${havingClause} ORDER BY p.name LIMIT ? OFFSET ?`
      const stock = await executeQuery(dataQuery, [...baseParams, limit, offset])
      res.json({ data: stock, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const dataQuery = `SELECT ${selectFields} ${fromClause} ${whereClause} ${groupClause} ${havingClause} ORDER BY p.name LIMIT 500`
      const stock = await executeQuery(dataQuery, baseParams)
      res.json(stock)
    }
  } catch (error) {
    console.error('Get stock error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/inventory/receive — receive stock (IN)
router.post('/receive', roleCheck('owner', 'admin', 'manager', 'cashier'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { productId, warehouseId, quantity, costPerUnit, sellingPrice, batchNumber, expiryDate, note } = req.body

    if (!productId || !warehouseId || !quantity || !costPerUnit) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' })
    }

    // Create stock lot
    const [lotResult] = await connection.execute(
      `INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit, batch_number, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [productId, warehouseId, quantity, costPerUnit, batchNumber || null, expiryDate || null]
    )

    // Create transaction record
    await connection.execute(
      `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, related_lot_id, note, created_by)
       VALUES (?, ?, 'IN', ?, ?, 'MANUAL', ?, ?, ?)`,
      [productId, warehouseId, quantity, costPerUnit, lotResult.insertId, note || null, req.user.id]
    )

    // Update product average cost + selling price
    const [lots] = await connection.execute(
      `SELECT SUM(quantity_remaining * cost_per_unit) as total_value, SUM(quantity_remaining) as total_qty
       FROM stock_lots WHERE product_id = ? AND quantity_remaining > 0`,
      [productId]
    )
    if (lots[0].total_qty > 0) {
      const avgCost = lots[0].total_value / lots[0].total_qty
      if (sellingPrice && sellingPrice > 0) {
        await connection.execute('UPDATE products SET cost_price = ?, selling_price = ? WHERE id = ?', [avgCost, sellingPrice, productId])
      } else {
        await connection.execute('UPDATE products SET cost_price = ? WHERE id = ?', [avgCost, productId])
      }
    }

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'stock_lot', entityId: lotResult.insertId,
      description: `รับสินค้าเข้าสต๊อก productId=${productId} qty=${quantity}`,
      newValues: { productId, warehouseId, quantity, costPerUnit, batchNumber, sellingPrice },
      req,
    })

    await connection.commit()

    res.status(201).json({ message: 'รับสินค้าเข้าสต๊อกสำเร็จ', lotId: lotResult.insertId })
  } catch (error) {
    await connection.rollback()
    console.error('Receive stock error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// POST /api/inventory/issue — issue stock (OUT)
router.post('/issue', roleCheck('owner', 'admin', 'manager', 'cashier'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { productId, warehouseId, quantity, note } = req.body
    const { deductions, weightedAvgCost } = await deductStockFIFO(connection, productId, warehouseId, quantity)

    // Create transaction records
    for (const d of deductions) {
      await connection.execute(
        `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, related_lot_id, note, created_by)
         VALUES (?, ?, 'OUT', ?, ?, 'MANUAL', ?, ?, ?)`,
        [productId, warehouseId, -d.quantity, d.costPerUnit, d.lotId, note || null, req.user.id]
      )
    }

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'stock_issue', entityId: null,
      description: `เบิกสินค้า productId=${productId} qty=${quantity}`,
      newValues: { productId, warehouseId, quantity, note, deductionCount: deductions.length },
      req,
    })

    await connection.commit()

    res.json({ message: 'เบิกสินค้าสำเร็จ', deductions })
  } catch (error) {
    await connection.rollback()
    console.error('Issue stock error:', error)
    res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// GET /api/inventory/transactions — stock movement history
router.get('/transactions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { productId, type, from, to } = req.query
    let whereClause = 'WHERE p.company_id = ?'
    const baseParams = [req.user.companyId]

    if (productId) { whereClause += ' AND st.product_id = ?'; baseParams.push(productId) }
    if (type) { whereClause += ' AND st.type = ?'; baseParams.push(type) }
    if (from) { whereClause += ' AND st.created_at >= ?'; baseParams.push(from) }
    if (to) { whereClause += ' AND st.created_at <= ?'; baseParams.push(to) }

    const fromClause = `FROM stock_transactions st
      JOIN products p ON st.product_id = p.id
      JOIN warehouses w ON st.warehouse_id = w.id
      LEFT JOIN users u ON st.created_by = u.id`

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM stock_transactions st JOIN products p ON st.product_id = p.id ${whereClause}`,
        baseParams
      )
      const total = countResult.total

      const transactions = await executeQuery(
        `SELECT st.*, p.name as product_name, p.sku, w.name as warehouse_name,
          u.full_name as created_by_name
         ${fromClause} ${whereClause} ORDER BY st.created_at DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const transactions = await executeQuery(
        `SELECT st.*, p.name as product_name, p.sku, w.name as warehouse_name,
          u.full_name as created_by_name
         ${fromClause} ${whereClause} ORDER BY st.created_at DESC LIMIT 500`,
        baseParams
      )
      res.json(transactions)
    }
  } catch (error) {
    console.error('Get transactions error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/inventory/warehouses
router.get('/warehouses', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    if (page > 0) {
      const [countResult] = await executeQuery(
        'SELECT COUNT(*) as total FROM warehouses WHERE company_id = ? AND is_active = TRUE',
        [req.user.companyId]
      )
      const total = countResult.total

      const warehouses = await executeQuery(
        'SELECT * FROM warehouses WHERE company_id = ? AND is_active = TRUE ORDER BY name LIMIT ? OFFSET ?',
        [req.user.companyId, limit, offset]
      )
      res.json({ data: warehouses, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const warehouses = await executeQuery(
        'SELECT * FROM warehouses WHERE company_id = ? AND is_active = TRUE ORDER BY name LIMIT 500',
        [req.user.companyId]
      )
      res.json(warehouses)
    }
  } catch (error) {
    console.error('Get warehouses error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/inventory/warehouses — create new warehouse
router.post('/warehouses', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, location } = req.body
    if (!name) return res.status(400).json({ message: 'กรุณากรอกชื่อคลังสินค้า' })
    const result = await executeQuery(
      'INSERT INTO warehouses (company_id, name, location) VALUES (?, ?, ?)',
      [req.user.companyId, name, location || null]
    )
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'warehouse', entityId: result.insertId,
      description: `สร้างคลังสินค้า "${name}"`,
      newValues: { name, location },
      req,
    })

    res.status(201).json({ message: 'สร้างคลังสินค้าสำเร็จ', id: result.insertId })
  } catch (error) {
    console.error('Create warehouse error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/inventory/stock-summary — stat cards
router.get('/stock-summary', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { warehouseId } = req.query

    let whereClause = 'p.company_id = ? AND p.is_active = TRUE'
    const params = [companyId]
    if (warehouseId) { whereClause += ' AND sl.warehouse_id = ?'; params.push(warehouseId) }

    const [rows] = await (require('../../config/db').pool).execute(`
      SELECT
        COUNT(DISTINCT p.id) as total_sku,
        COALESCE(SUM(sl.quantity_remaining), 0) as total_units,
        COALESCE(SUM(sl.quantity_remaining * sl.cost_per_unit), 0) as total_value,
        COUNT(DISTINCT CASE WHEN COALESCE(sl_sum.stock, 0) <= p.min_stock THEN p.id END) as low_stock_count
      FROM products p
      LEFT JOIN stock_lots sl ON p.id = sl.product_id AND sl.quantity_remaining > 0
        ${warehouseId ? 'AND sl.warehouse_id = ?' : ''}
      LEFT JOIN (
        SELECT product_id, ${warehouseId ? 'warehouse_id,' : ''} SUM(quantity_remaining) as stock
        FROM stock_lots WHERE quantity_remaining > 0 ${warehouseId ? 'AND warehouse_id = ?' : ''}
        GROUP BY product_id ${warehouseId ? ', warehouse_id' : ''}
      ) sl_sum ON p.id = sl_sum.product_id
      WHERE ${whereClause}
    `, warehouseId ? [warehouseId, warehouseId, companyId, warehouseId] : [companyId])

    res.json(rows[0])
  } catch (error) {
    console.error('Stock summary error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/inventory/adjust — manual stock adjustment
router.post('/adjust', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { productId, warehouseId, quantity, note } = req.body
    if (!productId || !warehouseId || quantity == null) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' })
    }

    // Get current stock
    const [lots] = await connection.execute(
      'SELECT id, quantity_remaining FROM stock_lots WHERE product_id = ? AND warehouse_id = ? AND quantity_remaining > 0 ORDER BY received_at ASC',
      [productId, warehouseId]
    )
    const currentStock = lots.reduce((s, l) => s + l.quantity_remaining, 0)
    const diff = quantity - currentStock

    if (diff === 0) {
      await connection.rollback()
      return res.json({ message: 'สต๊อกไม่มีการเปลี่ยนแปลง' })
    }

    if (diff > 0) {
      // Add stock
      const costRows = await connection.execute(
        'SELECT cost_per_unit FROM stock_lots WHERE product_id = ? ORDER BY received_at DESC LIMIT 1',
        [productId]
      )
      const costPerUnit = costRows[0]?.[0]?.cost_per_unit || 0
      await connection.execute(
        'INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit) VALUES (?, ?, ?, ?)',
        [productId, warehouseId, diff, costPerUnit]
      )
    } else {
      // Deduct stock (FIFO)
      const { deductStockFIFO } = require('../../utils/fifo')
      await deductStockFIFO(connection, productId, warehouseId, Math.abs(diff))
    }

    await connection.execute(
      `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, reference_type, note, created_by)
       VALUES (?, ?, 'ADJUST', ?, 'MANUAL', ?, ?)`,
      [productId, warehouseId, diff, note || 'ปรับยอดสต๊อก', req.user.id]
    )

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'stock_adjustment', entityId: null,
      description: `ปรับยอดสต๊อก productId=${productId} diff=${diff}`,
      oldValues: { currentStock },
      newValues: { productId, warehouseId, newQuantity: quantity, diff, note },
      req,
    })

    await connection.commit()
    res.json({ message: 'ปรับยอดสต๊อกสำเร็จ', diff })
  } catch (error) {
    await connection.rollback()
    console.error('Adjust stock error:', error)
    res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

module.exports = router

