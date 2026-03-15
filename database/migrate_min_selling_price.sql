-- เพิ่มคอลัมน์ราคาขายต่ำสุด
ALTER TABLE products
ADD COLUMN min_selling_price DECIMAL(12,2) DEFAULT 0 AFTER selling_price;
