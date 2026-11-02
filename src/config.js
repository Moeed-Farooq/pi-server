require('dotenv').config()

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

const readNumber = (value, fallback) => {
  const number = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(number) ? number : fallback
}

const readBoolean = (value, fallback) => {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

const readPin = (value, fallback) => {
  if (value === undefined) return fallback
  if (String(value).trim() === '' || String(value).trim().toLowerCase() === 'none') return null
  const pin = Number(value)
  return Number.isInteger(pin) && pin >= 0 && pin <= 27 ? pin : fallback
}

const loadMachineMap = (file) => {
  if (!fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('must be a JSON array')
    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        equipmentId: entry.equipmentId ? String(entry.equipmentId) : null,
        type: entry.type ? String(entry.type) : null,
        machineNum: entry.machineNum !== undefined && entry.machineNum !== null ? String(entry.machineNum) : null,
        label: entry.label ? String(entry.label) : null,
        gpio: readPin(entry.gpio, null),
      }))
      .filter((entry) => entry.gpio !== null && (entry.equipmentId || (entry.type && entry.machineNum)))
  } catch (error) {
    console.error(`[config] Ignoring ${file}: ${error.message}`)
    return []
  }
}

const loadConfig = (env = process.env) => {
  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data')
  const machinesFile = env.MACHINES_FILE ? path.resolve(env.MACHINES_FILE) : path.join(ROOT, 'config', 'machines.json')
  const ledPin = readPin(env.LED_GPIO_PIN, 17)

  return {
    host: env.HOST || '0.0.0.0',
    port: readNumber(env.PORT, 3000),
    dataDir,
    machinesFile,

    ledPin,
    ledOnMs: readNumber(env.LED_ON_MS, 5000),

    defaultMachinePin: readPin(env.DEFAULT_MACHINE_GPIO, ledPin),
    relayActiveLow: readBoolean(env.RELAY_ACTIVE_LOW, false),
    signalMode: String(env.MACHINE_SIGNAL_MODE || 'hold').toLowerCase() === 'pulse' ? 'pulse' : 'hold',
    pulseMs: readNumber(env.PULSE_MS, 1000),
    machineMap: loadMachineMap(machinesFile),

    apiKey: env.API_KEY ? String(env.API_KEY) : '',
    shopId: env.SHOP_ID ? String(env.SHOP_ID) : '',
    piName: env.PI_NAME || '',

    resumeAfterReboot: readBoolean(env.RESUME_AFTER_REBOOT, true),
    maxRunMinutes: readNumber(env.MAX_RUN_MINUTES, 240),
    minuteMs: readNumber(env.MINUTE_MS, 60000),
    keepSyncedDays: readNumber(env.KEEP_SYNCED_DAYS, 45),
    maxStoredSessions: readNumber(env.MAX_STORED_SESSIONS, 5000),
    checkpointMs: readNumber(env.CHECKPOINT_MS, 5000),
  }
}

module.exports = { loadConfig, loadMachineMap, ROOT }
