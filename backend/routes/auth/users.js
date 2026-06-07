const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { validate } = require('../../middleware/validate')
const { createUserSchema, updateRoleSchema } = require('../../middleware/schemas')
const { writeAuditLog } = require('../../middleware/auditLog')

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

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'user', entityId: result.insertId,
      description: `เพิ่มผู้ใช้ ${username} (${role})`,
      newValues: { username, fullName, role }, req,
    })

    res.status(201).json({
      message: 'เพิ่มผู้ใช้งานสำเร็จ',
      userId: result.insertId,
    })
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/users/search — search existing users by username (for adding to company)
router.get('/search', roleCheck('owner', 'admin'), async (req, res) => {
  try {
    const { q } = req.query
    if (!q || String(q).trim().length < 2) {
      return res.json([])
    }

    // Find users matching query but NOT already in current company
    const users = await executeQuery(
      `SELECT u.id, u.username, u.full_name, u.nick_name
       FROM users u
       WHERE u.is_active = TRUE
         AND (u.username LIKE ? OR u.full_name LIKE ? OR u.nick_name LIKE ?)
         AND u.id NOT IN (
           SELECT uc.user_id FROM user_companies uc WHERE uc.company_id = ?
         )
       LIMIT 10`,
      [`%${q}%`, `%${q}%`, `%${q}%`, req.user.companyId]
    )

    res.json(users)
  } catch (error) {
    console.error('Search users error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/users/add-to-company — add existing user to current company
router.post('/add-to-company', roleCheck('owner', 'admin'), async (req, res) => {
  try {
    const { userId, role } = req.body

    if (!userId || !role) {
      return res.status(400).json({ message: 'กรุณาระบุผู้ใช้และตำแหน่ง' })
    }

    const validRoles = ['admin', 'manager', 'cashier', 'accountant', 'staff']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'ตำแหน่งไม่ถูกต้อง' })
    }

    // Check user exists
    const user = await executeQuery('SELECT id, full_name FROM users WHERE id = ? AND is_active = TRUE', [userId])
    if (user.length === 0) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' })
    }

    // Check if already in company
    const existing = await executeQuery(
      'SELECT id FROM user_companies WHERE user_id = ? AND company_id = ?',
      [userId, req.user.companyId]
    )
    if (existing.length > 0) {
      return res.status(409).json({ message: 'ผู้ใช้นี้อยู่ในบริษัทนี้แล้ว' })
    }

    await executeQuery(
      'INSERT INTO user_companies (user_id, company_id, role, is_default) VALUES (?, ?, ?, FALSE)',
      [userId, req.user.companyId, role]
    )

    res.status(201).json({
      message: `เพิ่ม ${user[0].full_name} เข้าบริษัทสำเร็จ`,
    })
  } catch (error) {
    console.error('Add user to company error:', error)
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

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'user', entityId: userId,
      description: `เปลี่ยนตำแหน่งผู้ใช้ #${userId}`,
      oldValues: { role: current[0].role }, newValues: { role }, req,
    })

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
    // Deactivating a user must also revoke their active sessions
    if (newStatus) {
      await executeQuery('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId])
    } else {
      await executeQuery('UPDATE users SET is_active = ?, token_version = token_version + 1 WHERE id = ?', [newStatus, userId])
    }

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'user', entityId: userId,
      description: newStatus ? `เปิดใช้งานผู้ใช้ #${userId}` : `ปิดใช้งานผู้ใช้ #${userId}`,
      newValues: { is_active: newStatus }, req,
    })

    res.json({
      message: newStatus ? 'เปิดใช้งานผู้ใช้สำเร็จ' : 'ปิดใช้งานผู้ใช้สำเร็จ',
      is_active: newStatus,
    })
  } catch (error) {
    console.error('Toggle active error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/users/:id/reset-password — reset a user's password
router.put('/:id/reset-password', roleCheck('owner', 'admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id)
    const { newPassword } = req.body

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' })
    }

    // Verify target user is in this company
    const userCompany = await executeQuery(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?',
      [userId, req.user.companyId]
    )
    if (userCompany.length === 0) {
      return res.status(404).json({ message: 'ไม่พบผู้ใช้งานในบริษัทนี้' })
    }
    if (userCompany[0].role === 'owner' && req.user.companyRole !== 'owner') {
      return res.status(403).json({ message: 'ไม่สามารถรีเซ็ตรหัสผ่านเจ้าของได้' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    // Reset password also revokes existing sessions (token_version bump)
    await executeQuery(
      'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
      [passwordHash, userId]
    )

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'user', entityId: userId,
      description: `รีเซ็ตรหัสผ่านผู้ใช้ #${userId}`, req,
    })

    res.json({ message: 'รีเซ็ตรหัสผ่านสำเร็จ' })
  } catch (error) {
    console.error('Reset password error:', error)
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

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'DELETE', entityType: 'user', entityId: userId,
      description: `ลบผู้ใช้ #${userId} ออกจากบริษัท`, req,
    })

    res.json({ message: 'ลบผู้ใช้ออกจากบริษัทสำเร็จ' })
  } catch (error) {
    console.error('Remove user error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
