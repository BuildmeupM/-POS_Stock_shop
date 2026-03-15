const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')
const { generateDocNumber } = require('../utils/docNumber')

router.use(auth, companyGuard)

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { status, platform, from, to } = req.query
    let query = `SELECT oo.*, c.name as customer_name_ref FROM online_orders oo
      LEFT JOIN customers c ON oo.customer_id = c.id WHERE oo.company_id = ?`
    const params = [req.user.companyId]
    if (status) { query += ' AND oo.order_status = ?'; params.push(status) }
    if (platform) { query += ' AND oo.platform = ?'; params.push(platform) }
    if (from) { query += ' AND oo.created_at >= ?'; params.push(from) }
    if (to) { query += ' AND oo.created_at <= ?'; params.push(to) }
    query += ' ORDER BY oo.created_at DESC LIMIT 200'
    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('Get orders error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/orders
router.post('/', async (req, res) => {
  try {
    const { platform, customerId, customerName, customerPhone, shippingAddress,
            items, shippingCost, discountAmount, paymentMethod, paymentChannelId, note } = req.body
    const companyId = req.user.companyId
    const orderNumber = await generateDocNumber('ORD', companyId, 'online_orders', 'order_number')
    let totalAmount = 0
    if (items) {
      for (const item of items) {
        totalAmount += (item.unitPrice * item.quantity) - (item.discount || 0)
      }
    }
    const netAmount = totalAmount + (shippingCost || 0) - (discountAmount || 0)
    const result = await executeQuery(
      `INSERT INTO online_orders (company_id, order_number, platform, customer_id, customer_name,
       customer_phone, shipping_address, total_amount, shipping_cost, discount_amount, net_amount,
       payment_method, payment_channel_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, orderNumber, platform || 'website', customerId || null,
       customerName || null, customerPhone || null, shippingAddress || null,
       totalAmount, shippingCost || 0, discountAmount || 0, netAmount,
       paymentMethod || 'transfer', paymentChannelId || null, note || null, req.user.id]
    )
    const orderId = result.insertId
    if (items) {
      for (const item of items) {
        const subtotal = (item.unitPrice * item.quantity) - (item.discount || 0)
        await executeQuery(
          `INSERT INTO online_order_items (order_id, product_id, quantity, unit_price, discount, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [orderId, item.productId, item.quantity, item.unitPrice, item.discount || 0, subtotal]
        )
      }
    }
    res.status(201).json({ message: 'สร้างออเดอร์สำเร็จ', orderId, orderNumber })
  } catch (error) {
    console.error('Create order error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const orders = await executeQuery(
      'SELECT * FROM online_orders WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (orders.length === 0) return res.status(404).json({ message: 'ไม่พบออเดอร์' })
    const items = await executeQuery(
      `SELECT oi.*, p.name as product_name, p.sku FROM online_order_items oi
       JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?`, [req.params.id]
    )
    res.json({ ...orders[0], items })
  } catch (error) {
    console.error('Get order detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/orders/:id  (edit – only when pending)
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.execute(
      'SELECT * FROM online_orders WHERE id = ? AND company_id = ? AND order_status = ?',
      [req.params.id, req.user.companyId, 'pending']
    )
    if (orders.length === 0) return res.status(400).json({ message: 'ไม่สามารถแก้ไขได้ (สถานะต้องเป็น รอยืนยัน)' })

    const { customerName, customerPhone, shippingAddress, platform,
            paymentMethod, shippingCost, discountAmount, note, items } = req.body

    let totalAmount = 0
    if (items) {
      for (const item of items) {
        totalAmount += (item.unitPrice * item.quantity) - (item.discount || 0)
      }
    }
    const netAmount = totalAmount + (shippingCost || 0) - (discountAmount || 0)

    await connection.execute(
      `UPDATE online_orders SET customer_name = ?, customer_phone = ?, shipping_address = ?,
       platform = ?, payment_method = ?, shipping_cost = ?, discount_amount = ?,
       total_amount = ?, net_amount = ?, note = ? WHERE id = ?`,
      [customerName || null, customerPhone || null, shippingAddress || null,
       platform || 'website', paymentMethod || 'transfer',
       shippingCost || 0, discountAmount || 0, totalAmount, netAmount,
       note || null, req.params.id]
    )

    // Replace items
    if (items) {
      await connection.execute('DELETE FROM online_order_items WHERE order_id = ?', [req.params.id])
      for (const item of items) {
        const subtotal = (item.unitPrice * item.quantity) - (item.discount || 0)
        await connection.execute(
          `INSERT INTO online_order_items (order_id, product_id, quantity, unit_price, discount, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.params.id, item.productId, item.quantity, item.unitPrice, item.discount || 0, subtotal]
        )
      }
    }

    await connection.commit()
    res.json({ message: 'แก้ไขออเดอร์สำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Edit order error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// PUT /api/orders/:id/status
router.put('/:id/status', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { orderStatus, trackingNumber, shippingProvider } = req.body
    let updates = 'order_status = ?'
    const params = [orderStatus]
    if (trackingNumber) { updates += ', tracking_number = ?'; params.push(trackingNumber) }
    if (shippingProvider) { updates += ', shipping_provider = ?'; params.push(shippingProvider) }
    if (orderStatus === 'shipped') updates += ', shipped_at = NOW()'
    if (orderStatus === 'delivered') updates += ', delivered_at = NOW()'
    if (orderStatus === 'returned') updates += ", payment_status = 'refunded'"
    params.push(req.params.id, req.user.companyId)
    await connection.execute(`UPDATE online_orders SET ${updates} WHERE id = ? AND company_id = ?`, params)

    // Auto-create credit note when returned
    if (orderStatus === 'returned') {
      const [order] = (await connection.execute(
        'SELECT * FROM online_orders WHERE id = ? AND company_id = ?',
        [req.params.id, req.user.companyId]
      ))[0]
      if (order) {
        // Generate CN number
        const today = new Date()
        const dateStr = `${today.getFullYear() + 543}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
        const [countRow] = (await connection.execute(
          "SELECT COUNT(*) as cnt FROM credit_notes WHERE company_id = ? AND credit_note_number LIKE ?",
          [req.user.companyId, `CN-${dateStr}-%`]
        ))[0]
        const seq = String((countRow?.cnt || 0) + 1).padStart(5, '0')
        const cnNumber = `CN-${dateStr}-${seq}`

        const [cnResult] = await connection.execute(
          `INSERT INTO credit_notes (company_id, credit_note_number, order_id, customer_name, customer_phone, reason,
            total_amount, shipping_refund, discount_refund, net_amount, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)`,
          [
            req.user.companyId, cnNumber, req.params.id,
            order.customer_name || null, order.customer_phone || null,
            `คืนสินค้า - ออเดอร์ ${order.order_number}`,
            order.total_amount || 0, order.shipping_cost || 0, order.discount_amount || 0, order.net_amount || 0,
            req.user.id
          ]
        )
        const cnId = cnResult.insertId

        // Copy items from order to credit note
        const [items] = await connection.execute(
          'SELECT * FROM online_order_items WHERE order_id = ?',
          [req.params.id]
        )
        for (const item of items) {
          await connection.execute(
            `INSERT INTO credit_note_items (credit_note_id, product_id, quantity, unit_price, discount, subtotal)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cnId, item.product_id, item.quantity, item.unit_price, item.discount || 0, item.subtotal]
          )
        }
      }
    }

    await connection.commit()
    res.json({ message: orderStatus === 'returned' ? 'คืนสินค้าและออกใบลดหนี้สำเร็จ' : 'อัพเดตสถานะสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Update order status error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// DELETE /api/orders/:id  (only when pending)
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [orders] = await connection.execute(
      'SELECT * FROM online_orders WHERE id = ? AND company_id = ? AND order_status = ?',
      [req.params.id, req.user.companyId, 'pending']
    )
    if (orders.length === 0) return res.status(400).json({ message: 'ไม่สามารถลบได้ (สถานะต้องเป็น รอยืนยัน)' })
    await connection.execute('DELETE FROM online_order_items WHERE order_id = ?', [req.params.id])
    await connection.execute('DELETE FROM online_orders WHERE id = ?', [req.params.id])
    await connection.commit()
    res.json({ message: 'ลบออเดอร์สำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Delete order error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

module.exports = router
