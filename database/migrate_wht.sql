-- ============================================================
-- POS Bookdee — Migration: Withholding Tax Certificates (หนังสือรับรองหัก ณ ที่จ่าย)
-- ============================================================

USE pos_stock_shop;

CREATE TABLE IF NOT EXISTS wht_certificates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    certificate_number VARCHAR(50) NOT NULL,
    form_type ENUM('pnd3', 'pnd53') NOT NULL COMMENT 'pnd3=บุคคลธรรมดา, pnd53=นิติบุคคล',
    contact_id INT NOT NULL,
    expense_id INT,
    payment_date DATE NOT NULL,
    income_type VARCHAR(100) NOT NULL COMMENT 'e.g. ค่าบริการ, ค่าเช่า, ค่าจ้างทำของ',
    income_description VARCHAR(255),
    paid_amount DECIMAL(12,2) NOT NULL,
    wht_rate DECIMAL(5,2) NOT NULL,
    wht_amount DECIMAL(12,2) NOT NULL,
    tax_month INT NOT NULL,
    tax_year INT NOT NULL,
    status ENUM('draft', 'issued', 'voided') DEFAULT 'draft',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE KEY uq_wht_cert_number (certificate_number, company_id)
);

CREATE INDEX idx_wht_company ON wht_certificates(company_id);
CREATE INDEX idx_wht_period ON wht_certificates(tax_year, tax_month);
CREATE INDEX idx_wht_contact ON wht_certificates(contact_id);
CREATE INDEX idx_wht_status ON wht_certificates(company_id, status);
