const STATUS = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  STOPPED: 'stopped',
  INTERRUPTED: 'interrupted',
})

const MODE = Object.freeze({ OFFLINE: 'offline', ONLINE: 'online' })

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const MAX_START_SKEW_MS = 10 * 60 * 1000

class SessionError extends Error {
  constructor(code, message, httpStatus = 400, details = {}) {
    super(message)
    this.name = 'SessionError'
    this.code = code
    this.httpStatus = httpStatus
    this.details = details
  }
}

const text = (value) => (value === undefined || value === null ? '' : String(value))

const createSessionManager = ({
  config,
  store,
  machines,
  clock,
  log = console,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  onEvent = () => { },
}) => {
  const timers = new Map()

  const isRunning = (session) => session?.status === STATUS.RUNNING

  const remainingOf = (session) => {
    if (!isRunning(session)) return Math.max(0, Number(session?.remainingMs) || 0)
    const timer = timers.get(session.sessionId)
    if (!timer) return Math.max(0, Number(session.remainingMs) || 0)
    return Math.max(0, timer.remainingAtStart - (clock.monotonic() - timer.monoStart))
  }

  const view = (session) => {
    if (!session) return null
    const remainingMs = Math.round(remainingOf(session))
    const now = clock.now()
    return {
      ...session,
      remainingMs,
      runMs: isRunning(session) ? Math.max(0, session.durationMs - remainingMs) : session.runMs,
      endsAt: isRunning(session) ? now + remainingMs : session.endsAt,
      controlsMachine: session.mode === MODE.OFFLINE,
    }
  }

  const activeFor = (equipmentId) => store.all().find((session) => isRunning(session) && session.equipmentId === equipmentId) || null

  const releaseRelay = (session) => {
    if (session.mode === MODE.OFFLINE && session.relayOn) machines.release(session.gpio)
  }

  const schedule = (session) => {
    const remaining = Math.max(0, Number(session.remainingMs) || 0)
    const handle = setTimer(() => finish(session.sessionId, STATUS.COMPLETED), remaining)
    handle?.unref?.()
    timers.set(session.sessionId, { handle, monoStart: clock.monotonic(), remainingAtStart: remaining })
  }

  const unschedule = (sessionId) => {
    const timer = timers.get(sessionId)
    if (timer) clearTimer(timer.handle)
    timers.delete(sessionId)
  }

  function finish(sessionId, status, reason = null) {
    const session = store.get(sessionId)
    if (!isRunning(session)) return view(session)

    const remaining = status === STATUS.COMPLETED ? 0 : remainingOf(session)
    unschedule(sessionId)
    releaseRelay(session)

    const now = clock.now()
    const next = store.put({
      ...session,
      status,
      remainingMs: Math.round(remaining),
      runMs: Math.round(Math.max(0, session.durationMs - remaining)),
      completedAt: now,
      updatedAt: now,
      relayOn: false,
      stopReason: reason,
    })
    log.log(`[session] ${label(next)} ${status.toUpperCase()}${reason ? ` (${reason})` : ''}`)
    onEvent({ type: status, session: next })
    return view(next)
  }

  const label = (session) => {
    const machine = session.equipmentName || session.equipmentType || session.equipmentId
    const number = session.machineNum ? ` #${session.machineNum}` : ''
    return `${machine}${number} / order ${session.orderId || '-'} [${session.mode}]`
  }

  const readMinutes = (payload) => {
    const minutes = Number(payload.durationMinutes ?? payload.token)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new SessionError('INVALID_TOKEN', 'token (minutes) must be a number above 0')
    }
    if (minutes > config.maxRunMinutes) {
      throw new SessionError('TOKEN_TOO_LONG', `token is ${minutes} minutes; the most this Pi accepts is ${config.maxRunMinutes}`)
    }
    return minutes
  }

  const validate = (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new SessionError('INVALID_BODY', 'Request body must be a JSON object')
    }
    const sessionId = text(payload.sessionId)
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new SessionError('INVALID_SESSION_ID', 'sessionId is required (letters, digits, - or _, up to 64)')
    }
    if (!text(payload.equipmentId)) throw new SessionError('MISSING_EQUIPMENT', 'equipmentId is required')
    if (config.shopId && text(payload.shopId) !== config.shopId) {
      throw new SessionError('WRONG_SHOP', `This Pi belongs to another shop (${config.shopId})`, 403)
    }
    return { sessionId, minutes: readMinutes(payload) }
  }

  const pickStartedAt = (value, now) => {
    const ms = typeof value === 'number' ? value : Date.parse(value)
    if (!Number.isFinite(ms) || Math.abs(ms - now) > MAX_START_SKEW_MS) return now
    return ms
  }

  const start = (payload, { mode, force = false }) => {
    const { sessionId, minutes } = validate(payload)

    const existing = store.get(sessionId)
    if (existing) return { session: view(existing), created: false }

    const busy = activeFor(text(payload.equipmentId))
    if (busy) {
      const replaceable = busy.mode === MODE.ONLINE && (mode === MODE.ONLINE || force)
      if (!replaceable) {
        const code = busy.mode === MODE.OFFLINE ? 'MACHINE_BUSY' : 'MACHINE_BUSY_ONLINE'
        throw new SessionError(code, `${label(busy)} is still running`, 409, { session: view(busy) })
      }
      finish(busy.sessionId, STATUS.STOPPED, mode === MODE.ONLINE ? 'replaced by a newer online start' : 'replaced by an offline start')
    }

    const now = clock.now()
    const durationMs = Math.round(minutes * config.minuteMs)
    const gpio = mode === MODE.OFFLINE ? machines.pinFor({
      equipmentId: text(payload.equipmentId),
      equipmentType: text(payload.equipmentType),
      machineNum: text(payload.machineNum),
    }) : null

    if (mode === MODE.OFFLINE && (gpio === null || gpio === undefined)) {
      throw new SessionError('NO_PIN', 'No GPIO pin is set for this machine (config/machines.json or DEFAULT_MACHINE_GPIO)', 500)
    }

    let session = {
      sessionId,
      mode,
      status: STATUS.RUNNING,
      orderId: text(payload.orderId),
      orderDocumentId: text(payload.orderDocumentId),
      serviceId: text(payload.serviceId),
      equipmentId: text(payload.equipmentId),
      equipmentName: text(payload.equipmentName),
      equipmentType: text(payload.equipmentType),
      machineNum: text(payload.machineNum),
      localGeneratedTokenId: text(payload.localGeneratedTokenId),
      token: minutes,
      durationMs,
      startedBy: text(payload.startedBy),
      shopId: text(payload.shopId),
      source: text(payload.source) || 'store-app',
      customerName: text(payload.customerName),
      startedAt: pickStartedAt(payload.startedAt, now),
      endsAt: now + durationMs,
      completedAt: null,
      remainingMs: durationMs,
      runMs: 0,
      receivedAt: now,
      updatedAt: now,
      gpio,
      relayOn: false,
      stopReason: null,
      syncedAt: null,
      restarts: 0,
    }

    if (mode === MODE.OFFLINE) {
      const switched = machines.acquire(gpio)
      if (!switched) {
        machines.release(gpio)
        store.put({ ...session, status: STATUS.STOPPED, remainingMs: durationMs, completedAt: now, stopReason: 'gpio_failed' })
        throw new SessionError('GPIO_FAILED', `Could not switch GPIO ${gpio}; the machine was not started`, 500)
      }
      if (config.signalMode === 'pulse') {
        setTimer(() => machines.release(gpio), config.pulseMs)?.unref?.()
      } else {
        session.relayOn = true
      }
    }

    session = store.put(session)
    schedule(session)
    machines.flashLed()
    log.log(`[session] ${label(session)} STARTED for ${minutes} min${gpio !== null ? ` (GPIO ${gpio})` : ''}`)
    onEvent({ type: 'started', session })
    return { session: view(session), created: true }
  }

  const stop = (sessionId, reason) => {
    const session = store.get(sessionId)
    if (!session) throw new SessionError('NOT_FOUND', `No session ${sessionId}`, 404)
    if (!isRunning(session)) return view(session)
    return finish(sessionId, STATUS.STOPPED, reason || 'stopped from the app')
  }

  const ack = (sessionIds) => {
    const now = clock.now()
    const acked = []
    sessionIds.forEach((id) => {
      const session = store.get(text(id))
      if (!session || isRunning(session)) return
      if (!session.syncedAt) store.put({ ...session, syncedAt: now }, { persist: false })
      acked.push(session.sessionId)
    })
    if (acked.length) store.save()
    return acked
  }

  const checkpoint = () => {
    let changed = false
    store.all().forEach((session) => {
      if (!isRunning(session) || !timers.has(session.sessionId)) return
      const remainingMs = Math.round(remainingOf(session))
      store.touch(session.sessionId, { remainingMs, runMs: Math.max(0, session.durationMs - remainingMs) })
      changed = true
    })
    if (changed) store.save()
  }

  const resume = () => {
    const running = store.all().filter(isRunning)
    running.forEach((session) => {
      if (!config.resumeAfterReboot) {
        finish(session.sessionId, STATUS.INTERRUPTED, 'pi restarted (RESUME_AFTER_REBOOT=false)')
        return
      }

      let remainingMs = Math.max(0, Number(session.remainingMs) || 0)
      if (session.mode === MODE.ONLINE) {
        remainingMs = Math.min(remainingMs, Math.max(0, session.endsAt - clock.now()))
      }

      let next = { ...session, remainingMs, restarts: (session.restarts || 0) + 1, relayOn: false }
      if (remainingMs <= 0) {
        next = store.put(next)
        finish(next.sessionId, STATUS.COMPLETED)
        return
      }
      if (session.mode === MODE.OFFLINE && config.signalMode !== 'pulse') {
        next.relayOn = machines.acquire(session.gpio)
      }
      next = store.put(next)
      schedule(next)
      const minutes = Math.floor(remainingMs / 60000)
      const seconds = Math.round((remainingMs % 60000) / 1000)
      log.log(`[session] ${label(next)} RESUMED after restart with ${minutes}m ${seconds}s left`)
      onEvent({ type: 'resumed', session: next })
    })
    return running.length
  }

  const prune = () => {
    const cutoff = clock.now() - config.keepSyncedDays * 24 * 60 * 60 * 1000
    const finished = store.all().filter((session) => !isRunning(session))
    const old = finished.filter((session) => session.syncedAt && (session.completedAt || session.updatedAt) < cutoff)
    const ids = new Set(old.map((session) => session.sessionId))

    const left = finished.filter((session) => !ids.has(session.sessionId))
    const overflow = store.all().length - ids.size - config.maxStoredSessions
    if (overflow > 0) {
      left
        .sort((a, b) => (a.syncedAt ? 0 : 1) - (b.syncedAt ? 0 : 1) || (a.updatedAt || 0) - (b.updatedAt || 0))
        .slice(0, overflow)
        .forEach((session) => ids.add(session.sessionId))
    }
    const removed = ids.size ? store.remove(Array.from(ids)) : 0
    if (removed) log.log(`[session] Removed ${removed} old session(s)`)
    return removed
  }

  const list = ({ afterSeq = 0, limit = 500 } = {}) => store.all()
    .filter((session) => (session.seq || 0) > afterSeq)
    .sort((a, b) => (a.seq || 0) - (b.seq || 0))
    .slice(0, limit)
    .map(view)

  const active = () => store.all().filter(isRunning).map(view).sort((a, b) => a.remainingMs - b.remainingMs)

  const machinesView = () => {
    const rows = new Map()
    config.machineMap.forEach((entry) => {
      const key = entry.equipmentId || `${entry.type}#${entry.machineNum}`
      rows.set(key, {
        equipmentId: entry.equipmentId,
        equipmentName: entry.label || entry.type,
        equipmentType: entry.type,
        machineNum: entry.machineNum,
        gpio: entry.gpio,
        busy: false,
        session: null,
        lastSession: null,
      })
    })
    store.all()
      .sort((a, b) => (a.seq || 0) - (b.seq || 0))
      .forEach((session) => {
        const configured = Array.from(rows.entries()).find(([, row]) => (
          (row.equipmentId && row.equipmentId === session.equipmentId)
          || (!row.equipmentId && row.equipmentType && row.equipmentType.toLowerCase() === session.equipmentType.toLowerCase()
            && row.machineNum === session.machineNum)
        ))
        const key = configured ? configured[0] : session.equipmentId
        const row = rows.get(key) || {
          equipmentId: session.equipmentId,
          equipmentName: session.equipmentName || session.equipmentType,
          equipmentType: session.equipmentType,
          machineNum: session.machineNum,
          gpio: machines.pinFor(session),
          busy: false,
          session: null,
          lastSession: null,
        }
        row.equipmentId = row.equipmentId || session.equipmentId
        row.equipmentName = row.equipmentName || session.equipmentName
        if (isRunning(session)) {
          row.busy = true
          row.session = view(session)
        } else {
          row.lastSession = view(session)
        }
        rows.set(key, row)
      })
    return Array.from(rows.values())
  }

  const shutdown = () => {
    checkpoint()
    timers.forEach((timer) => clearTimer(timer.handle))
    timers.clear()
  }

  return {
    start,
    stop,
    ack,
    checkpoint,
    resume,
    prune,
    list,
    active,
    machines: machinesView,
    get: (id) => view(store.get(id)),
    unsyncedCount: () => store.all().filter((session) => !isRunning(session) && session.mode === MODE.OFFLINE && !session.syncedAt).length,
    seq: () => store.getSeq(),
    shutdown,
  }
}

module.exports = { createSessionManager, SessionError, STATUS, MODE }
