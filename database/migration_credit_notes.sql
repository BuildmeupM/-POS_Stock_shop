-- Credit Notes (ใบลดหนี้)
CREATE TABLE IF NOT EXISTS credit_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    credit_note_number VARCHAR(30) NOT NULL,
    order_id INT NOT NULL,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(20),
    reason TEXT,
    total_amount DECIMAL(12,2) DEFAULT 0,
    shipping_refund DECIMAL(12,2) DEFAULT 0,
    discount_refund DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    status ENUM('draft','approved','voided') DEFAULT 'approved',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (order_id) REFERENCES online_orders(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE KEY uq_cn_company (credit_note_number, company_id)
);

CREATE TABLE IF NOT EXISTS credit_note_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    credit_note_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    discount DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);
