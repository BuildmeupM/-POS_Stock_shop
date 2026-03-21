const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')
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
const DOC_PREFIX = { quotation: 'QT', invoice: 'IV', receipt: 'RC', delivery: 'DN' }

// =============================================
// GET /api/sales-doc — list documents
// =============================================
router.get('/', async (req, res) => {
  try {
    const { docType, status, from, to, customerId } = req.query
    let query = `
      SELECT sd.*, c.name as customer_name_ref, u.full_name as salesperson_name,
        cu.full_name as created_by_name
      FROM sales_documents sd
      LEFT JOIN customers c ON sd.customer_id = c.id
      LEFT JOIN users u ON sd.salesperson_id = u.id
      LEFT JOIN users cu ON sd.created_by = cu.id
      WHERE sd.company_id = ?`
    const params = [req.user.companyId]

    if (docType) { query += ' AND sd.doc_type = ?'; params.push(docType) }
    if (status) { query += ' AND sd.status = ?'; params.push(status) }
    if (from) { query += ' AND sd.doc_date >= ?'; params.push(from) }
    if (to) { query += ' AND sd.doc_date <= ?'; params.push(to) }
    if (customerId) { query += ' AND sd.customer_id = ?'; params.push(customerId) }

    query += ' ORDER BY sd.created_at DESC LIMIT 200'
    res.json(await executeQuery(query, params))
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
router.post('/', async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const companyId = req.user.companyId
    const {
      docType, reference, customerId, customerName, customerAddress, customerTaxId,
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
      `INSERT INTO sales_documents (company_id, doc_type, doc_number, reference,
        customer_id, customer_name, customer_address, customer_tax_id, customer_phone, customer_email,
        doc_date, due_date, valid_until, price_type,
        subtotal, discount_amount, amount_before_vat, vat_rate, vat_amount, wht_amount, total_amount,
        status, salesperson_id, note, internal_note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, docType, docNumber, reference || null,
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
    if (finalStatus === 'approved' && (docType === 'invoice' || docType === 'receipt')) {
      const journalLines = [
        { accountCode: '1110', debit: totalAmount, credit: 0, description: `ลูกหนี้ ${docNumber}` },
        { accountCode: '4100', debit: 0, credit: amountBeforeVat, description: `รายได้ ${docNumber}` },
      ]
      if (finalVat > 0) {
        journalLines.push({ accountCode: '2120', debit: 0, credit: finalVat, description: `ภาษีขาย ${docNumber}` })
      }

      const journalId = await createJournalEntry(connection, {
        companyId, entryDate: docDate || new Date().toISOString().slice(0, 10),
        description: `${docType === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จ'} ${docNumber}`,
        referenceType: 'SALES_DOC', referenceId: docId, createdBy: req.user.id,
        lines: journalLines,
      })

      if (journalId) {
        await connection.execute('UPDATE sales_documents SET journal_entry_id = ? WHERE id = ?', [journalId, docId])
      }
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
router.put('/:id/approve', async (req, res) => {
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

    // Auto-journal for invoice/receipt
    if (doc.doc_type === 'invoice' || doc.doc_type === 'receipt') {
      const journalLines = [
        { accountCode: '1110', debit: parseFloat(doc.total_amount), credit: 0, description: `ลูกหนี้ ${doc.doc_number}` },
        { accountCode: '4100', debit: 0, credit: parseFloat(doc.amount_before_vat), description: `รายได้ ${doc.doc_number}` },
      ]
      if (parseFloat(doc.vat_amount) > 0) {
        journalLines.push({ accountCode: '2120', debit: 0, credit: parseFloat(doc.vat_amount), description: `ภาษีขาย ${doc.doc_number}` })
      }

      const journalId = await createJournalEntry(connection, {
        companyId, entryDate: doc.doc_date,
        description: `อนุมัติ${doc.doc_type === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบเสร็จ'} ${doc.doc_number}`,
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
router.put('/:id/pay', async (req, res) => {
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
router.put('/:id/void', async (req, res) => {
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
// POST /api/sales-doc/:id/convert — แปลง QT→IV หรือ IV→RC
// =============================================
router.post('/:id/convert', async (req, res) => {
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
