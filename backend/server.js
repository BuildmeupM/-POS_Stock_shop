const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'

// CORS
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

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/companies', require('./routes/companies'))
app.use('/api/products', require('./routes/products'))
app.use('/api/inventory', require('./routes/inventory'))
app.use('/api/sales', require('./routes/sales'))
app.use('/api/accounting', require('./routes/accounting'))
app.use('/api/contacts', require('./routes/contacts'))
app.use('/api/orders', require('./routes/orders'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api/suppliers', require('./routes/suppliers'))
app.use('/api/purchases', require('./routes/purchases'))
app.use('/api/wallet', require('./routes/wallet'))
app.use('/api/credit-notes', require('./routes/creditNotes'))

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ message: 'Internal Server Error' })
})

app.listen(PORT, HOST, () => {
  console.log(`🚀 POS Bookdee Backend running at http://${HOST}:${PORT}`)
  console.log(`🌐 CORS origins: ${allowedOrigins.join(', ')}`)
})
