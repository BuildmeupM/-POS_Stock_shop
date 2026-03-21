const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard, roleCheck } = require('../../middleware/companyGuard')
const { v4: uuidv4 } = require('uuid')

// All routes require auth + company
router.use(auth, companyGuard)

// GET /api/companies/current — get active company details
router.get('/current', async (req, res) => {
  try {
    const [company] = await executeQuery(
      'SELECT * FROM companies WHERE id = ?', [req.user.companyId]
    )
    if (!company) return res.status(404).json({ message: 'ไม่พบบริษัท' })
    // Parse settings JSON
    if (company.settings && typeof company.settings === 'string') {
      company.settings = JSON.parse(company.settings)
    }
    res.json(company)
  } catch (error) {
    console.error('Get current company error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/companies — list user's companies
router.get('/', async (req, res) => {
  try {
    const companies = await executeQuery(
      `SELECT uc.company_id, uc.role, uc.is_default, c.*
       FROM user_companies uc
       JOIN companies c ON uc.company_id = c.id
       WHERE uc.user_id = ? AND c.is_active = TRUE`,
      [req.user.id]
    )
    res.json(companies)
  } catch (error) {
    console.error('Get companies error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/companies — create new company
router.post('/', async (req, res) => {
  try {
    const { name, taxId, address, phone } = req.body
    const companyId = uuidv4()

    await executeQuery(
      `INSERT INTO companies (id, name, tax_id, address, phone, settings)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [companyId, name, taxId || null, address || null, phone || null,
       JSON.stringify({ vat_enabled: true, vat_rate: 7, currency: 'THB' })]
    )

    // Link creator as owner
    await executeQuery(
      'INSERT INTO user_companies (user_id, company_id, role, is_default) VALUES (?, ?, ?, ?)',
      [req.user.id, companyId, 'owner', false]
    )

    // Create default warehouse
    await executeQuery(
      'INSERT INTO warehouses (company_id, name, location) VALUES (?, ?, ?)',
      [companyId, 'คลังสินค้าหลัก', 'สาขาหลัก']
    )

    // Seed default chart of accounts
    const defaultAccounts = [
      ['1000', 'สินทรัพย์', 'asset'], ['1100', 'เงินสด', 'asset'],
      ['1110', 'เงินสดในมือ', 'asset'], ['1120', 'เงินสดย่อย', 'asset'],
      ['1200', 'เงินฝากธนาคาร', 'asset'], ['1300', 'ลูกหนี้การค้า', 'asset'],
      ['1400', 'สินค้าคงเหลือ', 'asset'],
      ['2000', 'หนี้สิน', 'liability'], ['2100', 'เจ้าหนี้การค้า', 'liability'],
      ['2200', 'ภาษีมูลค่าเพิ่มค้างจ่าย', 'liability'],
      ['2300', 'ภาษีหัก ณ ที่จ่ายค้างจ่าย', 'liability'],
      ['3000', 'ส่วนของเจ้าของ', 'equity'], ['3100', 'ทุนเจ้าของ', 'equity'],
      ['3200', 'กำไรสะสม', 'equity'],
      ['4000', 'รายได้', 'revenue'], ['4100', 'รายได้จากการขาย — หน้าร้าน', 'revenue'],
      ['4200', 'รายได้จากการขาย — ออนไลน์', 'revenue'], ['4300', 'รายได้อื่น', 'revenue'],
      ['5000', 'ค่าใช้จ่าย', 'expense'], ['5100', 'ต้นทุนสินค้าขาย (COGS)', 'expense'],
      ['5200', 'ค่าแรง/เงินเดือน', 'expense'], ['5300', 'ค่าเช่า', 'expense'],
      ['5400', 'ค่าน้ำ/ค่าไฟ', 'expense'], ['5500', 'ค่าขนส่ง', 'expense'],
      ['5600', 'ค่าวัสดุสำนักงาน', 'expense'], ['5700', 'ค่าโฆษณา/การตลาด', 'expense'],
      ['5800', 'ค่าใช้จ่ายเบ็ดเตล็ด', 'expense'], ['5900', 'ค่าเสื่อมราคา', 'expense'],
    ]

    for (const [code, accName, type] of defaultAccounts) {
      await executeQuery(
        'INSERT INTO accounts (company_id, account_code, name, account_type) VALUES (?, ?, ?, ?)',
        [companyId, code, accName, type]
      )
    }

    // Create default walk-in customer
    await executeQuery(
      "INSERT INTO customers (company_id, name, customer_type) VALUES (?, 'ลูกค้าทั่วไป (Walk-in)', 'walk-in')",
      [companyId]
    )

    res.status(201).json({ message: 'สร้างบริษัทสำเร็จ', companyId })
  } catch (error) {
    console.error('Create company error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/companies/:id
router.put('/:id', roleCheck('owner', 'admin'), async (req, res) => {
  try {
    const { name, taxId, address, phone, settings } = req.body
    await executeQuery(
      'UPDATE companies SET name = ?, tax_id = ?, address = ?, phone = ?, settings = ? WHERE id = ?',
      [name, taxId || null, address || null, phone || null,
       settings ? JSON.stringify(settings) : null, req.params.id]
    )
    res.json({ message: 'อัพเดตบริษัทสำเร็จ' })
  } catch (error) {
    console.error('Update company error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
