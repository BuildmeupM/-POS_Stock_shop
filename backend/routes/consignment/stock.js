const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/consignment/stock — ดูสต๊อกฝากขายทั้งหมด
router.get('/', async (req, res) => {
  try {
    const { agreementId } = req.query
    let query = `
      SELECT cs.*, p.name as product_name, p.sku, p.unit,
        ca.agreement_number, c.name as contact_name,
        ca.commission_type, ca.commission_rate
      FROM consignment_stock cs
      JOIN products p ON cs.product_id = p.id
      JOIN consignment_agreements ca ON cs.agreement_id = ca.id
      JOIN contacts c ON ca.contact_id = c.id
      WHERE ca.company_id = ?`
    const params = [req.user.companyId]

    if (agreementId) { query += ' AND cs.agreement_id = ?'; params.push(agreementId) }
    query += ' ORDER BY cs.received_at DESC'

    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('Get consignment stock error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/consignment/stock/receive — รับสินค้าฝากขายเข้า
router.post('/receive', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { agreementId, items } = req.body

    if (!agreementId || !items || items.length === 0) {
      return res.status(400).json({ message: 'กรุณาระบุสัญญาและรายการสินค้า' })
    }

    // Verify agreement
    const [agreements] = await connection.execute(
      "SELECT id FROM consignment_agreements WHERE id = ? AND company_id = ? AND status = 'active'",
      [agreementId, req.user.companyId]
    )
    if (agreements.length === 0) {
      return res.status(400).json({ message: 'ไม่พบสัญญาฝากขายที่ใช้งานอยู่' })
    }

    for (const item of items) {
      const { productId, quantity, consignorPrice, sellingPrice } = item
      if (!productId || !quantity || quantity <= 0) continue

      // Check if stock row exists for this agreement + product
      const [existing] = await connection.execute(
        'SELECT id, quantity_received, quantity_on_hand FROM consignment_stock WHERE agreement_id = ? AND product_id = ?',
        [agreementId, productId]
      )

      if (existing.length > 0) {
        // Update existing
        await connection.execute(
          `UPDATE consignment_stock
           SET quantity_received = quantity_received + ?,
               quantity_on_hand = quantity_on_hand + ?,
               consignor_price = COALESCE(?, consignor_price),
               selling_price = COALESCE(?, selling_price)
           WHERE id = ?`,
          [quantity, quantity, consignorPrice, sellingPrice, existing[0].id]
        )
      } else {
        // Insert new
        await connection.execute(
          `INSERT INTO consignment_stock (agreement_id, product_id, quantity_received, quantity_on_hand,
            consignor_price, selling_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [agreementId, productId, quantity, quantity, consignorPrice || 0, sellingPrice || 0]
        )
      }

      // Mark product as consignment
      await connection.execute('UPDATE products SET is_consignment = TRUE WHERE id = ?', [productId])

      // Log transaction
      await connection.execute(
        `INSERT INTO consignment_transactions (agreement_id, product_id, type, quantity,
          consignor_price, selling_price, note, created_by)
         VALUES (?, ?, 'RECEIVE', ?, ?, ?, ?, ?)`,
        [agreementId, productId, quantity, consignorPrice || 0, sellingPrice || 0,
          item.note || null, req.user.id]
      )
    }

    await connection.commit()
    res.status(201).json({ message: 'รับสินค้าฝากขายสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Receive consignment error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// POST /api/consignment/stock/return — คืนสินค้าให้ผู้ฝากขาย
router.post('/return', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { agreementId, items } = req.body

    if (!agreementId || !items || items.length === 0) {
      return res.status(400).json({ message: 'กรุณาระบุรายการสินค้าที่จะคืน' })
    }

    for (const item of items) {
      const { productId, quantity } = item
      if (!productId || !quantity || quantity <= 0) continue

      // Check stock
      const [stock] = await connection.execute(
        'SELECT id, quantity_on_hand, consignor_price, selling_price FROM consignment_stock WHERE agreement_id = ? AND product_id = ?',
        [agreementId, productId]
      )
      if (stock.length === 0 || stock[0].quantity_on_hand < quantity) {
        await connection.rollback()
        return res.status(400).json({ message: `สินค้าคงเหลือไม่พอสำหรับการคืน (product: ${productId})` })
      }

      // Update stock
      await connection.execute(
        `UPDATE consignment_stock
         SET quantity_returned = quantity_returned + ?,
             quantity_on_hand = quantity_on_hand - ?
         WHERE id = ?`,
        [quantity, quantity, stock[0].id]
      )

      // Log transaction
      await connection.execute(
        `INSERT INTO consignment_transactions (agreement_id, product_id, type, quantity,
          consignor_price, selling_price, note, created_by)
         VALUES (?, ?, 'RETURN', ?, ?, ?, ?, ?)`,
        [agreementId, productId, quantity, stock[0].consignor_price, stock[0].selling_price,
          item.note || 'คืนสินค้าให้ผู้ฝากขาย', req.user.id]
      )
    }

    await connection.commit()
    res.json({ message: 'คืนสินค้าสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Return consignment error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// GET /api/consignment/stock/transactions — ดูประวัติเคลื่อนไหว
router.get('/transactions', async (req, res) => {
  try {
    const { agreementId } = req.query
    let query = `
      SELECT ct.*, p.name as product_name, p.sku, u.full_name as created_by_name,
        ca.agreement_number
      FROM consignment_transactions ct
      JOIN products p ON ct.product_id = p.id
      JOIN consignment_agreements ca ON ct.agreement_id = ca.id
      LEFT JOIN users u ON ct.created_by = u.id
      WHERE ca.company_id = ?`
    const params = [req.user.companyId]

    if (agreementId) { query += ' AND ct.agreement_id = ?'; params.push(agreementId) }
    query += ' ORDER BY ct.created_at DESC LIMIT 200'

    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('Get consignment transactions error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
