-- ============================================================
-- POS Bookdee — Migration: Remove suppliers table & unify to contacts
-- ============================================================
-- This migration:
-- 1. Adds contact_id column to purchase_orders (if not exists)
-- 2. Migrates data from suppliers → contacts table
-- 3. Links purchase_orders to contacts via contact_id
-- 4. Adds payment_terms to contacts (from suppliers)
-- 5. Drops supplier_id FK and column from purchase_orders
-- 6. Drops suppliers table
--
-- IMPORTANT: Run this AFTER ensuring all suppliers data is backed up
-- ============================================================

USE pos_stock_shop;

-- ===== Step 1: Add contact_id to purchase_orders if not exists =====
-- (The backend code already uses contact_id — this ensures the column exists)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND column_name = 'contact_id');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE purchase_orders ADD COLUMN contact_id INT AFTER supplier_id',
  'SELECT "contact_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ===== Step 2: Add payment_terms to contacts if not exists =====
SET @col_exists2 = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'contacts' AND column_name = 'payment_terms');

SET @sql2 = IF(@col_exists2 = 0,
  'ALTER TABLE contacts ADD COLUMN payment_terms INT DEFAULT 0 AFTER bank_name',
  'SELECT "payment_terms already exists"');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- ===== Step 3: Add contact_code to contacts if not exists =====
SET @col_exists3 = (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'contacts' AND column_name = 'code');

SET @sql3 = IF(@col_exists3 = 0,
  'ALTER TABLE contacts ADD COLUMN code VARCHAR(20) AFTER company_id',
  'SELECT "code already exists"');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- ===== Step 4: Migrate suppliers → contacts =====
-- Insert suppliers that don't already exist in contacts (matched by name + company_id)
INSERT IGNORE INTO contacts (company_id, code, name, contact_type, tax_id, phone, email, address,
  bank_account, bank_name, payment_terms, note, is_active, created_at)
SELECT s.company_id, s.code, s.name, 'vendor', s.tax_id, s.phone, s.email, s.address,
  s.bank_account, s.bank_name, s.payment_terms, s.note, s.is_active, s.created_at
FROM suppliers s
LEFT JOIN contacts c ON c.company_id = s.company_id AND c.name = s.name
WHERE c.id IS NULL;

-- ===== Step 5: Link purchase_orders.contact_id from suppliers → contacts =====
UPDATE purchase_orders po
JOIN suppliers s ON po.supplier_id = s.id
JOIN contacts c ON c.company_id = s.company_id AND c.name = s.name
SET po.contact_id = c.id
WHERE po.contact_id IS NULL AND po.supplier_id IS NOT NULL;

-- ===== Step 6: Add FK for contact_id (if not exists) =====
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE table_schema = DATABASE() AND table_name = 'purchase_orders' AND constraint_name = 'fk_po_contact');

SET @sql6 = IF(@fk_exists = 0,
  'ALTER TABLE purchase_orders ADD CONSTRAINT fk_po_contact FOREIGN KEY (contact_id) REFERENCES contacts(id)',
  'SELECT "fk_po_contact already exists"');
PREPARE stmt6 FROM @sql6;
EXECUTE stmt6;
DEALLOCATE PREPARE stmt6;

-- ===== Step 7: Drop old supplier_id FK and column =====
-- First drop the FK constraint (name may vary)
-- You may need to check the actual constraint name:
-- SELECT constraint_name FROM information_schema.key_column_usage
--   WHERE table_name = 'purchase_orders' AND column_name = 'supplier_id';

-- ALTER TABLE purchase_orders DROP FOREIGN KEY purchase_orders_ibfk_2;  -- Adjust constraint name
-- ALTER TABLE purchase_orders DROP COLUMN supplier_id;

-- ===== Step 8: Drop suppliers table (after confirming migration) =====
-- DROP TABLE IF EXISTS suppliers;

-- NOTE: Steps 7-8 are commented out for safety.
-- Run them manually after verifying that:
-- 1. All purchase_orders have contact_id set
-- 2. All suppliers data is in contacts table
-- Verify: SELECT COUNT(*) FROM purchase_orders WHERE contact_id IS NULL;
