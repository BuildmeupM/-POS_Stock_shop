import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import {
  IconDashboard, IconShoppingCart, IconPackage, IconBasket,
  IconReceipt, IconTruckDelivery, IconLogout, IconBuilding, IconSettings, IconFileInvoice, IconUsers, IconWallet, IconReceiptRefund
} from '@tabler/icons-react'
import { Menu, UnstyledButton } from '@mantine/core'
import api from '../../services/api'

const navItems = [
  { path: '/', label: 'Dashboard', icon: IconDashboard },
  { path: '/pos', label: 'POS ขายหน้าร้าน', icon: IconShoppingCart },
  { path: '/sales', label: 'รายการขาย', icon: IconFileInvoice },
  { path: '/stock', label: 'สต๊อกสินค้า', icon: IconPackage },
  { path: '/purchases', label: 'จัดซื้อสินค้า', icon: IconBasket },
  { path: '/expenses', label: 'ค่าใช้จ่าย', icon: IconReceipt },
  { path: '/contacts', label: 'ผู้ติดต่อ', icon: IconUsers },
  { path: '/wallet', label: 'กระเป๋าเงิน', icon: IconWallet },
  { path: '/orders', label: 'ออเดอร์ออนไลน์', icon: IconTruckDelivery },
  { path: '/credit-notes', label: 'ใบลดหนี้', icon: IconReceiptRefund },
  { path: '/settings', label: 'ตั้งค่าระบบ', icon: IconSettings },
]

export default function Layout() {
  const { user, companies, activeCompany, switchCompany, logout } = useAuthStore()
  const location = useLocation()

  const handleSwitchCompany = async (companyId: string) => {
    try {
      const res = await api.post('/auth/switch-company', { companyId })
      const { token: newToken, activeCompany: newCompany } = res.data
      switchCompany(newCompany, newToken)
      window.location.reload()
    } catch (err) {
      console.error('Switch company error:', err)
    }
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">B</div>
          <div className="sidebar-title">Bookdee POS</div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">เมนูหลัก</div>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <item.icon size={18} stroke={1.5} />
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid var(--app-border)' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              borderRadius: 8, cursor: 'pointer', color: 'var(--app-text-dim)', fontSize: 14 }}
            onClick={logout}
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
            {navItems.find(n => n.path === location.pathname)?.label || 'POS Bookdee'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Company Switcher */}
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
    </div>
  )
}
