const { pool } = require('../config/db')

/**
 * FIFO Stock Deduction
 * Deducts quantity from oldest stock lots first
 * Returns array of { lotId, quantity, costPerUnit } for cost tracking
 */
const deductStockFIFO = async (connection, productId, warehouseId, quantityNeeded) => {
  // Get lots ordered by oldest first (FIFO)
  const [lots] = await connection.execute(
    `SELECT id, quantity_remaining, cost_per_unit 
     FROM stock_lots 
     WHERE product_id = ? AND warehouse_id = ? AND quantity_remaining > 0 
     ORDER BY received_at ASC`,
    [productId, warehouseId]
  )

  let remaining = quantityNeeded
  const deductions = []
  let totalCost = 0

  for (const lot of lots) {
    if (remaining <= 0) break

    const deductQty = Math.min(remaining, lot.quantity_remaining)

    // Update lot remaining
    await connection.execute(
      'UPDATE stock_lots SET quantity_remaining = quantity_remaining - ? WHERE id = ?',
      [deductQty, lot.id]
    )

    deductions.push({
      lotId: lot.id,
      quantity: deductQty,
      costPerUnit: parseFloat(lot.cost_per_unit),
    })

    totalCost += deductQty * parseFloat(lot.cost_per_unit)
    remaining -= deductQty
  }

  if (remaining > 0) {
    throw new Error(`สินค้า ID ${productId} มีสต๊อกไม่เพียงพอ (ขาดอีก ${remaining} ชิ้น)`)
  }

  const weightedAvgCost = totalCost / quantityNeeded

  return { deductions, totalCost, weightedAvgCost }
}

/**
 * Get total stock for a product across specific or all warehouses
 */
const getProductStock = async (productId, warehouseId = null) => {
  let query = `SELECT COALESCE(SUM(quantity_remaining), 0) as total_stock 
               FROM stock_lots WHERE product_id = ? AND quantity_remaining > 0`
  const params = [productId]

  if (warehouseId) {
    query += ' AND warehouse_id = ?'
    params.push(warehouseId)
  }

  const [rows] = await pool.execute(query, params)
  return rows[0].total_stock
}

module.exports = { deductStockFIFO, getProductStock }
