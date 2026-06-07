const { executeQuery } = require('../config/db')

// Middleware: verify user has access to the active company
const companyGuard = async (req, res, next) => {
  try {
    const { companyId } = req.user
    if (!companyId) {
      return res.status(400).json({ message: 'ไม่ได้เลือกบริษัท กรุณาเลือกบริษัทก่อน' })
    }

    // Verify user belongs to this company (and read token_version in the same
    // round-trip for token revocation — no extra query on the hot path)
    const rows = await executeQuery(
      `SELECT uc.role, u.token_version
       FROM user_companies uc
       JOIN users u ON u.id = uc.user_id
       WHERE uc.user_id = ? AND uc.company_id = ?`,
      [req.user.id, companyId]
    )

    if (rows.length === 0) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงบริษัทนี้' })
    }

    // Token revocation: a logout / password reset bumps users.token_version,
    // invalidating any token minted before the bump.
    if ((req.user.tokenVersion ?? 0) !== (rows[0].token_version ?? 0)) {
      return res.status(401).json({ message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' })
    }

    // Attach role for this company
    req.user.companyRole = rows[0].role
    next()
  } catch (error) {
    console.error('CompanyGuard error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์' })
  }
}

// Middleware: check role permission
const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user.companyRole || req.user.role
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์ใช้งานฟีเจอร์นี้' })
    }
    next()
  }
}

module.exports = { companyGuard, roleCheck }
