-- ============================================================
-- POS Bookdee — Database Schema (Multi-Tenant)
-- ============================================================

CREATE DATABASE IF NOT EXISTS pos_stock_shop CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pos_stock_shop;

-- ===== 1. COMPANIES (ร้านค้า/บริษัท) =====
CREATE TABLE companies (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    tax_id VARCHAR(13),
    address TEXT,
    phone VARCHAR(20),
    logo_url VARCHAR(500),
    settings JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ===== 2. USERS =====
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    nick_name VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ===== 3. USER ↔ COMPANY (many-to-many + role per company) =====
CREATE TABLE user_companies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    company_id VARCHAR(36) NOT NULL,
    role ENUM('owner', 'admin', 'manager', 'cashier', 'accountant', 'staff') DEFAULT 'staff',
    is_default BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_company (user_id, company_id)
);

-- ===== 4. CATEGORIES =====
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    parent_id INT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- ===== 5. PRODUCTS =====
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    sku VARCHAR(50) NOT NULL,
    barcode VARCHAR(100),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id INT,
    unit VARCHAR(20) DEFAULT 'ชิ้น',
    cost_price DECIMAL(12,2) DEFAULT 0,
    selling_price DECIMAL(12,2) NOT NULL,
    min_stock INT DEFAULT 0,
    image_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    UNIQUE KEY uq_sku_company (sku, company_id)
);

-- ===== 6. WAREHOUSES =====
CREATE TABLE warehouses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- ===== 7. STOCK LOTS =====
CREATE TABLE stock_lots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    quantity_remaining INT NOT NULL,
    cost_per_unit DECIMAL(12,2) NOT NULL,
    batch_number VARCHAR(50),
    expiry_date DATE,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
);

-- ===== 8. STOCK TRANSACTIONS =====
CREATE TABLE stock_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    type ENUM('IN', 'OUT', 'SALE', 'RETURN', 'ADJUST', 'TRANSFER') NOT NULL,
    quantity INT NOT NULL,
    cost_per_unit DECIMAL(12,2),
    reference_type VARCHAR(50),
    reference_id INT,
    related_lot_id INT,
    note TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (related_lot_id) REFERENCES stock_lots(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ===== 9. CUSTOMERS =====
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    tax_id VARCHAR(13),
    address TEXT,
    customer_type ENUM('walk-in', 'member', 'wholesale') DEFAULT 'walk-in',
    points INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- ===== 10. SALES =====
CREATE TABLE sales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    invoice_number VARCHAR(30) NOT NULL,
    sale_type ENUM('pos', 'online') NOT NULL,
    customer_id INT,
    total_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    vat_amount DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    payment_method ENUM('cash', 'transfer', 'credit_card', 'qr_code', 'mixed') DEFAULT 'cash',
    payment_status ENUM('paid', 'partial', 'unpaid', 'refunded') DEFAULT 'paid',
    status ENUM('completed', 'voided', 'pending') DEFAULT 'completed',
    cashier_id INT,
    note TEXT,
    sold_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (cashier_id) REFERENCES users(id),
    UNIQUE KEY uq_invoice_company (invoice_number, company_id)
);

-- ===== 11. SALE ITEMS =====
CREATE TABLE sale_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    cost_price DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ===== 12. PAYMENTS =====
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sale_id INT NOT NULL,
    method ENUM('cash', 'transfer', 'credit_card', 'qr_code') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reference_number VARCHAR(100),
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- ===== 13. CHART OF ACCOUNTS =====
CREATE TABLE accounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    account_code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    account_type ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL,
    parent_id INT,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (parent_id) REFERENCES accounts(id) ON DELETE SET NULL,
    UNIQUE KEY uq_code_company (account_code, company_id)
);

-- ===== 14. JOURNAL ENTRIES =====
CREATE TABLE journal_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    entry_number VARCHAR(30) NOT NULL,
    entry_date DATE NOT NULL,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id INT,
    status ENUM('draft', 'posted', 'voided') DEFAULT 'draft',
    created_by INT,
    approved_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id),
    UNIQUE KEY uq_entry_company (entry_number, company_id)
);

-- ===== 15. JOURNAL LINES =====
CREATE TABLE journal_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    journal_entry_id INT NOT NULL,
    account_id INT NOT NULL,
    debit_amount DECIMAL(12,2) DEFAULT 0,
    credit_amount DECIMAL(12,2) DEFAULT 0,
    description VARCHAR(200),
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- ===== 16. EXPENSES =====
CREATE TABLE expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    expense_number VARCHAR(30) NOT NULL,
    account_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    expense_date DATE NOT NULL,
    payment_method ENUM('cash', 'transfer', 'credit_card') DEFAULT 'cash',
    receipt_url VARCHAR(500),
    vendor_name VARCHAR(200),
    tax_id VARCHAR(13),
    vat_amount DECIMAL(12,2) DEFAULT 0,
    wht_amount DECIMAL(12,2) DEFAULT 0,
    status ENUM('draft', 'approved', 'voided') DEFAULT 'draft',
    created_by INT,
    journal_entry_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
    UNIQUE KEY uq_expense_company (expense_number, company_id)
);

-- ===== 17. ONLINE ORDERS =====
CREATE TABLE online_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    order_number VARCHAR(30) NOT NULL,
    platform ENUM('website', 'facebook', 'line', 'shopee', 'lazada', 'other') DEFAULT 'website',
    customer_id INT,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    shipping_address TEXT,
    total_amount DECIMAL(12,2) DEFAULT 0,
    shipping_cost DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    payment_method ENUM('transfer', 'cod', 'credit_card', 'qr_code') DEFAULT 'transfer',
    payment_status ENUM('pending', 'confirmed', 'refunded') DEFAULT 'pending',
    payment_proof_url VARCHAR(500),
    order_status ENUM('pending','confirmed','packing','shipped','delivered','cancelled','returned') DEFAULT 'pending',
    tracking_number VARCHAR(100),
    shipping_provider VARCHAR(50),
    shipped_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    note TEXT,
    sale_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE KEY uq_order_company (order_number, company_id)
);

-- ===== 18. ONLINE ORDER ITEMS =====
CREATE TABLE online_order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    discount DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES online_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);
