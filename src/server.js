require('dotenv').config()

const express = require('express')
const ordersRouter = require('./routes/orders')
const healthRouter = require('./routes/health')
const { initLed, cleanupLed } = require('./services/ledService')

const app = express()

// MANUAL CONFIG: HOST and PORT come from .env (defaults keep LAN reachable)
const HOST = process.env.HOST || '0.0.0.0'
const PORT = Number(process.env.PORT) || 3000

app.use(express.json({ limit: '1mb' }))

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`)
  next()
})

app.use('/api/health', healthRouter)
app.use('/api/orders', ordersRouter)

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Not found',
  })
})

app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err)
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  })
})

// Listen on 0.0.0.0 so devices on the same Wi-Fi can reach this server
app.listen(PORT, HOST, () => {
  console.log(`Raspberry Pi server listening on http://${HOST}:${PORT}`)
  console.log('Endpoints:')
  console.log(`  GET  http://${HOST}:${PORT}/api/health`)
  console.log(`  POST http://${HOST}:${PORT}/api/orders/start`)
  console.log(`  GET  http://${HOST}:${PORT}/api/orders`)
  initLed()
})

const shutdown = () => {
  cleanupLed()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
