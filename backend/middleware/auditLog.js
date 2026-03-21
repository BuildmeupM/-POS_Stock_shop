const { executeQuery } = require('../config/db')

/**
 * Write an audit log entry
 * @param {Object} opts
 * @param {string} opts.companyId
 * @param {number} opts.userId
 * @param {string} opts.userName
 * @param {string} opts.action - CREATE, UPDATE, DELETE, VOID, LOGIN, LOGOUT, etc.
 * @param {string} opts.entityType - sale, purchase_order, expense, product, user, etc.
 * @param {string|number} opts.entityId
 * @param {string} opts.description
 * @param {Object} [opts.oldValues]
 * @param {Object} [opts.newValues]
 * @param {Object} [opts.req] - Express request (for IP / user-agent)
 */
async function writeAuditLog(opts) {
  try {
    const ip = opts.req?.ip || opts.req?.connection?.remoteAddress || null
    const ua = opts.req?.get?.('user-agent')?.substring(0, 500) || null

    await executeQuery(
      `INSERT INTO audit_logs (company_id, user_id, user_name, action, entity_type, entity_id, description, old_values, new_values, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.companyId || null,
        opts.userId || null,
        opts.userName || null,
        opts.action,
        opts.entityType,
        opts.entityId != null ? String(opts.entityId) : null,
        opts.description || null,
        opts.oldValues ? JSON.stringify(opts.oldValues) : null,
        opts.newValues ? JSON.stringify(opts.newValues) : null,
        ip,
        ua,
      ]
    )
  } catch (error) {
    // Audit log failure should not break the main operation
    console.error('Audit log write error:', error.message)
  }
}

module.exports = { writeAuditLog }
