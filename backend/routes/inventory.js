const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')
const { deductStockFIFO } = require('../utils/fifo')
const { generateDocNumber } = require('../utils/docNumber')

router.use(auth, companyGuard)

// GET /api/inventory/stock — current stock levels
router.get('/stock', async (req, res) => {
  try {
    const { warehouseId, lowStock } = req.query
    let query = `
      SELECT p.id, p.sku, p.name, p.unit, p.min_stock, p.cost_price, p.selling_price,
        COALESCE(SUM(sl.quantity_remaining), 0) as total_stock,
        w.name as warehouse_name
      FROM products p
      LEFT JOIN stock_lots sl ON p.id = sl.product_id AND sl.quantity_remaining > 0
      LEFT JOIN warehouses w ON sl.warehouse_id = w.id
      WHERE p.company_id = ? AND p.is_active = TRUE`
    const params = [req.user.companyId]

    if (warehouseId) {
      query += ' AND sl.warehouse_id = ?'
      params.push(warehouseId)
    }

    query += ' GROUP BY p.id, w.id'

    if (lowStock === 'true') {
      query += ' HAVING total_stock <= p.min_stock'
    }

    query += ' ORDER BY p.name'
    const stock = await executeQuery(query, params)
    res.json(stock)
  } catch (error) {
    console.error('Get stock error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/inventory/receive — receive stock (IN)
router.post('/receive', async (req, res) => {
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
router.post('/issue', async (req, res) => {
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
    const { productId, type, from, to } = req.query
    let query = `
      SELECT st.*, p.name as product_name, p.sku, w.name as warehouse_name,
        u.full_name as created_by_name
      FROM stock_transactions st
      JOIN products p ON st.product_id = p.id
      JOIN warehouses w ON st.warehouse_id = w.id
      LEFT JOIN users u ON st.created_by = u.id
      WHERE p.company_id = ?`
    const params = [req.user.companyId]

    if (productId) { query += ' AND st.product_id = ?'; params.push(productId) }
    if (type) { query += ' AND st.type = ?'; params.push(type) }
    if (from) { query += ' AND st.created_at >= ?'; params.push(from) }
    if (to) { query += ' AND st.created_at <= ?'; params.push(to) }

    query += ' ORDER BY st.created_at DESC LIMIT 500'
    const transactions = await executeQuery(query, params)
    res.json(transactions)
  } catch (error) {
    console.error('Get transactions error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/inventory/warehouses
router.get('/warehouses', async (req, res) => {
  try {
    const warehouses = await executeQuery(
      'SELECT * FROM warehouses WHERE company_id = ? AND is_active = TRUE ORDER BY name',
      [req.user.companyId]
    )
    res.json(warehouses)
  } catch (error) {
    console.error('Get warehouses error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
