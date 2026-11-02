const { execFile } = require('child_process')
const { performance } = require('perf_hooks')

const MIN_OFFSET_MS = 30 * 1000
const MAX_OFFSET_MS = 400 * 24 * 60 * 60 * 1000

const createClock = ({ systemNow = Date.now, monotonic = () => performance.now() } = {}) => {
  let offsetMs = 0
  let ntpSynced = null

  const now = () => systemNow() + (ntpSynced ? 0 : offsetMs)

  const observeClientTime = (clientTime) => {
    const value = Number(clientTime)
    if (!Number.isFinite(value) || value <= 0 || ntpSynced) return
    const diff = value - systemNow()
    if (Math.abs(diff) > MAX_OFFSET_MS) return
    offsetMs = Math.abs(diff) >= MIN_OFFSET_MS ? diff : 0
  }

  const setNtpSynced = (value) => {
    ntpSynced = value
    if (value) offsetMs = 0
  }

  return {
    now,
    monotonic,
    observeClientTime,
    setNtpSynced,
    getOffsetMs: () => (ntpSynced ? 0 : offsetMs),
    isNtpSynced: () => ntpSynced,
  }
}

const checkNtpSynced = () => new Promise((resolve) => {
  execFile('timedatectl', ['show', '-p', 'NTPSynchronized', '--value'], { timeout: 3000 }, (error, stdout) => {
    if (error) return resolve(null)
    resolve(String(stdout).trim() === 'yes')
  })
})

module.exports = { createClock, checkNtpSynced }
