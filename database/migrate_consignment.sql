-- ============================================================
-- POS Bookdee — Migration: Consignment System (ระบบฝากขาย)
-- ============================================================

USE pos_stock_shop;

-- ===== 1. สัญญาฝากขาย =====
CREATE TABLE IF NOT EXISTS consignment_agreements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    contact_id INT NOT NULL,
    agreement_number VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    commission_type ENUM('percent', 'fixed') DEFAULT 'percent',
    commission_rate DECIMAL(12,2) DEFAULT 0,
    payment_terms INT DEFAULT 30,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    note TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE KEY uq_csa_company (agreement_number, company_id),
    INDEX idx_csa_status (company_id, status)
);

-- ===== 2. สต๊อกสินค้าฝากขาย =====
CREATE TABLE IF NOT EXISTS consignment_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agreement_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity_received INT DEFAULT 0,
    quantity_sold INT DEFAULT 0,
    quantity_returned INT DEFAULT 0,
    quantity_on_hand INT DEFAULT 0,
    consignor_price DECIMAL(12,2) NOT NULL,
    selling_price DECIMAL(12,2) NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agreement_id) REFERENCES consignment_agreements(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_cs_agreement (agreement_id),
    INDEX idx_cs_product (product_id)
);

-- ===== 3. ประวัติเคลื่อนไหวฝากขาย =====
CREATE TABLE IF NOT EXISTS consignment_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    agreement_id INT NOT NULL,
    product_id INT NOT NULL,
    type ENUM('RECEIVE', 'SALE', 'RETURN') NOT NULL,
    quantity INT NOT NULL,
    consignor_price DECIMAL(12,2) DEFAULT 0,
    selling_price DECIMAL(12,2) DEFAULT 0,
    commission_amount DECIMAL(12,2) DEFAULT 0,
    sale_id INT,
    note TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agreement_id) REFERENCES consignment_agreements(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_ct_agreement (agreement_id),
    INDEX idx_ct_type (type),
    INDEX idx_ct_date (created_at)
);

-- ===== 4. ใบสรุปยอด/จ่ายเงินฝากขาย =====
CREATE TABLE IF NOT EXISTS consignment_settlements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    agreement_id INT NOT NULL,
    settlement_number VARCHAR(30) NOT NULL,
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_commission DECIMAL(12,2) DEFAULT 0,
    net_payable DECIMAL(12,2) DEFAULT 0,
    status ENUM('draft', 'confirmed', 'paid') DEFAULT 'draft',
    paid_at TIMESTAMP NULL,
    payment_method VARCHAR(20),
    payment_channel_id INT,
    journal_entry_id INT,
    note TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (agreement_id) REFERENCES consignment_agreements(id),
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE KEY uq_cst_company (settlement_number, company_id),
    INDEX idx_cst_agreement (agreement_id),
    INDEX idx_cst_status (company_id, status)
);

-- ===== 5. เพิ่ม flag ฝากขายใน products =====
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_consignment BOOLEAN DEFAULT FALSE AFTER is_active;

-- ===== 6. เพิ่ม flag ฝากขายใน sale_items =====
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_consignment BOOLEAN DEFAULT FALSE AFTER subtotal;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS consignment_stock_id INT AFTER is_consignment;
