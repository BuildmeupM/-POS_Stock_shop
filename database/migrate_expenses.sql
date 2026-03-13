-- ============================================================
-- POS Bookdee — Expense System Migration
-- Add multi-line items, tax invoice fields, payment status
-- ============================================================

USE pos_stock_shop;

-- ===== 1. New columns on expenses table =====
ALTER TABLE expenses
  ADD COLUMN reference_number VARCHAR(100) AFTER description,
  ADD COLUMN due_date DATE AFTER expense_date,
  ADD COLUMN payment_status ENUM('paid','unpaid','partial') DEFAULT 'paid' AFTER payment_method,
  ADD COLUMN tax_invoice_number VARCHAR(50) AFTER tax_id,
  ADD COLUMN tax_invoice_date DATE AFTER tax_invoice_number,
  ADD COLUMN tax_period VARCHAR(10) AFTER tax_invoice_date,
  ADD COLUMN wht_type VARCHAR(10) AFTER wht_amount,
  ADD COLUMN note TEXT AFTER status;

-- ===== 2. New table: expense_items (multi-line items) =====
CREATE TABLE IF NOT EXISTS expense_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expense_id INT NOT NULL,
    account_id INT NOT NULL,
    description VARCHAR(200),
    quantity DECIMAL(12,2) DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    vat_type ENUM('none','include','exclude') DEFAULT 'none',
    vat_rate DECIMAL(5,2) DEFAULT 7.00,
    vat_amount DECIMAL(12,2) DEFAULT 0,
    wht_rate DECIMAL(5,2) DEFAULT 0,
    wht_amount DECIMAL(12,2) DEFAULT 0,
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- ===== 3. Make account_id nullable on expenses (for multi-item, we use items) =====
ALTER TABLE expenses MODIFY COLUMN account_id INT NULL;
