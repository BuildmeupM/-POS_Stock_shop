-- =============================================
-- Loyalty Points System & Price Levels
-- =============================================

-- Add points_balance and price_level to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS points_balance INT DEFAULT 0 AFTER address;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS price_level ENUM('retail', 'wholesale', 'vip') DEFAULT 'retail' AFTER points_balance;

-- Loyalty transactions log
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    contact_id INT NOT NULL,
    sale_id INT,
    type ENUM('earn', 'redeem', 'adjust', 'expire') NOT NULL,
    points INT NOT NULL,
    balance_after INT NOT NULL,
    description VARCHAR(255),
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX idx_loyalty_company ON loyalty_transactions(company_id);
CREATE INDEX idx_loyalty_contact ON loyalty_transactions(contact_id);

-- Price levels on products
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(12,2) AFTER selling_price;
ALTER TABLE products ADD COLUMN IF NOT EXISTS vip_price DECIMAL(12,2) AFTER wholesale_price;

-- Add loyalty settings to companies.settings JSON:
-- points_per_baht: 1       (earn 1 point per 1 baht spent)
-- points_value: 1           (1 point = 1 baht when redeeming)
-- min_redeem_points: 100    (minimum points to redeem)
