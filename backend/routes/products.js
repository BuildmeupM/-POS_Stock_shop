const express = require('express')
const router = express.Router()
const { executeQuery } = require('../config/db')
const auth = require('../middleware/auth')
const { companyGuard } = require('../middleware/companyGuard')

router.use(auth, companyGuard)

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { search, category, active } = req.query
    let query = `
      SELECT p.*, c.name as category_name,
        COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl 
                  JOIN warehouses w ON sl.warehouse_id = w.id
                  WHERE sl.product_id = p.id AND w.company_id = p.company_id), 0) as total_stock
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.company_id = ?`
    const params = [req.user.companyId]

    if (search) {
      query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (category) {
      query += ' AND p.category_id = ?'
      params.push(category)
    }
    if (active !== undefined) {
      query += ' AND p.is_active = ?'
      params.push(active === 'true')
    }

    query += ' ORDER BY p.name ASC'
    const products = await executeQuery(query, params)
    res.json(products)
  } catch (error) {
    console.error('Get products error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const products = await executeQuery(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ? AND p.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (products.length === 0) {
      return res.status(404).json({ message: 'ไม่พบสินค้า' })
    }
    res.json(products[0])
  } catch (error) {
    console.error('Get product error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { sku, barcode, name, description, categoryId, unit, costPrice, sellingPrice, minStock } = req.body

    if (!sku || !name || !sellingPrice) {
      return res.status(400).json({ message: 'กรุณากรอก SKU, ชื่อสินค้า, และราคาขาย' })
    }

    const result = await executeQuery(
      `INSERT INTO products (company_id, sku, barcode, name, description, category_id, unit, cost_price, selling_price, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, sku, barcode || null, name, description || null,
       categoryId || null, unit || 'ชิ้น', costPrice || 0, sellingPrice, minStock || 0]
    )

    res.status(201).json({ message: 'เพิ่มสินค้าสำเร็จ', productId: result.insertId })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'SKU นี้มีในระบบแล้ว' })
    }
    console.error('Create product error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const { sku, barcode, name, description, categoryId, unit, costPrice, sellingPrice, minStock, isActive } = req.body

    await executeQuery(
      `UPDATE products SET sku = ?, barcode = ?, name = ?, description = ?, category_id = ?,
       unit = ?, cost_price = ?, selling_price = ?, min_stock = ?, is_active = ?
       WHERE id = ? AND company_id = ?`,
      [sku, barcode || null, name, description || null, categoryId || null,
       unit || 'ชิ้น', costPrice || 0, sellingPrice, minStock || 0,
       isActive !== undefined ? isActive : true,
       req.params.id, req.user.companyId]
    )

    res.json({ message: 'อัพเดตสินค้าสำเร็จ' })
  } catch (error) {
    console.error('Update product error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/products/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await executeQuery(
      'UPDATE products SET is_active = FALSE WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    res.json({ message: 'ลบสินค้าสำเร็จ' })
  } catch (error) {
    console.error('Delete product error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// === CATEGORIES ===
// GET /api/products/categories/all
router.get('/categories/all', async (req, res) => {
  try {
    const categories = await executeQuery(
      'SELECT * FROM categories WHERE company_id = ? ORDER BY name',
      [req.user.companyId]
    )
    res.json(categories)
  } catch (error) {
    console.error('Get categories error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/products/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, parentId } = req.body
    const result = await executeQuery(
      'INSERT INTO categories (company_id, name, parent_id) VALUES (?, ?, ?)',
      [req.user.companyId, name, parentId || null]
    )
    res.status(201).json({ message: 'เพิ่มหมวดหมู่สำเร็จ', categoryId: result.insertId })
  } catch (error) {
    console.error('Create category error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
