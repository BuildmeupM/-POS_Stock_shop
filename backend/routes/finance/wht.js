const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// =============================================
// GET /api/wht/summary — WHT summary for filing
// =============================================
router.get('/summary', async (req, res) => {
  try {
    const { taxYear, taxMonth, formType } = req.query
    let query = `
      SELECT
        tax_year, tax_month, form_type,
        COUNT(*) as cert_count,
        SUM(paid_amount) as total_paid,
        SUM(wht_amount) as total_wht
      FROM wht_certificates
      WHERE company_id = ? AND status != 'voided'`
    const params = [req.user.companyId]

    if (taxYear) { query += ' AND tax_year = ?'; params.push(taxYear) }
    if (taxMonth) { query += ' AND tax_month = ?'; params.push(taxMonth) }
    if (formType) { query += ' AND form_type = ?'; params.push(formType) }

    query += ' GROUP BY tax_year, tax_month, form_type ORDER BY tax_year DESC, tax_month DESC'
    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('WHT summary error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// GET /api/wht — List WHT certificates
// =============================================
router.get('/', async (req, res) => {
  try {
    const { formType, taxMonth, taxYear, contactId, status } = req.query
    let query = `
      SELECT w.*, c.name as contact_name, c.tax_id as contact_tax_id,
        u.full_name as created_by_name
      FROM wht_certificates w
      LEFT JOIN contacts c ON w.contact_id = c.id
      LEFT JOIN users u ON w.created_by = u.id
      WHERE w.company_id = ?`
    const params = [req.user.companyId]

    if (formType) { query += ' AND w.form_type = ?'; params.push(formType) }
    if (taxMonth) { query += ' AND w.tax_month = ?'; params.push(taxMonth) }
    if (taxYear) { query += ' AND w.tax_year = ?'; params.push(taxYear) }
    if (contactId) { query += ' AND w.contact_id = ?'; params.push(contactId) }
    if (status) { query += ' AND w.status = ?'; params.push(status) }

    query += ' ORDER BY w.created_at DESC LIMIT 200'
    res.json(await executeQuery(query, params))
  } catch (error) {
    console.error('List WHT error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// GET /api/wht/:id — Get WHT certificate detail
// =============================================
router.get('/:id', async (req, res) => {
  try {
    const rows = await executeQuery(
      `SELECT w.*, c.name as contact_name, c.tax_id as contact_tax_id,
        c.address as contact_address, c.phone as contact_phone,
        u.full_name as created_by_name
       FROM wht_certificates w
       LEFT JOIN contacts c ON w.contact_id = c.id
       LEFT JOIN users u ON w.created_by = u.id
       WHERE w.id = ? AND w.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (rows.length === 0) return res.status(404).json({ message: 'ไม่พบหนังสือรับรอง' })
    res.json(rows[0])
  } catch (error) {
    console.error('Get WHT error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// POST /api/wht — Create WHT certificate
// =============================================
router.post('/', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user.companyId
    const {
      formType, contactId, expenseId, paymentDate,
      incomeType, incomeDescription, paidAmount, whtRate,
      whtAmount, taxMonth, taxYear, status: certStatus,
    } = req.body

    if (!formType || !contactId || !paymentDate || !incomeType || !paidAmount || !whtRate) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' })
    }

    const prefix = formType === 'pnd3' ? 'WH3' : 'WH53'
    const certNumber = await generateDocNumber(prefix, companyId, 'wht_certificates', 'certificate_number')

    // Auto-calculate WHT amount if not provided
    const paid = parseFloat(paidAmount)
    const rate = parseFloat(whtRate)
    const calculatedWht = whtAmount ? parseFloat(whtAmount) : Math.round(paid * rate / 100 * 100) / 100

    const result = await executeQuery(
      `INSERT INTO wht_certificates
        (company_id, certificate_number, form_type, contact_id, expense_id,
         payment_date, income_type, income_description,
         paid_amount, wht_rate, wht_amount, tax_month, tax_year,
         status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId, certNumber, formType, contactId, expenseId || null,
        paymentDate, incomeType, incomeDescription || null,
        paid, rate, calculatedWht, taxMonth, taxYear,
        certStatus || 'draft', req.user.id,
      ]
    )

    res.status(201).json({
      message: 'สร้างหนังสือรับรองหัก ณ ที่จ่ายสำเร็จ',
      id: result.insertId,
      certificateNumber: certNumber,
    })
  } catch (error) {
    console.error('Create WHT error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// PUT /api/wht/:id — Update WHT certificate (draft only)
// =============================================
router.put('/:id', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const companyId = req.user.companyId
    const rows = await executeQuery(
      "SELECT * FROM wht_certificates WHERE id = ? AND company_id = ? AND status = 'draft'",
      [req.params.id, companyId]
    )
    if (rows.length === 0) return res.status(400).json({ message: 'ไม่พบหนังสือรับรองร่างที่จะแก้ไข' })

    const {
      formType, contactId, expenseId, paymentDate,
      incomeType, incomeDescription, paidAmount, whtRate,
      whtAmount, taxMonth, taxYear,
    } = req.body

    const paid = parseFloat(paidAmount)
    const rate = parseFloat(whtRate)
    const calculatedWht = whtAmount ? parseFloat(whtAmount) : Math.round(paid * rate / 100 * 100) / 100

    await executeQuery(
      `UPDATE wht_certificates SET
        form_type = ?, contact_id = ?, expense_id = ?,
        payment_date = ?, income_type = ?, income_description = ?,
        paid_amount = ?, wht_rate = ?, wht_amount = ?,
        tax_month = ?, tax_year = ?
       WHERE id = ? AND company_id = ?`,
      [
        formType, contactId, expenseId || null,
        paymentDate, incomeType, incomeDescription || null,
        paid, rate, calculatedWht, taxMonth, taxYear,
        req.params.id, companyId,
      ]
    )

    res.json({ message: 'แก้ไขหนังสือรับรองสำเร็จ' })
  } catch (error) {
    console.error('Update WHT error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// PUT /api/wht/:id/issue — Issue WHT certificate
// =============================================
router.put('/:id/issue', roleCheck('owner', 'admin', 'manager', 'accountant'), async (req, res) => {
  try {
    const rows = await executeQuery(
      "SELECT * FROM wht_certificates WHERE id = ? AND company_id = ? AND status = 'draft'",
      [req.params.id, req.user.companyId]
    )
    if (rows.length === 0) return res.status(400).json({ message: 'ไม่พบหนังสือรับรองร่างที่จะออก' })

    await executeQuery(
      "UPDATE wht_certificates SET status = 'issued' WHERE id = ?",
      [req.params.id]
    )
    res.json({ message: 'ออกหนังสือรับรองสำเร็จ' })
  } catch (error) {
    console.error('Issue WHT error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// =============================================
// PUT /api/wht/:id/void — Void WHT certificate
// =============================================
router.put('/:id/void', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const rows = await executeQuery(
      "SELECT * FROM wht_certificates WHERE id = ? AND company_id = ? AND status != 'voided'",
      [req.params.id, req.user.companyId]
    )
    if (rows.length === 0) return res.status(400).json({ message: 'ไม่พบหนังสือรับรอง' })

    await executeQuery(
      "UPDATE wht_certificates SET status = 'voided' WHERE id = ?",
      [req.params.id]
    )
    res.json({ message: 'ยกเลิกหนังสือรับรองสำเร็จ' })
  } catch (error) {
    console.error('Void WHT error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
