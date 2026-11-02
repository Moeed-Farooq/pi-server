const path = require('path')
const { readJson, writeJson } = require('./jsonFile')

const createSessionStore = ({ dataDir }) => {
  const file = path.join(dataDir, 'sessions.json')
  const stored = readJson(file, { seq: 0, sessions: [] })
  let seq = Number(stored.seq) || 0
  const sessions = new Map(
    (Array.isArray(stored.sessions) ? stored.sessions : [])
      .filter((session) => session && session.sessionId)
      .map((session) => [session.sessionId, session]),
  )

  const save = () => writeJson(file, { seq, sessions: Array.from(sessions.values()) })

  const get = (sessionId) => sessions.get(sessionId) || null

  const put = (session, { persist = true } = {}) => {
    seq += 1
    const next = { ...session, seq }
    sessions.set(next.sessionId, next)
    if (persist) save()
    return next
  }

  const touch = (sessionId, values) => {
    const current = sessions.get(sessionId)
    if (!current) return null
    const next = { ...current, ...values }
    sessions.set(sessionId, next)
    return next
  }

  const all = () => Array.from(sessions.values())

  const remove = (sessionIds) => {
    let removed = 0
    sessionIds.forEach((id) => {
      if (sessions.delete(id)) removed += 1
    })
    if (removed) save()
    return removed
  }

  return { file, get, put, touch, all, remove, save, getSeq: () => seq }
}

module.exports = { createSessionStore }
