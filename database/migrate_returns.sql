-- Sales Returns / Credit Notes for POS
CREATE TABLE IF NOT EXISTS sale_returns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_number VARCHAR(50) NOT NULL,
    sale_id INT NOT NULL,
    company_id INT NOT NULL,
    customer_id INT,
    return_date DATE NOT NULL,
    reason TEXT,
    status ENUM('draft', 'approved', 'voided') DEFAULT 'draft',
    subtotal DECIMAL(12,2) DEFAULT 0,
    vat_amount DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) DEFAULT 0,
    refund_method ENUM('cash', 'transfer', 'credit', 'exchange') DEFAULT 'cash',
    refund_amount DECIMAL(12,2) DEFAULT 0,
    journal_entry_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    return_id INT NOT NULL,
    sale_item_id INT,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    cost_price DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) NOT NULL,
    restock BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_sale_returns_company ON sale_returns(company_id);
CREATE INDEX idx_sale_returns_sale ON sale_returns(sale_id);
CREATE INDEX idx_sale_returns_date ON sale_returns(return_date);
