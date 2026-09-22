/**
 * Turns the breadboard LED ON for a few seconds when an order arrives.
 * Default: GPIO 17 (physical pin 11 on the Pi).
 */

let led = null

const LED_PIN = Number(process.env.LED_GPIO_PIN) || 17
const LED_ON_MS = Number(process.env.LED_ON_MS) || 5000

function initLed() {
  try {
    const { Gpio } = require('onoff')
    led = new Gpio(LED_PIN, 'out')
    led.writeSync(0)
    console.log(`[led] Ready on GPIO ${LED_PIN}`)
  } catch (error) {
    console.warn('[led] Not available:', error.message)
    led = null
  }
}

function flashOrderReceived() {
  if (!led) {
    console.log('[led] Skipped — GPIO not ready')
    return
  }

  console.log(`[led] ON for ${LED_ON_MS / 1000}s`)
  led.writeSync(1)

  setTimeout(() => {
    try {
      led.writeSync(0)
      console.log('[led] OFF')
    } catch (error) {
      console.error('[led] Failed to turn off:', error.message)
    }
  }, LED_ON_MS)
}

function cleanupLed() {
  if (!led) return
  try {
    led.writeSync(0)
    led.unexport()
  } catch (_) {}
  led = null
}

module.exports = {
  initLed,
  flashOrderReceived,
  cleanupLed,
}
