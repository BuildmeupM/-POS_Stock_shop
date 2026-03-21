const { z } = require('zod')

// ── Auth ──
const loginSchema = z.object({
  username: z.string().min(1, 'กรุณากรอก username'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})

const registerSchema = z.object({
  username: z.string().min(3, 'username ต้องมีอย่างน้อย 3 ตัวอักษร').max(50),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
  fullName: z.string().min(1, 'กรุณากรอกชื่อ-สกุล').max(100),
  nickName: z.string().max(50).optional().nullable(),
})

// ── Users ──
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  fullName: z.string().min(1).max(100),
  nickName: z.string().max(50).optional().nullable(),
  role: z.enum(['admin', 'manager', 'cashier', 'accountant', 'staff']),
})

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'manager', 'cashier', 'accountant', 'staff']),
})

// ── Company ──
const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  taxId: z.string().max(13).optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  settings: z.record(z.unknown()).optional(),
})

// ── Sales ──
const createSaleSchema = z.object({
  items: z.array(z.object({
    productId: z.number().optional().nullable(),
    isService: z.boolean().optional(),
    serviceName: z.string().optional().nullable(),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0).optional(),
    discount: z.number().min(0).optional(),
  })).min(1, 'ต้องมีอย่างน้อย 1 รายการ'),
  customerId: z.number().optional().nullable(),
  paymentMethod: z.string().optional(),
  paymentChannelId: z.number().optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  note: z.string().optional().nullable(),
  payments: z.array(z.object({
    method: z.string(),
    amount: z.number().min(0),
    paymentChannelId: z.number().optional().nullable(),
    referenceNumber: z.string().optional().nullable(),
  })).optional(),
})

// ── Products ──
const createProductSchema = z.object({
  sku: z.string().min(1).max(50),
  barcode: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  categoryId: z.number().optional().nullable(),
  unit: z.string().max(20).optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0),
  minSellingPrice: z.number().min(0).optional().nullable(),
  minStock: z.number().min(0).optional(),
  attributes: z.array(z.object({
    groupId: z.number(),
    valueId: z.number(),
  })).optional(),
})

// ── Contacts ──
const createContactSchema = z.object({
  name: z.string().min(1, 'กรุณาระบุชื่อผู้ติดต่อ').max(200),
  code: z.string().max(20).optional().nullable(),
  contactType: z.enum(['vendor', 'customer', 'both']).optional(),
  taxId: z.string().max(13).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง').optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  addressStreet: z.string().optional().nullable(),
  addressSubdistrict: z.string().optional().nullable(),
  addressDistrict: z.string().optional().nullable(),
  addressProvince: z.string().optional().nullable(),
  addressPostalCode: z.string().max(10).optional().nullable(),
  branch: z.string().optional().nullable(),
  bankAccount: z.string().max(50).optional().nullable(),
  bankName: z.string().max(100).optional().nullable(),
  paymentTerms: z.number().min(0).optional(),
  note: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

// ── Expenses ──
const createExpenseSchema = z.object({
  vendorName: z.string().optional().nullable(),
  taxId: z.string().max(13).optional().nullable(),
  contactId: z.number().optional().nullable(),
  expenseDate: z.string().min(1, 'กรุณาระบุวันที่'),
  dueDate: z.string().optional().nullable(),
  paymentMethod: z.string().optional(),
  paymentChannelId: z.number().optional().nullable(),
  paymentStatus: z.string().optional(),
  referenceNumber: z.string().optional().nullable(),
  taxInvoiceNumber: z.string().optional().nullable(),
  taxInvoiceDate: z.string().optional().nullable(),
  taxPeriod: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  status: z.enum(['draft', 'approved']).optional(),
  items: z.array(z.object({
    accountId: z.number(),
    description: z.string().optional().nullable(),
    quantity: z.number().min(0),
    unitPrice: z.number().min(0),
    vatType: z.enum(['none', 'include', 'exclude']).optional(),
    vatRate: z.number().min(0).max(100).optional(),
    whtRate: z.number().min(0).max(100).optional(),
  })).min(1, 'ต้องมีอย่างน้อย 1 รายการ'),
})

// ── Purchase Orders ──
const createPOSchema = z.object({
  contactId: z.number({ required_error: 'กรุณาเลือกผู้ขาย' }),
  orderDate: z.string().min(1, 'กรุณาระบุวันที่'),
  expectedDate: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  status: z.enum(['draft', 'approved']).optional(),
  items: z.array(z.object({
    productId: z.number(),
    quantity: z.number().min(1),
    unitCost: z.number().min(0),
  })).min(1, 'ต้องมีอย่างน้อย 1 รายการ'),
})

module.exports = {
  loginSchema, registerSchema,
  createUserSchema, updateRoleSchema,
  updateCompanySchema,
  createSaleSchema,
  createProductSchema,
  createContactSchema,
  createExpenseSchema,
  createPOSchema,
}
