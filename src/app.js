const os = require('os')
const express = require('express')
const { SessionError, MODE } = require('./services/sessionManager')
const { lanAddresses } = require('./services/system')

const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

const createApp = ({ config, manager, machines, clock, identity, getInternet = () => null, version = '0.0.0', trustLocalhost = true }) => {
  const isLocal = (req) => trustLocalhost && LOCAL_ADDRESSES.has(req.socket?.remoteAddress)
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '256kb' }))

  app.use((req, _res, next) => {
    clock.observeClientTime(req.get('x-client-time'))
    next()
  })

  app.use((req, _res, next) => {
    if (req.path !== '/api/status' && req.path !== '/api/health') {
      console.log(`[${new Date(clock.now()).toISOString()}] ${req.method} ${req.originalUrl} from ${req.socket?.remoteAddress}`)
    }
    next()
  })

  const requireKey = (req, res, next) => {
    if (!config.apiKey || isLocal(req) || req.get('x-api-key') === config.apiKey) return next()
    return res.status(401).json({ success: false, code: 'BAD_API_KEY', message: 'Wrong or missing Pi key. Set it in the app: Machine Controller settings.' })
  }

  const ok = (res, data, message = 'OK', status = 200) => res.status(status).json({ success: true, message, data })

  const fail = (res, error) => {
    if (error instanceof SessionError) {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, data: error.details })
    }
    console.error('[api] Unexpected error:', error)
    return res.status(500).json({ success: false, code: 'INTERNAL', message: 'Internal server error' })
  }

  const health = () => ({
    service: 'fastcub-pi',
    piId: identity.piId,
    name: config.piName || os.hostname(),
    hostname: os.hostname(),
    version,
    port: config.port,
    addresses: lanAddresses(),
    now: clock.now(),
    clockOffsetMs: clock.getOffsetMs(),
    ntpSynced: clock.isNtpSynced(),
    internet: getInternet(),
    uptimeSec: Math.round(process.uptime()),
    authRequired: !!config.apiKey,
    shopId: config.shopId || null,
    gpio: { ready: machines.isReady(), dryRun: machines.isDryRun(), signalMode: config.signalMode },
    activeCount: manager.active().length,
    unsyncedCount: manager.unsyncedCount(),
  })

  app.get('/api/health', (req, res) => ok(res, {
    ...health(),
    keyAccepted: !config.apiKey || isLocal(req) || req.get('x-api-key') === config.apiKey,
  }, 'Raspberry Pi server is running'))

  app.get('/api/status', requireKey, (req, res) => {
    const afterSeq = Number(req.query.afterSeq)
    ok(res, {
      ...health(),
      active: manager.active(),
      machines: manager.machines(),
      changed: Number.isFinite(afterSeq) ? manager.list({ afterSeq, limit: Number(req.query.limit) || 500 }) : undefined,
      seq: manager.seq(),
    })
  })

  app.get('/api/sessions', requireKey, (req, res) => {
    const afterSeq = Number(req.query.afterSeq) || 0
    ok(res, manager.list({ afterSeq, limit: Number(req.query.limit) || 500 }))
  })

  app.get('/api/sessions/:id', requireKey, (req, res) => {
    const session = manager.get(req.params.id)
    if (!session) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No such session' })
    return ok(res, session)
  })

  const startHandler = (mode) => (req, res) => {
    try {
      const { session, created } = manager.start(req.body, { mode, force: req.body?.force === true })
      return ok(res, session, created ? 'Machine started' : 'Already started', created ? 201 : 200)
    } catch (error) {
      return fail(res, error)
    }
  }

  app.post('/api/sessions/start', requireKey, startHandler(MODE.OFFLINE))

  app.post('/api/sessions/track', requireKey, startHandler(MODE.ONLINE))

  app.post('/api/sessions/:id/stop', requireKey, (req, res) => {
    try {
      return ok(res, manager.stop(req.params.id, req.body?.reason), 'Stopped')
    } catch (error) {
      return fail(res, error)
    }
  })

  app.post('/api/sessions/ack', requireKey, (req, res) => {
    const ids = Array.isArray(req.body?.sessionIds) ? req.body.sessionIds.slice(0, 1000) : []
    return ok(res, { acked: manager.ack(ids) })
  })

  app.post('/api/orders/start', requireKey, (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const sessionId = body.sessionId || `legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    try {
      const { session } = manager.start({ ...body, sessionId, token: body.token || 1 }, { mode: MODE.ONLINE })
      return ok(res, { orderId: session.orderId, receivedAt: new Date(session.receivedAt).toISOString(), sessionId }, 'Order data received')
    } catch (error) {
      return fail(res, error)
    }
  })

  app.get('/api/orders', requireKey, (_req, res) => {
    const sessions = manager.list({ afterSeq: 0, limit: 5000 })
    return res.status(200).json({ success: true, message: 'Orders retrieved', data: sessions, count: sessions.length })
  })

  app.use((_req, res) => res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Not found' }))

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, code: 'INVALID_JSON', message: 'Body is not valid JSON' })
    }
    return fail(res, error)
  })

  return app
}

module.exports = { createApp }
