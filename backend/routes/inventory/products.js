const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')

router.use(auth, companyGuard)

// ====================================================================
// ATTRIBUTE GROUPS (must be before /:id routes)
// ====================================================================

// GET /api/products/attribute-groups
router.get('/attribute-groups', async (req, res) => {
  try {
    const groups = await executeQuery(
      'SELECT * FROM product_attribute_groups WHERE company_id = ? AND is_active = TRUE ORDER BY sort_order, name',
      [req.user.companyId]
    )

    if (groups.length > 0) {
      const groupIds = groups.map(g => g.id)
      const values = await executeQuery(
        `SELECT * FROM product_attribute_values 
         WHERE group_id IN (${groupIds.map(() => '?').join(',')}) AND is_active = TRUE
         ORDER BY sort_order, value`,
        groupIds
      )

      const valueMap = {}
      for (const v of values) {
        if (!valueMap[v.group_id]) valueMap[v.group_id] = []
        valueMap[v.group_id].push(v)
      }
      for (const g of groups) {
        g.values = valueMap[g.id] || []
      }
    }

    res.json(groups)
  } catch (error) {
    console.error('Get attribute groups error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/products/attribute-groups
router.post('/attribute-groups', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่อกลุ่ม' })

    const maxResult = await executeQuery(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM product_attribute_groups WHERE company_id = ?',
      [req.user.companyId]
    )

    const result = await executeQuery(
      'INSERT INTO product_attribute_groups (company_id, name, sort_order) VALUES (?, ?, ?)',
      [req.user.companyId, name, maxResult[0].next_order]
    )
    res.status(201).json({ message: 'สร้างกลุ่มสำเร็จ', groupId: result.insertId })
  } catch (error) {
    console.error('Create attribute group error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/products/attribute-groups/:id
router.put('/attribute-groups/:id', async (req, res) => {
  try {
    const { name, sortOrder } = req.body
    await executeQuery(
      'UPDATE product_attribute_groups SET name = ?, sort_order = ? WHERE id = ? AND company_id = ?',
      [name, sortOrder || 0, req.params.id, req.user.companyId]
    )
    res.json({ message: 'แก้ไขกลุ่มสำเร็จ' })
  } catch (error) {
    console.error('Update attribute group error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/products/attribute-groups/:id
router.delete('/attribute-groups/:id', async (req, res) => {
  try {
    await executeQuery(
      'UPDATE product_attribute_groups SET is_active = FALSE WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    res.json({ message: 'ลบกลุ่มสำเร็จ' })
  } catch (error) {
    console.error('Delete attribute group error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/products/attribute-groups/:id/values
router.post('/attribute-groups/:id/values', async (req, res) => {
  try {
    const { value } = req.body
    if (!value) return res.status(400).json({ message: 'กรุณาระบุค่า' })

    const groups = await executeQuery(
      'SELECT id FROM product_attribute_groups WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (groups.length === 0) return res.status(404).json({ message: 'ไม่พบกลุ่ม' })

    const maxResult = await executeQuery(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM product_attribute_values WHERE group_id = ?',
      [req.params.id]
    )

    const result = await executeQuery(
      'INSERT INTO product_attribute_values (group_id, value, sort_order) VALUES (?, ?, ?)',
      [req.params.id, value, maxResult[0].next_order]
    )
    res.status(201).json({ message: 'เพิ่มค่าสำเร็จ', valueId: result.insertId })
  } catch (error) {
    console.error('Create attribute value error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/products/attribute-values/:id
router.put('/attribute-values/:id', async (req, res) => {
  try {
    const { value, sortOrder } = req.body
    await executeQuery(
      'UPDATE product_attribute_values SET value = ?, sort_order = ? WHERE id = ?',
      [value, sortOrder || 0, req.params.id]
    )
    res.json({ message: 'แก้ไขค่าสำเร็จ' })
  } catch (error) {
    console.error('Update attribute value error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/products/attribute-values/:id
router.delete('/attribute-values/:id', async (req, res) => {
  try {
    await executeQuery(
      'UPDATE product_attribute_values SET is_active = FALSE WHERE id = ?',
      [req.params.id]
    )
    res.json({ message: 'ลบค่าสำเร็จ' })
  } catch (error) {
    console.error('Delete attribute value error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// === LEGACY CATEGORIES (kept for backward compatibility) ===
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

// ====================================================================
// PRODUCTS (/:id routes after specific routes)
// ====================================================================

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { search, active } = req.query
    let query = `
      SELECT p.*,
        COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl 
                  JOIN warehouses w ON sl.warehouse_id = w.id
                  WHERE sl.product_id = p.id AND w.company_id = p.company_id), 0) as total_stock
      FROM products p
      WHERE p.company_id = ?`
    const params = [req.user.companyId]

    if (search) {
      query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (active !== undefined) {
      query += ' AND p.is_active = ?'
      params.push(active === 'true')
    }

    query += ' ORDER BY p.name ASC'
    const products = await executeQuery(query, params)

    // Fetch attributes for all products
    if (products.length > 0) {
      const productIds = products.map(p => p.id)
      const attrs = await executeQuery(`
        SELECT pa.product_id, pag.id as group_id, pag.name as group_name, 
               pav.id as value_id, pav.value as value_name
        FROM product_attributes pa
        JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
        JOIN product_attribute_groups pag ON pav.group_id = pag.id
        WHERE pa.product_id IN (${productIds.map(() => '?').join(',')})
        ORDER BY pag.sort_order, pav.sort_order
      `, productIds)

      const attrMap = {}
      for (const a of attrs) {
        if (!attrMap[a.product_id]) attrMap[a.product_id] = []
        attrMap[a.product_id].push({
          groupId: a.group_id,
          groupName: a.group_name,
          valueId: a.value_id,
          valueName: a.value_name,
        })
      }
      for (const p of products) {
        p.attributes = attrMap[p.id] || []
      }
    }

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
      `SELECT p.* FROM products p WHERE p.id = ? AND p.company_id = ?`,
      [req.params.id, req.user.companyId]
    )
    if (products.length === 0) {
      return res.status(404).json({ message: 'ไม่พบสินค้า' })
    }
    const product = products[0]

    product.attributes = await executeQuery(`
      SELECT pag.id as group_id, pag.name as group_name, 
             pav.id as value_id, pav.value as value_name
      FROM product_attributes pa
      JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
      JOIN product_attribute_groups pag ON pav.group_id = pag.id
      WHERE pa.product_id = ?
      ORDER BY pag.sort_order, pav.sort_order
    `, [product.id])

    res.json(product)
  } catch (error) {
    console.error('Get product error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { sku, barcode, name, description, unit, costPrice, sellingPrice, minSellingPrice, minStock, attributes } = req.body

    if (!sku || !name || !sellingPrice) {
      return res.status(400).json({ message: 'กรุณากรอก SKU, ชื่อสินค้า, และราคาขาย' })
    }

    const result = await executeQuery(
      `INSERT INTO products (company_id, sku, barcode, name, description, unit, cost_price, selling_price, min_selling_price, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, sku, barcode || null, name, description || null,
       unit || 'ชิ้น', costPrice || 0, sellingPrice, minSellingPrice || 0, minStock || 0]
    )

    const productId = result.insertId

    if (attributes && attributes.length > 0) {
      for (const attr of attributes) {
        if (attr.valueId) {
          await executeQuery(
            'INSERT INTO product_attributes (product_id, attribute_value_id) VALUES (?, ?)',
            [productId, attr.valueId]
          )
        }
      }
    }

    res.status(201).json({ message: 'เพิ่มสินค้าสำเร็จ', productId })
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
    const { sku, barcode, name, description, unit, costPrice, sellingPrice, minSellingPrice, minStock, isActive, attributes } = req.body

    await executeQuery(
      `UPDATE products SET sku = ?, barcode = ?, name = ?, description = ?,
       unit = ?, cost_price = ?, selling_price = ?, min_selling_price = ?, min_stock = ?, is_active = ?
       WHERE id = ? AND company_id = ?`,
      [sku, barcode || null, name, description || null,
       unit || 'ชิ้น', costPrice || 0, sellingPrice, minSellingPrice || 0, minStock || 0,
       isActive !== undefined ? isActive : true,
       req.params.id, req.user.companyId]
    )

    // Update attributes: delete all and re-insert
    if (attributes !== undefined) {
      await executeQuery('DELETE FROM product_attributes WHERE product_id = ?', [req.params.id])
      if (attributes && attributes.length > 0) {
        for (const attr of attributes) {
          if (attr.valueId) {
            await executeQuery(
              'INSERT INTO product_attributes (product_id, attribute_value_id) VALUES (?, ?)',
              [req.params.id, attr.valueId]
            )
          }
        }
      }
    }

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

module.exports = router
