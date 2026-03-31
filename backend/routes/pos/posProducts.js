const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')

router.use(auth, companyGuard)

// ====================================================================
// POS-specific product endpoints
// Optimized queries for the POS checkout screen
// ====================================================================

// ------------------------------------
// GET /api/pos-products/best-sellers
// Top selling products by quantity sold (last 30 days by default)
// ------------------------------------
router.get('/best-sellers', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const limit = Math.min(parseInt(req.query.limit) || 20, 50)
    const days = Math.min(parseInt(req.query.days) || 30, 365)

    const products = await executeQuery(`
      SELECT p.*, COALESCE(stock_agg.total_stock, 0) as total_stock,
             bs.total_qty_sold, bs.total_times_sold
      FROM (
        SELECT si.product_id,
               SUM(si.quantity) as total_qty_sold,
               COUNT(DISTINCT si.sale_id) as total_times_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.company_id = ?
          AND s.status = 'completed'
          AND s.sold_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          AND si.product_id IS NOT NULL
        GROUP BY si.product_id
        ORDER BY total_qty_sold DESC
        LIMIT ?
      ) bs
      JOIN products p ON bs.product_id = p.id AND p.is_active = TRUE
      LEFT JOIN (
        SELECT sl.product_id, SUM(sl.quantity_remaining) as total_stock
        FROM stock_lots sl
        JOIN warehouses w ON sl.warehouse_id = w.id AND w.company_id = ?
        GROUP BY sl.product_id
      ) stock_agg ON stock_agg.product_id = p.id
      ORDER BY bs.total_qty_sold DESC
    `, [companyId, days, limit, companyId])

    // Fetch attributes
    if (products.length > 0) {
      const productIds = products.map(p => p.id)
      const attrs = await executeQuery(`
        SELECT pa.product_id, pag.id as group_id, pag.name as group_name,
               pav.id as value_id, pav.value as value_name
        FROM product_attributes pa
        JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
        JOIN product_attribute_groups pag ON pav.group_id = pag.id
        WHERE pa.product_id IN (${productIds.map(() => '?').join(',')})
        ORDER BY pag.sort_order, pav.sort_order
      `, productIds)
      const attrMap = {}
      for (const a of attrs) {
        if (!attrMap[a.product_id]) attrMap[a.product_id] = []
        attrMap[a.product_id].push({
          groupId: a.group_id, groupName: a.group_name,
          valueId: a.value_id, valueName: a.value_name,
        })
      }
      for (const p of products) { p.attributes = attrMap[p.id] || [] }
    }

    res.json(products)
  } catch (error) {
    console.error('Get best sellers error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ------------------------------------
// GET /api/pos-products/recent
// Recently sold products (unique, ordered by last sold time)
// ------------------------------------
router.get('/recent', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const limit = Math.min(parseInt(req.query.limit) || 20, 50)
    const cashierId = req.query.cashierId || req.user.id

    const products = await executeQuery(`
      SELECT p.*, COALESCE(stock_agg.total_stock, 0) as total_stock,
             rc.last_sold_at
      FROM (
        SELECT si.product_id, MAX(s.sold_at) as last_sold_at
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.company_id = ?
          AND s.status = 'completed'
          AND s.cashier_id = ?
          AND si.product_id IS NOT NULL
        GROUP BY si.product_id
        ORDER BY last_sold_at DESC
        LIMIT ?
      ) rc
      JOIN products p ON rc.product_id = p.id AND p.is_active = TRUE
      LEFT JOIN (
        SELECT sl.product_id, SUM(sl.quantity_remaining) as total_stock
        FROM stock_lots sl
        JOIN warehouses w ON sl.warehouse_id = w.id AND w.company_id = ?
        GROUP BY sl.product_id
      ) stock_agg ON stock_agg.product_id = p.id
      ORDER BY rc.last_sold_at DESC
    `, [companyId, cashierId, limit, companyId])

    // Fetch attributes
    if (products.length > 0) {
      const productIds = products.map(p => p.id)
      const attrs = await executeQuery(`
        SELECT pa.product_id, pag.id as group_id, pag.name as group_name,
               pav.id as value_id, pav.value as value_name
        FROM product_attributes pa
        JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
        JOIN product_attribute_groups pag ON pav.group_id = pag.id
        WHERE pa.product_id IN (${productIds.map(() => '?').join(',')})
        ORDER BY pag.sort_order, pav.sort_order
      `, productIds)
      const attrMap = {}
      for (const a of attrs) {
        if (!attrMap[a.product_id]) attrMap[a.product_id] = []
        attrMap[a.product_id].push({
          groupId: a.group_id, groupName: a.group_name,
          valueId: a.value_id, valueName: a.value_name,
        })
      }
      for (const p of products) { p.attributes = attrMap[p.id] || [] }
    }

    res.json(products)
  } catch (error) {
    console.error('Get recent products error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ------------------------------------
// GET /api/pos-products/favorites
// Get favorite/pinned products for the current user
// ------------------------------------
router.get('/favorites', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const userId = req.user.id

    const products = await executeQuery(`
      SELECT p.*, COALESCE(stock_agg.total_stock, 0) as total_stock,
             pf.created_at as favorited_at
      FROM pos_favorite_products pf
      JOIN products p ON pf.product_id = p.id AND p.is_active = TRUE
      LEFT JOIN (
        SELECT sl.product_id, SUM(sl.quantity_remaining) as total_stock
        FROM stock_lots sl
        JOIN warehouses w ON sl.warehouse_id = w.id AND w.company_id = ?
        GROUP BY sl.product_id
      ) stock_agg ON stock_agg.product_id = p.id
      WHERE pf.user_id = ? AND pf.company_id = ?
      ORDER BY pf.sort_order ASC, pf.created_at ASC
    `, [companyId, userId, companyId])

    // Fetch attributes
    if (products.length > 0) {
      const productIds = products.map(p => p.id)
      const attrs = await executeQuery(`
        SELECT pa.product_id, pag.id as group_id, pag.name as group_name,
               pav.id as value_id, pav.value as value_name
        FROM product_attributes pa
        JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
        JOIN product_attribute_groups pag ON pav.group_id = pag.id
        WHERE pa.product_id IN (${productIds.map(() => '?').join(',')})
        ORDER BY pag.sort_order, pav.sort_order
      `, productIds)
      const attrMap = {}
      for (const a of attrs) {
        if (!attrMap[a.product_id]) attrMap[a.product_id] = []
        attrMap[a.product_id].push({
          groupId: a.group_id, groupName: a.group_name,
          valueId: a.value_id, valueName: a.value_name,
        })
      }
      for (const p of products) { p.attributes = attrMap[p.id] || [] }
    }

    res.json(products)
  } catch (error) {
    // Table might not exist yet — return empty array gracefully
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.json([])
    }
    console.error('Get favorites error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ------------------------------------
// POST /api/pos-products/favorites
// Add a product to favorites
// ------------------------------------
router.post('/favorites', async (req, res) => {
  try {
    const { productId } = req.body
    if (!productId) return res.status(400).json({ message: 'กรุณาระบุสินค้า' })

    const companyId = req.user.companyId
    const userId = req.user.id

    // Get next sort order
    const [maxResult] = await executeQuery(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM pos_favorite_products WHERE user_id = ? AND company_id = ?',
      [userId, companyId]
    )

    await executeQuery(
      'INSERT IGNORE INTO pos_favorite_products (user_id, company_id, product_id, sort_order) VALUES (?, ?, ?, ?)',
      [userId, companyId, productId, maxResult.next_order]
    )

    res.status(201).json({ message: 'เพิ่มรายการโปรดสำเร็จ' })
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: 'กรุณารัน migration สร้างตาราง pos_favorite_products ก่อน' })
    }
    console.error('Add favorite error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ------------------------------------
// DELETE /api/pos-products/favorites/:productId
// Remove a product from favorites
// ------------------------------------
router.delete('/favorites/:productId', async (req, res) => {
  try {
    await executeQuery(
      'DELETE FROM pos_favorite_products WHERE user_id = ? AND company_id = ? AND product_id = ?',
      [req.user.id, req.user.companyId, req.params.productId]
    )

    res.json({ message: 'ลบรายการโปรดสำเร็จ' })
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.json({ message: 'ลบรายการโปรดสำเร็จ' })
    }
    console.error('Remove favorite error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
