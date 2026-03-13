const mysql = require('mysql2/promise')
require('dotenv').config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pos_stock_shop',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
})

// Retry wrapper for ECONNRESET
const executeQuery = async (query, params = [], retries = 3) => {
  while (retries > 0) {
    try {
      const [results] = await pool.execute(query, params)
      return results
    } catch (error) {
      retries--
      if (error.code === 'ECONNRESET' && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }
      throw error
    }
  }
}

module.exports = { pool, executeQuery }
