/**
 * WebSocket utility for real-time event broadcasting.
 * Usage:
 *   const { broadcast } = require('../utils/websocket')
 *   broadcast(companyId, 'sale:created', { saleId: 1, invoiceNumber: 'INV-001' })
 */

const WebSocket = require('ws')

let wss = null
// Map: companyId -> Set<ws>
const companyClients = new Map()

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Call once from server.js after app.listen().
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    // Expect token and companyId as query params: /ws?token=xxx&companyId=1
    const url = new URL(req.url, `http://${req.headers.host}`)
    const companyId = url.searchParams.get('companyId')

    if (!companyId) {
      ws.close(4001, 'Missing companyId')
      return
    }

    // Register client under company
    if (!companyClients.has(companyId)) {
      companyClients.set(companyId, new Set())
    }
    companyClients.get(companyId).add(ws)

    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })

    ws.on('close', () => {
      const clients = companyClients.get(companyId)
      if (clients) {
        clients.delete(ws)
        if (clients.size === 0) companyClients.delete(companyId)
      }
    })

    // Send welcome
    ws.send(JSON.stringify({ event: 'connected', data: { message: 'เชื่อมต่อ real-time สำเร็จ' } }))
  })

  // Heartbeat every 30 seconds
  const interval = setInterval(() => {
    if (!wss) return
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate()
      ws.isAlive = false
      ws.ping()
    })
  }, 30000)

  wss.on('close', () => clearInterval(interval))

  console.log('🔌 WebSocket server attached at /ws')
  return wss
}

/**
 * Broadcast an event to all clients of a specific company.
 * @param {string|number} companyId
 * @param {string} event - e.g. 'sale:created', 'stock:updated', 'order:statusChanged'
 * @param {object} data - payload
 */
function broadcast(companyId, event, data = {}) {
  const cid = String(companyId)
  const clients = companyClients.get(cid)
  if (!clients || clients.size === 0) return

  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() })
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  })
}

module.exports = { initWebSocket, broadcast }
