-- ============================================================
-- POS Bookdee — Migration: Add receipt_abb, debit_note, credit_note to sales_documents
-- ============================================================

USE pos_stock_shop;

ALTER TABLE sales_documents MODIFY COLUMN doc_type ENUM('quotation', 'invoice', 'receipt', 'receipt_tax', 'delivery', 'receipt_abb', 'debit_note', 'credit_note') NOT NULL;
