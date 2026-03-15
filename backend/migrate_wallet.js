/**
 * Migration: Add payment_channel_id to payment-related tables
 * Run: node migrate_wallet.js
 */
const { pool } = require('./config/db')

async function migrate() {
  const connection = await pool.getConnection()
  try {
    console.log('🔧 Starting wallet integration migration...\n')

    const alterations = [
      {
        table: 'purchase_payments',
        column: 'payment_channel_id',
        sql: 'ALTER TABLE purchase_payments ADD COLUMN payment_channel_id INT(11) NULL AFTER payment_method',
      },
      {
        table: 'sales',
        column: 'payment_channel_id',
        sql: 'ALTER TABLE sales ADD COLUMN payment_channel_id INT(11) NULL AFTER payment_method',
      },
      {
        table: 'payments',
        column: 'payment_channel_id',
        sql: 'ALTER TABLE payments ADD COLUMN payment_channel_id INT(11) NULL AFTER method',
      },
      {
        table: 'online_orders',
        column: 'payment_channel_id',
        sql: 'ALTER TABLE online_orders ADD COLUMN payment_channel_id INT(11) NULL AFTER payment_method',
      },
      {
        table: 'expenses',
        column: 'payment_channel_id',
        sql: 'ALTER TABLE expenses ADD COLUMN payment_channel_id INT(11) NULL AFTER payment_method',
      },
    ]

    for (const alt of alterations) {
      // Check if column already exists
      const [cols] = await connection.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [alt.table, alt.column]
      )
      if (cols.length > 0) {
        console.log(`  ✅ ${alt.table}.${alt.column} — already exists, skipping`)
      } else {
        await connection.execute(alt.sql)
        console.log(`  ✅ ${alt.table}.${alt.column} — added`)
      }
    }

    console.log('\n✅ Migration complete!')
  } catch (error) {
    console.error('❌ Migration failed:', error.message)
  } finally {
    connection.release()
    process.exit()
  }
}

migrate()
