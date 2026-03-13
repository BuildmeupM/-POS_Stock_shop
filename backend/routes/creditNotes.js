const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/credit-notes — list all
router.get('/', async (req, res) => {
  try {
    const rows = await executeQuery(
      `SELECT cn.*, o.order_number 
       FROM credit_notes cn 
       LEFT JOIN online_orders o ON cn.order_id = o.id 
       WHERE cn.company_id = ? ORDER BY cn.created_at DESC`,
      [req.user.companyId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List credit notes error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/credit-notes/by-order/:orderId — CN linked to order (MUST be before /:id)
router.get('/by-order/:orderId', async (req, res) => {
  try {
    const [cn] = await executeQuery(
      `SELECT cn.*, o.order_number 
       FROM credit_notes cn 
       LEFT JOIN online_orders o ON cn.order_id = o.id 
       WHERE cn.order_id = ? AND cn.company_id = ?`,
      [req.params.orderId, req.user.companyId]
    )
    if (!cn) return res.json(null)

    const items = await executeQuery(
      `SELECT ci.*, p.name as product_name, p.sku 
       FROM credit_note_items ci 
       LEFT JOIN products p ON ci.product_id = p.id 
       WHERE ci.credit_note_id = ?`,
      [cn.id]
    )
    res.json({ ...cn, items })
  } catch (error) {
    console.error('Get credit note by order error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/credit-notes/:id — detail
router.get('/:id', async (req, res) => {
  try {
    const [cn] = await executeQuery(
      `SELECT cn.*, o.order_number 
       FROM credit_notes cn 
       LEFT JOIN online_orders o ON cn.order_id = o.id 
       WHERE cn.id = ? AND cn.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (!cn) return res.status(404).json({ message: 'ไม่พบใบลดหนี้' })

    const items = await executeQuery(
      `SELECT ci.*, p.name as product_name, p.sku 
       FROM credit_note_items ci 
       LEFT JOIN products p ON ci.product_id = p.id 
       WHERE ci.credit_note_id = ?`,
      [req.params.id]
    )
    res.json({ ...cn, items })
  } catch (error) {
    console.error('Get credit note error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
