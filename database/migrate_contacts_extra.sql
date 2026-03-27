USE pos_stock_shop;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS code VARCHAR(50) AFTER company_id;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS price_level ENUM('retail','wholesale','vip') DEFAULT 'retail' AFTER address_postal_code;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS payment_terms INT DEFAULT 0 AFTER bank_name;
