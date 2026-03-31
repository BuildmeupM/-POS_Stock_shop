const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')

// Middleware: superadmin only
const superAdminOnly = (req, res, next) => {
  if (!req.user.isSuperAdmin) {
    return res.status(403).json({ message: 'เฉพาะ Super Admin เท่านั้น' })
  }
  next()
}

router.use(auth, superAdminOnly)

// GET /api/admin/companies — all companies with user counts
router.get('/companies', async (req, res) => {
  try {
    const companies = await executeQuery(
      `SELECT c.id, c.name, c.tax_id, c.phone, c.is_active, c.created_at,
              COUNT(uc.user_id) as user_count
       FROM companies c
       LEFT JOIN user_companies uc ON uc.company_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    )
    res.json(companies)
  } catch (error) {
    console.error('Admin get companies error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/admin/companies/:id/users — all users of any company
router.get('/companies/:id/users', async (req, res) => {
  try {
    const { id } = req.params
    const users = await executeQuery(
      `SELECT u.id, u.username, u.full_name, u.nick_name, u.is_active, u.is_superadmin,
              u.created_at, uc.role, uc.joined_at
       FROM user_companies uc
       JOIN users u ON uc.user_id = u.id
       WHERE uc.company_id = ?
       ORDER BY FIELD(uc.role, 'owner', 'admin', 'manager', 'cashier', 'accountant', 'staff'), u.full_name`,
      [id]
    )
    res.json(users)
  } catch (error) {
    console.error('Admin get company users error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/admin/users — all users in the system
router.get('/users', async (req, res) => {
  try {
    const users = await executeQuery(
      `SELECT u.id, u.username, u.full_name, u.nick_name, u.is_active, u.is_superadmin, u.created_at,
              COUNT(uc.company_id) as company_count
       FROM users u
       LEFT JOIN user_companies uc ON uc.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    )
    res.json(users)
  } catch (error) {
    console.error('Admin get users error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/admin/users/:id/superadmin — toggle superadmin status
router.put('/users/:id/superadmin', async (req, res) => {
  try {
    const userId = parseInt(req.params.id)

    if (userId === req.user.id) {
      return res.status(400).json({ message: 'ไม่สามารถเปลี่ยนสิทธิ์ตัวเองได้' })
    }

    const [user] = await executeQuery('SELECT id, is_superadmin FROM users WHERE id = ?', [userId])
    if (!user) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' })

    const newStatus = !user.is_superadmin
    await executeQuery('UPDATE users SET is_superadmin = ? WHERE id = ?', [newStatus, userId])

    res.json({
      message: newStatus ? 'เพิ่มสิทธิ์ Super Admin สำเร็จ' : 'ยกเลิกสิทธิ์ Super Admin สำเร็จ',
      is_superadmin: newStatus,
    })
  } catch (error) {
    console.error('Admin toggle superadmin error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
