require('dotenv').config()

const http = require('http')

const PORT = Number(process.env.PORT) || 3000
const REFRESH_MS = 1000
const RECENT_ROWS = 8

const ESC = '\x1b['
const color = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  cyan: `${ESC}36m`,
  inverse: `${ESC}7m`,
}
const paint = (text, ...styles) => `${styles.join('')}${text}${color.reset}`
const visibleLength = (text) => String(text).replace(/\x1b\[[0-9;]*m/g, '').length
const pad = (text, width) => {
  const value = String(text ?? '')
  const length = visibleLength(value)
  if (length > width) return `${value.slice(0, Math.max(0, width - 1))}…`
  return value + ' '.repeat(width - length)
}

const two = (n) => String(n).padStart(2, '0')
const clockTime = (ms) => {
  if (!ms) return '--:--'
  const date = new Date(ms)
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}
const duration = (ms) => {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`
}
const machineName = (row) => [row.equipmentName || row.equipmentType || row.equipmentId, row.machineNum ? `#${row.machineNum}` : '']
  .filter(Boolean).join(' ')

const fetchJson = (path) => new Promise((resolve, reject) => {
  const request = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 2000 }, (response) => {
    let body = ''
    response.setEncoding('utf8')
    response.on('data', (chunk) => { body += chunk })
    response.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
  })
  request.on('timeout', () => request.destroy(new Error('timeout')))
  request.on('error', reject)
})

