const { generateDocNumber } = require('./docNumber')

/**
 * Create a journal entry with lines inside a transaction
 *
 * @param {Object} connection - MySQL connection (from pool.getConnection())
 * @param {Object} opts
 * @param {string} opts.companyId
 * @param {string} opts.entryDate - YYYY-MM-DD
 * @param {string} opts.description
 * @param {string} opts.referenceType - e.g. 'SALE', 'GRN', 'PURCHASE_PAYMENT', 'VOID_SALE'
 * @param {number} [opts.referenceId]
 * @param {number} opts.createdBy - user id
 * @param {Array} opts.lines - [{ accountCode, debit, credit, description }]
 * @returns {Promise<number>} journalEntryId
 */
async function createJournalEntry(connection, opts) {
  const { companyId, entryDate, description, referenceType, referenceId, createdBy, lines } = opts

  if (!lines || lines.length === 0) return null

  // Filter out zero-amount lines
  const validLines = lines.filter(l => (l.debit || 0) > 0 || (l.credit || 0) > 0)
  if (validLines.length === 0) return null

  // Enforce double-entry balance: total debits must equal total credits.
  // Reject unbalanced entries so accounting data can never be silently corrupted.
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100
  const totalDebit = round2(validLines.reduce((s, l) => s + (l.debit || 0), 0))
  const totalCredit = round2(validLines.reduce((s, l) => s + (l.credit || 0), 0))
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(
      `Unbalanced journal entry (${referenceType || 'N/A'} #${referenceId ?? '-'}): ` +
      `debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)}`
    )
  }

  const entryNumber = await generateDocNumber('JV', companyId, 'journal_entries', 'entry_number')

  const [result] = await connection.execute(
    `INSERT INTO journal_entries (company_id, entry_number, entry_date, description, reference_type, reference_id, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'posted', ?)`,
    [companyId, entryNumber, entryDate, description, referenceType || null, referenceId || null, createdBy]
  )
  const journalEntryId = result.insertId

  // Resolve account codes to IDs and insert lines
  for (const line of validLines) {
    let accountId = line.accountId
    if (!accountId && line.accountCode) {
      const [accounts] = await connection.execute(
        'SELECT id FROM accounts WHERE company_id = ? AND account_code = ?',
        [companyId, line.accountCode]
      )
      accountId = accounts.length > 0 ? accounts[0].id : null
    }
    if (!accountId) continue

    await connection.execute(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
       VALUES (?, ?, ?, ?, ?)`,
      [journalEntryId, accountId, line.debit || 0, line.credit || 0, line.description || null]
    )
  }

  return journalEntryId
}

/**
 * Void a journal entry
 */
async function voidJournalEntry(connection, journalEntryId) {
  if (!journalEntryId) return
  await connection.execute(
    "UPDATE journal_entries SET status = 'voided' WHERE id = ?",
    [journalEntryId]
  )
}

module.exports = { createJournalEntry, voidJournalEntry }
