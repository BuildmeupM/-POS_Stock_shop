-- ============================================================
-- POS Bookdee — Migration: Sales Documents (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ)
-- ============================================================

USE pos_stock_shop;

-- ===== 1. เอกสารขาย =====
CREATE TABLE IF NOT EXISTS sales_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    doc_type ENUM('quotation', 'invoice', 'receipt') NOT NULL,
    doc_number VARCHAR(30) NOT NULL,
    ref_doc_id INT,                          -- อ้างอิงเอกสารต้นทาง (QT→IV→RC)
    reference VARCHAR(100),                  -- อ้างอิงภายนอก

    -- ลูกค้า
    customer_id INT,
    customer_name VARCHAR(200),
    customer_address TEXT,
    customer_tax_id VARCHAR(13),
    customer_phone VARCHAR(20),
    customer_email VARCHAR(100),

    -- วันที่
    doc_date DATE NOT NULL,
    due_date DATE,
    valid_until DATE,                        -- ใบเสนอราคา: ใช้ได้ถึงวันที่

    -- ราคา
    price_type ENUM('include_vat', 'exclude_vat', 'no_vat') DEFAULT 'include_vat',
    subtotal DECIMAL(12,2) DEFAULT 0,        -- รวมสินค้า (ก่อนส่วนลดรวม)
    discount_amount DECIMAL(12,2) DEFAULT 0, -- ส่วนลดรวม
    amount_before_vat DECIMAL(12,2) DEFAULT 0,
    vat_rate DECIMAL(5,2) DEFAULT 7,
    vat_amount DECIMAL(12,2) DEFAULT 0,
    wht_amount DECIMAL(12,2) DEFAULT 0,      -- ภาษีหัก ณ ที่จ่าย
    total_amount DECIMAL(12,2) DEFAULT 0,    -- ยอดรวมทั้งสิ้น

    -- การชำระ
    paid_amount DECIMAL(12,2) DEFAULT 0,
    payment_status ENUM('unpaid', 'partial', 'paid') DEFAULT 'unpaid',
    payment_method VARCHAR(20),
    payment_channel_id INT,
    paid_at TIMESTAMP NULL,

    -- สถานะ
    status ENUM('draft', 'approved', 'sent', 'accepted', 'rejected', 'voided') DEFAULT 'draft',
    salesperson_id INT,
    note TEXT,
    internal_note TEXT,

    -- Journal
    journal_entry_id INT,

    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (ref_doc_id) REFERENCES sales_documents(id),
    FOREIGN KEY (salesperson_id) REFERENCES users(id),
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE KEY uq_sdoc_company (doc_number, company_id),
    INDEX idx_sdoc_type (company_id, doc_type, status),
    INDEX idx_sdoc_customer (customer_id),
    INDEX idx_sdoc_date (doc_date)
);

-- ===== 2. รายการสินค้าในเอกสาร =====
CREATE TABLE IF NOT EXISTS sales_document_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    product_id INT,
    description VARCHAR(500),
    quantity DECIMAL(12,2) DEFAULT 1,
    unit VARCHAR(20) DEFAULT 'ชิ้น',
    unit_price DECIMAL(12,2) DEFAULT 0,
    discount_per_unit DECIMAL(12,2) DEFAULT 0,
    discount_type ENUM('baht', 'percent') DEFAULT 'baht',
    vat_type ENUM('vat7', 'vat0', 'no_vat') DEFAULT 'vat7',
    wht_rate DECIMAL(5,2) DEFAULT 0,
    subtotal DECIMAL(12,2) DEFAULT 0,

    FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_sdi_doc (document_id)
);
