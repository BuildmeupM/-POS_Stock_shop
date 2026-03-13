-- ============================================================
-- POS Bookdee — Seed Data
-- ============================================================
USE pos_stock_shop;

-- ===== Default Company =====
INSERT INTO
    companies (
        id,
        name,
        tax_id,
        phone,
        settings
    )
VALUES (
        'comp-001',
        'ร้านบุ๊คดี สาขาหลัก',
        '1234567890123',
        '0812345678',
        '{"vat_enabled": true, "vat_rate": 7, "currency": "THB", "language": "th"}'
    );

-- ===== Default Admin User (password: admin123) =====
-- password: admin123
INSERT INTO users (username, password_hash, full_name, nick_name) VALUES
('admin', '$2a$10$jBjNbkPgM3epp7FfsQ8KJ.rmssZCK6HeNB4ihpsEymLWJ2f6yvVu6', 'ผู้ดูแลระบบ', 'แอดมิน');

-- ===== Link Admin to Company =====
INSERT INTO
    user_companies (
        user_id,
        company_id,
        role,
        is_default
    )
VALUES (1, 'comp-001', 'owner', TRUE);

-- ===== Default Warehouse =====
INSERT INTO
    warehouses (company_id, name, location)
VALUES (
        'comp-001',
        'คลังสินค้าหลัก',
        'สาขาหลัก'
    );

-- ===== Default Chart of Accounts =====
-- สินทรัพย์ (Assets)
INSERT INTO
    accounts (
        company_id,
        account_code,
        name,
        account_type
    )
VALUES (
        'comp-001',
        '1000',
        'สินทรัพย์',
        'asset'
    ),
    (
        'comp-001',
        '1100',
        'เงินสด',
        'asset'
    ),
    (
        'comp-001',
        '1110',
        'เงินสดในมือ',
        'asset'
    ),
    (
        'comp-001',
        '1120',
        'เงินสดย่อย',
        'asset'
    ),
    (
        'comp-001',
        '1200',
        'เงินฝากธนาคาร',
        'asset'
    ),
    (
        'comp-001',
        '1300',
        'ลูกหนี้การค้า',
        'asset'
    ),
    (
        'comp-001',
        '1400',
        'สินค้าคงเหลือ',
        'asset'
    );

-- หนี้สิน (Liabilities)
INSERT INTO
    accounts (
        company_id,
        account_code,
        name,
        account_type
    )
VALUES (
        'comp-001',
        '2000',
        'หนี้สิน',
        'liability'
    ),
    (
        'comp-001',
        '2100',
        'เจ้าหนี้การค้า',
        'liability'
    ),
    (
        'comp-001',
        '2200',
        'ภาษีมูลค่าเพิ่มค้างจ่าย',
        'liability'
    ),
    (
        'comp-001',
        '2300',
        'ภาษีหัก ณ ที่จ่ายค้างจ่าย',
        'liability'
    );

-- ส่วนของเจ้าของ (Equity)
INSERT INTO
    accounts (
        company_id,
        account_code,
        name,
        account_type
    )
VALUES (
        'comp-001',
        '3000',
        'ส่วนของเจ้าของ',
        'equity'
    ),
    (
        'comp-001',
        '3100',
        'ทุนเจ้าของ',
        'equity'
    ),
    (
        'comp-001',
        '3200',
        'กำไรสะสม',
        'equity'
    );

-- รายได้ (Revenue)
INSERT INTO
    accounts (
        company_id,
        account_code,
        name,
        account_type
    )
VALUES (
        'comp-001',
        '4000',
        'รายได้',
        'revenue'
    ),
    (
        'comp-001',
        '4100',
        'รายได้จากการขาย — หน้าร้าน',
        'revenue'
    ),
    (
        'comp-001',
        '4200',
        'รายได้จากการขาย — ออนไลน์',
        'revenue'
    ),
    (
        'comp-001',
        '4300',
        'รายได้อื่น',
        'revenue'
    );

-- ค่าใช้จ่าย (Expenses)
INSERT INTO
    accounts (
        company_id,
        account_code,
        name,
        account_type
    )
VALUES (
        'comp-001',
        '5000',
        'ค่าใช้จ่าย',
        'expense'
    ),
    (
        'comp-001',
        '5100',
        'ต้นทุนสินค้าขาย (COGS)',
        'expense'
    ),
    (
        'comp-001',
        '5200',
        'ค่าแรง/เงินเดือน',
        'expense'
    ),
    (
        'comp-001',
        '5300',
        'ค่าเช่า',
        'expense'
    ),
    (
        'comp-001',
        '5400',
        'ค่าน้ำ/ค่าไฟ',
        'expense'
    ),
    (
        'comp-001',
        '5500',
        'ค่าขนส่ง',
        'expense'
    ),
    (
        'comp-001',
        '5600',
        'ค่าวัสดุสำนักงาน',
        'expense'
    ),
    (
        'comp-001',
        '5700',
        'ค่าโฆษณา/การตลาด',
        'expense'
    ),
    (
        'comp-001',
        '5800',
        'ค่าใช้จ่ายเบ็ดเตล็ด',
        'expense'
    ),
    (
        'comp-001',
        '5900',
        'ค่าเสื่อมราคา',
        'expense'
    );

-- ===== Default Walk-in Customer =====
INSERT INTO
    customers (
        company_id,
        name,
        customer_type
    )
VALUES (
        'comp-001',
        'ลูกค้าทั่วไป (Walk-in)',
        'walk-in'
    );