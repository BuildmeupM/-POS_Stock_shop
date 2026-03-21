import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import {
  IconDashboard, IconShoppingCart, IconPackage, IconBasket,
  IconReceipt, IconTruckDelivery, IconLogout, IconBuilding, IconSettings,
  IconFileInvoice, IconUsers, IconWallet, IconReceiptRefund, IconChevronDown,
  IconUserCircle, IconBuildingStore, IconCash,
  IconBook2, IconCalculator, IconReportMoney, IconScale, IconReceiptTax, IconListCheck,
  IconChartBar, IconPackages, IconContract, IconPlus,
} from '@tabler/icons-react'
import { Menu, UnstyledButton, Modal, TextInput, Button, Stack, Group } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import api from '../../services/api'

/* ── Types ── */
type NavChild = { path: string; label: string; icon: any }
type NavGroup = {
  key: string
  sectionTitle: string
  color: string        // accent color for group
  children: (NavChild | { key: string; label: string; icon: any; children: NavChild[] })[]
}

/* ── Navigation structure with colors ── */
const navGroups: NavGroup[] = [
  {
    key: 'overview', sectionTitle: 'ภาพรวม', color: '#a5b4fc',
    children: [
      { path: '/', label: 'Dashboard', icon: IconDashboard },
    ],
  },
  {
    key: 'pos', sectionTitle: 'ขายหน้าร้าน', color: '#34d399',
    children: [
      { path: '/pos', label: 'POS ขายสินค้า', icon: IconShoppingCart },
    ],
  },
  {
    key: 'sales', sectionTitle: 'การขาย', color: '#fbbf24',
    children: [
      { path: '/sales-doc', label: 'เอกสารขาย', icon: IconFileInvoice },
      { path: '/sales', label: 'รายการขาย POS', icon: IconCash },
      { path: '/orders', label: 'ออเดอร์ออนไลน์', icon: IconTruckDelivery },
      { path: '/customers', label: 'ลูกค้า', icon: IconUserCircle },
      { path: '/credit-notes', label: 'ใบลดหนี้', icon: IconReceiptRefund },
    ],
  },
  {
    key: 'purchasing', sectionTitle: 'จัดซื้อ & สต๊อก', color: '#fb923c',
    children: [
      { path: '/stock', label: 'สต๊อกสินค้า', icon: IconPackage },
      { path: '/purchases', label: 'จัดซื้อสินค้า', icon: IconBasket },
      { path: '/suppliers-contacts', label: 'ผู้จำหน่าย', icon: IconBuildingStore },
      { path: '/consignment', label: 'ฝากขาย', icon: IconContract },
    ],
  },
  {
    key: 'finance', sectionTitle: 'บัญชี & การเงิน', color: '#38bdf8',
    children: [
      { path: '/expenses', label: 'ค่าใช้จ่าย', icon: IconReceipt },
      { path: '/wallet', label: 'กระเป๋าเงิน', icon: IconWallet },
      { path: '/accounts', label: 'ผังบัญชี', icon: IconBook2 },
      { path: '/journals', label: 'สมุดบัญชี', icon: IconCalculator },
    ],
  },
  {
    key: 'reports', sectionTitle: 'รายงาน', color: '#c084fc',
    children: [
      { path: '/reports/sales', label: 'รายงานการขาย', icon: IconChartBar },
      { path: '/reports/inventory', label: 'รายงานสินค้าคงเหลือ', icon: IconPackages },
      { path: '/reports/trial-balance', label: 'งบทดลอง', icon: IconListCheck },
      { path: '/reports/pnl', label: 'งบกำไรขาดทุน', icon: IconReportMoney },
      { path: '/reports/balance-sheet', label: 'งบดุล', icon: IconScale },
      { path: '/reports/tax', label: 'รายงานภาษี', icon: IconReceiptTax },
    ],
  },
  {
    key: 'admin', sectionTitle: 'ตั้งค่า', color: '#94a3b8',
    children: [
      { path: '/settings', label: 'ตั้งค่าระบบ', icon: IconSettings },
    ],
  },
]

/* ── Flatten all nav items for getPageTitle ── */
const flatItems: NavChild[] = navGroups.flatMap(g => g.children.flatMap(c => 'path' in c ? [c] : c.children))

