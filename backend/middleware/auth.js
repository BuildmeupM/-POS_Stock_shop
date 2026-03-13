const jwt = require('jsonwebtoken')
require('dotenv').config()

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    req.user = {
      id: decoded.id,
      username: decoded.username,
      fullName: decoded.fullName,
      companyId: decoded.companyId,
      role: decoded.role,
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
