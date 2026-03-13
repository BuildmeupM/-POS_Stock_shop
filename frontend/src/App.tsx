import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import POSPage from './pages/POSPage'
import StockPage from './pages/StockPage'
import ExpensePage from './pages/ExpensePage'
import ExpenseCreatePage from './pages/ExpenseCreatePage'
import ContactsPage from './pages/ContactsPage'
import OrdersPage from './pages/OrdersPage'
import OrderCreatePage from './pages/OrderCreatePage'
import OrderDetailPage from './pages/OrderDetailPage'
import PurchasePage from './pages/PurchasePage'
import PurchaseCreatePage from './pages/PurchaseCreatePage'
import PurchaseDetailPage from './pages/PurchaseDetailPage'
import SettingsPage from './pages/SettingsPage'
import SalesPage from './pages/SalesPage'
import WalletPage from './pages/WalletPage'
import CreditNotesPage from './pages/CreditNotesPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const token = useAuthStore((s) => s.token)

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="pos" element={<POSPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="purchases" element={<PurchasePage />} />
        <Route path="purchases/create" element={<PurchaseCreatePage />} />
        <Route path="purchases/:id" element={<PurchaseDetailPage />} />
        <Route path="expenses/create" element={<ExpenseCreatePage />} />
        <Route path="expenses" element={<ExpensePage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="orders/create" element={<OrderCreatePage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="credit-notes" element={<CreditNotesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
