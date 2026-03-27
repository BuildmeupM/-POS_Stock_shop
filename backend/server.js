const express = require('express')
const path = require('path')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'

// === Security Headers ===
// Enable all Helmet defaults; CSP disabled in dev for flexibility (enable in production)
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
}))

// === CORS ===
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || ''
const parseCorsOrigins = () => {
  const origins = [CORS_ORIGIN, ALLOWED_ORIGINS]
    .join(',')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
  return [...new Set(origins)]
}
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  maxAge: 600, // preflight cache 10 minutes
}))

// === Rate Limiting ===
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,                  // 200 requests per window (global)
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'คำขอมากเกินไป กรุณารอสักครู่' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,                   // 10 login attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 15 นาที' },
})

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,                  // 100 mutation requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  message: { message: 'คำขอเปลี่ยนแปลงข้อมูลมากเกินไป กรุณารอสักครู่' },
})

app.use('/api/', apiLimiter)
app.use('/api/', mutationLimiter)
app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)

// === Body Parsers ===
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ limit: '10mb', extended: true }))

// === Static Files (uploads) ===
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

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
const { pool } = require('./config/db')

app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB',
    },
    database: 'unknown',
  }

  try {
    const [rows] = await pool.execute('SELECT 1 AS ok')
    health.database = rows[0]?.ok === 1 ? 'connected' : 'error'
  } catch (err) {
    health.status = 'degraded'
    health.database = 'disconnected'
    health.databaseError = err.message
  }

  const statusCode = health.status === 'ok' ? 200 : 503
  res.status(statusCode).json(health)
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
app.use('/api/returns', require('./routes/pos/returns'))

// Routes — inventory (สต๊อก & สินค้า)
app.use('/api/products', require('./routes/inventory/products'))
app.use('/api/inventory', require('./routes/inventory/inventory'))
app.use('/api/stocktaking', require('./routes/inventory/stocktaking'))

// Routes — purchasing (จัดซื้อ)
app.use('/api/purchases', require('./routes/purchasing/purchases'))

// Routes — consignment (ฝากขาย)
app.use('/api/consignment/agreements', require('./routes/consignment/agreements'))
app.use('/api/consignment/stock', require('./routes/consignment/stock'))
app.use('/api/consignment/settlements', require('./routes/consignment/settlements'))

// Routes — contacts (ลูกค้า & ออเดอร์)
app.use('/api/contacts', require('./routes/contacts/contacts'))
app.use('/api/orders', require('./routes/contacts/orders'))
app.use('/api/loyalty', require('./routes/contacts/loyalty'))

// Routes — finance (การเงิน & บัญชี)
app.use('/api/accounting', require('./routes/finance/accounting'))
app.use('/api/wallet', require('./routes/finance/wallet'))
app.use('/api/reconciliation', require('./routes/finance/reconciliation'))
app.use('/api/recurring-expenses', require('./routes/finance/recurringExpenses'))
app.use('/api/wht', require('./routes/finance/wht'))

// Routes — search (global search)
app.use('/api/search', require('./routes/search'))

// Routes — reports
app.use('/api/reports', require('./routes/reports/reports'))

// Routes — exports & imports (Excel)
app.use('/api/exports', require('./routes/reports/exports'))
app.use('/api/imports', require('./routes/reports/imports'))

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
  console.log(`🔒 Rate limits — Global: 200/15min | Mutations: 100/15min | Auth: 10/15min`)
})
