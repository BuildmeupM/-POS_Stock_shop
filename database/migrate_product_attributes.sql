-- ============================================================
-- Migration: Product Attribute Groups System
-- แทนที่ระบบ categories เดิม ด้วยระบบ attribute groups แบบหลายชั้น
-- ============================================================

-- 1. กลุ่มแอตทริบิวต์ (เช่น หมวดหมู่, แบรนด์, ประเภท)
CREATE TABLE IF NOT EXISTS product_attribute_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- 2. ค่าในแต่ละกลุ่ม (เช่น เครื่องดื่ม, ขนม, Coca-Cola)
CREATE TABLE IF NOT EXISTS product_attribute_values (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    value VARCHAR(200) NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES product_attribute_groups(id) ON DELETE CASCADE
);

-- 3. เชื่อมสินค้ากับค่าแอตทริบิวต์
CREATE TABLE IF NOT EXISTS product_attributes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    attribute_value_id INT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (attribute_value_id) REFERENCES product_attribute_values(id) ON DELETE CASCADE,
    UNIQUE KEY uq_product_attr (product_id, attribute_value_id)
);

-- 4. ย้ายข้อมูล categories เดิมเข้า attribute system
-- 4a. สร้างกลุ่ม "หมวดหมู่สินค้า" สำหรับแต่ละ company ที่มี categories
INSERT INTO product_attribute_groups (company_id, name, sort_order)
SELECT DISTINCT c.company_id, 'หมวดหมู่สินค้า', 1
FROM categories c
WHERE c.is_active = TRUE
AND NOT EXISTS (
    SELECT 1 FROM product_attribute_groups pag 
    WHERE pag.company_id = c.company_id AND pag.name = 'หมวดหมู่สินค้า'
);

-- 4b. ย้ายค่า categories เป็น attribute values
INSERT INTO product_attribute_values (group_id, value, sort_order)
SELECT pag.id, c.name, c.id
FROM categories c
JOIN product_attribute_groups pag ON pag.company_id = c.company_id AND pag.name = 'หมวดหมู่สินค้า'
WHERE c.is_active = TRUE;

-- 4c. ย้าย product-category relationships เป็น product_attributes
INSERT INTO product_attributes (product_id, attribute_value_id)
SELECT p.id, pav.id
FROM products p
JOIN categories c ON p.category_id = c.id
JOIN product_attribute_groups pag ON pag.company_id = p.company_id AND pag.name = 'หมวดหมู่สินค้า'
JOIN product_attribute_values pav ON pav.group_id = pag.id AND pav.value = c.name
WHERE p.category_id IS NOT NULL;
