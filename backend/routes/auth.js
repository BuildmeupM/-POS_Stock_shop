const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { executeQuery } = require('../config/db')
const auth = require('../middleware/auth')

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, fullName, nickName } = req.body

    if (!username || !password || !fullName) {
      return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบ' })
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

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ', userId: result.insertId })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    const users = await executeQuery(
      'SELECT id, username, password_hash, full_name, nick_name FROM users WHERE username = ? AND is_active = TRUE',
      [username]
    )

    if (users.length === 0) {
      return res.status(401).json({ message: 'Username หรือ Password ไม่ถูกต้อง' })
    }

    const user = users[0]
    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) {
      return res.status(401).json({ message: 'Username หรือ Password ไม่ถูกต้อง' })
    }

    // Get user's companies
    const companies = await executeQuery(
      `SELECT uc.company_id, uc.role, uc.is_default, c.name as company_name, c.logo_url
       FROM user_companies uc
       JOIN companies c ON uc.company_id = c.id
       WHERE uc.user_id = ? AND c.is_active = TRUE
       ORDER BY uc.is_default DESC`,
      [user.id]
    )

    // Pick default company or first one
    const defaultCompany = companies.find(c => c.is_default) || companies[0]

    const tokenPayload = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      companyId: defaultCompany ? defaultCompany.company_id : null,
      role: defaultCompany ? defaultCompany.role : null,
    }

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        nickName: user.nick_name,
      },
      companies,
      activeCompany: defaultCompany || null,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/auth/switch-company
router.post('/switch-company', auth, async (req, res) => {
  try {
    const { companyId } = req.body

    // Verify user has access
    const rows = await executeQuery(
      `SELECT uc.role, c.name as company_name, c.logo_url
       FROM user_companies uc
       JOIN companies c ON uc.company_id = c.id
       WHERE uc.user_id = ? AND uc.company_id = ? AND c.is_active = TRUE`,
      [req.user.id, companyId]
    )

    if (rows.length === 0) {
      return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงบริษัทนี้' })
    }

    const company = rows[0]
    const tokenPayload = {
      id: req.user.id,
      username: req.user.username,
      fullName: req.user.fullName,
      companyId,
      role: company.role,
    }

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    })

    res.json({
      token,
      activeCompany: {
        company_id: companyId,
        company_name: company.company_name,
        logo_url: company.logo_url,
        role: company.role,
      },
    })
  } catch (error) {
    console.error('Switch company error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const users = await executeQuery(
      'SELECT id, username, full_name, nick_name FROM users WHERE id = ?',
      [req.user.id]
    )

    const companies = await executeQuery(
      `SELECT uc.company_id, uc.role, uc.is_default, c.name as company_name, c.logo_url
       FROM user_companies uc
       JOIN companies c ON uc.company_id = c.id
       WHERE uc.user_id = ? AND c.is_active = TRUE`,
      [req.user.id]
    )

    res.json({
      user: users[0],
      companies,
      activeCompanyId: req.user.companyId,
      role: req.user.role,
    })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
