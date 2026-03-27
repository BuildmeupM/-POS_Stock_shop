-- ============================================================
-- Migration: Link sales_documents ↔ sales + add receipt_tax/delivery doc types
-- ============================================================

USE pos_stock_shop;

-- 1. Add sale_id column to link back to POS sale
ALTER TABLE sales_documents 
  ADD COLUMN sale_id INT NULL AFTER ref_doc_id,
  ADD INDEX idx_sdoc_sale (sale_id);

-- 2. Update doc_type ENUM to include delivery and receipt_tax
ALTER TABLE sales_documents 
  MODIFY COLUMN doc_type ENUM('quotation', 'invoice', 'receipt', 'receipt_tax', 'delivery') NOT NULL;
