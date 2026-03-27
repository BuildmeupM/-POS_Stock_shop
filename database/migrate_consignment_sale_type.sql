USE pos_stock_shop;

-- เพิ่ม 'consignment' ใน sale_type ENUM เพื่อรองรับยอดขายจากระบบฝากขาย
ALTER TABLE sales MODIFY COLUMN sale_type ENUM('pos', 'online', 'consignment') NOT NULL DEFAULT 'pos';
