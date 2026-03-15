const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')
const { deductStockFIFO } = require('../utils/fifo')
const { generateDocNumber } = require('../utils/docNumber')

router.use(auth, companyGuard)

// POST /api/sales — create sale (POS checkout)
router.post('/', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { items, customerId, paymentMethod, discountAmount, note, payments: paymentList, paymentChannelId } = req.body
    const companyId = req.user.companyId

    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'กรุณาเพิ่มสินค้า' })
    }

    // Get company settings for VAT
    const [companies] = await connection.execute('SELECT settings FROM companies WHERE id = ?', [companyId])
    const settings = companies[0]?.settings ? JSON.parse(companies[0].settings) : {}
    const vatRate = settings.vat_enabled ? (settings.vat_rate || 7) : 0

    // Generate invoice number
    const invoiceNumber = await generateDocNumber('INV', companyId, 'sales', 'invoice_number')

    // Get default warehouse
    const [warehouses] = await connection.execute(
      'SELECT id FROM warehouses WHERE company_id = ? AND is_active = TRUE LIMIT 1',
      [companyId]
    )
    const warehouseId = warehouses[0]?.id

    let totalAmount = 0
    let totalCostAmount = 0
    const saleItems = []

    // Process each item
    for (const item of items) {
      // Service items (ค่าแรง, ค่าบริการ) — skip product lookup & stock
      if (item.isService) {
        const unitPrice = item.unitPrice || 0
        const discount = item.discount || 0
        const subtotal = (unitPrice * item.quantity) - discount
        totalAmount += subtotal
        saleItems.push({ ...item, unitPrice, discount, subtotal, costPrice: 0, productId: null })
        continue
      }

      const [products] = await connection.execute(
        'SELECT selling_price FROM products WHERE id = ? AND company_id = ?',
        [item.productId, companyId]
      )
      if (products.length === 0) continue

      const unitPrice = item.unitPrice || parseFloat(products[0].selling_price)
      const discount = item.discount || 0
      const subtotal = (unitPrice * item.quantity) - discount

      // FIFO stock deduction
      let costPrice = 0
      if (warehouseId) {
        try {
          const fifoResult = await deductStockFIFO(connection, item.productId, warehouseId, item.quantity)
          costPrice = fifoResult.weightedAvgCost
          totalCostAmount += fifoResult.totalCost
        } catch (e) {
          await connection.rollback()
          return res.status(400).json({ message: e.message })
        }
      }

      totalAmount += subtotal
      saleItems.push({ ...item, unitPrice, discount, subtotal, costPrice })
    }

    const discount = discountAmount || 0
    const amountAfterDiscount = totalAmount - discount
    const vatAmount = vatRate > 0 ? (amountAfterDiscount * vatRate) / (100 + vatRate) : 0
    const netAmount = amountAfterDiscount

    // Insert sale
    const [saleResult] = await connection.execute(
      `INSERT INTO sales (company_id, invoice_number, sale_type, customer_id, total_amount, 
       discount_amount, vat_amount, net_amount, payment_method, payment_channel_id, payment_status, cashier_id, note)
       VALUES (?, ?, 'pos', ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)`,
      [companyId, invoiceNumber, customerId || null, totalAmount, discount,
       Math.round(vatAmount * 100) / 100, netAmount, paymentMethod || 'cash',
       paymentChannelId || null, req.user.id, note || null]
    )

    const saleId = saleResult.insertId

    // Insert sale items
    for (const item of saleItems) {
      await connection.execute(
        `INSERT INTO sale_items (sale_id, product_id, service_name, quantity, unit_price, cost_price, discount, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.productId || null, item.serviceName || null, item.quantity, item.unitPrice, item.costPrice, item.discount, item.subtotal]
      )

      // Create stock transaction for SALE type (skip for service items)
      if (warehouseId && !item.isService && item.productId) {
        await connection.execute(
          `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, created_by)
           VALUES (?, ?, 'SALE', ?, ?, 'SALE', ?, ?)`,
          [item.productId, warehouseId, -item.quantity, item.costPrice, saleId, req.user.id]
        )
      }
    }

    // Insert payments
    if (paymentList && paymentList.length > 0) {
      for (const payment of paymentList) {
        await connection.execute(
          'INSERT INTO payments (sale_id, method, payment_channel_id, amount, reference_number) VALUES (?, ?, ?, ?, ?)',
          [saleId, payment.method, payment.paymentChannelId || null, payment.amount, payment.referenceNumber || null]
        )
      }
    } else {
      await connection.execute(
        'INSERT INTO payments (sale_id, method, payment_channel_id, amount) VALUES (?, ?, ?, ?)',
        [saleId, paymentMethod || 'cash', paymentChannelId || null, netAmount]
      )
    }

    await connection.commit()

    res.status(201).json({
      message: 'บันทึกการขายสำเร็จ',
      saleId,
      invoiceNumber,
      totalAmount,
      discountAmount: discount,
      vatAmount: Math.round(vatAmount * 100) / 100,
      netAmount,
    })
  } catch (error) {
    await connection.rollback()
    console.error('Create sale error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// GET /api/sales — list sales
router.get('/', async (req, res) => {
  try {
    const { from, to, status, saleType } = req.query
    let query = `
      SELECT s.*, u.full_name as cashier_name, c.name as customer_name
      FROM sales s
      LEFT JOIN users u ON s.cashier_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.company_id = ?`
    const params = [req.user.companyId]

    if (from) { query += ' AND s.sold_at >= ?'; params.push(from) }
    if (to) { query += ' AND s.sold_at <= ?'; params.push(to) }
    if (status) { query += ' AND s.status = ?'; params.push(status) }
    if (saleType) { query += ' AND s.sale_type = ?'; params.push(saleType) }

    query += ' ORDER BY s.sold_at DESC LIMIT 200'
    const sales = await executeQuery(query, params)
    res.json(sales)
  } catch (error) {
    console.error('Get sales error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/sales/:id — sale detail
router.get('/:id', async (req, res) => {
  try {
    const sales = await executeQuery(
      `SELECT s.*, u.full_name as cashier_name FROM sales s
       LEFT JOIN users u ON s.cashier_id = u.id
       WHERE s.id = ? AND s.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (sales.length === 0) return res.status(404).json({ message: 'ไม่พบบิล' })

    const items = await executeQuery(
      `SELECT si.*, COALESCE(p.name, si.service_name, 'ค่าบริการ') as product_name, p.sku FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id = ?`,
      [req.params.id]
    )

    const payments = await executeQuery(
      'SELECT * FROM payments WHERE sale_id = ?',
      [req.params.id]
    )

    res.json({ ...sales[0], items, payments })
  } catch (error) {
    console.error('Get sale detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/sales/:id/void — void sale
router.put('/:id/void', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // Update sale status
    await connection.execute(
      "UPDATE sales SET status = 'voided' WHERE id = ? AND company_id = ?",
      [req.params.id, req.user.companyId]
    )

    // TODO: Reverse stock deductions if needed

    await connection.commit()
    res.json({ message: 'ยกเลิกบิลสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Void sale error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// GET /api/sales/customers/all
router.get('/customers/all', async (req, res) => {
  try {
    const customers = await executeQuery(
      'SELECT * FROM customers WHERE company_id = ? AND is_active = TRUE ORDER BY name',
      [req.user.companyId]
    )
    res.json(customers)
  } catch (error) {
    console.error('Get customers error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
