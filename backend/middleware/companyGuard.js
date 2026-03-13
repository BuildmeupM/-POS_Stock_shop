const { executeQuery } = require('../config/db')

// Middleware: verify user has access to the active company
const companyGuard = async (req, res, next) => {
  try {
    const { companyId } = req.user
    if (!companyId) {
      return res.status(400).json({ message: 'ไม่ได้เลือกบริษัท กรุณาเลือกบริษัทก่อน' })
    }

    // Verify user belongs to this company
    const rows = await executeQuery(
      'SELECT role FROM user_companies WHERE user_id = ? AND company_id = ?',
      [req.user.id, companyId]
    )

    if (rows.length === 0) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงบริษัทนี้' })
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
