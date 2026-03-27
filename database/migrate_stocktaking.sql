-- Stock Count / Stocktaking System
CREATE TABLE IF NOT EXISTS stock_counts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    count_number VARCHAR(50) NOT NULL,
    company_id INT NOT NULL,
    warehouse_id INT NOT NULL,
    count_date DATE NOT NULL,
    status ENUM('draft', 'in_progress', 'completed', 'voided') DEFAULT 'draft',
    note TEXT,
    total_items INT DEFAULT 0,
    total_variance_qty INT DEFAULT 0,
    total_variance_value DECIMAL(12,2) DEFAULT 0,
    completed_at TIMESTAMP NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    count_id INT NOT NULL,
    product_id INT NOT NULL,
    system_qty INT DEFAULT 0,
    counted_qty INT DEFAULT NULL,
    variance_qty INT DEFAULT 0,
    cost_per_unit DECIMAL(12,2) DEFAULT 0,
    variance_value DECIMAL(12,2) DEFAULT 0,
    note TEXT,
    FOREIGN KEY (count_id) REFERENCES stock_counts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_stock_counts_company ON stock_counts(company_id);
CREATE INDEX idx_stock_counts_warehouse ON stock_counts(warehouse_id);
CREATE INDEX idx_stock_count_items_product ON stock_count_items(product_id);
