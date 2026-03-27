import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import 'dayjs/locale/th'
import App from './App'
import './index.css'

const theme = createTheme({
  primaryColor: 'indigo',
  fontFamily: 'Inter, -apple-system, sans-serif',
  defaultRadius: 'md',
  colors: {
    dark: [
      '#C1C2C5', '#A6A7AB', '#909296', '#5c5f66',
      '#373A40', '#2C2E33', '#25262b', '#1e293b',
      '#141517', '#0f172a',
    ],
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
})

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'th' }}>
        <Notifications position="top-right" />
        <ModalsProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  </StrictMode>
)
