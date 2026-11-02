const createMachineControl = ({ config, driver, log = console }) => {
  const holds = new Map()
  let ready = false

  const level = (on) => (config.relayActiveLow ? !on : on)

  const writePin = (pin, on) => {
    try {
      driver.write(pin, level(on))
      return true
    } catch (error) {
      log.error(`[gpio] Failed to switch GPIO ${pin} ${on ? 'ON' : 'OFF'}:`, error.message)
      return false
    }
  }

  const knownPins = () => {
    const pins = new Set(config.machineMap.map((entry) => entry.gpio))
    if (config.defaultMachinePin !== null) pins.add(config.defaultMachinePin)
    if (config.ledPin !== null) pins.add(config.ledPin)
    return Array.from(pins)
  }

  const init = () => {
    let ok = true
    knownPins().forEach((pin) => {
      ok = writePin(pin, false) && ok
    })
    ready = ok
    const mode = driver.isDryRun?.() ? 'DRY-RUN' : 'pinctrl'
    log.log(`[gpio] ${ok ? 'Ready' : 'NOT ready'} (${mode}); pins: ${knownPins().join(', ') || 'none'}; relay active-${config.relayActiveLow ? 'LOW' : 'HIGH'}`)
    return ok
  }

  const pinFor = ({ equipmentId, equipmentType, machineNum } = {}) => {
    const byId = config.machineMap.find((entry) => entry.equipmentId && entry.equipmentId === equipmentId)
    if (byId) return byId.gpio
    const byName = config.machineMap.find((entry) => (
      entry.type && entry.machineNum
      && entry.type.toLowerCase() === String(equipmentType || '').toLowerCase()
      && entry.machineNum === String(machineNum ?? '')
    ))
    if (byName) return byName.gpio
    return config.defaultMachinePin
  }

  const acquire = (pin) => {
    if (pin === null || pin === undefined) return false
    const count = holds.get(pin) || 0
    holds.set(pin, count + 1)
    if (count === 0) return writePin(pin, true)
    return true
  }

  const release = (pin) => {
    if (pin === null || pin === undefined) return
    const count = holds.get(pin) || 0
    if (count <= 1) {
      holds.delete(pin)
      writePin(pin, false)
    } else {
      holds.set(pin, count - 1)
    }
  }

  const flashLed = () => {
    if (config.ledPin === null) return
    acquire(config.ledPin)
    setTimeout(() => release(config.ledPin), config.ledOnMs).unref?.()
  }

  const shutdown = () => {
    holds.clear()
    knownPins().forEach((pin) => writePin(pin, false))
  }

  return {
    init,
    pinFor,
    acquire,
    release,
    flashLed,
    shutdown,
    isReady: () => ready,
    isDryRun: () => !!driver.isDryRun?.(),
    pinsOn: () => Array.from(holds.keys()),
  }
}

module.exports = { createMachineControl }
