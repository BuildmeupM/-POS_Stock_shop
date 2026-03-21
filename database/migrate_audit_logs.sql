-- ============================================================
-- POS Bookdee — Migration: Audit Logs
-- บันทึกการเปลี่ยนแปลงข้อมูลสำคัญ
-- ============================================================

USE pos_stock_shop;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    user_id INT,
    user_name VARCHAR(100),
    action VARCHAR(50) NOT NULL,        -- CREATE, UPDATE, DELETE, VOID, LOGIN, etc.
    entity_type VARCHAR(50) NOT NULL,   -- sale, purchase_order, expense, product, user, etc.
    entity_id VARCHAR(50),              -- ID of the affected record
    description TEXT,                    -- Human-readable summary
    old_values JSON,                     -- Previous values (for updates)
    new_values JSON,                     -- New values
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_audit_company (company_id),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_date (created_at),
    INDEX idx_audit_action (action)
);
