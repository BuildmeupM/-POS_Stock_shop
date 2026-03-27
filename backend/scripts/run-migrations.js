/**
 * Run new migration SQL files via the app's DB connection pool.
 * Handles FK constraints and IF NOT EXISTS issues.
 * Usage: node scripts/run-migrations.js
 */
require('dotenv').config()
const { pool } = require('../config/db')

async function run() {
  const connection = await pool.getConnection()
  console.log('Connected to database.\n')

  // Check companies.id type
  const [cols] = await connection.execute(
    "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'id'"
  )
  const companyIdType = cols[0]?.DATA_TYPE === 'varchar' ? 'VARCHAR(36)' : 'INT'
  console.log(`companies.id type: ${companyIdType}\n`)

  const migrations = []

  // === 1. sale_returns ===
  migrations.push({
    name: 'sale_returns',
    stmts: [
      `CREATE TABLE IF NOT EXISTS sale_returns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        return_number VARCHAR(50) NOT NULL,
        sale_id INT NOT NULL,
        company_id ${companyIdType} NOT NULL,
        customer_id INT,
        return_date DATE NOT NULL,
        reason TEXT,
        status ENUM('draft','approved','voided') DEFAULT 'draft',
        subtotal DECIMAL(12,2) DEFAULT 0,
        vat_amount DECIMAL(12,2) DEFAULT 0,
        net_amount DECIMAL(12,2) DEFAULT 0,
        refund_method ENUM('cash','transfer','credit','exchange') DEFAULT 'cash',
        refund_amount DECIMAL(12,2) DEFAULT 0,
        journal_entry_id INT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sale_returns_company (company_id),
        INDEX idx_sale_returns_sale (sale_id),
        INDEX idx_sale_returns_date (return_date)
      )`,
      `CREATE TABLE IF NOT EXISTS sale_return_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        return_id INT NOT NULL,
        sale_item_id INT,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        cost_price DECIMAL(12,2) DEFAULT 0,
        discount DECIMAL(12,2) DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL,
        restock BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE
      )`,
    ]
  })

  // === 2. stock_counts ===
  migrations.push({
    name: 'stock_counts',
    stmts: [
      `CREATE TABLE IF NOT EXISTS stock_counts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        count_number VARCHAR(50) NOT NULL,
        company_id ${companyIdType} NOT NULL,
        warehouse_id INT NOT NULL,
        count_date DATE NOT NULL,
        status ENUM('draft','in_progress','completed','voided') DEFAULT 'draft',
        note TEXT,
        total_items INT DEFAULT 0,
        total_variance_qty INT DEFAULT 0,
        total_variance_value DECIMAL(12,2) DEFAULT 0,
        completed_at TIMESTAMP NULL,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_stock_counts_company (company_id),
        INDEX idx_stock_counts_warehouse (warehouse_id)
      )`,
      `CREATE TABLE IF NOT EXISTS stock_count_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        count_id INT NOT NULL,
        product_id INT NOT NULL,
        system_qty INT DEFAULT 0,
        counted_qty INT DEFAULT NULL,
        variance_qty INT DEFAULT 0,
        cost_per_unit DECIMAL(12,2) DEFAULT 0,
        variance_value DECIMAL(12,2) DEFAULT 0,
        note TEXT,
        FOREIGN KEY (count_id) REFERENCES stock_counts(id) ON DELETE CASCADE,
        INDEX idx_stock_count_items_product (product_id)
      )`,
    ]
  })

  // === 3. product images ===
  migrations.push({
    name: 'product_images',
    stmts: [
      `ALTER TABLE products ADD COLUMN image_url VARCHAR(500) AFTER description`,
    ]
  })

  // === 4. loyalty ===
  migrations.push({
    name: 'loyalty',
    stmts: [
      `ALTER TABLE contacts ADD COLUMN points_balance INT DEFAULT 0`,
      `ALTER TABLE contacts ADD COLUMN price_level ENUM('retail','wholesale','vip') DEFAULT 'retail'`,
      `CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id ${companyIdType} NOT NULL,
        contact_id INT NOT NULL,
        sale_id INT,
        type ENUM('earn','redeem','adjust','expire') NOT NULL,
        points INT NOT NULL,
        balance_after INT NOT NULL,
        description VARCHAR(255),
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_loyalty_company (company_id),
        INDEX idx_loyalty_contact (contact_id)
      )`,
      `ALTER TABLE products ADD COLUMN wholesale_price DECIMAL(12,2) AFTER selling_price`,
      `ALTER TABLE products ADD COLUMN vip_price DECIMAL(12,2) AFTER wholesale_price`,
    ]
  })

  // === 5. abbreviated_tax ===
  migrations.push({
    name: 'abbreviated_tax',
    stmts: [
      `ALTER TABLE sales_documents MODIFY COLUMN doc_type ENUM('quotation','invoice','receipt','receipt_tax','delivery','receipt_abb','debit_note','credit_note') NOT NULL`,
    ]
  })

  // === 6. wht ===
  migrations.push({
    name: 'wht_certificates',
    stmts: [
      `CREATE TABLE IF NOT EXISTS wht_certificates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id ${companyIdType} NOT NULL,
        certificate_number VARCHAR(50) NOT NULL,
        form_type ENUM('pnd3','pnd53') NOT NULL,
        contact_id INT NOT NULL,
        expense_id INT,
        payment_date DATE NOT NULL,
        income_type VARCHAR(100) NOT NULL,
        income_description VARCHAR(255),
        paid_amount DECIMAL(12,2) NOT NULL,
        wht_rate DECIMAL(5,2) NOT NULL,
        wht_amount DECIMAL(12,2) NOT NULL,
        tax_month INT NOT NULL,
        tax_year INT NOT NULL,
        status ENUM('draft','issued','voided') DEFAULT 'draft',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_wht_company (company_id),
        INDEX idx_wht_period (tax_year, tax_month),
        INDEX idx_wht_contact (contact_id),
        INDEX idx_wht_status (status)
      )`,
    ]
  })

  // === 7. bank_reconciliation ===
  migrations.push({
    name: 'bank_reconciliation',
    stmts: [
      `CREATE TABLE IF NOT EXISTS bank_reconciliations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id ${companyIdType} NOT NULL,
        channel_id INT NOT NULL,
        period_from DATE NOT NULL,
        period_to DATE NOT NULL,
        statement_balance DECIMAL(12,2) NOT NULL,
        system_balance DECIMAL(12,2) NOT NULL,
        difference DECIMAL(12,2) DEFAULT 0,
        status ENUM('draft','reconciled') DEFAULT 'draft',
        note TEXT,
        reconciled_by INT,
        reconciled_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    ]
  })

  // === 8. recurring_expenses ===
  migrations.push({
    name: 'recurring_expenses',
    stmts: [
      `CREATE TABLE IF NOT EXISTS recurring_expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id ${companyIdType} NOT NULL,
        template_name VARCHAR(200) NOT NULL,
        contact_id INT,
        description TEXT,
        amount DECIMAL(12,2) NOT NULL,
        vat_amount DECIMAL(12,2) DEFAULT 0,
        wht_amount DECIMAL(12,2) DEFAULT 0,
        frequency ENUM('daily','weekly','monthly','quarterly','yearly') DEFAULT 'monthly',
        day_of_month INT DEFAULT 1,
        account_code VARCHAR(20),
        is_active BOOLEAN DEFAULT TRUE,
        last_generated DATE,
        next_due DATE,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    ]
  })

  // Run all
  let totalOk = 0, totalSkip = 0, totalErr = 0
  for (const m of migrations) {
    console.log(`=== ${m.name} ===`)
    for (const stmt of m.stmts) {
      try {
        await connection.execute(stmt)
        totalOk++
        console.log(`  OK`)
      } catch (err) {
        if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
          totalSkip++
          console.log(`  SKIP (already exists)`)
        } else {
          totalErr++
          console.error(`  ERROR: ${err.message.slice(0, 120)}`)
        }
      }
    }
  }

  console.log(`\nDone: ${totalOk} OK, ${totalSkip} skipped, ${totalErr} errors`)
  connection.release()
  process.exit(0)
}

run().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
