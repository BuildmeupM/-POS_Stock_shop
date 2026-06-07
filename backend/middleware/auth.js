const jwt = require('jsonwebtoken')
require('dotenv').config()

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' })
    }

    const token = authHeader.split(' ')[1]
    // Pin the algorithm to HS256 to prevent algorithm-confusion attacks
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })

    req.user = {
      id: decoded.id,
      username: decoded.username,
      fullName: decoded.fullName,
      isSuperAdmin: !!decoded.isSuperAdmin,
      companyId: decoded.companyId,
      role: decoded.role,
      tokenVersion: decoded.tokenVersion ?? 0,
    }

    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' })
    }
    return res.status(401).json({ message: 'Token ไม่ถูกต้อง' })
  }
}

module.exports = auth
