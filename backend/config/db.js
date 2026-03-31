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
  // Use query instead of execute to avoid prepared statement overhead
  // (saves 1 round-trip per query — critical for remote DB)
  namedPlaceholders: false,
})

// Retry wrapper for ECONNRESET
const executeQuery = async (query, params = [], retries = 3) => {
  while (retries > 0) {
    try {
      // Use pool.query() instead of pool.execute() to skip prepared statements
      // This halves the round-trips for remote databases (1 trip vs 2)
      const [results] = await pool.query(query, params)
      return results
    } catch (error) {
      retries--
      if ((error.code === 'ECONNRESET' || error.code === 'EPIPE' || error.code === 'PROTOCOL_CONNECTION_LOST') && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }
      throw error
    }
  }
}

module.exports = { pool, executeQuery }
