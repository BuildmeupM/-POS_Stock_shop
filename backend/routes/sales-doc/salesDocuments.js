const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')
const { createJournalEntry, voidJournalEntry } = require('../../utils/journal')

router.use(auth, companyGuard)

// Helper: get VAT rate from company settings
async function getCompanyVatRate(companyId) {
  const rows = await executeQuery('SELECT settings FROM companies WHERE id = ?', [companyId])
  if (rows.length > 0 && rows[0].settings) {
    const s = typeof rows[0].settings === 'string' ? JSON.parse(rows[0].settings) : rows[0].settings
    if (s.vat_enabled === false) return 0
    return s.vat_rate || 7
  }
  return 7
}

// Doc type prefixes
const DOC_PREFIX = {
  quotation: 'QT', invoice: 'IV', receipt: 'RC', receipt_tax: 'RT',
  delivery: 'DN', receipt_abb: 'RA', debit_note: 'DB', credit_note: 'CN'
}

// =============================================
// GET /api/sales-doc — list documents
// =============================================
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { docType, status, from, to, customerId } = req.query
    let whereClause = 'WHERE sd.company_id = ?'
    const baseParams = [req.user.companyId]

    if (docType) { whereClause += ' AND sd.doc_type = ?'; baseParams.push(docType) }
    if (status) { whereClause += ' AND sd.status = ?'; baseParams.push(status) }
    if (from) { whereClause += ' AND sd.doc_date >= ?'; baseParams.push(from) }
    if (to) { whereClause += ' AND sd.doc_date <= ?'; baseParams.push(to) }
    if (customerId) { whereClause += ' AND sd.customer_id = ?'; baseParams.push(customerId) }

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM sales_documents sd ${whereClause}`, baseParams
      )
      const total = countResult.total

      const rows = await executeQuery(
        `SELECT sd.*, c.name as customer_name_ref, u.full_name as salesperson_name,
          cu.full_name as created_by_name
        FROM sales_documents sd
        LEFT JOIN customers c ON sd.customer_id = c.id
        LEFT JOIN users u ON sd.salesperson_id = u.id
        LEFT JOIN users cu ON sd.created_by = cu.id
        ${whereClause} ORDER BY sd.created_at DESC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const rows = await executeQuery(
        `SELECT sd.*, c.name as customer_name_ref, u.full_name as salesperson_name,
          cu.full_name as created_by_name
        FROM sales_documents sd
        LEFT JOIN customers c ON sd.customer_id = c.id
        LEFT JOIN users u ON sd.salesperson_id = u.id
        LEFT JOIN users cu ON sd.created_by = cu.id
        ${whereClause} ORDER BY sd.created_at DESC LIMIT 500`,
        baseParams
      )
      res.json(rows)
    }
  } catch (error) {
    console.error('List sales docs error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// GET /api/sales-doc/:id — detail
// =============================================
router.get('/:id', async (req, res) => {
  try {
    const docs = await executeQuery(
      `SELECT sd.*, c.name as customer_name_ref, u.full_name as salesperson_name
       FROM sales_documents sd
       LEFT JOIN customers c ON sd.customer_id = c.id
       LEFT JOIN users u ON sd.salesperson_id = u.id
       WHERE sd.id = ? AND sd.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (docs.length === 0) return res.status(404).json({ message: 'ไม่พบเอกสาร' })

    const items = await executeQuery(
      `SELECT sdi.*, p.name as product_name, p.sku
       FROM sales_document_items sdi
       LEFT JOIN products p ON sdi.product_id = p.id
       WHERE sdi.document_id = ?
       ORDER BY sdi.id`,
      [req.params.id]
    )

    res.json({ ...docs[0], items })
  } catch (error) {
    console.error('Get sales doc error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// POST /api/sales-doc — create document
// =============================================
router.post('/', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId
    const {
      docType, reference, saleId, customerId, customerName, customerAddress, customerTaxId,
      customerPhone, customerEmail, docDate, dueDate, validUntil,
      priceType, discountAmount, salespersonId, note, internalNote,
      items, status: docStatus,
    } = req.body

    if (!docType || !items || items.length === 0) {
      return res.status(400).json({ message: 'กรุณาระบุประเภทเอกสารและรายการสินค้า' })
    }

    const prefix = DOC_PREFIX[docType] || 'IV'
    const docNumber = await generateDocNumber(prefix, companyId, 'sales_documents', 'doc_number')
    const vatRate = await getCompanyVatRate(companyId)

    // === Validate min_selling_price for each product item ===
    for (const item of items) {
      if (!item.productId) continue
      const [prodRows] = await connection.execute(
        'SELECT name, min_selling_price FROM products WHERE id = ? AND company_id = ?',
        [item.productId, companyId]
      )
      if (prodRows.length === 0) continue
      const prod = prodRows[0]
      const minPrice = parseFloat(prod.min_selling_price) || 0
      if (minPrice <= 0) continue

      const listPrice = parseFloat(item.unitPrice) || 0
      const discPerUnit = item.discountType === 'percent'
        ? listPrice * (parseFloat(item.discountPerUnit) || 0) / 100
        : parseFloat(item.discountPerUnit) || 0
      const effectivePrice = listPrice - discPerUnit

      if (effectivePrice < minPrice) {
        await connection.rollback()
        return res.status(400).json({
          message: `ราคาขายสินค้า "${prod.name}" ต่ำกว่าราคาขายขั้นต่ำ (ขั้นต่ำ: ฿${minPrice.toFixed(2)}, ที่ขาย: ฿${effectivePrice.toFixed(2)})`
        })
      }
    }

    // Calculate items
    let subtotal = 0
    let totalVat = 0
    let totalWht = 0
    const processedItems = items.map(item => {
      const qty = parseFloat(item.quantity) || 1
      const price = parseFloat(item.unitPrice) || 0
      const discPerUnit = parseFloat(item.discountPerUnit) || 0
      const discType = item.discountType || 'baht'
      const actualDisc = discType === 'percent' ? (price * discPerUnit / 100) : discPerUnit
      const lineTotal = qty * (price - actualDisc)

      // VAT per item
      let lineVat = 0
      const vatType = item.vatType || 'vat7'
      if (vatType === 'vat7') {
        if (priceType === 'exclude_vat') {
          lineVat = lineTotal * (vatRate / 100)
        } else if (priceType === 'include_vat') {
          lineVat = lineTotal - (lineTotal / (1 + vatRate / 100))
        }
      }

      // WHT
      const whtRate = parseFloat(item.whtRate) || 0
      const lineWht = whtRate > 0 ? (lineTotal * whtRate / 100) : 0

      subtotal += lineTotal
      totalVat += lineVat
      totalWht += lineWht

      return { ...item, quantity: qty, unitPrice: price, discountPerUnit: actualDisc, subtotal: lineTotal }
    })


    const discount = parseFloat(discountAmount) || 0
    const amountBeforeVat = priceType === 'include_vat' ? (subtotal - totalVat - discount) : (subtotal - discount)
    const finalVat = priceType === 'no_vat' ? 0 : totalVat
    const totalAmount = amountBeforeVat + finalVat - totalWht
    const finalStatus = docStatus || 'draft'

    // Insert document
    const [docResult] = await connection.execute(
      `INSERT INTO sales_documents (company_id, doc_type, doc_number, reference, sale_id,
        customer_id, customer_name, customer_address, customer_tax_id, customer_phone, customer_email,
        doc_date, due_date, valid_until, price_type,
        subtotal, discount_amount, amount_before_vat, vat_rate, vat_amount, wht_amount, total_amount,
        status, salesperson_id, note, internal_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, docType, docNumber, reference || null, saleId || null,
        customerId || null, customerName || null, customerAddress || null,
        customerTaxId || null, customerPhone || null, customerEmail || null,
        docDate || new Date().toISOString().slice(0, 10), dueDate || null, validUntil || null,
        priceType || 'include_vat',
        subtotal, discount, amountBeforeVat, vatRate, finalVat, totalWht, totalAmount,
        finalStatus, salespersonId || null, note || null, internalNote || null, req.user.id]
    )
    const docId = docResult.insertId

    // Insert items
    for (const item of processedItems) {
      await connection.execute(
        `INSERT INTO sales_document_items (document_id, product_id, description, quantity, unit,
          unit_price, discount_per_unit, discount_type, vat_type, wht_rate, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [docId, item.productId || null, item.description || null,
          item.quantity, item.unit || 'ชิ้น',
          item.unitPrice, item.discountPerUnit, item.discountType || 'baht',
          item.vatType || 'vat7', parseFloat(item.whtRate) || 0, item.subtotal]
      )
    }

    // Auto-journal for approved invoice/receipt
    const journalDocTypes = ['invoice', 'receipt', 'receipt_tax', 'receipt_abb']
    if (finalStatus === 'approved' && journalDocTypes.includes(docType)) {
      const journalLines = [
        { accountCode: '1110', debit: totalAmount, credit: 0, description: `ลูกหนี้ ${docNumber}` },
        { accountCode: '4100', debit: 0, credit: amountBeforeVat, description: `รายได้ ${docNumber}` },
      ]
      if (finalVat > 0) {
        journalLines.push({ accountCode: '2120', debit: 0, credit: finalVat, description: `ภาษีขาย ${docNumber}` })
      }

      const docTypeNames = {
        invoice: 'ใบแจ้งหนี้', receipt_tax: 'ใบเสร็จ/ใบกำกับภาษี',
        receipt_abb: 'ใบกำกับภาษีอย่างย่อ', receipt: 'ใบเสร็จ',
      }
      const journalId = await createJournalEntry(connection, {
        companyId, entryDate: docDate || new Date().toISOString().slice(0, 10),
        description: `${docTypeNames[docType] || 'เอกสาร'} ${docNumber}`,
        referenceType: 'SALES_DOC', referenceId: docId, createdBy: req.user.id,
        lines: journalLines,
      })

      if (journalId) {
        await connection.execute('UPDATE sales_documents SET journal_entry_id = ? WHERE id = ?', [journalId, docId])
      }
    }

    // Handle immediate payment if payNow flag is set
    const { payNow, paymentMethod: payMethod, paymentChannelId: payChId } = req.body
    if (payNow && finalStatus === 'approved') {
      await connection.execute(
        `UPDATE sales_documents SET paid_amount = ?, payment_status = 'paid', payment_method = ?, payment_channel_id = ?, paid_at = NOW() WHERE id = ?`,
        [totalAmount, payMethod || 'cash', payChId || null, docId]
      )
    }

    await connection.commit()
    res.status(201).json({ message: 'สร้างเอกสารสำเร็จ', docId, docNumber })
  } catch (error) {
    await connection.rollback()
    console.error('Create sales doc error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// =============================================
// PUT /api/sales-doc/:id/approve — อนุมัติเอกสาร
// =============================================
router.put('/:id/approve', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId

    const [docs] = await connection.execute(
      "SELECT * FROM sales_documents WHERE id = ? AND company_id = ? AND status = 'draft'",
      [req.params.id, companyId]
    )
    if (docs.length === 0) return res.status(400).json({ message: 'ไม่พบเอกสารร่างที่จะอนุมัติ' })
    const doc = docs[0]

    await connection.execute("UPDATE sales_documents SET status = 'approved' WHERE id = ?", [doc.id])

    // Optionally handle immediate payment
    const { payNow, paymentMethod, paymentChannelId, amount } = req.body || {}
    if (payNow) {
      const payAmount = parseFloat(amount) || parseFloat(doc.total_amount)
      await connection.execute(
        `UPDATE sales_documents SET paid_amount = ?, payment_status = 'paid', payment_method = ?, payment_channel_id = ?, paid_at = NOW() WHERE id = ?`,
        [payAmount, paymentMethod || 'cash', paymentChannelId || null, doc.id]
      )
    }

    // Auto-journal for invoice/receipt
    const approveJournalTypes = ['invoice', 'receipt', 'receipt_tax', 'receipt_abb']
    if (approveJournalTypes.includes(doc.doc_type)) {
      const journalLines = [
        { accountCode: '1110', debit: parseFloat(doc.total_amount), credit: 0, description: `ลูกหนี้ ${doc.doc_number}` },
        { accountCode: '4100', debit: 0, credit: parseFloat(doc.amount_before_vat), description: `รายได้ ${doc.doc_number}` },
      ]
      if (parseFloat(doc.vat_amount) > 0) {
        journalLines.push({ accountCode: '2120', debit: 0, credit: parseFloat(doc.vat_amount), description: `ภาษีขาย ${doc.doc_number}` })
      }

      const docTypeNames = {
        invoice: 'ใบแจ้งหนี้', receipt_tax: 'ใบเสร็จ/ใบกำกับภาษี',
        receipt_abb: 'ใบกำกับภาษีอย่างย่อ', receipt: 'ใบเสร็จ',
      }
      const journalId = await createJournalEntry(connection, {
        companyId, entryDate: doc.doc_date,
        description: `อนุมัติ${docTypeNames[doc.doc_type] || 'เอกสาร'} ${doc.doc_number}`,
        referenceType: 'SALES_DOC', referenceId: doc.id, createdBy: req.user.id,
        lines: journalLines,
      })

      if (journalId) {
        await connection.execute('UPDATE sales_documents SET journal_entry_id = ? WHERE id = ?', [journalId, doc.id])
      }
    }

    await connection.commit()
    res.json({ message: 'อนุมัติเอกสารสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Approve sales doc error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// =============================================
// PUT /api/sales-doc/:id/pay — บันทึกชำระเงิน
// =============================================
router.put('/:id/pay', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const { amount, paymentMethod, paymentChannelId } = req.body

    const [docs] = await connection.execute(
      "SELECT * FROM sales_documents WHERE id = ? AND company_id = ? AND status = 'approved' AND payment_status != 'paid'",
      [req.params.id, req.user.companyId]
    )
    if (docs.length === 0) return res.status(400).json({ message: 'ไม่พบเอกสารที่จะชำระ' })
    const doc = docs[0]

    const payAmount = parseFloat(amount) || parseFloat(doc.total_amount)
    const newPaid = parseFloat(doc.paid_amount) + payAmount
    const payStatus = newPaid >= parseFloat(doc.total_amount) ? 'paid' : 'partial'

    await connection.execute(
      `UPDATE sales_documents SET paid_amount = ?, payment_status = ?, payment_method = ?,
        payment_channel_id = ?, paid_at = NOW() WHERE id = ?`,
      [newPaid, payStatus, paymentMethod || 'cash', paymentChannelId || null, doc.id]
    )

    // Journal: Dr. Cash / Cr. Receivable
    if (payAmount > 0) {
      await createJournalEntry(connection, {
        companyId: req.user.companyId,
        entryDate: new Date().toISOString().slice(0, 10),
        description: `รับชำระ ${doc.doc_number}`,
        referenceType: 'SALES_DOC_PAY', referenceId: doc.id, createdBy: req.user.id,
        lines: [
          { accountCode: '1100', debit: payAmount, credit: 0, description: `รับเงิน ${doc.doc_number}` },
          { accountCode: '1110', debit: 0, credit: payAmount, description: `ลดลูกหนี้ ${doc.doc_number}` },
        ],
      })
    }

    await connection.commit()
    res.json({ message: 'บันทึกชำระเงินสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Pay sales doc error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// =============================================
// PUT /api/sales-doc/:id/void — ยกเลิกเอกสาร
// =============================================
router.put('/:id/void', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [docs] = await connection.execute(
      "SELECT * FROM sales_documents WHERE id = ? AND company_id = ? AND status != 'voided'",
      [req.params.id, req.user.companyId]
    )
    if (docs.length === 0) return res.status(400).json({ message: 'ไม่พบเอกสาร' })

    if (docs[0].journal_entry_id) {
      await voidJournalEntry(connection, docs[0].journal_entry_id)
    }

    await connection.execute("UPDATE sales_documents SET status = 'voided' WHERE id = ?", [req.params.id])

    await connection.commit()
    res.json({ message: 'ยกเลิกเอกสารสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Void sales doc error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// =============================================
// DELETE /api/sales-doc/:id — ลบเอกสาร (เฉพาะ draft/voided)
// =============================================
router.delete('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId

    const [docs] = await connection.execute(
      'SELECT * FROM sales_documents WHERE id = ? AND company_id = ?',
      [req.params.id, companyId]
    )
    if (docs.length === 0) {
      await connection.rollback()
      return res.status(404).json({ message: 'ไม่พบเอกสาร' })
    }
    const doc = docs[0]

    // Only allow deletion of draft or voided documents
    if (doc.status !== 'draft' && doc.status !== 'voided') {
      await connection.rollback()
      return res.status(400).json({
        message: 'ลบได้เฉพาะเอกสารสถานะ "ร่าง" หรือ "ยกเลิก" เท่านั้น กรุณายกเลิกเอกสารก่อนลบ',
      })
    }

    // Check if other documents reference this one (ref_doc_id)
    const [refs] = await connection.execute(
      'SELECT id, doc_number FROM sales_documents WHERE ref_doc_id = ? AND company_id = ?',
      [req.params.id, companyId]
    )
    if (refs.length > 0) {
      await connection.rollback()
      return res.status(400).json({
        message: `ไม่สามารถลบได้ เอกสารนี้ถูกอ้างอิงโดย ${refs.map(r => r.doc_number).join(', ')}`,
      })
    }

    // Void journal entry if exists (shouldn't for draft, but safety for voided)
    if (doc.journal_entry_id) {
      await voidJournalEntry(connection, doc.journal_entry_id)
    }

    // Delete items (CASCADE should handle, but explicit for safety)
    await connection.execute('DELETE FROM sales_document_items WHERE document_id = ?', [req.params.id])

    // Delete the document
    await connection.execute('DELETE FROM sales_documents WHERE id = ? AND company_id = ?', [req.params.id, companyId])

    await connection.commit()
    res.json({ message: 'ลบเอกสารสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Delete sales doc error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// =============================================
// POST /api/sales-doc/:id/convert — แปลง QT→IV หรือ IV→RC
// =============================================
router.post('/:id/convert', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user.companyId
    const { targetType } = req.body // 'invoice' or 'receipt'

    const doc = await executeQuery(
      "SELECT * FROM sales_documents WHERE id = ? AND company_id = ? AND status IN ('approved', 'accepted')",
      [req.params.id, companyId]
    )
    if (doc.length === 0) return res.status(400).json({ message: 'ไม่พบเอกสารที่จะแปลง' })

    const items = await executeQuery('SELECT * FROM sales_document_items WHERE document_id = ?', [req.params.id])

    // Create new doc via the same POST logic
    res.json({
      message: 'พร้อมสร้างเอกสารใหม่',
      sourceDoc: doc[0],
      items,
      suggestedType: targetType || 'invoice',
    })
  } catch (error) {
    console.error('Convert sales doc error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
