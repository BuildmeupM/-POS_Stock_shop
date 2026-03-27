import { useEffect, useRef, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { useAuthStore } from '../stores/authStore'

interface WSMessage {
  event: string
  data: Record<string, unknown>
  timestamp: string
}

type EventHandler = (data: Record<string, unknown>) => void

/**
 * Hook for real-time WebSocket connection.
 * Auto-connects when authenticated, auto-reconnects on disconnect.
 * Invalidates relevant React Query caches on events.
 */
export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const [connected, setConnected] = useState(false)

  const queryClient = useQueryClient()
  const activeCompany = useAuthStore((s) => s.activeCompany)
  const token = useAuthStore((s) => s.token)

  const connect = useCallback(() => {
    if (!activeCompany?.id || !token) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = import.meta.env.VITE_API_URL
      ? new URL(import.meta.env.VITE_API_URL).host
      : window.location.hostname + ':3001'

    const url = `${protocol}://${host}/ws?companyId=${activeCompany.id}&token=${token}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (evt) => {
      try {
        const msg: WSMessage = JSON.parse(evt.data)
        // Auto-invalidate queries based on event type
        autoInvalidate(msg.event, queryClient)
        // Call registered handlers
        const handlers = handlersRef.current.get(msg.event)
        if (handlers) {
          handlers.forEach((fn) => fn(msg.data))
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Reconnect after 5 seconds
      reconnectTimer.current = setTimeout(connect, 5000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [activeCompany?.id, token, queryClient])

  // Connect on mount / when company changes
  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  // Subscribe to a specific event
  const on = useCallback((event: string, handler: EventHandler) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set())
    }
    handlersRef.current.get(event)!.add(handler)
    return () => {
      handlersRef.current.get(event)?.delete(handler)
    }
  }, [])

  return { connected, on }
}

/**
 * Auto-invalidate React Query caches based on WS event names.
 */
function autoInvalidate(event: string, queryClient: ReturnType<typeof useQueryClient>) {
  const map: Record<string, string[]> = {
    'sale:created': ['sales', 'reports'],
    'sale:voided': ['sales', 'reports'],
    'sale:deleted': ['sales', 'reports'],
    'stock:updated': ['stock', 'products', 'inventory'],
    'stock:received': ['stock', 'products', 'inventory'],
    'order:created': ['orders'],
    'order:statusChanged': ['orders'],
    'expense:created': ['expenses', 'reports'],
    'document:created': ['sales-docs'],
    'product:updated': ['products'],
    'return:created': ['returns', 'sales', 'stock'],
    'stockcount:completed': ['stock', 'products', 'inventory'],
  }

  const keys = map[event]
  if (keys) {
    keys.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: [key] })
    })
  }
}

/**
 * Hook specifically for showing real-time notifications.
 * Place once in Layout component.
 */
export function useWebSocketNotifications() {
  const { on } = useWebSocket()

  useEffect(() => {
    const unsubs = [
      on('sale:created', (data) => {
        notifications.show({
          title: 'ขายสำเร็จ',
          message: `บิล ${data.invoiceNumber} ยอด ฿${data.netAmount}`,
          color: 'green',
          autoClose: 3000,
        })
      }),
      on('stock:received', (data) => {
        notifications.show({
          title: 'รับสต๊อกเข้า',
          message: `${data.productName || 'สินค้า'} +${data.quantity} ชิ้น`,
          color: 'blue',
          autoClose: 3000,
        })
      }),
      on('order:created', (data) => {
        notifications.show({
          title: 'ออเดอร์ใหม่',
          message: `${data.orderNumber || 'ออเดอร์ใหม่'} จาก ${data.platform || 'ลูกค้า'}`,
          color: 'violet',
          autoClose: 5000,
        })
      }),
    ]

    return () => unsubs.forEach((unsub) => unsub())
  }, [on])
}
