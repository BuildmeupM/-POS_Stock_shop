const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { deductStockFIFO } = require('../../utils/fifo')
const { generateDocNumber } = require('../../utils/docNumber')
const { createJournalEntry, voidJournalEntry } = require('../../utils/journal')
const { validate } = require('../../middleware/validate')
const { createSaleSchema } = require('../../middleware/schemas')
const { writeAuditLog } = require('../../middleware/auditLog')


router.use(auth, companyGuard)

// POST /api/sales — create sale (POS checkout)
router.post('/', roleCheck('owner', 'admin', 'manager', 'cashier'), validate(createSaleSchema), async (req, res) => {
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
        'SELECT selling_price, min_selling_price, is_consignment FROM products WHERE id = ? AND company_id = ?',
        [item.productId, companyId]
      )
      if (products.length === 0) continue

      const product = products[0]
      const unitPrice = item.unitPrice || parseFloat(product.selling_price)
      const discount = item.discount || 0
      // Effective price per unit after line-level discount
      const effectiveUnitPrice = item.quantity > 0 ? (unitPrice - discount / item.quantity) : unitPrice
      const minPrice = parseFloat(product.min_selling_price) || 0

      // Enforce minimum selling price
      if (minPrice > 0 && effectiveUnitPrice < minPrice) {
        await connection.rollback()
        return res.status(400).json({
          message: `ราคาขายสินค้า ID ${item.productId} ต่ำกว่าราคาขายขั้นต่ำ (ขั้นต่ำ: ฿${minPrice.toFixed(2)}, ที่ขาย: ฿${effectiveUnitPrice.toFixed(2)})`
        })
      }

      const subtotal = (unitPrice * item.quantity) - discount
      const isConsignment = product.is_consignment || false

      let costPrice = 0
      let consignmentStockId = null

      if (isConsignment) {
        // === Consignment: ตัดสต๊อกฝากขาย + บันทึก commission ===
        const [csRows] = await connection.execute(
          `SELECT cs.id, cs.quantity_on_hand, cs.consignor_price, cs.selling_price,
            ca.commission_type, ca.commission_rate, ca.id as agreement_id
           FROM consignment_stock cs
           JOIN consignment_agreements ca ON cs.agreement_id = ca.id
           WHERE cs.product_id = ? AND ca.company_id = ? AND ca.status = 'active' AND cs.quantity_on_hand >= ?
           ORDER BY cs.received_at ASC LIMIT 1`,
          [item.productId, companyId, item.quantity]
        )
        if (csRows.length === 0) {
          await connection.rollback()
          return res.status(400).json({ message: `สินค้าฝากขายคงเหลือไม่พอ: ${item.productId}` })
        }
        const cs = csRows[0]
        consignmentStockId = cs.id
        costPrice = parseFloat(cs.consignor_price)

        // Calculate commission
        let commissionAmount = 0
        if (cs.commission_type === 'percent') {
          commissionAmount = subtotal * (parseFloat(cs.commission_rate) / 100)
        } else {
          commissionAmount = parseFloat(cs.commission_rate) * item.quantity
        }

        // Update consignment stock
        await connection.execute(
          'UPDATE consignment_stock SET quantity_sold = quantity_sold + ?, quantity_on_hand = quantity_on_hand - ? WHERE id = ?',
          [item.quantity, item.quantity, cs.id]
        )

        // Log consignment transaction
        await connection.execute(
          `INSERT INTO consignment_transactions (agreement_id, product_id, type, quantity,
            consignor_price, selling_price, commission_amount, sale_id, created_by)
           VALUES (?, ?, 'SALE', ?, ?, ?, ?, NULL, ?)`,
          [cs.agreement_id, item.productId, item.quantity,
            cs.consignor_price, unitPrice, commissionAmount, req.user.id]
        )

        // No COGS for consignment — store consignor_price as costPrice for reference only
      } else {
        // === Regular: FIFO stock deduction ===
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
      }

      totalAmount += subtotal
      saleItems.push({ ...item, unitPrice, discount, subtotal, costPrice, isConsignment, consignmentStockId })
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
        `INSERT INTO sale_items (sale_id, product_id, service_name, quantity, unit_price, cost_price, discount, subtotal, is_consignment, consignment_stock_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.productId || null, item.serviceName || null, item.quantity, item.unitPrice, item.costPrice, item.discount, item.subtotal,
          item.isConsignment || false, item.consignmentStockId || null]
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

    // === Auto Journal Entry ===
    const today = new Date().toISOString().slice(0, 10)
    const roundedVat = Math.round(vatAmount * 100) / 100

    const journalLines = []

    // Debit: Cash / Bank (1100) — net amount received
    journalLines.push({
      accountCode: '1100', debit: netAmount, credit: 0,
      description: `รับชำระค่าขาย ${invoiceNumber}`,
    })

    // Credit: Revenue (4100) — sales amount excluding VAT
    const revenueAmount = netAmount - roundedVat
    if (revenueAmount > 0) {
      journalLines.push({
        accountCode: '4100', debit: 0, credit: revenueAmount,
        description: `รายได้จากการขาย ${invoiceNumber}`,
      })
    }

    // Credit: VAT Payable (2120) — if VAT > 0
    if (roundedVat > 0) {
      journalLines.push({
        accountCode: '2120', debit: 0, credit: roundedVat,
        description: `ภาษีขาย ${invoiceNumber}`,
      })
    }

    // Debit: Cost of Goods Sold (5100) / Credit: Inventory (1200) — COGS (สินค้าปกติเท่านั้น)
    if (totalCostAmount > 0) {
      journalLines.push({
        accountCode: '5100', debit: totalCostAmount, credit: 0,
        description: `ต้นทุนขาย ${invoiceNumber}`,
      })
      journalLines.push({
        accountCode: '1200', debit: 0, credit: totalCostAmount,
        description: `ตัดสต๊อกสินค้า ${invoiceNumber}`,
      })
    }

    // === Consignment journal: ฝากขาย ===
    // สินค้าฝากขาย: ร้านได้เฉพาะค่าคอมฯ ส่วนที่เหลือเป็นเจ้าหนี้ผู้ฝากขาย
    const consignmentItems = saleItems.filter(i => i.isConsignment)
    if (consignmentItems.length > 0) {
      let totalConsignorPayable = 0
      let totalCommission = 0
      for (const ci of consignmentItems) {
        const consignorCost = ci.costPrice * ci.quantity
        const commission = ci.subtotal - consignorCost
        totalConsignorPayable += consignorCost
        totalCommission += commission
      }
      // Credit: เจ้าหนี้ผู้ฝากขาย (2150)
      if (totalConsignorPayable > 0) {
        journalLines.push({
          accountCode: '2150', debit: 0, credit: totalConsignorPayable,
          description: `เจ้าหนี้ฝากขาย ${invoiceNumber}`,
        })
      }
      // Credit: รายได้ค่าคอมมิชชัน (4200) — แทนที่ Revenue ปกติสำหรับส่วนฝากขาย
      if (totalCommission > 0) {
        journalLines.push({
          accountCode: '4200', debit: 0, credit: totalCommission,
          description: `ค่าคอมมิชชันฝากขาย ${invoiceNumber}`,
        })
        // ลดยอด Revenue (4100) ที่บันทึกไว้ข้างต้น เฉพาะส่วนฝากขาย
        const consignmentSalesTotal = consignmentItems.reduce((s, i) => s + i.subtotal, 0)
        journalLines.push({
          accountCode: '4100', debit: consignmentSalesTotal, credit: 0,
          description: `ปรับรายได้ส่วนฝากขาย ${invoiceNumber}`,
        })
      }
    }

    await createJournalEntry(connection, {
      companyId, entryDate: today, description: `ขายสินค้า ${invoiceNumber}`,
      referenceType: 'SALE', referenceId: saleId, createdBy: req.user.id,
      lines: journalLines,
    })

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'sale', entityId: saleId,
      description: `สร้างบิลขาย ${invoiceNumber}`,
      newValues: { invoiceNumber, totalAmount, discountAmount: discount, vatAmount: roundedVat, netAmount, paymentMethod: paymentMethod || 'cash', itemCount: saleItems.length },
      req,
    })

    // === Auto-earn loyalty points ===
    let pointsEarned = 0
    if (customerId) {
      const pointsPerBaht = settings.points_per_baht ?? 0
      if (pointsPerBaht > 0) {
        pointsEarned = Math.floor(netAmount * pointsPerBaht)
        if (pointsEarned > 0) {
          // Check if this is a contact (ct_ prefix) or customer
          const isContact = String(customerId).startsWith('ct_')
          const contactIdNum = isContact ? String(customerId).replace('ct_', '') : null
          if (contactIdNum) {
            const [contactRows] = await connection.execute(
              'SELECT points_balance FROM contacts WHERE id = ? AND company_id = ?',
              [contactIdNum, companyId]
            )
            if (contactRows.length > 0) {
              const currentBalance = contactRows[0].points_balance || 0
              const newBalance = currentBalance + pointsEarned
              await connection.execute(
                'UPDATE contacts SET points_balance = ? WHERE id = ? AND company_id = ?',
                [newBalance, contactIdNum, companyId]
              )
              await connection.execute(
                `INSERT INTO loyalty_transactions (company_id, contact_id, sale_id, type, points, balance_after, description, created_by)
                 VALUES (?, ?, ?, 'earn', ?, ?, ?, ?)`,
                [companyId, contactIdNum, saleId, pointsEarned, newBalance,
                 `สะสมแต้มจากบิล ${invoiceNumber}`, req.user.id]
              )
            }
          }
        }
      }
    }

    await connection.commit()



    res.status(201).json({
      message: 'บันทึกการขายสำเร็จ',
      saleId,
      invoiceNumber,
      totalAmount,
      discountAmount: discount,
      vatAmount: roundedVat,
      netAmount,
      pointsEarned,
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
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { from, to, status, saleType } = req.query
    let whereClause = 'WHERE s.company_id = ?'
    const baseParams = [req.user.companyId]

    if (from) { whereClause += ' AND s.sold_at >= ?'; baseParams.push(from) }
    if (to) { whereClause += ' AND s.sold_at <= ?'; baseParams.push(to) }
    if (status) { whereClause += ' AND s.status = ?'; baseParams.push(status) }
    if (saleType) { whereClause += ' AND s.sale_type = ?'; baseParams.push(saleType) }

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM sales s ${whereClause}`, baseParams
      )
      const total = countResult.total

      const sales = await executeQuery(
        `SELECT s.*, u.full_name as cashier_name, c.name as customer_name,
          (SELECT GROUP_CONCAT(CONCAT(sd.doc_type, ':', sd.doc_number) SEPARATOR '|')
           FROM sales_documents sd WHERE sd.sale_id = s.id AND sd.status != 'voided') as linked_doc_refs
        FROM sales s
        LEFT JOIN users u ON s.cashier_id = u.id
        LEFT JOIN customers c ON s.customer_id = c.id
        ${whereClause} ORDER BY s.sold_at DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: sales, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const sales = await executeQuery(
        `SELECT s.*, u.full_name as cashier_name, c.name as customer_name,
          (SELECT GROUP_CONCAT(CONCAT(sd.doc_type, ':', sd.doc_number) SEPARATOR '|')
           FROM sales_documents sd WHERE sd.sale_id = s.id AND sd.status != 'voided') as linked_doc_refs
        FROM sales s
        LEFT JOIN users u ON s.cashier_id = u.id
        LEFT JOIN customers c ON s.customer_id = c.id
        ${whereClause} ORDER BY s.sold_at DESC LIMIT 500`,
        baseParams
      )
      res.json(sales)
    }
  } catch (error) {
    console.error('Get sales error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/sales/customers/all
router.get('/customers/all', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    if (page > 0) {
      const [countResult] = await executeQuery(
        'SELECT COUNT(*) as total FROM customers WHERE company_id = ? AND is_active = TRUE',
        [req.user.companyId]
      )
      const total = countResult.total

      const customers = await executeQuery(
        'SELECT * FROM customers WHERE company_id = ? AND is_active = TRUE ORDER BY name LIMIT ? OFFSET ?',
        [req.user.companyId, limit, offset]
      )
      res.json({ data: customers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const customers = await executeQuery(
        'SELECT * FROM customers WHERE company_id = ? AND is_active = TRUE ORDER BY name LIMIT 500',
        [req.user.companyId]
      )
      res.json(customers)
    }
  } catch (error) {
    console.error('Get customers error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/sales/customers/search — ค้นหาจากทั้ง customers + contacts (type=customer/both)
router.get('/customers/search', async (req, res) => {
  try {
    const { q } = req.query
    const companyId = req.user.companyId
    const results = []

    // 1) Search from customers table
    let cQuery = 'SELECT id, name, phone, email, tax_id, address, customer_type, "customer" as source FROM customers WHERE company_id = ? AND is_active = TRUE'
    const cParams = [companyId]
    if (q && q.trim()) {
      cQuery += ' AND (name LIKE ? OR phone LIKE ? OR tax_id LIKE ?)'
      const s = `%${q.trim()}%`
      cParams.push(s, s, s)
    }
    cQuery += ' ORDER BY name LIMIT 10'
    const customers = await executeQuery(cQuery, cParams)
    results.push(...customers)

    // 2) Search from contacts table (customer/both)
    let ctQuery = `SELECT id, name, phone, email, tax_id, address, contact_type as customer_type, points_balance, price_level, "contact" as source
      FROM contacts WHERE company_id = ? AND is_active = TRUE AND contact_type IN ('customer', 'both')`
    const ctParams = [companyId]
    if (q && q.trim()) {
      ctQuery += ' AND (name LIKE ? OR phone LIKE ? OR tax_id LIKE ?)'
      const s = `%${q.trim()}%`
      ctParams.push(s, s, s)
    }
    ctQuery += ' ORDER BY name LIMIT 10'
    const contacts = await executeQuery(ctQuery, ctParams)
    // Prefix contact IDs to avoid collision with customer IDs
    results.push(...contacts.map(c => ({ ...c, id: `ct_${c.id}`, contact_id: c.id })))

    // If no search, limit to 5 most recent
    if (!q || !q.trim()) {
      res.json(results.slice(0, 5))
    } else {
      res.json(results.slice(0, 20))
    }
  } catch (error) {
    console.error('Search customers error:', error)
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

    // Linked sales documents (ใบเสร็จรับเงิน, ใบกำกับภาษี, etc.) — include voided for display
    const linkedDocs = await executeQuery(
      `SELECT id, doc_type, doc_number, status, total_amount, created_at
       FROM sales_documents WHERE sale_id = ?
       ORDER BY created_at DESC`,
      [req.params.id]
    )

    res.json({ ...sales[0], items, payments, linkedDocs })
  } catch (error) {
    console.error('Get sale detail error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/sales/:id/void — void sale
router.put('/:id/void', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const companyId = req.user.companyId
    const saleId = req.params.id

    // Get sale info
    const [sales] = await connection.execute(
      "SELECT * FROM sales WHERE id = ? AND company_id = ? AND status = 'completed'",
      [saleId, companyId]
    )
    if (sales.length === 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'ไม่พบบิลหรือยกเลิกแล้ว' })
    }
    const sale = sales[0]

    // Update sale status
    await connection.execute(
      "UPDATE sales SET status = 'voided' WHERE id = ? AND company_id = ?",
      [saleId, companyId]
    )

    // Void the original journal entry for this sale
    const [originalJournals] = await connection.execute(
      "SELECT id FROM journal_entries WHERE company_id = ? AND reference_type = 'SALE' AND reference_id = ? AND status = 'posted'",
      [companyId, saleId]
    )
    for (const j of originalJournals) {
      await voidJournalEntry(connection, j.id)
    }

    // === Restore stock: regular items (FIFO reverse) ===
    const [itemsToRestore] = await connection.execute(
      `SELECT si.product_id, si.quantity, si.cost_price, si.is_consignment, si.consignment_stock_id
       FROM sale_items si WHERE si.sale_id = ? AND si.product_id IS NOT NULL`,
      [saleId]
    )

    const [warehouses] = await connection.execute(
      'SELECT id FROM warehouses WHERE company_id = ? AND is_active = TRUE LIMIT 1',
      [companyId]
    )
    const warehouseId = warehouses[0]?.id

    for (const item of itemsToRestore) {
      if (item.is_consignment && item.consignment_stock_id) {
        // === Restore consignment stock ===
        await connection.execute(
          'UPDATE consignment_stock SET quantity_sold = quantity_sold - ?, quantity_on_hand = quantity_on_hand + ? WHERE id = ?',
          [item.quantity, item.quantity, item.consignment_stock_id]
        )
      } else if (warehouseId) {
        // === Restore regular stock (คืนกลับ stock_lots — FIFO reverse) ===
        const [latestLot] = await connection.execute(
          `SELECT id FROM stock_lots
           WHERE product_id = ? AND warehouse_id = ?
           ORDER BY received_at DESC LIMIT 1`,
          [item.product_id, warehouseId]
        )
        if (latestLot.length > 0) {
          await connection.execute(
            'UPDATE stock_lots SET quantity_remaining = quantity_remaining + ? WHERE id = ?',
            [item.quantity, latestLot[0].id]
          )
        } else {
          // ไม่เคยมี lot → สร้าง lot ใหม่
          await connection.execute(
            `INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit)
             VALUES (?, ?, ?, ?)`,
            [item.product_id, warehouseId, item.quantity, item.cost_price]
          )
        }
        // Insert reverse stock transaction
        await connection.execute(
          `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, reference_id, note, created_by)
           VALUES (?, ?, 'RETURN', ?, ?, 'VOID_SALE', ?, ?, ?)`,
          [item.product_id, warehouseId, item.quantity, item.cost_price, saleId, `คืนสต๊อกจากยกเลิกบิล`, req.user.id]
        )
      }
    }

    // === Void linked sales documents ===
    const [linkedDocs] = await connection.execute(
      "SELECT id, journal_entry_id FROM sales_documents WHERE sale_id = ? AND status != 'voided'",
      [saleId]
    )
    for (const doc of linkedDocs) {
      if (doc.journal_entry_id) {
        await voidJournalEntry(connection, doc.journal_entry_id)
      }
      await connection.execute(
        "UPDATE sales_documents SET status = 'voided' WHERE id = ?",
        [doc.id]
      )
    }

    // Create reverse journal
    const netAmount = parseFloat(sale.net_amount) || 0
    const vatAmount = parseFloat(sale.vat_amount) || 0
    const revenueAmount = netAmount - vatAmount

    // Get COGS from sale items
    const [costRows] = await connection.execute(
      'SELECT SUM(quantity * cost_price) as total_cost FROM sale_items WHERE sale_id = ? AND product_id IS NOT NULL AND (is_consignment = FALSE OR is_consignment IS NULL)',
      [saleId]
    )
    const totalCost = parseFloat(costRows[0]?.total_cost) || 0

    const reverseLines = []
    // Reverse: Credit Cash, Debit Revenue
    if (netAmount > 0) {
      reverseLines.push({ accountCode: '1100', debit: 0, credit: netAmount, description: `กลับรายการขาย ${sale.invoice_number}` })
    }
    if (revenueAmount > 0) {
      reverseLines.push({ accountCode: '4100', debit: revenueAmount, credit: 0, description: `กลับรายได้ ${sale.invoice_number}` })
    }
    if (vatAmount > 0) {
      reverseLines.push({ accountCode: '2120', debit: vatAmount, credit: 0, description: `กลับภาษีขาย ${sale.invoice_number}` })
    }
    // Reverse COGS (regular items only)
    if (totalCost > 0) {
      reverseLines.push({ accountCode: '5100', debit: 0, credit: totalCost, description: `กลับต้นทุนขาย ${sale.invoice_number}` })
      reverseLines.push({ accountCode: '1200', debit: totalCost, credit: 0, description: `คืนสต๊อก ${sale.invoice_number}` })
    }

    // Reverse consignment entries
    const consignmentItems = itemsToRestore.filter(i => i.is_consignment)
    if (consignmentItems.length > 0) {
      let totalConsignorPayable = 0
      for (const ci of consignmentItems) {
        totalConsignorPayable += parseFloat(ci.cost_price) * ci.quantity
      }
      if (totalConsignorPayable > 0) {
        reverseLines.push({ accountCode: '2150', debit: totalConsignorPayable, credit: 0, description: `กลับเจ้าหนี้ฝากขาย ${sale.invoice_number}` })
      }
    }

    await createJournalEntry(connection, {
      companyId, entryDate: new Date().toISOString().slice(0, 10),
      description: `ยกเลิกบิล ${sale.invoice_number}`,
      referenceType: 'VOID_SALE', referenceId: saleId,
      createdBy: req.user.id, lines: reverseLines,
    })

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'VOID', entityType: 'sale', entityId: saleId,
      description: `ยกเลิกบิลขาย ${sale.invoice_number}`,
      oldValues: { invoiceNumber: sale.invoice_number, netAmount: sale.net_amount, status: 'completed' },
      newValues: { status: 'voided' },
      req,
    })

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

// DELETE /api/sales/:id — hard-delete a voided sale
router.delete('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId
    const saleId = req.params.id

    const [rows] = await connection.execute(
      'SELECT id, status, invoice_number FROM sales WHERE id = ? AND company_id = ?',
      [saleId, companyId]
    )
    if (rows.length === 0) {
      await connection.rollback()
      return res.status(404).json({ message: 'ไม่พบบิลขาย' })
    }
    if (rows[0].status !== 'voided') {
      await connection.rollback()
      return res.status(400).json({ message: 'ลบได้เฉพาะบิลที่ยกเลิกแล้วเท่านั้น กรุณายกเลิกบิลก่อนลบ' })
    }

    // Check for linked sales documents
    const [linkedDocs] = await connection.execute(
      'SELECT id, doc_number FROM sales_documents WHERE sale_id = ? AND company_id = ?',
      [saleId, companyId]
    )
    if (linkedDocs.length > 0) {
      const nonVoided = linkedDocs.filter((d) => d.status !== 'voided')
      if (nonVoided.length > 0) {
        await connection.rollback()
        return res.status(400).json({
          message: `ไม่สามารถลบได้ บิลนี้มีเอกสารที่ยังไม่ได้ยกเลิก: ${nonVoided.map(d => d.doc_number).join(', ')}`
        })
      }
      // Delete linked voided documents & their items
      for (const doc of linkedDocs) {
        await connection.execute('DELETE FROM sales_document_items WHERE document_id = ?', [doc.id])
        await connection.execute('DELETE FROM sales_documents WHERE id = ?', [doc.id])
      }
    }

    // Delete payments, sale_items (CASCADE), then sale
    await connection.execute('DELETE FROM payments WHERE sale_id = ?', [saleId])
    await connection.execute('DELETE FROM sale_items WHERE sale_id = ?', [saleId])
    await connection.execute('DELETE FROM sales WHERE id = ? AND company_id = ?', [saleId, companyId])

    await writeAuditLog({
      companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'DELETE', entityType: 'sale', entityId: saleId,
      description: `ลบบิลขาย ${rows[0].invoice_number}`,
      oldValues: { invoiceNumber: rows[0].invoice_number, status: rows[0].status },
      req,
    })

    await connection.commit()

    res.json({ message: 'ลบบิลสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Delete sale error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบบิล' })
  } finally {
    connection.release()
  }
})

module.exports = router
