const { loadConfig } = require('./config')
const { createApp } = require('./app')
const { createClock, checkNtpSynced } = require('./clock')
const { createSessionStore } = require('./storage/sessionStore')
const { createPinctrlDriver } = require('./services/gpio')
const { createMachineControl } = require('./services/machineControl')
const { createSessionManager } = require('./services/sessionManager')
const { checkInternet, createEventLog, lanAddresses, loadIdentity } = require('./services/system')
const { version } = require('../package.json')

const NTP_CHECK_MS = 10 * 60 * 1000
const INTERNET_CHECK_MS = 30 * 1000
const PRUNE_EVERY_MS = 60 * 60 * 1000

const config = loadConfig()
const clock = createClock()
const identity = loadIdentity(config.dataDir)
const store = createSessionStore({ dataDir: config.dataDir })
const machines = createMachineControl({ config, driver: createPinctrlDriver() })
const manager = createSessionManager({
  config,
  store,
  machines,
  clock,
  onEvent: createEventLog(config.dataDir),
})

let internet = null
const refreshInternet = async () => {
  internet = await checkInternet()
}
const refreshNtp = async () => clock.setNtpSynced(await checkNtpSynced())

const app = createApp({ config, manager, machines, clock, identity, version, getInternet: () => internet })

const boot = async () => {
  await refreshNtp()
  machines.init()
  const resumed = manager.resume()
  manager.prune()

  const server = app.listen(config.port, config.host, () => {
    console.log('==================================================')
    console.log(` FastCub Pi server v${version}  (${identity.piId})`)
    console.log(` Listening on http://${config.host}:${config.port}`)
    lanAddresses().forEach(({ interface: name, address }) => {
      console.log(` App address (${name}): ${address}:${config.port}`)
    })
    console.log(` Resumed runs: ${resumed}   API key: ${config.apiKey ? 'required' : 'off'}   Shop lock: ${config.shopId || 'off'}`)
    console.log(` Clock: ${clock.isNtpSynced() === true ? 'NTP synced' : 'not NTP synced (phone time is used)'}`)
    console.log('==================================================')
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[server] Port ${config.port} is already in use. Is another copy running (pm2, a terminal)?`)
      console.error('[server] Check with: sudo systemctl status fastcub-pi   or   pm2 list')
    } else {
      console.error('[server] Failed to start:', error)
    }
    machines.shutdown()
    process.exit(1)
  })

  const timers = [
    setInterval(() => manager.checkpoint(), config.checkpointMs),
    setInterval(() => manager.prune(), PRUNE_EVERY_MS),
    setInterval(refreshNtp, NTP_CHECK_MS),
    setInterval(refreshInternet, INTERNET_CHECK_MS),
  ]
  refreshInternet()

  let stopping = false
  const shutdown = (signal) => {
    if (stopping) return
    stopping = true
    console.log(`[server] ${signal}: saving runs and switching relays off.`)
    timers.forEach(clearInterval)
    manager.shutdown()
    machines.shutdown()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 2000).unref()
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('uncaughtException', (error) => {
    console.error('[server] Uncaught exception:', error)
    shutdown('uncaughtException')
  })
  process.on('unhandledRejection', (error) => console.error('[server] Unhandled rejection:', error))
}

boot().catch((error) => {
  console.error('[server] Boot failed:', error)
  machines.shutdown()
  process.exit(1)
})
