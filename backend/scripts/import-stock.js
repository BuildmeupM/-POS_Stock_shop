/**
 * Import Stock Script
 * ใช้สำหรับ import สินค้าและสต๊อกจากไฟล์ CSV เข้าฐานข้อมูล
 *
 * Usage:
 *   node scripts/import-stock.js <csv_file> [--company <company_id>] [--warehouse <warehouse_id>] [--user <user_id>] [--dry-run]
 *
 * ตัวอย่าง:
 *   node scripts/import-stock.js templates/import_stock_template.csv --company comp-001 --warehouse 1 --user 1
 *   node scripts/import-stock.js templates/import_stock_template.csv --company comp-001 --dry-run
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ===== Parse CLI arguments =====
const args = process.argv.slice(2);
const csvFile = args[0];

function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const dryRun = args.includes('--dry-run');
const companyId = getArg('company', 'comp-001');
const warehouseId = parseInt(getArg('warehouse', '1'), 10);
const userId = parseInt(getArg('user', '1'), 10);

if (!csvFile) {
  console.error('Usage: node scripts/import-stock.js <csv_file> [--company <id>] [--warehouse <id>] [--user <id>] [--dry-run]');
  process.exit(1);
}

const csvPath = path.resolve(__dirname, '..', csvFile);
if (!fs.existsSync(csvPath)) {
  console.error(`ไม่พบไฟล์: ${csvPath}`);
  process.exit(1);
}

async function main() {
  // Read & parse CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // handle BOM from Excel
  });

  if (records.length === 0) {
    console.error('ไม่มีข้อมูลในไฟล์ CSV');
    process.exit(1);
  }

  console.log(`\n📦 Import Stock — ${dryRun ? '(DRY RUN)' : 'LIVE'}`);
  console.log(`   ไฟล์: ${csvPath}`);
  console.log(`   บริษัท: ${companyId}`);
  console.log(`   คลัง: ${warehouseId}`);
  console.log(`   ผู้ใช้: ${userId}`);
  console.log(`   จำนวนรายการ: ${records.length}\n`);

  // Connect to DB
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  const stats = { products_created: 0, products_skipped: 0, categories_created: 0, stock_received: 0, errors: [] };

  // Cache existing categories
  const [existingCategories] = await conn.query(
    'SELECT id, name FROM categories WHERE company_id = ?', [companyId]
  );
  const categoryMap = new Map(existingCategories.map(c => [c.name, c.id]));

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // line number in CSV (header = 1)
    const sku = row.sku?.trim();
    const name = row.name?.trim();

    if (!sku || !name) {
      stats.errors.push(`แถว ${rowNum}: sku และ name จำเป็นต้องกรอก — ข้าม`);
      continue;
    }

    const sellingPrice = parseFloat(row.selling_price) || 0;
    if (sellingPrice <= 0) {
      stats.errors.push(`แถว ${rowNum} (${sku}): selling_price ต้องมากกว่า 0 — ข้าม`);
      continue;
    }

    try {
      await conn.beginTransaction();

      // 1. Resolve category
      let categoryId = null;
      const categoryName = row.category?.trim();
      if (categoryName) {
        if (categoryMap.has(categoryName)) {
          categoryId = categoryMap.get(categoryName);
        } else if (!dryRun) {
          const [catResult] = await conn.query(
            'INSERT INTO categories (company_id, name) VALUES (?, ?)',
            [companyId, categoryName]
          );
          categoryId = catResult.insertId;
          categoryMap.set(categoryName, categoryId);
          stats.categories_created++;
          console.log(`  + หมวดหมู่ใหม่: "${categoryName}" (id=${categoryId})`);
        } else {
          console.log(`  [dry-run] จะสร้างหมวดหมู่: "${categoryName}"`);
          stats.categories_created++;
        }
      }

      // 2. Check if product exists (by sku + company)
      const [existing] = await conn.query(
        'SELECT id FROM products WHERE sku = ? AND company_id = ?',
        [sku, companyId]
      );

      let productId;
      if (existing.length > 0) {
        productId = existing[0].id;
        stats.products_skipped++;
        console.log(`  ~ สินค้า "${sku}" มีอยู่แล้ว (id=${productId}) — ข้ามการสร้าง, เพิ่มสต๊อกอย่างเดียว`);
      } else {
        if (!dryRun) {
          const [prodResult] = await conn.query(
            `INSERT INTO products (company_id, sku, barcode, name, description, category_id, unit, cost_price, selling_price, min_stock)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              companyId,
              sku,
              row.barcode?.trim() || null,
              name,
              row.description?.trim() || null,
              categoryId,
              row.unit?.trim() || 'ชิ้น',
              parseFloat(row.cost_price) || 0,
              sellingPrice,
              parseInt(row.min_stock, 10) || 0,
            ]
          );
          productId = prodResult.insertId;
        }
        stats.products_created++;
        console.log(`  + สินค้าใหม่: "${name}" (sku=${sku}${dryRun ? '' : `, id=${productId}`})`);
      }

      // 3. Receive stock (if quantity > 0)
      const quantity = parseInt(row.quantity, 10) || 0;
      if (quantity > 0 && !dryRun) {
        const costPerUnit = parseFloat(row.cost_price) || 0;

        // Create stock lot
        const [lotResult] = await conn.query(
          `INSERT INTO stock_lots (product_id, warehouse_id, quantity_remaining, cost_per_unit, batch_number, expiry_date)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            productId,
            warehouseId,
            quantity,
            costPerUnit,
            row.batch_number?.trim() || null,
            row.expiry_date?.trim() || null,
          ]
        );

        // Create stock transaction
        await conn.query(
          `INSERT INTO stock_transactions (product_id, warehouse_id, type, quantity, cost_per_unit, reference_type, related_lot_id, note, created_by)
           VALUES (?, ?, 'IN', ?, ?, 'IMPORT', ?, ?, ?)`,
          [
            productId,
            warehouseId,
            quantity,
            costPerUnit,
            lotResult.insertId,
            `Import จาก CSV — ${path.basename(csvPath)}`,
            userId,
          ]
        );

        stats.stock_received++;
        console.log(`    📥 รับเข้าสต๊อก: ${quantity} ${row.unit?.trim() || 'ชิ้น'} @ ${costPerUnit} บาท`);
      } else if (quantity > 0 && dryRun) {
        stats.stock_received++;
        console.log(`    [dry-run] จะรับเข้าสต๊อก: ${quantity} ${row.unit?.trim() || 'ชิ้น'}`);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      stats.errors.push(`แถว ${rowNum} (${sku}): ${err.message}`);
      console.error(`  ✗ แถว ${rowNum} (${sku}): ${err.message}`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('📊 สรุปผลการ Import');
  console.log('========================================');
  console.log(`  สินค้าใหม่:        ${stats.products_created}`);
  console.log(`  สินค้าซ้ำ (ข้าม):   ${stats.products_skipped}`);
  console.log(`  หมวดหมู่ใหม่:      ${stats.categories_created}`);
  console.log(`  รับเข้าสต๊อก:      ${stats.stock_received} รายการ`);
  if (stats.errors.length > 0) {
    console.log(`  ❌ ข้อผิดพลาด:     ${stats.errors.length}`);
    stats.errors.forEach(e => console.log(`     - ${e}`));
  } else {
    console.log(`  ✅ ไม่มีข้อผิดพลาด`);
  }
  if (dryRun) {
    console.log('\n⚠️  โหมด DRY RUN — ไม่มีการเปลี่ยนแปลงฐานข้อมูลจริง');
  }
  console.log('');

  await conn.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