const progressBar = (session, width = 14) => {
  const done = session.durationMs ? 1 - session.remainingMs / session.durationMs : 0
  const filled = Math.max(0, Math.min(width, Math.round(done * width)))
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

const render = (status, recent, lastError) => {
  const columns = Math.max(80, process.stdout.columns || 100)
  const line = paint('─'.repeat(columns), color.dim)
  const out = []
  const now = status?.now || Date.now()
  const date = new Date(now)

  const title = paint(' FastCub Machine Controller ', color.bold, color.inverse)
  const stamp = paint(`${date.toDateString()}  ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`, color.bold)
  out.push(`${title}${' '.repeat(Math.max(1, columns - visibleLength(title) - visibleLength(stamp)))}${stamp}`)

  if (!status) {
    out.push(line)
    out.push(paint(` Waiting for the Pi server on port ${PORT}…  ${lastError ? `(${lastError})` : ''}`, color.yellow))
    out.push(paint(' It starts on boot (systemd service "fastcub-pi"). Check: sudo systemctl status fastcub-pi', color.dim))
    return out.join('\n')
  }

  const address = status.addresses?.[0]?.address
  const internet = status.internet === true ? paint('yes', color.green) : status.internet === false ? paint('no', color.yellow) : '…'
  const gpio = status.gpio?.ready ? paint(status.gpio.dryRun ? 'dry-run' : 'ready', status.gpio.dryRun ? color.yellow : color.green) : paint('NOT READY', color.red)
  out.push(` App address: ${paint(address ? `${address}:${status.port}` : 'no network!', color.bold, color.cyan)}   Pi: ${status.name} (${status.piId})`)
  out.push(` Internet: ${internet}   GPIO: ${gpio}   Key: ${status.authRequired ? 'required' : 'off'}   Clock: ${status.ntpSynced ? 'NTP' : status.clockOffsetMs ? `phone (${Math.round(status.clockOffsetMs / 1000)}s)` : 'local'}   Up: ${duration(status.uptimeSec * 1000)}`)
  out.push(line)

  const active = status.active || []
  out.push(paint(` RUNNING NOW (${active.length})`, color.bold))
  if (!active.length) {
    out.push(paint('  No machine is running.', color.dim))
  } else {
    out.push(paint(`  ${pad('Machine', 22)}${pad('Order', 12)}${pad('Token', 7)}${pad('Start', 7)}${pad('Ends', 7)}${pad('Time left', 11)}${pad('', 16)}Mode`, color.dim))
    active.forEach((session) => {
      const left = paint(pad(duration(session.remainingMs), 11), color.bold, session.remainingMs < 60000 ? color.yellow : color.green)
      const mode = session.mode === 'offline'
        ? paint(`relay GPIO ${session.gpio ?? '-'}`, color.cyan)
        : paint('online (tracked)', color.dim)
      out.push(`  ${pad(machineName(session), 22)}${pad(session.orderId || '-', 12)}${pad(`${session.token}m`, 7)}${pad(clockTime(session.startedAt), 7)}${pad(clockTime(session.endsAt), 7)}${left}${pad(progressBar(session), 16)}${mode}`)
      const details = [
        session.customerName && `customer ${session.customerName}`,
        session.equipmentType && session.equipmentType !== session.equipmentName && session.equipmentType,
        session.localGeneratedTokenId && `slot ${session.localGeneratedTokenId}`,
        session.restarts ? `resumed ${session.restarts}x after restart` : null,
      ].filter(Boolean)
      if (details.length) out.push(paint(`    ${details.join(' · ')}`, color.dim))
    })
  }
  out.push(line)

  const machines = status.machines || []
  out.push(paint(` MACHINES (${machines.length})`, color.bold))
  if (!machines.length) out.push(paint('  None yet. Machines appear after their first start (or list them in config/machines.json).', color.dim))
  machines.forEach((row) => {
    const state = row.busy
      ? paint(pad(`BUSY ${duration(row.session?.remainingMs)}`, 16), color.yellow, color.bold)
      : paint(pad('AVAILABLE', 16), color.green, color.bold)
    const last = row.lastSession ? `last: ${row.lastSession.status} ${clockTime(row.lastSession.completedAt)} (order ${row.lastSession.orderId || '-'})` : ''
    out.push(`  ${pad(machineName(row), 26)}${state}${pad(row.gpio !== null && row.gpio !== undefined ? `GPIO ${row.gpio}` : '', 10)}${paint(last, color.dim)}`)
  })
  out.push(line)

  out.push(paint(' RECENT RUNS', color.bold))
  if (!recent.length) out.push(paint('  None yet.', color.dim))
  recent.forEach((session) => {
    const icon = session.status === 'completed' ? paint('✔', color.green) : paint('■', color.yellow)
    const synced = session.mode === 'online'
      ? paint('online', color.dim)
      : session.syncedAt ? paint('synced to Firestore', color.green) : paint('waiting to sync (the app uploads it)', color.yellow)
    out.push(`  ${icon} ${pad(clockTime(session.completedAt), 7)}${pad(session.status, 11)}${pad(machineName(session), 22)}${pad(`order ${session.orderId || '-'}`, 16)}${pad(duration(session.runMs), 9)}${synced}`)
  })
  if (status.unsyncedCount) {
    out.push(paint(` ${status.unsyncedCount} run(s) not in Firestore yet. The app uploads them when it has internet and this Pi in reach.`, color.yellow))
  }
  out.push(line)
  out.push(paint(' Ctrl+C closes this screen only; machines keep running. Logs: journalctl -u fastcub-pi -f', color.dim))
  return out.join('\n')
}

let recent = []
let lastSeq = 0
let lastError = null
let last = null

const tick = async () => {
  try {
    const response = await fetchJson(`/api/status?afterSeq=${lastSeq}`)
    last = response.data
    lastError = null
    const changed = (last.changed || []).filter((session) => session.status !== 'running')
    if (changed.length) {
      const byId = new Map(recent.map((session) => [session.sessionId, session]))
      changed.forEach((session) => byId.set(session.sessionId, session))
      recent = Array.from(byId.values())
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
        .slice(0, RECENT_ROWS)
    }
    if (last.seq < lastSeq) recent = []
    lastSeq = last.seq
  } catch (error) {
    last = null
    lastError = error.code || error.message
  }
  process.stdout.write(`${ESC}H${ESC}2J${render(last, recent, lastError)}\n`)
}

process.stdout.write(`${ESC}?25l`)
const restore = () => {
  process.stdout.write(`${ESC}?25h${color.reset}\n`)
  process.exit(0)
}
process.on('SIGINT', restore)
process.on('SIGTERM', restore)
process.stdout.on('resize', tick)

tick()
setInterval(tick, REFRESH_MS)
