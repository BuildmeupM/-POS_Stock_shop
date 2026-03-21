-- ============================================================
-- POS Bookdee — Migration: Performance Indexes
-- เพิ่ม index สำหรับ query ที่ใช้บ่อย
-- ============================================================

USE pos_stock_shop;

-- === Sales ===
CREATE INDEX IF NOT EXISTS idx_sales_company_date ON sales(company_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- === Products ===
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- === Stock ===
CREATE INDEX IF NOT EXISTS idx_stock_lots_product ON stock_lots(product_id, quantity_remaining);
CREATE INDEX IF NOT EXISTS idx_stock_lots_warehouse ON stock_lots(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_txn_product ON stock_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_txn_company_date ON stock_transactions(created_at);

-- === Purchases ===
CREATE INDEX IF NOT EXISTS idx_po_company_status ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_po_items ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_pinv_po ON purchase_invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_ppay_inv ON purchase_payments(invoice_id);

-- === Contacts ===
CREATE INDEX IF NOT EXISTS idx_contacts_company_type ON contacts(company_id, contact_type);

-- === Customers ===
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id, is_active);

-- === Expenses ===
CREATE INDEX IF NOT EXISTS idx_expenses_company_date ON expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(company_id, status);
CREATE INDEX IF NOT EXISTS idx_expense_items ON expense_items(expense_id);

-- === Journal ===
CREATE INDEX IF NOT EXISTS idx_je_company_date ON journal_entries(company_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_status ON journal_entries(company_id, status);
CREATE INDEX IF NOT EXISTS idx_je_ref ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id);

-- === Accounts ===
CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id, account_type);

-- === Orders ===
CREATE INDEX IF NOT EXISTS idx_orders_company ON online_orders(company_id, order_status);
CREATE INDEX IF NOT EXISTS idx_order_items ON online_order_items(order_id);

-- === Payments ===
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
