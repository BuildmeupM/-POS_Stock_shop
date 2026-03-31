import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { Loader } from '@mantine/core'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout/Layout'

// Only LoginPage is eagerly loaded (shown on first visit)
import LoginPage from './pages/auth/LoginPage'

// Lazy load all other pages — each becomes its own chunk
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const POSPage = lazy(() => import('./pages/pos/POSPage'))
const CreditNotesPage = lazy(() => import('./pages/pos/CreditNotesPage'))
const ReturnsPage = lazy(() => import('./pages/pos/ReturnsPage'))
const SalesPage = lazy(() => import('./pages/sales/SalesPage'))
const SalesReportsPage = lazy(() => import('./pages/sales/SalesReportsPage'))
const SalesDocPage = lazy(() => import('./pages/sales-doc/SalesDocPage'))
const SalesDocCreatePage = lazy(() => import('./pages/sales-doc/SalesDocCreatePage'))
const SalesDocDetailPage = lazy(() => import('./pages/sales-doc/SalesDocDetailPage'))
const OrdersPage = lazy(() => import('./pages/orders/OrdersPage'))
const OrderCreatePage = lazy(() => import('./pages/orders/OrderCreatePage'))
const OrderDetailPage = lazy(() => import('./pages/orders/OrderDetailPage'))
const CustomersPage = lazy(() => import('./pages/contacts/CustomersPage'))
const SuppliersContactPage = lazy(() => import('./pages/contacts/SuppliersContactPage'))
const PurchasePage = lazy(() => import('./pages/purchases/PurchasePage'))
const PurchaseCreatePage = lazy(() => import('./pages/purchases/PurchaseCreatePage'))
const PurchaseDetailPage = lazy(() => import('./pages/purchases/PurchaseDetailPage'))
const StockPage = lazy(() => import('./pages/stock/StockPage'))
const WarehousePage = lazy(() => import('./pages/stock/WarehousePage'))
const StocktakingPage = lazy(() => import('./pages/stock/StocktakingPage'))
const ConsignmentPage = lazy(() => import('./pages/consignment/ConsignmentPage'))
const ConsignmentDetailPage = lazy(() => import('./pages/consignment/ConsignmentDetailPage'))
const ExpensePage = lazy(() => import('./pages/finance/ExpensePage'))
const ExpenseCreatePage = lazy(() => import('./pages/finance/ExpenseCreatePage'))
const WalletPage = lazy(() => import('./pages/finance/WalletPage'))
const WhtPage = lazy(() => import('./pages/finance/WhtPage'))
const BankReconciliationPage = lazy(() => import('./pages/finance/BankReconciliationPage'))
const CashFlowPage = lazy(() => import('./pages/finance/CashFlowPage'))
const AccountsPage = lazy(() => import('./pages/accounting/AccountsPage'))
const JournalsPage = lazy(() => import('./pages/accounting/JournalsPage'))
const TrialBalancePage = lazy(() => import('./pages/accounting/TrialBalancePage'))
const ProfitLossPage = lazy(() => import('./pages/accounting/ProfitLossPage'))
const BalanceSheetPage = lazy(() => import('./pages/accounting/BalanceSheetPage'))
const TaxSummaryPage = lazy(() => import('./pages/accounting/TaxSummaryPage'))
const InventoryReportPage = lazy(() => import('./pages/reports/InventoryReportPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <Loader size="md" />
  </div>
)

// Wrap lazy component with Suspense at element level (React Router v6 requirement)
function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

export default function App() {
  const token = useAuthStore((s) => s.token)

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<S><DashboardPage /></S>} />
        <Route path="pos" element={<S><POSPage /></S>} />
        <Route path="sales" element={<S><SalesPage /></S>} />
        <Route path="stock" element={<S><StockPage /></S>} />
        <Route path="purchases" element={<S><PurchasePage /></S>} />
        <Route path="purchases/create" element={<S><PurchaseCreatePage /></S>} />
        <Route path="purchases/:id" element={<S><PurchaseDetailPage /></S>} />
        <Route path="expenses/create" element={<S><ExpenseCreatePage /></S>} />
        <Route path="expenses" element={<S><ExpensePage /></S>} />
        <Route path="customers" element={<S><CustomersPage /></S>} />
        <Route path="suppliers-contacts" element={<S><SuppliersContactPage /></S>} />
        <Route path="contacts" element={<Navigate to="/customers" replace />} />
        <Route path="orders/create" element={<S><OrderCreatePage /></S>} />
        <Route path="orders/:id" element={<S><OrderDetailPage /></S>} />
        <Route path="orders" element={<S><OrdersPage /></S>} />
        <Route path="wallet" element={<S><WalletPage /></S>} />
        <Route path="credit-notes" element={<S><CreditNotesPage /></S>} />
        <Route path="returns" element={<S><ReturnsPage /></S>} />
        <Route path="accounts" element={<S><AccountsPage /></S>} />
        <Route path="journals" element={<S><JournalsPage /></S>} />
        <Route path="sales-doc" element={<S><SalesDocPage /></S>} />
        <Route path="sales-doc/create" element={<S><SalesDocCreatePage /></S>} />
        <Route path="sales-doc/:id" element={<S><SalesDocDetailPage /></S>} />
        <Route path="consignment" element={<S><ConsignmentPage /></S>} />
        <Route path="consignment/:id" element={<S><ConsignmentDetailPage /></S>} />
        <Route path="stocktaking" element={<S><StocktakingPage /></S>} />
        <Route path="reports/sales" element={<S><SalesReportsPage /></S>} />
        <Route path="reports/inventory" element={<S><InventoryReportPage /></S>} />
        <Route path="warehouse" element={<S><WarehousePage /></S>} />
        <Route path="reports/trial-balance" element={<S><TrialBalancePage /></S>} />
        <Route path="reports/pnl" element={<S><ProfitLossPage /></S>} />
        <Route path="reports/balance-sheet" element={<S><BalanceSheetPage /></S>} />
        <Route path="reports/tax" element={<S><TaxSummaryPage /></S>} />
        <Route path="reports/cashflow" element={<S><CashFlowPage /></S>} />
        <Route path="reconciliation" element={<S><BankReconciliationPage /></S>} />
        <Route path="wht" element={<S><WhtPage /></S>} />
        <Route path="settings" element={<S><SettingsPage /></S>} />
        <Route path="online-orders" element={<Navigate to="/orders" replace />} />
      </Route>
    </Routes>
  )
}
