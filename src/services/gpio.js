const { execFileSync } = require('child_process')

const createPinctrlDriver = ({ log = console } = {}) => {
  let available = null

  const detect = () => {
    if (available !== null) return available
    try {
      execFileSync('pinctrl', ['-h'], { stdio: 'ignore', timeout: 2000 })
      available = true
    } catch (error) {
      available = error.code !== 'ENOENT'
    }
    if (!available) log.warn('[gpio] pinctrl not found: running in DRY-RUN mode (pins are only logged).')
    return available
  }

  const write = (pin, high) => {
    if (!detect()) {
      log.log(`[gpio] (dry-run) GPIO ${pin} -> ${high ? 'HIGH' : 'LOW'}`)
      return
    }
    execFileSync('pinctrl', ['set', String(pin), 'op', high ? 'dh' : 'dl'], { stdio: 'ignore', timeout: 2000 })
  }

  return { write, isDryRun: () => !detect() }
}

module.exports = { createPinctrlDriver }