export default function Layout() {
  const { user, companies, activeCompany, switchCompany, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  /* ── Collapsible groups ── */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleGroup = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  /* ── Create Company ── */
  const [createModal, setCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', phone: '' })
  const [creating, setCreating] = useState(false)

  const handleSwitchCompany = async (companyId: string) => {
    try {
      const res = await api.post('/auth/switch-company', { companyId })
      const { token: newToken, activeCompany: newCompany, companies: newCompanies } = res.data
      switchCompany(newCompany, newToken, newCompanies)
      window.location.reload()
    } catch (err) {
      console.error('Switch company error:', err)
    }
  }

  const handleCreateCompany = async () => {
    if (!createForm.name.trim()) return
    setCreating(true)
    try {
      const res = await api.post('/companies', { name: createForm.name.trim(), phone: createForm.phone.trim() || null })
      notifications.show({ title: 'สำเร็จ', message: 'สร้างร้านค้าใหม่สำเร็จ', color: 'green' })
      setCreateModal(false)
      setCreateForm({ name: '', phone: '' })
      // Switch to the new company
      await handleSwitchCompany(res.data.companyId)
    } catch (err: any) {
      notifications.show({ title: 'ผิดพลาด', message: err.response?.data?.message || 'ไม่สามารถสร้างร้านค้าได้', color: 'red' })
    } finally {
      setCreating(false)
    }
  }

  const getPageTitle = () => {
    const item = flatItems.find(i => i.path === location.pathname)
    if (item) return item.label
    const parent = flatItems.find(i => i.path !== '/' && location.pathname.startsWith(i.path + '/'))
    if (parent) return parent.label
    return 'POS Bookdee'
  }

  const isPathActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">B</div>
          <div className="sidebar-title">Bookdee POS</div>
        </div>

        <nav className="sidebar-nav">
          {navGroups.map((group) => {
            const groupPaths = group.children.flatMap(c => 'path' in c ? [c.path] : c.children.map(cc => cc.path))
            const hasActive = groupPaths.some(p => isPathActive(p))
            const isCollapsed = collapsed[group.key] ?? false

            return (
              <div key={group.key} className="nav-section">
                {/* Group header — clickable to toggle */}
                <div
                  className={`nav-section-title ${hasActive ? 'section-active' : ''}`}
                  onClick={() => toggleGroup(group.key)}
                  style={{ '--group-color': group.color } as React.CSSProperties}
                >
                  <div className="nav-section-dot" />
                  <span>{group.sectionTitle}</span>
                  <IconChevronDown
                    size={13} stroke={2.5}
                    className={`nav-section-chevron ${isCollapsed ? 'collapsed' : ''}`}
                  />
                </div>

                {/* Collapsible items */}
                <div className={`nav-section-items ${isCollapsed ? 'collapsed' : ''}`}>
                  {group.children.map((item) => {
                    if ('path' in item) {
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.path === '/'}
                          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                          style={{ '--group-color': group.color } as React.CSSProperties}
                        >
                          <item.icon size={17} stroke={1.5} />
                          {item.label}
                        </NavLink>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 14,
              transition: 'all 0.2s',
            }}
            onClick={logout}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          >
            <IconLogout size={18} stroke={1.5} />
            ออกจากระบบ
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="main-content">
        <header className="top-bar">
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {getPageTitle()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Menu shadow="md" width={250}>
              <Menu.Target>
                <UnstyledButton className="company-switcher">
                  <IconBuilding size={16} />
                  <div>
                    <div className="company-switcher-name">
                      {activeCompany?.company_name || 'เลือกร้าน'}
                    </div>
                    <div className="company-switcher-role">
                      {activeCompany?.role || ''}
                    </div>
                  </div>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>เปลี่ยนร้านค้า</Menu.Label>
                {companies.map((c) => (
                  <Menu.Item
                    key={c.company_id}
                    onClick={() => handleSwitchCompany(c.company_id)}
                    style={{
                      fontWeight: c.company_id === activeCompany?.company_id ? 700 : 400,
                      background: c.company_id === activeCompany?.company_id
                        ? 'rgba(99,102,241,0.1)' : undefined,
                    }}
                  >
                    <div>{c.company_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--app-text-dim)' }}>{c.role}</div>
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item leftSection={<IconPlus size={14} />} color="indigo"
                  onClick={() => setCreateModal(true)}>
                  เพิ่มร้านค้าใหม่
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <div style={{ fontSize: 13, color: 'var(--app-text-dim)' }}>
              {user?.fullName}
            </div>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* Create Company Modal */}
      <Modal opened={createModal} onClose={() => setCreateModal(false)} title="เพิ่มร้านค้าใหม่" centered size="sm">
        <Stack gap="md">
          <TextInput label="ชื่อร้านค้า / บริษัท" placeholder="เช่น ร้านบุ๊คดี สาขา 2" required
            value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCompany() }} />
          <TextInput label="เบอร์โทรศัพท์" placeholder="02-xxx-xxxx (ไม่บังคับ)"
            value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
          <div style={{ fontSize: 12, color: 'var(--app-text-dim)', background: 'var(--app-surface-light)', padding: '10px 12px', borderRadius: 8 }}>
            ระบบจะสร้างร้านค้าใหม่พร้อมข้อมูลเริ่มต้น (คลังสินค้า, ผังบัญชี, ลูกค้า Walk-in) และเปลี่ยนไปยังร้านค้าใหม่อัตโนมัติ
          </div>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setCreateModal(false)}>ยกเลิก</Button>
            <Button leftSection={<IconPlus size={16} />} loading={creating}
              disabled={!createForm.name.trim()} onClick={handleCreateCompany}>
              สร้างร้านค้า
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  )
}
