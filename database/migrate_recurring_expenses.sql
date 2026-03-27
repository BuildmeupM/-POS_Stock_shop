CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    template_name VARCHAR(200) NOT NULL,
    contact_id INT,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    vat_amount DECIMAL(12,2) DEFAULT 0,
    wht_amount DECIMAL(12,2) DEFAULT 0,
    frequency ENUM('daily', 'weekly', 'monthly', 'quarterly', 'yearly') DEFAULT 'monthly',
    day_of_month INT DEFAULT 1,
    account_code VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    last_generated DATE,
    next_due DATE,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);
