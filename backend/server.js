const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'

// === Security Headers ===
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))

// === CORS ===
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
const parseCorsOrigins = () => CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
const allowedOrigins = parseCorsOrigins()

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true)
    if (process.env.NODE_ENV === 'development') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true)
      if (/^http:\/\/\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(origin)) return callback(null, true)
    }
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return callback(null, true)
    console.warn('⚠️ CORS rejected:', origin)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

// === Rate Limiting ===
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,                  // 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'คำขอมากเกินไป กรุณารอสักครู่' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,                   // 20 login attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที' },
})

app.use('/api/', apiLimiter)
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)

// === Body Parsers ===
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// === Request Logger (structured) ===
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    if (req.path !== '/api/health' && duration > 1000) {
      console.warn(`⚠️ SLOW ${req.method} ${req.path} — ${duration}ms (status: ${res.statusCode})`)
    }
  })
  next()
})

// === Health check ===
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes — auth
app.use('/api/auth', require('./routes/auth/auth'))
app.use('/api/users', require('./routes/auth/users'))

// Routes — company
app.use('/api/companies', require('./routes/company/companies'))

// Routes — sales documents (เอกสารขาย)
app.use('/api/sales-doc', require('./routes/sales-doc/salesDocuments'))

// Routes — pos (ขายหน้าร้าน)
app.use('/api/sales', require('./routes/pos/sales'))
app.use('/api/credit-notes', require('./routes/pos/creditNotes'))

// Routes — inventory (สต๊อก & สินค้า)
app.use('/api/products', require('./routes/inventory/products'))
app.use('/api/inventory', require('./routes/inventory/inventory'))

// Routes — purchasing (จัดซื้อ)
app.use('/api/purchases', require('./routes/purchasing/purchases'))

// Routes — consignment (ฝากขาย)
app.use('/api/consignment/agreements', require('./routes/consignment/agreements'))
app.use('/api/consignment/stock', require('./routes/consignment/stock'))
app.use('/api/consignment/settlements', require('./routes/consignment/settlements'))

// Routes — contacts (ลูกค้า & ออเดอร์)
app.use('/api/contacts', require('./routes/contacts/contacts'))
app.use('/api/orders', require('./routes/contacts/orders'))

// Routes — finance (การเงิน & บัญชี)
app.use('/api/accounting', require('./routes/finance/accounting'))
app.use('/api/wallet', require('./routes/finance/wallet'))

// Routes — reports
app.use('/api/reports', require('./routes/reports/reports'))

// === Structured Error Handler ===
app.use((err, req, res, next) => {
  const status = err.status || 500
  const message = status === 500 ? 'เกิดข้อผิดพลาดภายในระบบ' : err.message

  // Log full error for server-side debugging
  console.error(JSON.stringify({
    level: 'error',
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    status,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    userId: req.user?.id || null,
    companyId: req.user?.companyId || null,
  }))

  res.status(status).json({ message })
})

// === 404 Handler ===
app.use((req, res) => {
  res.status(404).json({ message: `ไม่พบ API: ${req.method} ${req.path}` })
})

app.listen(PORT, HOST, () => {
  console.log(`🚀 POS Bookdee Backend running at http://${HOST}:${PORT}`)
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`)
  console.log(`🔒 Rate limit: ${apiLimiter.max} req / ${apiLimiter.windowMs / 60000} min`)
})
