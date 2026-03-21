const express = require('express')
const router = express.Router()
const { executeQuery } = require('../../config/db')
const auth = require('../../middleware/auth')
const { companyGuard } = require('../../middleware/companyGuard')
const { generateDocNumber } = require('../../utils/docNumber')

router.use(auth, companyGuard)

// GET /api/wallet/next-code — preview next auto code
router.get('/next-code', async (req, res) => {
  try {
    const code = await generateDocNumber('WAL', req.user.companyId, 'payment_channels', 'channel_code')
    res.json({ code })
  } catch (error) {
    console.error('Get next code error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// GET /api/wallet — list all payment channels
router.get('/', async (req, res) => {
  try {
    const { active } = req.query
    let query = 'SELECT * FROM payment_channels WHERE company_id = ?'
    const params = [req.user.companyId]
    if (active !== undefined) {
      query += ' AND is_active = ?'
      params.push(active === 'true' ? 1 : 0)
    }
    query += ' ORDER BY is_default DESC, name ASC'
    const channels = await executeQuery(query, params)
    res.json(channels)
  } catch (error) {
    console.error('Get payment channels error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// POST /api/wallet — create
router.post('/', async (req, res) => {
  try {
    const { name, type, accountName, accountNumber, bankName, qrCodeUrl, icon, isDefault, note } = req.body
    if (!name || !type) return res.status(400).json({ message: 'กรุณาระบุชื่อและประเภทช่องทาง' })

    const companyId = req.user.companyId

    // If setting as default, unset others first
    if (isDefault) {
      await executeQuery('UPDATE payment_channels SET is_default = FALSE WHERE company_id = ?', [companyId])
    }

    // Auto-generate channel code
    const channelCode = await generateDocNumber('WAL', companyId, 'payment_channels', 'channel_code')

    const result = await executeQuery(
      `INSERT INTO payment_channels (company_id, channel_code, name, type, account_name, account_number, bank_name, qr_code_url, icon, is_default, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, channelCode, name, type, accountName || null, accountNumber || null, bankName || null, qrCodeUrl || null, icon || null, isDefault || false, note || null]
    )
    res.status(201).json({ id: result.insertId, channelCode, message: 'เพิ่มช่องทางชำระเงินสำเร็จ' })
  } catch (error) {
    console.error('Create payment channel error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// PUT /api/wallet/:id — update
router.put('/:id', async (req, res) => {
  try {
    const { name, type, accountName, accountNumber, bankName, qrCodeUrl, icon, isDefault, isActive, note } = req.body
    const companyId = req.user.companyId

    // Verify ownership
    const [existing] = await executeQuery('SELECT id FROM payment_channels WHERE id = ? AND company_id = ?', [req.params.id, companyId])
    if (!existing) return res.status(404).json({ message: 'ไม่พบช่องทางชำระเงิน' })

    if (isDefault) {
      await executeQuery('UPDATE payment_channels SET is_default = FALSE WHERE company_id = ?', [companyId])
    }

    await executeQuery(
      `UPDATE payment_channels SET name = ?, type = ?, account_name = ?, account_number = ?, bank_name = ?,
       qr_code_url = ?, icon = ?, is_default = ?, is_active = ?, note = ? WHERE id = ? AND company_id = ?`,
      [name, type, accountName || null, accountNumber || null, bankName || null, qrCodeUrl || null, icon || null,
       isDefault || false, isActive !== undefined ? isActive : true, note || null, req.params.id, companyId]
    )
    res.json({ message: 'อัปเดตสำเร็จ' })
  } catch (error) {
    console.error('Update payment channel error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

// DELETE /api/wallet/:id
router.delete('/:id', async (req, res) => {
  try {
    const companyId = req.user.companyId
    const [existing] = await executeQuery('SELECT id FROM payment_channels WHERE id = ? AND company_id = ?', [req.params.id, companyId])
    if (!existing) return res.status(404).json({ message: 'ไม่พบช่องทางชำระเงิน' })

    await executeQuery('DELETE FROM payment_channels WHERE id = ? AND company_id = ?', [req.params.id, companyId])
    res.json({ message: 'ลบสำเร็จ' })
  } catch (error) {
    console.error('Delete payment channel error:', error)
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' })
  }
})

module.exports = router
