-- Bank Reconciliation table
CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    channel_id INT NOT NULL,
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    statement_balance DECIMAL(12,2) NOT NULL,
    system_balance DECIMAL(12,2) NOT NULL,
    difference DECIMAL(12,2) DEFAULT 0,
    status ENUM('draft', 'reconciled') DEFAULT 'draft',
    note TEXT,
    reconciled_by INT,
    reconciled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (channel_id) REFERENCES payment_channels(id)
);
