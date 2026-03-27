const express = require('express')
const router = express.Router()
const { pool, executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')

router.use(auth, companyGuard)

// Helper: get company loyalty settings
async function getLoyaltySettings(companyId, connection) {
  const db = connection || pool
  const [companies] = connection
    ? await connection.execute('SELECT settings FROM companies WHERE id = ?', [companyId])
    : [await executeQuery('SELECT settings FROM companies WHERE id = ?', [companyId])]
  const settings = companies[0]?.settings ? JSON.parse(companies[0].settings) : {}
  return {
    points_per_baht: settings.points_per_baht ?? 1,
    points_value: settings.points_value ?? 1,
    min_redeem_points: settings.min_redeem_points ?? 100,
  }
}

// GET /api/loyalty/:contactId — customer loyalty info + recent transactions
router.get('/:contactId', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const contactId = req.params.contactId

    const contacts = await executeQuery(
      'SELECT id, name, points_balance, price_level FROM contacts WHERE id = ? AND company_id = ?',
      [contactId, companyId]
    )
    if (contacts.length === 0) return res.status(404).json({ message: 'ไม่พบลูกค้า' })

    const transactions = await executeQuery(
      `SELECT lt.*, u.full_name as created_by_name
       FROM loyalty_transactions lt
       LEFT JOIN users u ON lt.created_by = u.id
       WHERE lt.contact_id = ? AND lt.company_id = ?
       ORDER BY lt.created_at DESC LIMIT 20`,
      [contactId, companyId]
    )

    const settings = await getLoyaltySettings(companyId)

    res.json({
      contact: contacts[0],
      transactions,
      settings,
    })
  } catch (error) {
    console.error('Get loyalty info error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/loyalty/:contactId/history — full paginated transaction history
router.get('/:contactId/history', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const contactId = req.params.contactId
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const offset = (page - 1) * limit

    const countResult = await executeQuery(
      'SELECT COUNT(*) as total FROM loyalty_transactions WHERE contact_id = ? AND company_id = ?',
      [contactId, companyId]
    )

    const transactions = await executeQuery(
      `SELECT lt.*, u.full_name as created_by_name
       FROM loyalty_transactions lt
       LEFT JOIN users u ON lt.created_by = u.id
       WHERE lt.contact_id = ? AND lt.company_id = ?
       ORDER BY lt.created_at DESC LIMIT ? OFFSET ?`,
      [contactId, companyId, limit, offset]
    )

    res.json({
      transactions,
      total: countResult[0].total,
      page,
      totalPages: Math.ceil(countResult[0].total / limit),
    })
  } catch (error) {
    console.error('Get loyalty history error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/loyalty/earn — earn points from a sale
router.post('/earn', roleCheck('owner', 'admin', 'manager', 'cashier'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { contactId, saleId, amount } = req.body
    const companyId = req.user.companyId

    if (!contactId || !amount) {
      return res.status(400).json({ message: 'กรุณาระบุลูกค้าและยอดเงิน' })
    }

    const settings = await getLoyaltySettings(companyId, connection)
    const pointsEarned = Math.floor(amount * settings.points_per_baht)
    if (pointsEarned <= 0) {
      await connection.rollback()
      return res.json({ pointsEarned: 0, message: 'ไม่มีแต้มสะสม' })
    }

    // Get current balance
    const [contacts] = await connection.execute(
      'SELECT points_balance FROM contacts WHERE id = ? AND company_id = ?',
      [contactId, companyId]
    )
    if (contacts.length === 0) {
      await connection.rollback()
      return res.status(404).json({ message: 'ไม่พบลูกค้า' })
    }

    const currentBalance = contacts[0].points_balance || 0
    const newBalance = currentBalance + pointsEarned

    // Update balance
    await connection.execute(
      'UPDATE contacts SET points_balance = ? WHERE id = ? AND company_id = ?',
      [newBalance, contactId, companyId]
    )

    // Insert transaction
    await connection.execute(
      `INSERT INTO loyalty_transactions (company_id, contact_id, sale_id, type, points, balance_after, description, created_by)
       VALUES (?, ?, ?, 'earn', ?, ?, ?, ?)`,
      [companyId, contactId, saleId || null, pointsEarned, newBalance,
       `สะสมแต้มจากการซื้อ ฿${amount}`, req.user.id]
    )

    await connection.commit()
    res.json({ pointsEarned, newBalance })
  } catch (error) {
    await connection.rollback()
    console.error('Earn points error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// POST /api/loyalty/redeem — redeem points for discount
router.post('/redeem', roleCheck('owner', 'admin', 'manager', 'cashier'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { contactId, points } = req.body
    const companyId = req.user.companyId

    if (!contactId || !points || points <= 0) {
      return res.status(400).json({ message: 'กรุณาระบุลูกค้าและจำนวนแต้ม' })
    }

    const settings = await getLoyaltySettings(companyId, connection)

    if (points < settings.min_redeem_points) {
      await connection.rollback()
      return res.status(400).json({ message: `แต้มขั้นต่ำในการแลก: ${settings.min_redeem_points} แต้ม` })
    }

    // Get current balance
    const [contacts] = await connection.execute(
      'SELECT points_balance FROM contacts WHERE id = ? AND company_id = ?',
      [contactId, companyId]
    )
    if (contacts.length === 0) {
      await connection.rollback()
      return res.status(404).json({ message: 'ไม่พบลูกค้า' })
    }

    const currentBalance = contacts[0].points_balance || 0
    if (currentBalance < points) {
      await connection.rollback()
      return res.status(400).json({ message: `แต้มไม่เพียงพอ (มี ${currentBalance} แต้ม)` })
    }

    const discountAmount = points * settings.points_value
    const newBalance = currentBalance - points

    // Update balance
    await connection.execute(
      'UPDATE contacts SET points_balance = ? WHERE id = ? AND company_id = ?',
      [newBalance, contactId, companyId]
    )

    // Insert transaction
    await connection.execute(
      `INSERT INTO loyalty_transactions (company_id, contact_id, type, points, balance_after, description, created_by)
       VALUES (?, ?, 'redeem', ?, ?, ?, ?)`,
      [companyId, contactId, -points, newBalance,
       `แลกแต้ม ${points} แต้ม = ส่วนลด ฿${discountAmount}`, req.user.id]
    )

    await connection.commit()
    res.json({ discountAmount, newBalance, pointsRedeemed: points })
  } catch (error) {
    await connection.rollback()
    console.error('Redeem points error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// POST /api/loyalty/adjust — manual adjustment (admin only)
router.post('/adjust', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const { contactId, points, description } = req.body
    const companyId = req.user.companyId

    if (!contactId || points === undefined || points === 0) {
      return res.status(400).json({ message: 'กรุณาระบุลูกค้าและจำนวนแต้ม' })
    }

    // Get current balance
    const [contacts] = await connection.execute(
      'SELECT points_balance FROM contacts WHERE id = ? AND company_id = ?',
      [contactId, companyId]
    )
    if (contacts.length === 0) {
      await connection.rollback()
      return res.status(404).json({ message: 'ไม่พบลูกค้า' })
    }

    const currentBalance = contacts[0].points_balance || 0
    const newBalance = currentBalance + points

    if (newBalance < 0) {
      await connection.rollback()
      return res.status(400).json({ message: 'แต้มไม่เพียงพอสำหรับการปรับลด' })
    }

    // Update balance
    await connection.execute(
      'UPDATE contacts SET points_balance = ? WHERE id = ? AND company_id = ?',
      [newBalance, contactId, companyId]
    )

    // Insert transaction
    await connection.execute(
      `INSERT INTO loyalty_transactions (company_id, contact_id, type, points, balance_after, description, created_by)
       VALUES (?, ?, 'adjust', ?, ?, ?, ?)`,
      [companyId, contactId, points, newBalance,
       description || `ปรับแต้มด้วยมือ ${points > 0 ? '+' : ''}${points}`, req.user.id]
    )

    await connection.commit()
    res.json({ newBalance, message: 'ปรับแต้มสำเร็จ' })
  } catch (error) {
    await connection.rollback()
    console.error('Adjust points error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  } finally {
    connection.release()
  }
})

// GET /api/contacts/:id/purchases — customer purchase history
// This route is registered separately on the contacts router, but we add it here
// and register it in server.js as '/api/loyalty'
router.get('/:contactId/purchases', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const contactId = req.params.contactId

    // Search in both customers table (customer_id) and contacts (via ct_ prefix or direct)
    const sales = await executeQuery(
      `SELECT s.id, s.invoice_number, s.sold_at, s.net_amount, s.payment_method, s.status,
              u.full_name as cashier_name
       FROM sales s
       LEFT JOIN users u ON s.cashier_id = u.id
       WHERE s.company_id = ? AND s.customer_id = ?
       ORDER BY s.sold_at DESC LIMIT 50`,
      [companyId, contactId]
    )

    res.json(sales)
  } catch (error) {
    console.error('Get customer purchases error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
