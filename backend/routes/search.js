const express = require('express')
const router = express.Router()
const { executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/search?q=keyword — Search across multiple entities
router.get('/', async (req, res) => {
  try {
    const q = req.query.q
    if (!q || q.length < 2) return res.json([])
    const like = `%${q}%`
    const companyId = req.user.companyId

    // Search products
    const products = await executeQuery(
      `SELECT id, name, sku, 'product' as type
       FROM products
       WHERE company_id = ? AND is_active = TRUE
         AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)
       LIMIT 5`,
      [companyId, like, like, like]
    )

    // Search sales
    const sales = await executeQuery(
      `SELECT id, invoice_number as name, '' as sku, 'sale' as type
       FROM sales
       WHERE company_id = ? AND invoice_number LIKE ?
       LIMIT 5`,
      [companyId, like]
    )

    // Search contacts
    const contacts = await executeQuery(
      `SELECT id, name, phone as sku, 'contact' as type
       FROM contacts
       WHERE company_id = ? AND is_active = TRUE
         AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)
       LIMIT 5`,
      [companyId, like, like, like]
    )

    // Search documents
    const docs = await executeQuery(
      `SELECT id, doc_number as name, doc_type as sku, 'document' as type
       FROM sales_documents
       WHERE company_id = ? AND doc_number LIKE ?
       LIMIT 5`,
      [companyId, like]
    )

    res.json([...products, ...sales, ...contacts, ...docs])
  } catch (error) {
    console.error('Search error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการค้นหา' })
  }
})

module.exports = router
