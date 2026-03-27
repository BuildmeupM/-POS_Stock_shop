const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { writeAuditLog } = require('../../middleware/auditLog')

// Configure multer for product images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/products')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) cb(null, true)
    else cb(new Error('อนุญาตเฉพาะไฟล์รูปภาพ (.jpg, .png, .webp)'))
  }
})

router.use(auth, companyGuard)

// ====================================================================
// ATTRIBUTE GROUPS (must be before /:id routes)
// ====================================================================

// GET /api/products/attribute-groups
router.get('/attribute-groups', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    let groups
    if (page > 0) {
      const [countResult] = await executeQuery(
        'SELECT COUNT(*) as total FROM product_attribute_groups WHERE company_id = ? AND is_active = TRUE',
        [req.user.companyId]
      )
      const total = countResult.total

      groups = await executeQuery(
        'SELECT * FROM product_attribute_groups WHERE company_id = ? AND is_active = TRUE ORDER BY sort_order, name LIMIT ? OFFSET ?',
        [req.user.companyId, limit, offset]
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
        for (const g of groups) { g.values = valueMap[g.id] || [] }
      }

      res.json({ data: groups, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      groups = await executeQuery(
        'SELECT * FROM product_attribute_groups WHERE company_id = ? AND is_active = TRUE ORDER BY sort_order, name LIMIT 500',
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
        for (const g of groups) { g.values = valueMap[g.id] || [] }
      }

      res.json(groups)
    }
  } catch (error) {
    console.error('Get attribute groups error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/products/attribute-groups
router.post('/attribute-groups', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
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
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'product_attribute_group', entityId: result.insertId,
      description: `สร้างกลุ่มคุณสมบัติ "${name}"`,
      newValues: { name, sortOrder: maxResult[0].next_order },
      req,
    })

    res.status(201).json({ message: 'สร้างกลุ่มสำเร็จ', groupId: result.insertId })
  } catch (error) {
    console.error('Create attribute group error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/products/attribute-groups/:id
router.put('/attribute-groups/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { name, sortOrder } = req.body
    await executeQuery(
      'UPDATE product_attribute_groups SET name = ?, sort_order = ? WHERE id = ? AND company_id = ?',
      [name, sortOrder || 0, req.params.id, req.user.companyId]
    )
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'product_attribute_group', entityId: req.params.id,
      description: `แก้ไขกลุ่มคุณสมบัติ "${name}"`,
      newValues: { name, sortOrder: sortOrder || 0 },
      req,
    })

    res.json({ message: 'แก้ไขกลุ่มสำเร็จ' })
  } catch (error) {
    console.error('Update attribute group error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/products/attribute-groups/:id
router.delete('/attribute-groups/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    await executeQuery(
      'UPDATE product_attribute_groups SET is_active = FALSE WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'DELETE', entityType: 'product_attribute_group', entityId: req.params.id,
      description: `ลบกลุ่มคุณสมบัติ (soft delete)`,
      oldValues: { id: req.params.id },
      req,
    })

    res.json({ message: 'ลบกลุ่มสำเร็จ' })
  } catch (error) {
    console.error('Delete attribute group error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/products/attribute-groups/:id/values
router.post('/attribute-groups/:id/values', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
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
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'product_attribute_value', entityId: result.insertId,
      description: `เพิ่มค่าคุณสมบัติ "${value}" ในกลุ่ม ${req.params.id}`,
      newValues: { groupId: req.params.id, value },
      req,
    })

    res.status(201).json({ message: 'เพิ่มค่าสำเร็จ', valueId: result.insertId })
  } catch (error) {
    console.error('Create attribute value error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/products/attribute-values/:id
router.put('/attribute-values/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { value, sortOrder } = req.body
    await executeQuery(
      'UPDATE product_attribute_values SET value = ?, sort_order = ? WHERE id = ?',
      [value, sortOrder || 0, req.params.id]
    )
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'product_attribute_value', entityId: req.params.id,
      description: `แก้ไขค่าคุณสมบัติ "${value}"`,
      newValues: { value, sortOrder: sortOrder || 0 },
      req,
    })

    res.json({ message: 'แก้ไขค่าสำเร็จ' })
  } catch (error) {
    console.error('Update attribute value error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/products/attribute-values/:id
router.delete('/attribute-values/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    await executeQuery(
      'UPDATE product_attribute_values SET is_active = FALSE WHERE id = ?',
      [req.params.id]
    )
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'DELETE', entityType: 'product_attribute_value', entityId: req.params.id,
      description: `ลบค่าคุณสมบัติ (soft delete)`,
      oldValues: { id: req.params.id },
      req,
    })

    res.json({ message: 'ลบค่าสำเร็จ' })
  } catch (error) {
    console.error('Delete attribute value error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// === LEGACY CATEGORIES (kept for backward compatibility) ===
router.get('/categories/all', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    if (page > 0) {
      const [countResult] = await executeQuery(
        'SELECT COUNT(*) as total FROM categories WHERE company_id = ?', [req.user.companyId]
      )
      const total = countResult.total

      const categories = await executeQuery(
        'SELECT * FROM categories WHERE company_id = ? ORDER BY name LIMIT ? OFFSET ?',
        [req.user.companyId, limit, offset]
      )
      res.json({ data: categories, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const categories = await executeQuery(
        'SELECT * FROM categories WHERE company_id = ? ORDER BY name LIMIT 500',
        [req.user.companyId]
      )
      res.json(categories)
    }
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
    const page = parseInt(req.query.page) || 0
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const offset = page > 0 ? (page - 1) * limit : 0

    const { search, active } = req.query
    let whereClause = 'WHERE p.company_id = ?'
    const baseParams = [req.user.companyId]

    if (search) {
      whereClause += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?
        OR EXISTS (
          SELECT 1 FROM product_attributes pa2
          JOIN product_attribute_values pav2 ON pa2.attribute_value_id = pav2.id
          WHERE pa2.product_id = p.id AND pav2.value LIKE ?
        ))`
      baseParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    }
    // Default to showing only active products; pass active=false to include deleted
    const showActive = active === undefined ? true : active === 'true'
    if (active !== 'all') {
      whereClause += ' AND p.is_active = ?'
      baseParams.push(showActive)
    }

    const fetchAttributes = (products) => {
      if (products.length === 0) return Promise.resolve()
      const productIds = products.map(p => p.id)
      return executeQuery(`
        SELECT pa.product_id, pag.id as group_id, pag.name as group_name,
               pav.id as value_id, pav.value as value_name
        FROM product_attributes pa
        JOIN product_attribute_values pav ON pa.attribute_value_id = pav.id
        JOIN product_attribute_groups pag ON pav.group_id = pag.id
        WHERE pa.product_id IN (${productIds.map(() => '?').join(',')})
        ORDER BY pag.sort_order, pav.sort_order
      `, productIds).then(attrs => {
        const attrMap = {}
        for (const a of attrs) {
          if (!attrMap[a.product_id]) attrMap[a.product_id] = []
          attrMap[a.product_id].push({
            groupId: a.group_id, groupName: a.group_name,
            valueId: a.value_id, valueName: a.value_name,
          })
        }
        for (const p of products) { p.attributes = attrMap[p.id] || [] }
      })
    }

    if (page > 0) {
      const [countResult] = await executeQuery(
        `SELECT COUNT(*) as total FROM products p ${whereClause}`, baseParams
      )
      const total = countResult.total

      const products = await executeQuery(
        `SELECT p.*,
          COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl
                    JOIN warehouses w ON sl.warehouse_id = w.id
                    WHERE sl.product_id = p.id AND w.company_id = p.company_id), 0) as total_stock
        FROM products p
        ${whereClause} ORDER BY p.name ASC LIMIT ? OFFSET ?`,
        [...baseParams, limit, offset]
      )

      await fetchAttributes(products)
      res.json({ data: products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
    } else {
      const products = await executeQuery(
        `SELECT p.*,
          COALESCE((SELECT SUM(sl.quantity_remaining) FROM stock_lots sl
                    JOIN warehouses w ON sl.warehouse_id = w.id
                    WHERE sl.product_id = p.id AND w.company_id = p.company_id), 0) as total_stock
        FROM products p
        ${whereClause} ORDER BY p.name ASC LIMIT 500`,
        baseParams
      )

      await fetchAttributes(products)
      res.json(products)
    }
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
router.post('/', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { sku, barcode, name, description, unit, costPrice, sellingPrice, wholesalePrice, vipPrice, minSellingPrice, minStock, attributes } = req.body

    if (!sku || !name || !sellingPrice) {
      return res.status(400).json({ message: 'กรุณากรอก SKU, ชื่อสินค้า, และราคาขาย' })
    }

    const result = await executeQuery(
      `INSERT INTO products (company_id, sku, barcode, name, description, unit, cost_price, selling_price, wholesale_price, vip_price, min_selling_price, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.companyId, sku, barcode || null, name, description || null,
       unit || 'ชิ้น', costPrice || 0, sellingPrice, wholesalePrice || null, vipPrice || null, minSellingPrice || 0, minStock || 0]
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

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'CREATE', entityType: 'product', entityId: productId,
      description: `เพิ่มสินค้า "${name}" (SKU: ${sku})`,
      newValues: { sku, barcode, name, unit, costPrice, sellingPrice, wholesalePrice, vipPrice, minSellingPrice, minStock },
      req,
    })

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
router.put('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const { sku, barcode, name, description, unit, costPrice, sellingPrice, wholesalePrice, vipPrice, minSellingPrice, minStock, isActive, attributes } = req.body

    await executeQuery(
      `UPDATE products SET sku = ?, barcode = ?, name = ?, description = ?,
       unit = ?, cost_price = ?, selling_price = ?, wholesale_price = ?, vip_price = ?, min_selling_price = ?, min_stock = ?, is_active = ?
       WHERE id = ? AND company_id = ?`,
      [sku, barcode || null, name, description || null,
       unit || 'ชิ้น', costPrice || 0, sellingPrice, wholesalePrice || null, vipPrice || null, minSellingPrice || 0, minStock || 0,
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

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'product', entityId: req.params.id,
      description: `แก้ไขสินค้า "${name}" (SKU: ${sku})`,
      newValues: { sku, barcode, name, unit, costPrice, sellingPrice, wholesalePrice, vipPrice, minSellingPrice, minStock, isActive },
      req,
    })

    res.json({ message: 'อัพเดตสินค้าสำเร็จ' })
  } catch (error) {
    console.error('Update product error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/products/:id (soft delete)
router.delete('/:id', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    await executeQuery(
      'UPDATE products SET is_active = FALSE WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'DELETE', entityType: 'product', entityId: req.params.id,
      description: `ลบสินค้า (soft delete)`,
      oldValues: { id: req.params.id },
      req,
    })

    res.json({ message: 'ลบสินค้าสำเร็จ' })
  } catch (error) {
    console.error('Delete product error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// ====================================================================
// PRODUCT IMAGE UPLOAD
// ====================================================================

// POST /api/products/:id/image — Upload product image
router.post('/:id/image', roleCheck('owner', 'admin', 'manager'), (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      // Multer errors (file too large, wrong type, etc.)
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `ไฟล์ใหญ่เกินไป (สูงสุด ${Math.round(15)} MB)`
        : err.message || 'อัพโหลดไม่สำเร็จ'
      return res.status(400).json({ message: msg })
    }
    next()
  })
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'กรุณาเลือกไฟล์รูปภาพ' })
    }

    // Validate product belongs to company
    const products = await executeQuery(
      'SELECT id, image_url FROM products WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (products.length === 0) {
      fs.unlinkSync(req.file.path)
      return res.status(404).json({ message: 'ไม่พบสินค้า' })
    }

    const oldImageUrl = products[0].image_url
    const newImageUrl = `/uploads/products/${req.file.filename}`

    // Update database
    await executeQuery(
      'UPDATE products SET image_url = ? WHERE id = ? AND company_id = ?',
      [newImageUrl, req.params.id, req.user.companyId]
    )

    // Delete old file if exists
    if (oldImageUrl) {
      const oldFilePath = path.join(__dirname, '../..', oldImageUrl)
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath)
    }

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'product', entityId: req.params.id,
      description: `อัพโหลดรูปภาพสินค้า`,
      newValues: { imageUrl: newImageUrl },
      req,
    })

    res.json({ imageUrl: newImageUrl })
  } catch (error) {
    console.error('Upload product image error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัพโหลดรูปภาพ' })
  }
})


// DELETE /api/products/:id/image — Remove product image
router.delete('/:id/image', roleCheck('owner', 'admin', 'manager'), async (req, res) => {
  try {
    const products = await executeQuery(
      'SELECT id, image_url FROM products WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )
    if (products.length === 0) {
      return res.status(404).json({ message: 'ไม่พบสินค้า' })
    }

    const imageUrl = products[0].image_url
    if (!imageUrl) {
      return res.status(400).json({ message: 'สินค้านี้ไม่มีรูปภาพ' })
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '../..', imageUrl)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Update database
    await executeQuery(
      'UPDATE products SET image_url = NULL WHERE id = ? AND company_id = ?',
      [req.params.id, req.user.companyId]
    )

    await writeAuditLog({
      companyId: req.user.companyId, userId: req.user.id, userName: req.user.fullName,
      action: 'UPDATE', entityType: 'product', entityId: req.params.id,
      description: `ลบรูปภาพสินค้า`,
      oldValues: { imageUrl },
      req,
    })

    res.json({ message: 'ลบรูปภาพสำเร็จ' })
  } catch (error) {
    console.error('Delete product image error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบรูปภาพ' })
  }
})

module.exports = router
