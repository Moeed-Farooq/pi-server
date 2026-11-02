const fs = require('fs')
const path = require('path')

const ensureDir = (file) => fs.mkdirSync(path.dirname(file), { recursive: true })

const tryRead = (file) => {
  if (!fs.existsSync(file)) return undefined
  const raw = fs.readFileSync(file, 'utf8')
  if (!raw.trim()) return undefined
  return JSON.parse(raw)
}

const readJson = (file, fallback) => {
  try {
    const value = tryRead(file)
    if (value !== undefined) return value
  } catch (error) {
    console.error(`[storage] ${path.basename(file)} is unreadable (${error.message}); trying the backup.`)
  }
  try {
    const backup = tryRead(`${file}.bak`)
    if (backup !== undefined) {
      console.warn(`[storage] Restored ${path.basename(file)} from its backup.`)
      return backup
    }
  } catch (error) {
    console.error(`[storage] Backup of ${path.basename(file)} is unreadable too:`, error.message)
  }
  return fallback
}

const writeJson = (file, value) => {
  ensureDir(file)
  const tmp = `${file}.tmp`
  const data = JSON.stringify(value, null, 2)
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeSync(fd, data)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, `${file}.bak`)
    } catch (error) {
      console.warn(`[storage] Could not back up ${path.basename(file)}:`, error.message)
    }
  }
  fs.renameSync(tmp, file)
}

module.exports = { readJson, writeJson }
