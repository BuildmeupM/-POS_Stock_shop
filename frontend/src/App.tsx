import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'

// Auth & Dashboard
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'

// POS
import POSPage from './pages/pos/POSPage'
import CreditNotesPage from './pages/pos/CreditNotesPage'
import ReturnsPage from './pages/pos/ReturnsPage'

// Sales
import SalesPage from './pages/sales/SalesPage'
import SalesReportsPage from './pages/sales/SalesReportsPage'

// Sales Documents
import SalesDocPage from './pages/sales-doc/SalesDocPage'
import SalesDocCreatePage from './pages/sales-doc/SalesDocCreatePage'
import SalesDocDetailPage from './pages/sales-doc/SalesDocDetailPage'

// Orders
import OrdersPage from './pages/orders/OrdersPage'
import OrderCreatePage from './pages/orders/OrderCreatePage'
import OrderDetailPage from './pages/orders/OrderDetailPage'

// Contacts
import CustomersPage from './pages/contacts/CustomersPage'
import SuppliersContactPage from './pages/contacts/SuppliersContactPage'

// Purchases & Stock
import PurchasePage from './pages/purchases/PurchasePage'
import PurchaseCreatePage from './pages/purchases/PurchaseCreatePage'
import PurchaseDetailPage from './pages/purchases/PurchaseDetailPage'
import StockPage from './pages/stock/StockPage'
import WarehousePage from './pages/stock/WarehousePage'
import StocktakingPage from './pages/stock/StocktakingPage'
import ConsignmentPage from './pages/consignment/ConsignmentPage'

// Finance
import ExpensePage from './pages/finance/ExpensePage'
import ExpenseCreatePage from './pages/finance/ExpenseCreatePage'
import WalletPage from './pages/finance/WalletPage'
import WhtPage from './pages/finance/WhtPage'
import BankReconciliationPage from './pages/finance/BankReconciliationPage'
import CashFlowPage from './pages/finance/CashFlowPage'

// Accounting
import AccountsPage from './pages/accounting/AccountsPage'
import JournalsPage from './pages/accounting/JournalsPage'
import TrialBalancePage from './pages/accounting/TrialBalancePage'
import ProfitLossPage from './pages/accounting/ProfitLossPage'
import BalanceSheetPage from './pages/accounting/BalanceSheetPage'
import TaxSummaryPage from './pages/accounting/TaxSummaryPage'

// Reports
import InventoryReportPage from './pages/reports/InventoryReportPage'

// Settings
import SettingsPage from './pages/settings/SettingsPage'

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
        <Route path="customers" element={<CustomersPage />} />
        <Route path="suppliers-contacts" element={<SuppliersContactPage />} />
        <Route path="contacts" element={<Navigate to="/customers" replace />} />
        <Route path="orders/create" element={<OrderCreatePage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="credit-notes" element={<CreditNotesPage />} />
        <Route path="returns" element={<ReturnsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="journals" element={<JournalsPage />} />
        <Route path="sales-doc" element={<SalesDocPage />} />
        <Route path="sales-doc/create" element={<SalesDocCreatePage />} />
        <Route path="sales-doc/:id" element={<SalesDocDetailPage />} />
        <Route path="consignment" element={<ConsignmentPage />} />
        <Route path="stocktaking" element={<StocktakingPage />} />
        <Route path="reports/sales" element={<SalesReportsPage />} />
        <Route path="reports/inventory" element={<InventoryReportPage />} />
        <Route path="warehouse" element={<WarehousePage />} />
        <Route path="reports/trial-balance" element={<TrialBalancePage />} />
        <Route path="reports/pnl" element={<ProfitLossPage />} />
        <Route path="reports/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="reports/tax" element={<TaxSummaryPage />} />
        <Route path="reports/cashflow" element={<CashFlowPage />} />
        <Route path="reconciliation" element={<BankReconciliationPage />} />
        <Route path="wht" element={<WhtPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
