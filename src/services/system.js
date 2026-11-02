const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { readJson, writeJson } = require('../storage/jsonFile')

const lanAddresses = () => Object.entries(os.networkInterfaces())
  .flatMap(([name, addresses]) => (addresses || [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => ({ interface: name, address: address.address, netmask: address.netmask })))
  .sort((a, b) => (a.interface.startsWith('wl') ? 0 : 1) - (b.interface.startsWith('wl') ? 0 : 1))

const loadIdentity = (dataDir) => {
  const file = path.join(dataDir, 'identity.json')
  const stored = readJson(file, null)
  if (stored?.piId) return stored
  const identity = { piId: `pi-${crypto.randomBytes(6).toString('hex')}`, createdAt: new Date().toISOString() }
  writeJson(file, identity)
  return identity
}

const checkInternet = (timeoutMs = 2500) => new Promise((resolve) => {
  const socket = net.connect({ host: 'firestore.googleapis.com', port: 443 })
  const done = (value) => {
    socket.destroy()
    resolve(value)
  }
  socket.setTimeout(timeoutMs, () => done(false))
  socket.once('connect', () => done(true))
  socket.once('error', () => done(false))
})

const createEventLog = (dataDir, maxBytes = 5 * 1024 * 1024) => {
  const file = path.join(dataDir, 'events.log')
  return (event) => {
    try {
      fs.mkdirSync(dataDir, { recursive: true })
      if (fs.existsSync(file) && fs.statSync(file).size > maxBytes) fs.renameSync(file, `${file}.1`)
      const { session } = event
      fs.appendFileSync(file, `${JSON.stringify({
        at: new Date().toISOString(),
        type: event.type,
        sessionId: session?.sessionId,
        mode: session?.mode,
        orderId: session?.orderId,
        equipmentId: session?.equipmentId,
        machine: session?.equipmentName,
        token: session?.token,
        status: session?.status,
        reason: session?.stopReason || undefined,
      })}\n`)
    } catch (error) {
      console.error('[events] Could not write events.log:', error.message)
    }
  }
}

module.exports = { lanAddresses, loadIdentity, checkInternet, createEventLog }
