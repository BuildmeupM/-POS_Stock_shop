const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')
const { generateDocNumber } = require('../utils/docNumber')

router.use(auth, companyGuard)

// =============================================
// PURCHASE ORDERS
// =============================================

// GET /api/purchases — list POs
router.get('/', async (req, res) => {
  try {
    const { status, contactId, from, to, search } = req.query
    let query = `
      SELECT po.*, c.name as contact_name,
        u.full_name as created_by_name,
        (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count
      FROM purchase_orders po
      LEFT JOIN contacts c ON po.contact_id = c.id
      LEFT JOIN users u ON po.created_by = u.id
      WHERE po.company_id = ?`
    const params = [req.user.companyId]

    if (status) { query += ' AND po.status = ?'; params.push(status) }
    if (contactId) { query += ' AND po.contact_id = ?'; params.push(contactId) }
    if (from) { query += ' AND po.order_date >= ?'; params.push(from) }
    if (to) { query += ' AND po.order_date <= ?'; params.push(to) }
    if (search) {
      query += ' AND (po.po_number LIKE ? OR c.name LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }

    query += ' ORDER BY po.created_at DESC'
    const orders = await executeQuery(query, params)
    res.json(orders)
  } catch (error) {
    console.error('Get POs error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/purchases/:id — PO detail with items
router.get('/:id', async (req, res) => {
  try {
    const pos = await executeQuery(
      `SELECT po.*, c.name as contact_name, c.phone as contact_phone,
         c.email as contact_email, c.address as contact_address,
         c.tax_id as contact_tax_id, c.branch as contact_branch,
         c.address_street as contact_address_street,
         c.address_subdistrict as contact_address_subdistrict,
         c.address_district as contact_address_district,
         c.address_province as contact_address_province,
         c.address_postal_code as contact_address_postal_code
       FROM purchase_orders po
       LEFT JOIN contacts c ON po.contact_id = c.id
       WHERE po.id = ? AND po.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (pos.length === 0) return res.status(404).json({ message: 'ไม่พบใบสั่งซื้อ' })

    const items = await executeQuery(
      `SELECT poi.*, p.name as product_name, p.sku, p.unit
       FROM purchase_order_items poi
       JOIN products p ON poi.product_id = p.id
       WHERE poi.po_id = ?`,
      [req.params.id]
    )

    res.json({ ...pos[0], items })
  } catch (error) {
    console.error('Get PO detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/purchases — create PO
router.post('/', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { contactId, orderDate, expectedDate, items, note, status } = req.body

    if (!contactId || !orderDate || !items || items.length === 0) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' })
    }

    const poNumber = await generateDocNumber('PO', req.user.companyId, 'purchase_orders', 'po_number')

    // Calculate totals
    const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unitCost), 0)
    const vatAmount = subtotal * 0.07
    const totalAmount = subtotal + vatAmount

    const [poResult] = await connection.execute(
      `INSERT INTO purchase_orders (company_id, po_number, contact_id, order_date, expected_date, subtotal, vat_amount, total_amount, status, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, poNumber, contactId, orderDate, expectedDate || null,
       subtotal, vatAmount, totalAmount, status || 'draft', note || null, req.user.id]
    )

    // Insert items
    for (const item of items) {
      await connection.execute(
        `INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_cost, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [poResult.insertId, item.productId, item.quantity, item.unitCost, item.quantity * item.unitCost]
      )
    }

    await connection.commit()
    res.status(201).json({ message: 'สร้างใบสั่งซื้อสำเร็จ', poId: poResult.insertId, poNumber })
  } catch (error) {
    await connection.rollback()
    console.error('Create PO error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// PUT /api/purchases/:id — edit PO (only draft/approved)
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { contactId, orderDate, expectedDate, note, items } = req.body

    // Verify PO exists and is editable
    const [pos] = await connection.execute(
      `SELECT * FROM purchase_orders WHERE id = ? AND company_id = ? AND status IN ('draft', 'approved')`,
      [req.params.id, req.user.companyId]
    )
    if (pos.length === 0) {
      return res.status(400).json({ message: 'ไม่พบใบสั่งซื้อ หรือสถานะไม่อนุญาตให้แก้ไข (ต้องเป็นฉบับร่างหรืออนุมัติแล้ว)' })
    }

    // Update PO header
    if (contactId || orderDate || expectedDate !== undefined || note !== undefined) {
      const setCols = []
      const params = []
      if (contactId) { setCols.push('contact_id = ?'); params.push(contactId) }
      if (orderDate) { setCols.push('order_date = ?'); params.push(orderDate) }
      if (expectedDate !== undefined) { setCols.push('expected_date = ?'); params.push(expectedDate || null) }
      if (note !== undefined) { setCols.push('note = ?'); params.push(note || null) }

      if (setCols.length > 0) {
        params.push(req.params.id)
        await connection.execute(
          `UPDATE purchase_orders SET ${setCols.join(', ')} WHERE id = ?`,
          params
        )
      }
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      // Delete old items
      await connection.execute('DELETE FROM purchase_order_items WHERE po_id = ?', [req.params.id])

      // Insert new items
      let subtotal = 0
      for (const item of items) {
        const itemSubtotal = item.quantity * item.unitCost
        subtotal += itemSubtotal
        await connection.execute(
          `INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_cost, subtotal)
           VALUES (?, ?, ?, ?, ?)`,
          [req.params.id, item.productId, item.quantity, item.unitCost, itemSubtotal]
        )
      }

      // Recalculate totals
      const vatAmount = subtotal * 0.07
      const totalAmount = subtotal + vatAmount
      await connection.execute(
        `UPDATE purchase_orders SET subtotal = ?, vat_amount = ?, total_amount = ? WHERE id = ?`,
        [subtotal, vatAmount, totalAmount, req.params.id]
      )
    }

    await connection.commit()
    res.json({ message: 'แก้ไขใบสั่งซื้อสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Update PO error:', error)
    res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// DELETE /api/purchases/:id — delete PO (only draft)
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    // Verify PO exists and is deletable
    const [pos] = await connection.execute(
      `SELECT * FROM purchase_orders WHERE id = ? AND company_id = ? AND status = 'draft'`,
      [req.params.id, req.user.companyId]
    )
    if (pos.length === 0) {
      return res.status(400).json({ message: 'ไม่พบใบสั่งซื้อ หรือไม่สามารถลบได้ (ต้องเป็นฉบับร่างเท่านั้น)' })
    }

    // Delete items first, then PO
    await connection.execute('DELETE FROM purchase_order_items WHERE po_id = ?', [req.params.id])
    await connection.execute('DELETE FROM purchase_orders WHERE id = ?', [req.params.id])

    await connection.commit()
    res.json({ message: 'ลบใบสั่งซื้อสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Delete PO error:', error)
    res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// PUT /api/purchases/:id/status — update PO status
router.put('/:id/status', async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['draft', 'approved', 'cancelled']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'สถานะไม่ถูกต้อง' })
    }

    const updates = { status }
    let extraCols = ''
    const params = [status]

    if (status === 'approved') {
      extraCols = ', approved_by = ?'
      params.push(req.user.id)
    }

    params.push(req.params.id, req.user.companyId)
    await executeQuery(
      `UPDATE purchase_orders SET status = ?${extraCols} WHERE id = ? AND company_id = ?`,
      params
    )

    res.json({ message: 'อัพเดตสถานะสำเร็จ' })
  } catch (error) {
    console.error('Update PO status error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/purchases/:id/revert — revert PO status (undo last step)
router.post('/:id/revert', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const poId = req.params.id

    // Get current PO
    const [pos] = await connection.execute(
      `SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?`,
      [poId, req.user.companyId]
    )
    if (pos.length === 0) return res.status(404).json({ message: 'ไม่พบใบสั่งซื้อ' })
    const po = pos[0]

    if (['draft', 'cancelled'].includes(po.status)) {
      return res.status(400).json({ message: 'สถานะปัจจุบันไม่สามารถย้อนกลับได้' })
    }

    if (po.status === 'paid') {
      // paid → invoiced : delete all payments for this PO's invoices
      const [invoices] = await connection.execute(
        'SELECT id FROM purchase_invoices WHERE po_id = ?', [poId]
      )
      for (const inv of invoices) {
        await connection.execute('DELETE FROM purchase_payments WHERE invoice_id = ?', [inv.id])
        await connection.execute(
          'UPDATE purchase_invoices SET paid_amount = 0, status = ? WHERE id = ?',
          ['pending', inv.id]
        )
      }
      await connection.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', ['invoiced', poId])

    } else if (po.status === 'invoiced') {
      // invoiced → approved : delete invoices + GRNs + reverse stock
      // 1) Delete invoices (payments should be 0 at this point)
      const [invoices] = await connection.execute(
        'SELECT id FROM purchase_invoices WHERE po_id = ?', [poId]
      )
      for (const inv of invoices) {
        await connection.execute('DELETE FROM purchase_payments WHERE invoice_id = ?', [inv.id])
      }
      await connection.execute('DELETE FROM purchase_invoices WHERE po_id = ?', [poId])

      // 2) Reverse GRN: delete stock transactions, stock lots, GRN items, GRN
      const [grns] = await connection.execute(
        'SELECT id FROM goods_receipts WHERE po_id = ?', [poId]
      )
      for (const grn of grns) {
        // Delete stock transactions
        await connection.execute(
          "DELETE FROM stock_transactions WHERE reference_type = 'GRN' AND reference_id = ?",
          [grn.id]
        )
        // Delete stock lots
        const [grnItems] = await connection.execute(
          'SELECT product_id, received_quantity FROM goods_receipt_items WHERE grn_id = ?',
          [grn.id]
        )
        // Remove lots created by this GRN
        for (const gi of grnItems) {
          await connection.execute(
            'DELETE FROM stock_lots WHERE product_id = ? AND quantity_remaining = ?',
            [gi.product_id, gi.received_quantity]
          )
        }
        await connection.execute('DELETE FROM goods_receipt_items WHERE grn_id = ?', [grn.id])
      }
      await connection.execute('DELETE FROM goods_receipts WHERE po_id = ?', [poId])

      // 3) Reset received_quantity on PO items
      await connection.execute(
        'UPDATE purchase_order_items SET received_quantity = 0 WHERE po_id = ?', [poId]
      )

      // 4) PO back to approved
      await connection.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', ['approved', poId])

    } else if (['received', 'partial'].includes(po.status)) {
      // received/partial → approved : reverse GRNs + stock
      const [grns] = await connection.execute(
        'SELECT id FROM goods_receipts WHERE po_id = ?', [poId]
      )
      for (const grn of grns) {
        await connection.execute(
          "DELETE FROM stock_transactions WHERE reference_type = 'GRN' AND reference_id = ?",
          [grn.id]
        )
        const [grnItems] = await connection.execute(
          'SELECT product_id, received_quantity FROM goods_receipt_items WHERE grn_id = ?',
          [grn.id]
        )
        for (const gi of grnItems) {
          await connection.execute(
            'DELETE FROM stock_lots WHERE product_id = ? AND quantity_remaining = ?',
            [gi.product_id, gi.received_quantity]
          )
        }
        await connection.execute('DELETE FROM goods_receipt_items WHERE grn_id = ?', [grn.id])
      }
      await connection.execute('DELETE FROM goods_receipts WHERE po_id = ?', [poId])
      await connection.execute(
        'UPDATE purchase_order_items SET received_quantity = 0 WHERE po_id = ?', [poId]
      )
      await connection.execute('UPDATE purchase_orders SET status = ? WHERE id = ?', ['approved', poId])

    } else if (po.status === 'approved') {
      // approved → draft
      await connection.execute(
        'UPDATE purchase_orders SET status = ?, approved_by = NULL WHERE id = ?',
        ['draft', poId]
      )
    }

    await connection.commit()
    res.json({ message: 'ย้อนสถานะสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Revert PO error:', error)
    res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// =============================================
// GOODS RECEIPT
// =============================================

// GET /api/purchases/receipts/all — list GRNs
router.get('/receipts/all', async (req, res) => {
  try {
    const grns = await executeQuery(
      `SELECT gr.*, po.po_number, c.name as contact_name, w.name as warehouse_name,
        u.full_name as created_by_name,
        (SELECT COUNT(*) FROM goods_receipt_items WHERE grn_id = gr.id) as item_count
       FROM goods_receipts gr
       JOIN purchase_orders po ON gr.po_id = po.id
       LEFT JOIN contacts c ON po.contact_id = c.id
       JOIN warehouses w ON gr.warehouse_id = w.id
       LEFT JOIN users u ON gr.created_by = u.id
       WHERE gr.company_id = ?
       ORDER BY gr.created_at DESC`,
      [req.user.companyId]
    )
    res.json(grns)
  } catch (error) {
    console.error('Get GRNs error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/purchases/receipts — create goods receipt
router.post('/receipts', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { poId, warehouseId, receivedDate, items, note } = req.body

    if (!poId || !warehouseId || !items || items.length === 0) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' })
    }

    // Verify PO exists and is approved/partial
    const [pos] = await connection.execute(
      `SELECT * FROM purchase_orders WHERE id = ? AND company_id = ? AND status IN ('approved', 'partial')`,
      [poId, req.user.companyId]
    )
    if (pos.length === 0) {
      return res.status(400).json({ message: 'ไม่พบใบสั่งซื้อ หรือสถานะไม่ถูกต้อง (ต้อง Approved)' })
    }

    const grnNumber = await generateDocNumber('GRN', req.user.companyId, 'goods_receipts', 'grn_number')

    // Create GRN
    const [grnResult] = await connection.execute(
      `INSERT INTO goods_receipts (company_id, grn_number, po_id, warehouse_id, received_date, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, grnNumber, poId, warehouseId, receivedDate || new Date().toISOString().slice(0, 10),
       note || null, req.user.id]
    )

    // Process each received item
    for (const item of items) {
      if (!item.receivedQuantity || item.receivedQuantity <= 0) continue

      // Insert GRN item
      await connection.execute(
        `INSERT INTO goods_receipt_items (grn_id, po_item_id, product_id, received_quantity, cost_per_unit, batch_number, expiry_date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [grnResult.insertId, item.poItemId, item.productId, item.receivedQuantity,
         item.costPerUnit, item.batchNumber || null, item.expiryDate || null, item.note || null]
      )

      // Update received_quantity on PO item
      await connection.execute(
        'UPDATE purchase_order_items SET received_quantity = received_quantity + ? WHERE id = ?',
        [item.receivedQuantity, item.poItemId]
      )

      // Create stock lot
      const [lotResult] = await connection.execute(
        `INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit, batch_number, expiry_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [item.productId, warehouseId, item.receivedQuantity, item.costPerUnit,
         item.batchNumber || null, item.expiryDate || null]
      )

      // Create stock transaction
      await connection.execute(
        `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, related_lot_id, note, created_by)
         VALUES (?, ?, 'IN', ?, ?, 'GRN', ?, ?, ?, ?)`,
        [item.productId, warehouseId, item.receivedQuantity, item.costPerUnit,
         grnResult.insertId, lotResult.insertId, `รับจาก PO: ${pos[0].po_number}`, req.user.id]
      )

      // Update product average cost
      const [lots] = await connection.execute(
        `SELECT SUM(quantity_remaining * cost_per_unit) as total_value, SUM(quantity_remaining) as total_qty
         FROM stock_lots WHERE product_id = ? AND quantity_remaining > 0`,
        [item.productId]
      )
      if (lots[0].total_qty > 0) {
        const avgCost = lots[0].total_value / lots[0].total_qty
        await connection.execute('UPDATE products SET cost_price = ? WHERE id = ?', [avgCost, item.productId])
      }
    }

    // Check if PO is fully received
    const [poItems] = await connection.execute(
      'SELECT quantity, received_quantity FROM purchase_order_items WHERE po_id = ?',
      [poId]
    )
    const allReceived = poItems.every(i => i.received_quantity >= i.quantity)
    const someReceived = poItems.some(i => i.received_quantity > 0)

    // === Auto-create Invoice (ใบแจ้งหนี้มาพร้อมของ) ===
    let invoiceNumber = null
    let invoiceId = null
    if (req.body.taxInvoiceNumber || req.body.createInvoice !== false) {
      invoiceNumber = await generateDocNumber('INV', req.user.companyId, 'purchase_invoices', 'invoice_number')
      
      // Calculate invoice totals from received items
      const invSubtotal = items.reduce((s, i) => s + (i.receivedQuantity * i.costPerUnit), 0)
      const invVat = invSubtotal * 0.07
      const invWht = req.body.whtAmount || 0
      const invTotal = invSubtotal + invVat - invWht

      const [invResult] = await connection.execute(
        `INSERT INTO purchase_invoices (company_id, invoice_number, po_id, grn_id, contact_id, 
         invoice_date, due_date, tax_invoice_number, subtotal, vat_amount, wht_amount, total_amount, status, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [req.user.companyId, invoiceNumber, poId, grnResult.insertId, pos[0].contact_id,
         receivedDate || new Date().toISOString().slice(0, 10),
         req.body.dueDate || null, req.body.taxInvoiceNumber || null,
         invSubtotal, invVat, invWht, invTotal, note || null, req.user.id]
      )
      invoiceId = invResult.insertId
    }

    // Update PO status
    let newStatus
    if (allReceived) {
      newStatus = invoiceNumber ? 'invoiced' : 'received'
    } else {
      newStatus = someReceived ? 'partial' : 'approved'
    }
    await connection.execute(
      'UPDATE purchase_orders SET status = ? WHERE id = ?',
      [newStatus, poId]
    )

    await connection.commit()
    res.status(201).json({ 
      message: 'รับสินค้าสำเร็จ', 
      grnId: grnResult.insertId, grnNumber,
      invoiceId, invoiceNumber 
    })
  } catch (error) {
    await connection.rollback()
    console.error('Create GRN error:', error)
    res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// =============================================
// PURCHASE INVOICES
// =============================================

// GET /api/purchases/invoices/all — list invoices
router.get('/invoices/all', async (req, res) => {
  try {
    const invoices = await executeQuery(
      `SELECT pi.*, po.po_number, c.name as contact_name,
        gr.grn_number, u.full_name as created_by_name
       FROM purchase_invoices pi
       JOIN purchase_orders po ON pi.po_id = po.id
       LEFT JOIN contacts c ON pi.contact_id = c.id
       JOIN goods_receipts gr ON pi.grn_id = gr.id
       LEFT JOIN users u ON pi.created_by = u.id
       WHERE pi.company_id = ?
       ORDER BY pi.created_at DESC`,
      [req.user.companyId]
    )
    res.json(invoices)
  } catch (error) {
    console.error('Get invoices error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/purchases/invoices/:id — invoice detail
router.get('/invoices/:id', async (req, res) => {
  try {
    const invs = await executeQuery(
      `SELECT pi.*, po.po_number, c.name as contact_name,
        gr.grn_number
       FROM purchase_invoices pi
       JOIN purchase_orders po ON pi.po_id = po.id
       LEFT JOIN contacts c ON pi.contact_id = c.id
       JOIN goods_receipts gr ON pi.grn_id = gr.id
       WHERE pi.id = ? AND pi.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (invs.length === 0) return res.status(404).json({ message: 'ไม่พบใบแจ้งหนี้' })

    // Get payments for this invoice
    const payments = await executeQuery(
      `SELECT pp.*, u.full_name as created_by_name
       FROM purchase_payments pp
       LEFT JOIN users u ON pp.created_by = u.id
       WHERE pp.invoice_id = ?
       ORDER BY pp.payment_date DESC`,
      [req.params.id]
    )

    res.json({ ...invs[0], payments })
  } catch (error) {
    console.error('Get invoice detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// PURCHASE PAYMENTS
// =============================================

// GET /api/purchases/payments/all — list payments
router.get('/payments/all', async (req, res) => {
  try {
    const payments = await executeQuery(
      `SELECT pp.*, pi.invoice_number, pi.total_amount as invoice_total,
        po.po_number, c.name as contact_name,
        u.full_name as created_by_name
       FROM purchase_payments pp
       JOIN purchase_invoices pi ON pp.invoice_id = pi.id
       JOIN purchase_orders po ON pi.po_id = po.id
       LEFT JOIN contacts c ON pi.contact_id = c.id
       LEFT JOIN users u ON pp.created_by = u.id
       WHERE pp.company_id = ?
       ORDER BY pp.created_at DESC`,
      [req.user.companyId]
    )
    res.json(payments)
  } catch (error) {
    console.error('Get payments error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/purchases/payments — create payment
router.post('/payments', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { invoiceId, paymentDate, amount, paymentMethod, referenceNumber, bankName, note, paymentChannelId } = req.body

    if (!invoiceId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' })
    }

    // Verify invoice exists
    const [invs] = await connection.execute(
      `SELECT pi.*, po.id as po_id FROM purchase_invoices pi 
       JOIN purchase_orders po ON pi.po_id = po.id
       WHERE pi.id = ? AND pi.company_id = ? AND pi.status IN ('pending', 'partial')`,
      [invoiceId, req.user.companyId]
    )
    if (invs.length === 0) {
      return res.status(400).json({ message: 'ไม่พบใบแจ้งหนี้ หรือชำระครบแล้ว' })
    }

    const invoice = invs[0]
    const paymentNumber = await generateDocNumber('PAY', req.user.companyId, 'purchase_payments', 'payment_number')

    // Create payment
    await connection.execute(
      `INSERT INTO purchase_payments (company_id, payment_number, invoice_id, payment_date, amount, payment_method, payment_channel_id, reference_number, bank_name, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, paymentNumber, invoiceId,
       paymentDate || new Date().toISOString().slice(0, 10),
       amount, paymentMethod || 'transfer', paymentChannelId || null,
       referenceNumber || null, bankName || null, note || null, req.user.id]
    )

    // Update invoice paid_amount and status
    const newPaidAmount = parseFloat(invoice.paid_amount) + parseFloat(amount)
    const invStatus = newPaidAmount >= parseFloat(invoice.total_amount) ? 'paid' : 'partial'
    await connection.execute(
      'UPDATE purchase_invoices SET paid_amount = ?, status = ? WHERE id = ?',
      [newPaidAmount, invStatus, invoiceId]
    )

    // If invoice fully paid, update PO status to paid
    if (invStatus === 'paid') {
      await connection.execute(
        'UPDATE purchase_orders SET status = ? WHERE id = ?',
        ['paid', invoice.po_id]
      )
    }

    await connection.commit()
    res.status(201).json({ message: 'บันทึกการชำระเงินสำเร็จ', paymentNumber })
  } catch (error) {
    await connection.rollback()
    console.error('Create payment error:', error)
    res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// GET /api/purchases/:id/timeline — document flow timeline
router.get('/:id/timeline', async (req, res) => {
  try {
    const poId = req.params.id

    // PO info
    const pos = await executeQuery(
      `SELECT po.*, c.name as contact_name FROM purchase_orders po
       LEFT JOIN contacts c ON po.contact_id = c.id
       WHERE po.id = ? AND po.company_id = ?`,
      [poId, req.user.companyId]
    )
    if (pos.length === 0) return res.status(404).json({ message: 'ไม่พบ PO' })

    // GRNs
    const grns = await executeQuery(
      `SELECT gr.*, w.name as warehouse_name FROM goods_receipts gr
       JOIN warehouses w ON gr.warehouse_id = w.id
       WHERE gr.po_id = ? ORDER BY gr.created_at ASC`,
      [poId]
    )

    // Invoices
    const invoices = await executeQuery(
      `SELECT pi.* FROM purchase_invoices pi WHERE pi.po_id = ? ORDER BY pi.created_at ASC`,
      [poId]
    )

    // Payments
    const payments = await executeQuery(
      `SELECT pp.*, pi.invoice_number FROM purchase_payments pp
       JOIN purchase_invoices pi ON pp.invoice_id = pi.id
       WHERE pi.po_id = ? ORDER BY pp.created_at ASC`,
      [poId]
    )

    res.json({
      po: pos[0],
      grns,
      invoices,
      payments,
    })
  } catch (error) {
    console.error('Get timeline error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router

