const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')
const { createJournalEntry } = require('../../utils/journal')

router.use(auth, companyGuard)

// GET /api/consignment/stock — ดูสต๊อกฝากขายทั้งหมด
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { agreementId } = req.query
    let whereClause = 'WHERE ca.company_id = ?'
    const baseParams = [req.user.companyId]

    if (agreementId) { whereClause += ' AND cs.agreement_id = ?'; baseParams.push(agreementId) }

    const fromClause = `FROM consignment_stock cs
      JOIN products p ON cs.product_id = p.id
      JOIN consignment_agreements ca ON cs.agreement_id = ca.id
      JOIN contacts c ON ca.contact_id = c.id`

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total ${fromClause} ${whereClause}`, baseParams
      )
      const total = countResult.total

      const rows = await executeQuery(
        `SELECT cs.*, p.name as product_name, p.sku, p.unit,
          ca.agreement_number, c.name as contact_name,
          ca.commission_type, ca.commission_rate
        ${fromClause} ${whereClause} ORDER BY cs.received_at DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const rows = await executeQuery(
        `SELECT cs.*, p.name as product_name, p.sku, p.unit,
          ca.agreement_number, c.name as contact_name,
          ca.commission_type, ca.commission_rate
        ${fromClause} ${whereClause} ORDER BY cs.received_at DESC LIMIT 500`,
        baseParams
      )
      res.json(rows)
    }
  } catch (error) {
    console.error('Get consignment stock error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/consignment/stock/receive — รับสินค้าฝากขายเข้า
router.post('/receive', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
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
router.post('/return', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
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
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { agreementId } = req.query
    let whereClause = 'WHERE ca.company_id = ?'
    const baseParams = [req.user.companyId]

    if (agreementId) { whereClause += ' AND ct.agreement_id = ?'; baseParams.push(agreementId) }

    const fromClause = `FROM consignment_transactions ct
      JOIN products p ON ct.product_id = p.id
      JOIN consignment_agreements ca ON ct.agreement_id = ca.id
      LEFT JOIN users u ON ct.created_by = u.id`

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM consignment_transactions ct JOIN consignment_agreements ca ON ct.agreement_id = ca.id ${whereClause}`,
        baseParams
      )
      const total = countResult.total

      const rows = await executeQuery(
        `SELECT ct.*, p.name as product_name, p.sku, u.full_name as created_by_name,
          ca.agreement_number
        ${fromClause} ${whereClause} ORDER BY ct.created_at DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const rows = await executeQuery(
        `SELECT ct.*, p.name as product_name, p.sku, u.full_name as created_by_name,
          ca.agreement_number
        ${fromClause} ${whereClause} ORDER BY ct.created_at DESC LIMIT 500`,
        baseParams
      )
      res.json(rows)
    }
  } catch (error) {
    console.error('Get consignment transactions error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/consignment/stock/record-sale — บันทึกยอดขายฝากขาย (ไม่ผ่าน POS)
router.post('/record-sale', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { agreementId, items, saleDate, note } = req.body
    const companyId = req.user.companyId

    if (!agreementId || !items || items.length === 0) {
      return res.status(400).json({ message: 'กรุณาระบุสัญญาและรายการสินค้า' })
    }

    // Get agreement info
    const [agreements] = await connection.execute(
      `SELECT ca.*, c.name as contact_name
       FROM consignment_agreements ca JOIN contacts c ON ca.contact_id = c.id
       WHERE ca.id = ? AND ca.company_id = ? AND ca.status = 'active'`,
      [agreementId, companyId]
    )
    if (agreements.length === 0) {
      await connection.rollback(); connection.release()
      return res.status(400).json({ message: 'ไม่พบสัญญาฝากขายที่ใช้งานอยู่' })
    }
    const agreement = agreements[0]

    let totalAmount = 0
    let totalCommission = 0
    let totalConsignorCost = 0
    const processedItems = []

    for (const item of items) {
      const { productId, quantity, sellingPrice } = item
      if (!productId || !quantity || quantity <= 0) continue

      // Check consignment stock
      const [stockRows] = await connection.execute(
        'SELECT id, quantity_on_hand, consignor_price, selling_price FROM consignment_stock WHERE agreement_id = ? AND product_id = ?',
        [agreementId, productId]
      )
      if (stockRows.length === 0 || stockRows[0].quantity_on_hand < quantity) {
        await connection.rollback(); connection.release()
        return res.status(400).json({ message: `สินค้าคงเหลือไม่พอ (product: ${productId}, คงเหลือ: ${stockRows[0]?.quantity_on_hand || 0})` })
      }
      const stock = stockRows[0]
      const unitPrice = sellingPrice || parseFloat(stock.selling_price)
      const subtotal = unitPrice * quantity
      const consignorCost = parseFloat(stock.consignor_price) * quantity

      // Calculate commission
      let commissionAmount = 0
      if (agreement.commission_type === 'percent') {
        commissionAmount = subtotal * (parseFloat(agreement.commission_rate) / 100)
      } else {
        commissionAmount = parseFloat(agreement.commission_rate) * quantity
      }

      // Update consignment stock
      await connection.execute(
        'UPDATE consignment_stock SET quantity_sold = quantity_sold + ?, quantity_on_hand = quantity_on_hand - ? WHERE id = ?',
        [quantity, quantity, stock.id]
      )

      // Log consignment transaction
      await connection.execute(
        `INSERT INTO consignment_transactions (agreement_id, product_id, type, quantity,
          consignor_price, selling_price, commission_amount, created_by)
         VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)`,
        [agreementId, productId, quantity, stock.consignor_price, unitPrice, commissionAmount, req.user.id]
      )

      totalAmount += subtotal
      totalCommission += commissionAmount
      totalConsignorCost += consignorCost
      processedItems.push({
        productId, quantity, unitPrice, costPrice: parseFloat(stock.consignor_price),
        discount: 0, subtotal, consignmentStockId: stock.id,
      })
    }

    if (processedItems.length === 0) {
      await connection.rollback(); connection.release()
      return res.status(400).json({ message: 'ไม่มีรายการสินค้าที่ถูกต้อง' })
    }

    // Generate invoice number and create sale record
    const invoiceNumber = await generateDocNumber('CSL', companyId, 'sales', 'invoice_number')
    const soldAt = saleDate || new Date().toISOString().slice(0, 10)

    const [saleResult] = await connection.execute(
      `INSERT INTO sales (company_id, invoice_number, sale_type, total_amount,
        discount_amount, vat_amount, net_amount, payment_method, payment_status, status, cashier_id, note, sold_at)
       VALUES (?, ?, 'consignment', ?, 0, 0, ?, 'transfer', 'unpaid', 'completed', ?, ?, ?)`,
      [companyId, invoiceNumber, totalAmount, totalAmount, req.user.id, note || `ยอดขายฝากขาย ${agreement.agreement_number}`, soldAt]
    )
    const saleId = saleResult.insertId

    // Insert sale items
    for (const item of processedItems) {
      await connection.execute(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, cost_price, discount, subtotal, is_consignment, consignment_stock_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
        [saleId, item.productId, item.quantity, item.unitPrice, item.costPrice, 0, item.subtotal, item.consignmentStockId]
      )
    }

    // Update consignment_transactions with sale_id
    await connection.execute(
      `UPDATE consignment_transactions SET sale_id = ?
       WHERE agreement_id = ? AND type = 'SALE' AND sale_id IS NULL AND created_by = ?
       ORDER BY created_at DESC LIMIT ?`,
      [saleId, agreementId, req.user.id, processedItems.length]
    )

    // Journal entry
    //   Dr. ลูกหนี้ฝากขาย (1130) = totalAmount (ยอดขายที่ร้านรับฝากต้องจ่าย)
    //   Cr. เจ้าหนี้ผู้ฝากขาย (2150) = totalConsignorCost (ส่วนของผู้ฝากขาย)
    //   Cr. รายได้ค่าคอมมิชชัน (4200) = totalCommission (ส่วนค่าคอมฯ ของร้าน)
    const journalLines = [
      { accountCode: '1130', debit: totalAmount, credit: 0, description: `ลูกหนี้ฝากขาย ${invoiceNumber}` },
      { accountCode: '2150', debit: 0, credit: totalConsignorCost, description: `เจ้าหนี้ผู้ฝากขาย ${invoiceNumber}` },
    ]
    if (totalCommission > 0) {
      journalLines.push({ accountCode: '4200', debit: 0, credit: totalCommission, description: `ค่าคอมมิชชัน ${invoiceNumber}` })
    }

    await createJournalEntry(connection, {
      companyId, entryDate: soldAt,
      description: `บันทึกยอดขายฝากขาย ${invoiceNumber} (สัญญา ${agreement.agreement_number})`,
      referenceType: 'CONSIGNMENT_SALE', referenceId: saleId, createdBy: req.user.id,
      lines: journalLines,
    })

    await connection.commit()
    res.status(201).json({
      message: 'บันทึกยอดขายสำเร็จ',
      saleId,
      invoiceNumber,
      totalAmount,
      totalCommission,
      netPayable: totalAmount - totalCommission,
      itemCount: processedItems.length,
    })
  } catch (error) {
    await connection.rollback()
    console.error('Record consignment sale error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

module.exports = router
