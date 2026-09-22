const path = require('path')
const fs = require('fs')

const ORDERS_FILE = path.join(__dirname, '../../data/orders.json')

const ensureFile = () => {
  const dir = path.dirname(ORDERS_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, '[]', 'utf8')
  }
}

const readOrders = () => {
  ensureFile()
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('[orderStorage] Failed to read orders.json:', error.message)
    return []
  }
}

/**
 * Append a new order record. Never overwrites existing entries.
 * Adds receivedAt metadata on the Pi.
 */
const appendOrder = (payload) => {
  ensureFile()
  const orders = readOrders()
  const record = {
    ...payload,
    receivedAt: new Date().toISOString(),
  }
  orders.push(record)
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8')
  console.log('[orderStorage] Appended order. Total records:', orders.length)
  return record
}

module.exports = {
  readOrders,
  appendOrder,
  ORDERS_FILE,
}
