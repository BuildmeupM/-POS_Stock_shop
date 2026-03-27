const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { validate } = require('../../middleware/validate')
const { createUserSchema, updateRoleSchema } = require('../../middleware/schemas')

// All routes require auth + company guard
router.use(auth, companyGuard)

// GET /api/users — list all users in the current company
router.get('/', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const baseWhere = 'WHERE uc.company_id = ?'
    const baseParams = [req.user.companyId]

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM user_companies uc ${baseWhere}`, baseParams
      )
      const total = countResult.total

      const users = await executeQuery(
        `SELECT u.id, u.username, u.full_name, u.nick_name, u.is_active, u.created_at,
                uc.role, uc.joined_at
         FROM user_companies uc
         JOIN users u ON uc.user_id = u.id
         ${baseWhere}
         ORDER BY FIELD(uc.role, 'owner', 'admin', 'manager', 'cashier', 'accountant', 'staff'), u.full_name
         LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )
      res.json({ data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const users = await executeQuery(
        `SELECT u.id, u.username, u.full_name, u.nick_name, u.is_active, u.created_at,
                uc.role, uc.joined_at
         FROM user_companies uc
         JOIN users u ON uc.user_id = u.id
         ${baseWhere}
         ORDER BY FIELD(uc.role, 'owner', 'admin', 'manager', 'cashier', 'accountant', 'staff'), u.full_name
         LIMIT 500`,
        baseParams
      )
      res.json(users)
    }
  } catch (error) {
    console.error('List users error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/users — create a new user and add to current company
router.post('/', roleCheck('owner', 'admin'), validate(createUserSchema), async (req, res) => {
  try {
    const { username, password, fullName, nickName, role } = req.body

    if (!username || !password || !fullName || !role) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' })
    }

    const validRoles = ['admin', 'manager', 'cashier', 'accountant', 'staff']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'ตำแหน่งไม่ถูกต้อง' })
    }

    // Check if username exists
    const existing = await executeQuery('SELECT id FROM users WHERE username = ?', [username])
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Username นี้ถูกใช้แล้ว' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const result = await executeQuery(
      'INSERT INTO users (username, password_hash, full_name, nick_name) VALUES (?, ?, ?, ?)',
      [username, passwordHash, fullName, nickName || null]
    )

    // Link user to current company with assigned role
    await executeQuery(
      'INSERT INTO user_companies (user_id, company_id, role, is_default) VALUES (?, ?, ?, TRUE)',
      [result.insertId, req.user.companyId, role]
    )

    res.status(201).json({
      message: 'เพิ่มผู้ใช้งานสำเร็จ',
      userId: result.insertId,
    })
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/users/:id/role — update user's role in the current company
router.put('/:id/role', roleCheck('owner', 'admin'), validate(updateRoleSchema), async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const { role } = req.body

    const validRoles = ['admin', 'manager', 'cashier', 'accountant', 'staff']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'ตำแหน่งไม่ถูกต้อง' })
    }

    // Cannot change owner's role
    const current = await executeQuery(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?',
      [userId, req.user.companyId]
    )
    if (current.length === 0) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานในบริษัทนี้' })
    }
    if (current[0].role === 'owner') {
      return res.status(403).json({ message: 'ไม่สามารถเปลี่ยนตำแหน่งเจ้าของได้' })
    }

    // Admin cannot change other admin's role (only owner can)
    if (current[0].role === 'admin' && req.user.companyRole !== 'owner') {
      return res.status(403).json({ message: 'เฉพาะเจ้าของเท่านั้นที่สามารถเปลี่ยนตำแหน่ง Admin ได้' })
    }

    await executeQuery(
      'UPDATE user_companies SET role = ? WHERE user_id = ? AND company_id = ?',
      [role, userId, req.user.companyId]
    )

    res.json({ message: 'อัพเดตตำแหน่งสำเร็จ' })
  } catch (error) {
    console.error('Update role error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/users/:id/toggle-active — enable/disable user
router.put('/:id/toggle-active', roleCheck('owner', 'admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id)

    // Cannot deactivate yourself
    if (userId === req.user.id) {
      return res.status(400).json({ message: 'ไม่สามารถปิดใช้งานตัวเองได้' })
    }

    // Cannot deactivate owner
    const userCompany = await executeQuery(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?',
      [userId, req.user.companyId]
    )
    if (userCompany.length === 0) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' })
    }
    if (userCompany[0].role === 'owner') {
      return res.status(403).json({ message: 'ไม่สามารถปิดใช้งานเจ้าของได้' })
    }

    const user = await executeQuery('SELECT is_active FROM users WHERE id = ?', [userId])
    if (user.length === 0) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' })

    const newStatus = !user[0].is_active
    await executeQuery('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId])

    res.json({
      message: newStatus ? 'เปิดใช้งานผู้ใช้สำเร็จ' : 'ปิดใช้งานผู้ใช้สำเร็จ',
      is_active: newStatus,
    })
  } catch (error) {
    console.error('Toggle active error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/users/:id — remove user from the current company
router.delete('/:id', roleCheck('owner'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id)

    // Cannot remove yourself
    if (userId === req.user.id) {
      return res.status(400).json({ message: 'ไม่สามารถลบตัวเองได้' })
    }

    const result = await executeQuery(
      'DELETE FROM user_companies WHERE user_id = ? AND company_id = ?',
      [userId, req.user.companyId]
    )

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานในบริษัทนี้' })
    }

    res.json({ message: 'ลบผู้ใช้ออกจากบริษัทสำเร็จ' })
  } catch (error) {
    console.error('Remove user error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
