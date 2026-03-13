const { executeQuery } = require('../config/db')

/**
 * Generate document number: PREFIX-YYYYMMDD-NNNNN
 * Uses Thai Buddhist Year (พ.ศ.)
 */
const generateDocNumber = async (prefix, companyId, tableName, columnName) => {
  const now = new Date()
  const thaiYear = now.getFullYear() + 543
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${thaiYear}${month}${day}`
  const pattern = `${prefix}-${dateStr}%`

  const rows = await executeQuery(
    `SELECT ${columnName} FROM ${tableName} WHERE company_id = ? AND ${columnName} LIKE ? ORDER BY ${columnName} DESC LIMIT 1`,
    [companyId, pattern]
  )

  let sequence = 1
  if (rows.length > 0) {
    const lastNumber = rows[0][columnName]
    const lastSeq = parseInt(lastNumber.split('-').pop(), 10)
    sequence = lastSeq + 1
  }

  return `${prefix}-${dateStr}-${String(sequence).padStart(5, '0')}`
}

module.exports = { generateDocNumber }
