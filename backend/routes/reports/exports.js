const express = require('express')
const router = express.Router()
const XLSX = require('xlsx')
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')

router.use(auth, companyGuard)

// ====================================================================
// EXPORT: Products to Excel
// GET /api/exports/products
// ====================================================================
router.get('/products', async (req, res) => {
  try {
    const products = await executeQuery(
      `SELECT p.sku, p.barcode, p.name, p.unit, p.cost_price, p.selling_price,
              p.min_selling_price, p.min_stock,
              COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl
                        JOIN warehouses w ON sl.warehouse_id = w.id
                        WHERE sl.product_id = p.id AND w.company_id = p.company_id), 0) as total_stock
       FROM products p
       WHERE p.company_id = ? AND p.is_active = TRUE
       ORDER BY p.name ASC`,
      [req.user.companyId]
    )

    // Fetch attributes for all products
    const productRows = await executeQuery(
      `SELECT p.id, p.sku FROM products p WHERE p.company_id = ? AND p.is_active = TRUE`,
      [req.user.companyId]
    )
    const skuToId = {}
    for (const p of productRows) skuToId[p.sku] = p.id

    let attrMap = {}
    if (productRows.length > 0) {
      const productIds = productRows.map(p => p.id)
      const attrs = await executeQuery(
        `SELECT pa.product_id, pag.name as group_name, pav.value as value_name
         FROM product_attributes pa
         JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
         JOIN product_attribute_groups pag ON pav.group_id = pag.id
         WHERE pa.product_id IN (${productIds.map(() => '?').join(',')})
         ORDER BY pag.sort_order, pav.sort_order`,
        productIds
      )
      for (const a of attrs) {
        if (!attrMap[a.product_id]) attrMap[a.product_id] = []
        attrMap[a.product_id].push(`${a.group_name}: ${a.value_name}`)
      }
    }

    const data = products.map(p => ({
      'SKU': p.sku,
      'Barcode': p.barcode || '',
      'ชื่อสินค้า': p.name,
      'หน่วย': p.unit,
      'ราคาทุน': parseFloat(p.cost_price) || 0,
      'ราคาขาย': parseFloat(p.selling_price) || 0,
      'ราคาขายขั้นต่ำ': parseFloat(p.min_selling_price) || 0,
      'สต๊อกขั้นต่ำ': p.min_stock || 0,
      'สต๊อกคงเหลือ': parseInt(p.total_stock) || 0,
      'แอตทริบิวต์': (attrMap[skuToId[p.sku]] || []).join(', '),
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 18 }, // Barcode
      { wch: 30 }, // Name
      { wch: 10 }, // Unit
      { wch: 12 }, // Cost
      { wch: 12 }, // Selling
      { wch: 15 }, // Min selling
      { wch: 12 }, // Min stock
      { wch: 12 }, // Current stock
      { wch: 30 }, // Attributes
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'สินค้า')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx')
    res.send(buffer)
  } catch (error) {
    console.error('Export products error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งออกสินค้า' })
  }
})

