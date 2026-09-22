/**
 * Turns the breadboard LED ON for a few seconds when an order arrives.
 * Uses `pinctrl` (works on Raspberry Pi OS Bookworm / Pi 4).
 *
 * Default: GPIO 17 = physical pin 11
 * Wiring: pin 11 → resistor → LED(+) ; LED(-) → pin 6 GND
 */

const { execSync } = require('child_process')

const LED_PIN = Number(process.env.LED_GPIO_PIN) || 17
const LED_ON_MS = Number(process.env.LED_ON_MS) || 5000

let ready = false

function run(command) {
  execSync(command, { stdio: 'ignore' })
}

function setLed(on) {
  // dh = drive high (ON), dl = drive low (OFF)
  const state = on ? 'dh' : 'dl'
  run(`pinctrl set ${LED_PIN} op ${state}`)
}

function initLed() {
  try {
    // Set pin as output and start OFF
    setLed(false)
    ready = true
    console.log(`[led] Ready on GPIO ${LED_PIN} (physical pin 11 if pin=17)`)
  } catch (error) {
    ready = false
    console.warn('[led] Not available:', error.message)
    console.warn('[led] Tip: on the Pi run: which pinctrl')
  }
}

function flashOrderReceived() {
  if (!ready) {
    console.log('[led] Skipped — GPIO not ready')
    return
  }

  try {
    console.log(`[led] ON for ${LED_ON_MS / 1000}s`)
    setLed(true)

    setTimeout(() => {
      try {
        setLed(false)
        console.log('[led] OFF')
      } catch (error) {
        console.error('[led] Failed to turn off:', error.message)
      }
    }, LED_ON_MS)
  } catch (error) {
    console.error('[led] Failed to turn on:', error.message)
  }
}

function cleanupLed() {
  if (!ready) return
  try {
    setLed(false)
  } catch (_) {}
  ready = false
}

module.exports = {
  initLed,
  flashOrderReceived,
  cleanupLed,
}
