USE pos_stock_shop;

ALTER TABLE contacts ADD COLUMN address_street VARCHAR(255) AFTER address;
ALTER TABLE contacts ADD COLUMN address_subdistrict VARCHAR(100) AFTER address_street;
ALTER TABLE contacts ADD COLUMN address_district VARCHAR(100) AFTER address_subdistrict;
ALTER TABLE contacts ADD COLUMN address_province VARCHAR(100) AFTER address_district;
ALTER TABLE contacts ADD COLUMN address_postal_code VARCHAR(10) AFTER address_province;