// ====================================================================
// EXPORT: Sales report to Excel
// GET /api/exports/sales?from=&to=&status=
// ====================================================================
router.get('/sales', async (req, res) => {
  try {
    const { from, to, status } = req.query
    let query = `
      SELECT s.invoice_number, s.sold_at, s.customer_name, s.cashier_name,
             s.sale_type, s.total_amount, s.discount_amount, s.vat_amount,
             s.net_amount, s.status, s.payment_method
      FROM sales s
      WHERE s.company_id = ?`
    const params = [req.user.companyId]

    if (from) {
      query += ' AND DATE(s.sold_at) >= ?'
      params.push(from)
    }
    if (to) {
      query += ' AND DATE(s.sold_at) <= ?'
      params.push(to)
    }
    if (status) {
      query += ' AND s.status = ?'
      params.push(status)
    }

    query += ' ORDER BY s.sold_at DESC'
    const sales = await executeQuery(query, params)

    const paymentLabels = {
      cash: 'เงินสด', transfer: 'โอนเงิน', credit_card: 'บัตรเครดิต',
      qr_code: 'QR Code', mixed: 'ผสม',
    }
    const statusLabels = {
      completed: 'สำเร็จ', voided: 'ยกเลิก', pending: 'รอดำเนินการ',
    }
    const typeLabels = { pos: 'POS', online: 'ออนไลน์' }

    const data = sales.map(s => ({
      'เลขบิล': s.invoice_number,
      'วันที่': s.sold_at ? new Date(s.sold_at).toLocaleString('th-TH') : '',
      'ลูกค้า': s.customer_name || '-',
      'แคชเชียร์': s.cashier_name || '-',
      'ช่องทาง': typeLabels[s.sale_type] || s.sale_type || '-',
      'ชำระเงิน': paymentLabels[s.payment_method] || s.payment_method || '-',
      'ยอดรวม': parseFloat(s.total_amount) || 0,
      'ส่วนลด': parseFloat(s.discount_amount) || 0,
      'VAT': parseFloat(s.vat_amount) || 0,
      'ยอดสุทธิ': parseFloat(s.net_amount) || 0,
      'สถานะ': statusLabels[s.status] || s.status,
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    ws['!cols'] = [
      { wch: 18 }, // Invoice
      { wch: 20 }, // Date
      { wch: 20 }, // Customer
      { wch: 15 }, // Cashier
      { wch: 12 }, // Channel
      { wch: 14 }, // Payment
      { wch: 14 }, // Total
      { wch: 12 }, // Discount
      { wch: 12 }, // VAT
      { wch: 14 }, // Net
      { wch: 12 }, // Status
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'รายการขาย')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx')
    res.send(buffer)
  } catch (error) {
    console.error('Export sales error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งออกรายการขาย' })
  }
})

// ====================================================================
// EXPORT: Current stock to Excel
// GET /api/exports/stock
// ====================================================================
router.get('/stock', async (req, res) => {
  try {
    const products = await executeQuery(
      `SELECT p.sku, p.name, p.unit, p.cost_price, p.min_stock,
              COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl
                        JOIN warehouses w ON sl.warehouse_id = w.id
                        WHERE sl.product_id = p.id AND w.company_id = p.company_id), 0) as total_stock
       FROM products p
       WHERE p.company_id = ? AND p.is_active = TRUE
       ORDER BY p.name ASC`,
      [req.user.companyId]
    )

    // Fetch attributes to show as "category"
    const productRows = await executeQuery(
      `SELECT p.id, p.sku FROM products p WHERE p.company_id = ? AND p.is_active = TRUE`,
      [req.user.companyId]
    )
    const skuToId = {}
    for (const p of productRows) skuToId[p.sku] = p.id

    let attrMap = {}
    if (productRows.length > 0) {
      const productIds = productRows.map(p => p.id)
      const attrs = await executeQuery(
        `SELECT pa.product_id, pag.name as group_name, pav.value as value_name
         FROM product_attributes pa
         JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
         JOIN product_attribute_groups pag ON pav.group_id = pag.id
         WHERE pa.product_id IN (${productIds.map(() => '?').join(',')})
         ORDER BY pag.sort_order, pav.sort_order`,
        productIds
      )
      for (const a of attrs) {
        if (!attrMap[a.product_id]) attrMap[a.product_id] = []
        attrMap[a.product_id].push(a.value_name)
      }
    }

    const data = products.map(p => {
      const stock = parseInt(p.total_stock) || 0
      const cost = parseFloat(p.cost_price) || 0
      return {
        'SKU': p.sku,
        'ชื่อสินค้า': p.name,
        'หมวดหมู่': (attrMap[skuToId[p.sku]] || []).join(', ') || '-',
        'สต๊อกคงเหลือ': stock,
        'หน่วย': p.unit,
        'ราคาทุน': cost,
        'มูลค่าสต๊อก': stock * cost,
        'สต๊อกขั้นต่ำ': p.min_stock || 0,
        'สถานะ': stock <= 0 ? 'หมดสต๊อก' : stock <= (p.min_stock || 0) ? 'ใกล้หมด' : 'ปกติ',
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    ws['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 30 }, // Name
      { wch: 20 }, // Category
      { wch: 14 }, // Stock
      { wch: 10 }, // Unit
      { wch: 12 }, // Cost
      { wch: 14 }, // Stock value
      { wch: 12 }, // Min stock
      { wch: 12 }, // Status
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'สต๊อกสินค้า')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=stock-report.xlsx')
    res.send(buffer)
  } catch (error) {
    console.error('Export stock error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งออกสต๊อก' })
  }
})

// ====================================================================
// EXPORT: Expenses to Excel
// GET /api/exports/expenses?from=&to=&status=
// ====================================================================
router.get('/expenses', async (req, res) => {
  try {
    const { from, to, status } = req.query
    let query = `
      SELECT e.expense_number, e.expense_date, e.vendor_name, e.description,
             e.amount, e.vat_amount, e.wht_amount, e.net_amount, e.status
      FROM expenses e
      WHERE e.company_id = ?`
    const params = [req.user.companyId]

    if (from) {
      query += ' AND DATE(e.expense_date) >= ?'
      params.push(from)
    }
    if (to) {
      query += ' AND DATE(e.expense_date) <= ?'
      params.push(to)
    }
    if (status) {
      query += ' AND e.status = ?'
      params.push(status)
    }

    query += ' ORDER BY e.expense_date DESC'
    const expenses = await executeQuery(query, params)

    const statusLabels = {
      approved: 'อนุมัติ', draft: 'ร่าง', pending: 'รอดำเนินการ', voided: 'ยกเลิก',
    }

    const data = expenses.map(e => ({
      'เลขที่': e.expense_number,
      'วันที่': e.expense_date ? new Date(e.expense_date).toLocaleDateString('th-TH') : '',
      'ผู้จำหน่าย': e.vendor_name || '-',
      'รายละเอียด': e.description || '-',
      'ยอดรวม': parseFloat(e.amount) || 0,
      'VAT': parseFloat(e.vat_amount) || 0,
      'หัก ณ ที่จ่าย': parseFloat(e.wht_amount) || 0,
      'ยอดสุทธิ': parseFloat(e.net_amount) || 0,
      'สถานะ': statusLabels[e.status] || e.status,
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    ws['!cols'] = [
      { wch: 18 }, // Number
      { wch: 14 }, // Date
      { wch: 20 }, // Vendor
      { wch: 30 }, // Description
      { wch: 14 }, // Amount
      { wch: 12 }, // VAT
      { wch: 14 }, // WHT
      { wch: 14 }, // Net
      { wch: 12 }, // Status
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'ค่าใช้จ่าย')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=expenses-report.xlsx')
    res.send(buffer)
  } catch (error) {
    console.error('Export expenses error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งออกค่าใช้จ่าย' })
  }
})

// ====================================================================
// EXPORT: Product import template
// GET /api/exports/template/products
// ====================================================================
router.get('/template/products', async (req, res) => {
  try {
    const headers = [
      'SKU*', 'Barcode', 'ชื่อสินค้า*', 'หน่วย*', 'ราคาทุน*', 'ราคาขาย*', 'ราคาขายขั้นต่ำ', 'สต๊อกขั้นต่ำ'
    ]

    const exampleRow = {
      'SKU*': 'PRD-001',
      'Barcode': '8850000000001',
      'ชื่อสินค้า*': 'สินค้าตัวอย่าง',
      'หน่วย*': 'ชิ้น',
      'ราคาทุน*': 100,
      'ราคาขาย*': 150,
      'ราคาขายขั้นต่ำ': 120,
      'สต๊อกขั้นต่ำ': 5,
    }

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([exampleRow], { header: headers })

    ws['!cols'] = [
      { wch: 15 }, // SKU
      { wch: 18 }, // Barcode
      { wch: 30 }, // Name
      { wch: 10 }, // Unit
      { wch: 12 }, // Cost
      { wch: 12 }, // Selling
      { wch: 15 }, // Min selling
      { wch: 12 }, // Min stock
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'แบบฟอร์มนำเข้า')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=product-import-template.xlsx')
    res.send(buffer)
  } catch (error) {
    console.error('Export template error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดาวน์โหลดแบบฟอร์ม' })
  }
})

module.exports = router
