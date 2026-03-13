USE pos_stock_shop;

CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(200) NOT NULL,
    contact_type ENUM('vendor','customer','both') DEFAULT 'vendor',
    tax_id VARCHAR(13),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    branch VARCHAR(100),
    bank_account VARCHAR(50),
    bank_name VARCHAR(100),
    note TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- Add contact_id to expenses for linking
ALTER TABLE expenses ADD COLUMN contact_id INT AFTER vendor_name;
ALTER TABLE expenses ADD CONSTRAINT fk_expense_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
