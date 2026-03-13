// Run purchase document flow DB migration (invoices + payments)
require('dotenv').config()
const { pool } = require('./config/db')

async function migrate() {
  const connection = await pool.getConnection()
  try {
    console.log('🔄 Running purchase document flow migration...')

    // Add invoiced/paid to PO status
    await connection.execute(`
      ALTER TABLE purchase_orders 
      MODIFY COLUMN status ENUM('draft','approved','partial','received','invoiced','paid','cancelled') 
      DEFAULT 'draft'
    `)
    console.log('✅ purchase_orders status enum updated')

    await connection.execute(`CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id VARCHAR(36) NOT NULL,
      invoice_number VARCHAR(30) NOT NULL,
      po_id INT NOT NULL,
      grn_id INT NOT NULL,
      supplier_id INT NOT NULL,
      invoice_date DATE NOT NULL,
      due_date DATE,
      tax_invoice_number VARCHAR(50),
      subtotal DECIMAL(12,2) DEFAULT 0,
      vat_amount DECIMAL(12,2) DEFAULT 0,
      wht_amount DECIMAL(12,2) DEFAULT 0,
      total_amount DECIMAL(12,2) DEFAULT 0,
      paid_amount DECIMAL(12,2) DEFAULT 0,
      status ENUM('pending','partial','paid') DEFAULT 'pending',
      note TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (grn_id) REFERENCES goods_receipts(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE KEY uq_inv_company (invoice_number, company_id)
    )`)
    console.log('✅ purchase_invoices table created')

    await connection.execute(`CREATE TABLE IF NOT EXISTS purchase_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id VARCHAR(36) NOT NULL,
      payment_number VARCHAR(30) NOT NULL,
      invoice_id INT NOT NULL,
      payment_date DATE NOT NULL,
      amount DECIMAL(12,2) NOT NULL,
      payment_method ENUM('cash','transfer','cheque') DEFAULT 'transfer',
      reference_number VARCHAR(100),
      bank_name VARCHAR(50),
      note TEXT,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      UNIQUE KEY uq_pay_company (payment_number, company_id)
    )`)
    console.log('✅ purchase_payments table created')

    console.log('🎉 Document flow migration complete!')
  } catch (error) {
    console.error('❌ Migration error:', error.message)
  } finally {
    connection.release()
    process.exit(0)
  }
}

migrate()
