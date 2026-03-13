const express = require('express')
const router = express.Router()
const { executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/reports/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const today = new Date().toISOString().split('T')[0]

    const [todaySales] = await executeQuery(
      `SELECT COUNT(*) as count, COALESCE(SUM(net_amount), 0) as total
       FROM sales WHERE company_id = ? AND DATE(sold_at) = ? AND status = 'completed'`,
      [companyId, today]
    )
    const [monthlySales] = await executeQuery(
      `SELECT COUNT(*) as count, COALESCE(SUM(net_amount), 0) as total
       FROM sales WHERE company_id = ? AND MONTH(sold_at) = MONTH(NOW()) AND YEAR(sold_at) = YEAR(NOW()) AND status = 'completed'`,
      [companyId]
    )
    const lowStock = await executeQuery(
      `SELECT p.id, p.name, p.sku, p.min_stock,
         COALESCE(SUM(sl.quantity_remaining), 0) as total_stock
       FROM products p
       LEFT JOIN stock_lots sl ON p.id = sl.product_id AND sl.quantity_remaining > 0
       WHERE p.company_id = ? AND p.is_active = TRUE
       GROUP BY p.id HAVING total_stock <= p.min_stock ORDER BY total_stock ASC LIMIT 10`,
      [companyId]
    )
    const pendingOrders = await executeQuery(
      `SELECT COUNT(*) as count FROM online_orders
       WHERE company_id = ? AND order_status IN ('pending', 'confirmed', 'packing')`,
      [companyId]
    )
    const recentSales = await executeQuery(
      `SELECT s.id, s.invoice_number, s.net_amount, s.sold_at, s.sale_type,
         u.full_name as cashier_name
       FROM sales s LEFT JOIN users u ON s.cashier_id = u.id
       WHERE s.company_id = ? AND s.status = 'completed'
       ORDER BY s.sold_at DESC LIMIT 5`,
      [companyId]
    )

    res.json({
      todaySales: todaySales[0] || { count: 0, total: 0 },
      monthlySales: monthlySales[0] || { count: 0, total: 0 },
      lowStockProducts: lowStock,
      pendingOrders: pendingOrders[0]?.count || 0,
      recentSales,
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/sales-summary
router.get('/sales-summary', async (req, res) => {
  try {
    const { from, to, groupBy } = req.query
    const companyId = req.user.companyId
    let dateGroup = 'DATE(s.sold_at)'
    if (groupBy === 'month') dateGroup = "DATE_FORMAT(s.sold_at, '%Y-%m')"
    if (groupBy === 'week') dateGroup = "DATE_FORMAT(s.sold_at, '%x-W%v')"

    let query = `SELECT ${dateGroup} as period, COUNT(*) as sales_count,
       SUM(net_amount) as total_revenue, SUM(discount_amount) as total_discount,
       SUM(vat_amount) as total_vat
       FROM sales s WHERE s.company_id = ? AND s.status = 'completed'`
    const params = [companyId]
    if (from) { query += ' AND s.sold_at >= ?'; params.push(from) }
    if (to) { query += ' AND s.sold_at <= ?'; params.push(to) }
    query += ` GROUP BY ${dateGroup} ORDER BY period DESC`

    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('Sales summary error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/top-products — Top 10 สินค้าขายดี
router.get('/top-products', async (req, res) => {
  try {
    const { from, to } = req.query
    const companyId = req.user.companyId
    let query = `
      SELECT p.id, p.name, p.sku, p.selling_price,
        SUM(si.quantity) as total_qty,
        SUM(si.subtotal) as total_revenue,
        SUM(si.quantity * si.cost_price) as total_cost
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE s.company_id = ? AND s.status = 'completed'`
    const params = [companyId]
    if (from) { query += ' AND s.sold_at >= ?'; params.push(from) }
    if (to) { query += ' AND s.sold_at <= ?'; params.push(to) }
    query += ' GROUP BY p.id ORDER BY total_qty DESC LIMIT 10'
    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('Top products error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/sales-trend — Sales trend (last 30 days)
router.get('/sales-trend', async (req, res) => {
  try {
    const { days } = req.query
    const companyId = req.user.companyId
    const numDays = parseInt(days) || 30
    const trend = await executeQuery(
      `SELECT DATE(s.sold_at) as date,
        COUNT(*) as sales_count,
        COALESCE(SUM(s.net_amount), 0) as revenue,
        COALESCE(SUM(s.discount_amount), 0) as discount
       FROM sales s
       WHERE s.company_id = ? AND s.status = 'completed'
         AND s.sold_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(s.sold_at)
       ORDER BY date ASC`,
      [companyId, numDays]
    )
    res.json(trend)
  } catch (error) {
    console.error('Sales trend error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
