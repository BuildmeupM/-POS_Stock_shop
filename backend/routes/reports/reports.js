const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/reports/dashboard — Executive Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const today = new Date().toISOString().split('T')[0]

    // === ยอดขาย ===
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
    // ยอดขายเดือนที่แล้ว (เทียบ)
    const [lastMonthSales] = await executeQuery(
      `SELECT COALESCE(SUM(net_amount), 0) as total
       FROM sales WHERE company_id = ? AND MONTH(sold_at) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))
       AND YEAR(sold_at) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND status = 'completed'`,
      [companyId]
    )

    // === กำไร/ต้นทุน เดือนนี้ ===
    const [monthlyCogs] = await executeQuery(
      `SELECT COALESCE(SUM(si.quantity * si.cost_price), 0) as total_cost
       FROM sale_items si JOIN sales s ON si.sale_id = s.id
       WHERE s.company_id = ? AND MONTH(s.sold_at) = MONTH(NOW()) AND YEAR(s.sold_at) = YEAR(NOW())
       AND s.status = 'completed'`, [companyId]
    )
    const [monthlyExpenses] = await executeQuery(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM expenses WHERE company_id = ? AND MONTH(expense_date) = MONTH(NOW())
       AND YEAR(expense_date) = YEAR(NOW()) AND status = 'approved'`, [companyId]
    )

    // === สต๊อก ===
    const lowStock = await executeQuery(
      `SELECT p.id, p.name, p.sku, p.min_stock,
         COALESCE(SUM(sl.quantity_remaining), 0) as total_stock
       FROM products p
       LEFT JOIN stock_lots sl ON p.id = sl.product_id AND sl.quantity_remaining > 0
       WHERE p.company_id = ? AND p.is_active = TRUE
       GROUP BY p.id HAVING total_stock <= p.min_stock ORDER BY total_stock ASC LIMIT 10`,
      [companyId]
    )
    const [stockValue] = await executeQuery(
      `SELECT COALESCE(SUM(sl.quantity_remaining * sl.cost_per_unit), 0) as cost_value,
              COUNT(DISTINCT sl.product_id) as product_count,
              COALESCE(SUM(sl.quantity_remaining), 0) as total_qty
       FROM stock_lots sl JOIN products p ON sl.product_id = p.id
       WHERE p.company_id = ? AND sl.quantity_remaining > 0`, [companyId]
    )

    // === ออเดอร์ ===
    const pendingOrders = await executeQuery(
      `SELECT COUNT(*) as count FROM online_orders
       WHERE company_id = ? AND order_status IN ('pending', 'confirmed', 'packing')`, [companyId]
    )

    // === จัดซื้อ ===
    const [pendingPO] = await executeQuery(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
       FROM purchase_orders WHERE company_id = ? AND status IN ('draft', 'approved', 'partial')`, [companyId]
    )

    // === เจ้าหนี้ค้างจ่าย ===
    const [unpaidInvoices] = await executeQuery(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_amount - paid_amount), 0) as total
       FROM purchase_invoices WHERE company_id = ? AND status IN ('pending', 'partial')`, [companyId]
    )

    // === ฝากขาย ===
    const [consignmentSummary] = await executeQuery(
      `SELECT COALESCE(SUM(cs.quantity_on_hand), 0) as total_on_hand,
              COALESCE(SUM(cs.quantity_on_hand * cs.selling_price), 0) as retail_value
       FROM consignment_stock cs
       JOIN consignment_agreements ca ON cs.agreement_id = ca.id
       WHERE ca.company_id = ? AND ca.status = 'active'`, [companyId]
    )

    // === การขายล่าสุด ===
    const recentSales = await executeQuery(
      `SELECT s.id, s.invoice_number, s.net_amount, s.sold_at, s.sale_type,
         u.full_name as cashier_name
       FROM sales s LEFT JOIN users u ON s.cashier_id = u.id
       WHERE s.company_id = ? AND s.status = 'completed'
       ORDER BY s.sold_at DESC LIMIT 5`, [companyId]
    )

    // === คำนวณ ===
    const monthlyRevenue = parseFloat(monthlySales[0]?.total) || 0
    const lastMonthRevenue = parseFloat(lastMonthSales[0]?.total) || 0
    const cogs = parseFloat(monthlyCogs[0]?.total_cost) || 0
    const expenses = parseFloat(monthlyExpenses[0]?.total) || 0
    const grossProfit = monthlyRevenue - cogs
    const netProfit = grossProfit - expenses
    const growthPercent = lastMonthRevenue > 0
      ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue * 100) : 0

    res.json({
      todaySales: { count: todaySales[0]?.count || 0, total: parseFloat(todaySales[0]?.total) || 0 },
      monthlySales: { count: monthlySales[0]?.count || 0, total: monthlyRevenue },
      lastMonthTotal: lastMonthRevenue,
      growthPercent: Math.round(growthPercent * 10) / 10,
      grossProfit,
      netProfit,
      monthlyCogs: cogs,
      monthlyExpenses: expenses,
      stockValue: {
        costValue: parseFloat(stockValue[0]?.cost_value) || 0,
        productCount: parseInt(stockValue[0]?.product_count) || 0,
        totalQty: parseInt(stockValue[0]?.total_qty) || 0,
      },
      lowStockProducts: lowStock,
      pendingOrders: pendingOrders[0]?.count || 0,
      pendingPO: { count: pendingPO[0]?.count || 0, total: parseFloat(pendingPO[0]?.total) || 0 },
      unpaidInvoices: { count: unpaidInvoices[0]?.count || 0, total: parseFloat(unpaidInvoices[0]?.total) || 0 },
      consignment: {
        totalOnHand: parseInt(consignmentSummary[0]?.total_on_hand) || 0,
        retailValue: parseFloat(consignmentSummary[0]?.retail_value) || 0,
      },
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

// GET /api/reports/sales-by-employee — ยอดขายตามพนักงาน
router.get('/sales-by-employee', async (req, res) => {
  try {
    const { from, to } = req.query
    const companyId = req.user.companyId
    let filter = ''
    const params = [companyId]
    if (from) { filter += ' AND s.sold_at >= ?'; params.push(from) }
    if (to) { filter += ' AND s.sold_at <= ?'; params.push(to) }

    const rows = await executeQuery(`
      SELECT u.id, u.full_name, u.nick_name,
        COUNT(s.id) as sale_count,
        COALESCE(SUM(s.net_amount), 0) as total_revenue,
        COALESCE(SUM(s.discount_amount), 0) as total_discount,
        COALESCE(SUM(s.vat_amount), 0) as total_vat,
        COALESCE(AVG(s.net_amount), 0) as avg_per_sale
      FROM sales s
      JOIN users u ON s.cashier_id = u.id
      WHERE s.company_id = ? AND s.status = 'completed' ${filter}
      GROUP BY u.id
      ORDER BY total_revenue DESC
    `, params)
    res.json(rows)
  } catch (error) {
    console.error('Sales by employee error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/sales-by-customer — ยอดขายตามลูกค้า
router.get('/sales-by-customer', async (req, res) => {
  try {
    const { from, to } = req.query
    const companyId = req.user.companyId
    let filter = ''
    const params = [companyId]
    if (from) { filter += ' AND s.sold_at >= ?'; params.push(from) }
    if (to) { filter += ' AND s.sold_at <= ?'; params.push(to) }

    const rows = await executeQuery(`
      SELECT COALESCE(c.id, 0) as id,
        COALESCE(c.name, 'ลูกค้าทั่วไป (Walk-in)') as customer_name,
        c.customer_type,
        COUNT(s.id) as sale_count,
        COALESCE(SUM(s.net_amount), 0) as total_revenue,
        COALESCE(SUM(s.discount_amount), 0) as total_discount
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.company_id = ? AND s.status = 'completed' ${filter}
      GROUP BY COALESCE(c.id, 0)
      ORDER BY total_revenue DESC
    `, params)
    res.json(rows)
  } catch (error) {
    console.error('Sales by customer error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/sales-by-category — ยอดขายตามหมวดหมู่
router.get('/sales-by-category', async (req, res) => {
  try {
    const { from, to } = req.query
    const companyId = req.user.companyId
    let filter = ''
    const params = [companyId]
    if (from) { filter += ' AND s.sold_at >= ?'; params.push(from) }
    if (to) { filter += ' AND s.sold_at <= ?'; params.push(to) }

    const rows = await executeQuery(`
      SELECT COALESCE(cat.id, 0) as id,
        COALESCE(cat.name, 'ไม่ระบุหมวดหมู่') as category_name,
        COUNT(DISTINCT s.id) as sale_count,
        SUM(si.quantity) as total_qty,
        COALESCE(SUM(si.subtotal), 0) as total_revenue,
        COALESCE(SUM(si.quantity * si.cost_price), 0) as total_cost,
        COALESCE(SUM(si.subtotal), 0) - COALESCE(SUM(si.quantity * si.cost_price), 0) as gross_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      LEFT JOIN products p ON si.product_id = p.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      WHERE s.company_id = ? AND s.status = 'completed' ${filter}
      GROUP BY COALESCE(cat.id, 0)
      ORDER BY total_revenue DESC
    `, params)
    res.json(rows)
  } catch (error) {
    console.error('Sales by category error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/slow-moving — สินค้าเคลื่อนไหวช้า
router.get('/slow-moving', async (req, res) => {
  try {
    const { days } = req.query
    const companyId = req.user.companyId
    const numDays = parseInt(days) || 30

    const rows = await executeQuery(`
      SELECT p.id, p.sku, p.name, p.unit, p.selling_price, p.cost_price,
        COALESCE(SUM(sl.quantity_remaining), 0) as qty_on_hand,
        COALESCE(SUM(sl.quantity_remaining * sl.cost_per_unit), 0) as stock_value,
        COALESCE(sold.total_sold, 0) as sold_last_period,
        MAX(sl.received_at) as last_received
      FROM products p
      LEFT JOIN stock_lots sl ON sl.product_id = p.id AND sl.quantity_remaining > 0
      LEFT JOIN (
        SELECT si.product_id, SUM(si.quantity) as total_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.company_id = ? AND s.status = 'completed'
          AND s.sold_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY si.product_id
      ) sold ON sold.product_id = p.id
      WHERE p.company_id = ? AND p.is_active = TRUE
      GROUP BY p.id
      HAVING qty_on_hand > 0 AND sold_last_period = 0
      ORDER BY stock_value DESC
    `, [companyId, numDays, companyId])

    res.json(rows)
  } catch (error) {
    console.error('Slow moving error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ============================================================
// ACCOUNTING REPORTS
// ============================================================

// GET /api/reports/trial-balance — งบทดลอง (ยอดยกมา + เคลื่อนไหว + คงเหลือ)
router.get('/trial-balance', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { from, to } = req.query

    // Determine fiscal year start (Jan 1 of the year of `from`)
    // Revenue/Expense accounts reset at fiscal year start
    let fiscalYearStart = null
    if (from) {
      const y = new Date(from).getFullYear()
      fiscalYearStart = `${y}-01-01`
    }

    // 1) ยอดยกมา (Brought Forward)
    //    - บัญชีสินทรัพย์/หนี้สิน/ส่วนของเจ้าของ (1,2,3) → สะสมตั้งแต่เริ่มต้นจนก่อน from
    //    - บัญชีรายได้/ค่าใช้จ่าย (4,5) → สะสมตั้งแต่ต้นปีบัญชีจนก่อน from
    const allAccounts = await executeQuery(
      'SELECT id, account_code, name, account_type FROM accounts WHERE company_id = ? AND is_active = TRUE ORDER BY account_code',
      [companyId]
    )

    const bfMap = {}
    if (from) {
      // Balance sheet accounts (asset/liability/equity): all time before `from`
      const bsRows = await executeQuery(`
        SELECT jl.account_id as id,
          COALESCE(SUM(jl.debit_amount), 0) as bf_debit,
          COALESCE(SUM(jl.credit_amount), 0) as bf_credit
        FROM journal_lines jl
        JOIN journal_entries je ON jl.journal_entry_id = je.id
        JOIN accounts a ON jl.account_id = a.id
        WHERE je.company_id = ? AND je.status = 'posted'
          AND je.entry_date < ?
          AND a.account_type IN ('asset', 'liability', 'equity')
        GROUP BY jl.account_id
      `, [companyId, from])
      bsRows.forEach(r => { bfMap[r.id] = { bf_debit: parseFloat(r.bf_debit), bf_credit: parseFloat(r.bf_credit) } })

      // Income/Expense accounts: from fiscal year start to before `from`
      if (fiscalYearStart && fiscalYearStart < from) {
        const plRows = await executeQuery(`
          SELECT jl.account_id as id,
            COALESCE(SUM(jl.debit_amount), 0) as bf_debit,
            COALESCE(SUM(jl.credit_amount), 0) as bf_credit
          FROM journal_lines jl
          JOIN journal_entries je ON jl.journal_entry_id = je.id
          JOIN accounts a ON jl.account_id = a.id
          WHERE je.company_id = ? AND je.status = 'posted'
            AND je.entry_date >= ? AND je.entry_date < ?
            AND a.account_type IN ('revenue', 'expense')
          GROUP BY jl.account_id
        `, [companyId, fiscalYearStart, from])
        plRows.forEach(r => { bfMap[r.id] = { bf_debit: parseFloat(r.bf_debit), bf_credit: parseFloat(r.bf_credit) } })
      }
    }

    // 2) เคลื่อนไหวระหว่างงวด (Movement) — from ถึง to
    const mvMap = {}
    const mvParams = [companyId]
    let mvFilter = ''
    if (from) { mvFilter += ' AND je.entry_date >= ?'; mvParams.push(from) }
    if (to) { mvFilter += ' AND je.entry_date <= ?'; mvParams.push(to) }

    const mvRows = await executeQuery(`
      SELECT jl.account_id as id,
        COALESCE(SUM(jl.debit_amount), 0) as mv_debit,
        COALESCE(SUM(jl.credit_amount), 0) as mv_credit
      FROM journal_lines jl
      JOIN journal_entries je ON jl.journal_entry_id = je.id
      WHERE je.company_id = ? AND je.status = 'posted' ${mvFilter}
      GROUP BY jl.account_id
    `, mvParams)
    mvRows.forEach(r => { mvMap[r.id] = { mv_debit: parseFloat(r.mv_debit), mv_credit: parseFloat(r.mv_credit) } })

    // 3) Merge — เรียงตาม account_code
    const accounts = allAccounts.map(acc => {
      const bf = bfMap[acc.id] || { bf_debit: 0, bf_credit: 0 }
      const mv = mvMap[acc.id] || { mv_debit: 0, mv_credit: 0 }

      // Convert BF to single-side balance
      const bfNet = bf.bf_debit - bf.bf_credit
      const bfDebit = bfNet >= 0 ? bfNet : 0
      const bfCredit = bfNet < 0 ? Math.abs(bfNet) : 0

      // Ending balance = BF net + movement net
      const endNet = bfNet + (mv.mv_debit - mv.mv_credit)
      const endDebit = endNet >= 0 ? endNet : 0
      const endCredit = endNet < 0 ? Math.abs(endNet) : 0

      return {
        id: acc.id,
        account_code: acc.account_code,
        name: acc.name,
        account_type: acc.account_type,
        bf_debit: bfDebit,
        bf_credit: bfCredit,
        mv_debit: mv.mv_debit,
        mv_credit: mv.mv_credit,
        end_debit: endDebit,
        end_credit: endCredit,
      }
    }).filter(a => a.bf_debit > 0 || a.bf_credit > 0 || a.mv_debit > 0 || a.mv_credit > 0)

    const totals = accounts.reduce((t, a) => ({
      bf_debit: t.bf_debit + a.bf_debit,
      bf_credit: t.bf_credit + a.bf_credit,
      mv_debit: t.mv_debit + a.mv_debit,
      mv_credit: t.mv_credit + a.mv_credit,
      end_debit: t.end_debit + a.end_debit,
      end_credit: t.end_credit + a.end_credit,
    }), { bf_debit: 0, bf_credit: 0, mv_debit: 0, mv_credit: 0, end_debit: 0, end_credit: 0 })

    res.json({ accounts, totals })
  } catch (error) {
    console.error('Trial balance error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/profit-loss — งบกำไรขาดทุน
router.get('/profit-loss', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { from, to } = req.query

    let dateFilter = ''
    const params = [companyId]
    if (from) { dateFilter += ' AND je.entry_date >= ?'; params.push(from) }
    if (to) { dateFilter += ' AND je.entry_date <= ?'; params.push(to) }

    // Revenue accounts (credit - debit = revenue)
    const revenue = await executeQuery(`
      SELECT a.id, a.account_code, a.name,
        COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0) as amount
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
        AND je.company_id = ? AND je.status = 'posted' ${dateFilter}
      WHERE a.company_id = ? AND a.account_type = 'revenue' AND a.is_active = TRUE
      GROUP BY a.id
      HAVING amount != 0
      ORDER BY a.account_code
    `, [...params, companyId])

    // Expense accounts (debit - credit = expense)
    const expenses = await executeQuery(`
      SELECT a.id, a.account_code, a.name,
        COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0) as amount
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
        AND je.company_id = ? AND je.status = 'posted' ${dateFilter}
      WHERE a.company_id = ? AND a.account_type = 'expense' AND a.is_active = TRUE
      GROUP BY a.id
      HAVING amount != 0
      ORDER BY a.account_code
    `, [...params, companyId])

    // Also get sales data directly for companies without full journal integration
    const salesParams = [companyId]
    let salesDateFilter = ''
    if (from) { salesDateFilter += ' AND sold_at >= ?'; salesParams.push(from) }
    if (to) { salesDateFilter += ' AND sold_at <= ?'; salesParams.push(to) }

    const [salesSummary] = await executeQuery(`
      SELECT COALESCE(SUM(net_amount), 0) as total_sales,
             COALESCE(SUM(vat_amount), 0) as total_vat,
             COALESCE(SUM(discount_amount), 0) as total_discount
      FROM sales
      WHERE company_id = ? AND status = 'completed' ${salesDateFilter}
    `, salesParams)

    // Get cost of goods sold from sale_items
    const [cogsSummary] = await executeQuery(`
      SELECT COALESCE(SUM(si.quantity * si.cost_price), 0) as total_cogs
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.company_id = ? AND s.status = 'completed' ${salesDateFilter}
    `, salesParams)

    // Get expenses total directly
    const expenseParams = [companyId]
    let expDateFilter = ''
    if (from) { expDateFilter += ' AND expense_date >= ?'; expenseParams.push(from) }
    if (to) { expDateFilter += ' AND expense_date <= ?'; expenseParams.push(to) }

    const [expenseSummary] = await executeQuery(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses,
             COALESCE(SUM(vat_amount), 0) as total_vat,
             COALESCE(SUM(wht_amount), 0) as total_wht
      FROM expenses
      WHERE company_id = ? AND status = 'approved' ${expDateFilter}
    `, expenseParams)

    const totalRevenue = revenue.reduce((s, r) => s + parseFloat(r.amount), 0)
    const totalExpenses = expenses.reduce((s, r) => s + parseFloat(r.amount), 0)

    res.json({
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netProfit: totalRevenue - totalExpenses,
      // Direct data (for companies not yet fully journal-integrated)
      salesData: {
        totalSales: parseFloat(salesSummary.total_sales) || 0,
        totalVat: parseFloat(salesSummary.total_vat) || 0,
        totalDiscount: parseFloat(salesSummary.total_discount) || 0,
        totalCogs: parseFloat(cogsSummary.total_cogs) || 0,
        grossProfit: (parseFloat(salesSummary.total_sales) || 0) - (parseFloat(cogsSummary.total_cogs) || 0),
      },
      expenseData: {
        totalExpenses: parseFloat(expenseSummary.total_expenses) || 0,
        totalVat: parseFloat(expenseSummary.total_vat) || 0,
        totalWht: parseFloat(expenseSummary.total_wht) || 0,
      },
    })
  } catch (error) {
    console.error('Profit & Loss error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/balance-sheet — งบดุล
router.get('/balance-sheet', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { asOf } = req.query

    let dateFilter = ''
    const params = [companyId]
    if (asOf) { dateFilter = ' AND je.entry_date <= ?'; params.push(asOf) }

    const rows = await executeQuery(`
      SELECT a.id, a.account_code, a.name, a.account_type,
        COALESCE(SUM(jl.debit_amount), 0) as total_debit,
        COALESCE(SUM(jl.credit_amount), 0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
        AND je.company_id = ? AND je.status = 'posted' ${dateFilter}
      WHERE a.company_id = ? AND a.is_active = TRUE
        AND a.account_type IN ('asset', 'liability', 'equity')
      GROUP BY a.id
      HAVING total_debit > 0 OR total_credit > 0
      ORDER BY a.account_code
    `, [...params, companyId])

    const assets = rows.filter(r => r.account_type === 'asset').map(r => ({
      ...r, balance: parseFloat(r.total_debit) - parseFloat(r.total_credit)
    }))
    const liabilities = rows.filter(r => r.account_type === 'liability').map(r => ({
      ...r, balance: parseFloat(r.total_credit) - parseFloat(r.total_debit)
    }))
    const equity = rows.filter(r => r.account_type === 'equity').map(r => ({
      ...r, balance: parseFloat(r.total_credit) - parseFloat(r.total_debit)
    }))

    const totalAssets = assets.reduce((s, r) => s + r.balance, 0)
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0)
    const totalEquity = equity.reduce((s, r) => s + r.balance, 0)

    // Get inventory value from stock_lots
    const [stockValue] = await executeQuery(`
      SELECT COALESCE(SUM(sl.quantity_remaining * sl.cost_per_unit), 0) as value
      FROM stock_lots sl
      JOIN products p ON sl.product_id = p.id
      WHERE p.company_id = ? AND sl.quantity_remaining > 0
    `, [companyId])

    res.json({
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      inventoryValue: parseFloat(stockValue.value) || 0,
    })
  } catch (error) {
    console.error('Balance sheet error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/tax-summary — สรุปภาษี
router.get('/tax-summary', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { from, to } = req.query

    // Output VAT (ภาษีขาย) — from sales
    let salesFilter = ''
    const salesParams = [companyId]
    if (from) { salesFilter += ' AND sold_at >= ?'; salesParams.push(from) }
    if (to) { salesFilter += ' AND sold_at <= ?'; salesParams.push(to) }

    const outputVat = await executeQuery(`
      SELECT DATE_FORMAT(sold_at, '%Y-%m') as period,
        COUNT(*) as invoice_count,
        SUM(net_amount) as total_sales,
        SUM(vat_amount) as vat_amount
      FROM sales
      WHERE company_id = ? AND status = 'completed' AND vat_amount > 0 ${salesFilter}
      GROUP BY period
      ORDER BY period DESC
    `, salesParams)

    // Input VAT (ภาษีซื้อ) — from expenses
    let expFilter = ''
    const expParams = [companyId]
    if (from) { expFilter += ' AND expense_date >= ?'; expParams.push(from) }
    if (to) { expFilter += ' AND expense_date <= ?'; expParams.push(to) }

    const inputVat = await executeQuery(`
      SELECT DATE_FORMAT(expense_date, '%Y-%m') as period,
        COUNT(*) as invoice_count,
        SUM(amount) as total_amount,
        SUM(vat_amount) as vat_amount
      FROM expenses
      WHERE company_id = ? AND status = 'approved' AND vat_amount > 0 ${expFilter}
      GROUP BY period
      ORDER BY period DESC
    `, expParams)

    // WHT (ภาษีหัก ณ ที่จ่าย) — from expenses
    const wht = await executeQuery(`
      SELECT DATE_FORMAT(expense_date, '%Y-%m') as period,
        COUNT(*) as doc_count,
        SUM(wht_amount) as wht_amount
      FROM expenses
      WHERE company_id = ? AND status = 'approved' AND wht_amount > 0 ${expFilter}
      GROUP BY period
      ORDER BY period DESC
    `, expParams)

    // Totals
    const totalOutputVat = outputVat.reduce((s, r) => s + parseFloat(r.vat_amount), 0)
    const totalInputVat = inputVat.reduce((s, r) => s + parseFloat(r.vat_amount), 0)
    const totalWht = wht.reduce((s, r) => s + parseFloat(r.wht_amount), 0)

    res.json({
      outputVat,
      inputVat,
      wht,
      totalOutputVat,
      totalInputVat,
      vatPayable: totalOutputVat - totalInputVat,
      totalWht,
    })
  } catch (error) {
    console.error('Tax summary error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/reports/inventory-valuation — มูลค่าสินค้าคงเหลือ
router.get('/inventory-valuation', async (req, res) => {
  try {
    const companyId = req.user.companyId

    const products = await executeQuery(`
      SELECT p.id, p.sku, p.name, p.unit, p.cost_price, p.selling_price,
        COALESCE(SUM(sl.quantity_remaining), 0) as qty_on_hand,
        COALESCE(SUM(sl.quantity_remaining * sl.cost_per_unit), 0) as cost_value,
        COALESCE(SUM(sl.quantity_remaining), 0) * p.selling_price as retail_value
      FROM products p
      LEFT JOIN stock_lots sl ON sl.product_id = p.id AND sl.quantity_remaining > 0
      WHERE p.company_id = ? AND p.is_active = TRUE
      GROUP BY p.id
      HAVING qty_on_hand > 0
      ORDER BY cost_value DESC
    `, [companyId])

    const totalCostValue = products.reduce((s, r) => s + parseFloat(r.cost_value), 0)
    const totalRetailValue = products.reduce((s, r) => s + parseFloat(r.retail_value), 0)
    const totalQty = products.reduce((s, r) => s + parseInt(r.qty_on_hand), 0)

    res.json({
      products,
      totalCostValue,
      totalRetailValue,
      totalQty,
      potentialProfit: totalRetailValue - totalCostValue,
    })
  } catch (error) {
    console.error('Inventory valuation error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
