const { appendOrder, readOrders } = require('../storage/orderStorage')
const { flashOrderReceived } = require('../services/ledService')

const REQUIRED_FIELDS = ['orderId', 'equipmentId']

const startOrder = (req, res) => {
  try {
    const payload = req.body

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be a JSON object',
      })
    }

    const missing = REQUIRED_FIELDS.filter(
      (field) =>
        payload[field] === undefined ||
        payload[field] === null ||
        payload[field] === ''
    )

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      })
    }

    console.log('========== ORDER RECEIVED FROM MOBILE APP ==========')
    console.log('Time:           ', new Date().toISOString())
    console.log('orderId:        ', payload.orderId)
    console.log('equipmentId:    ', payload.equipmentId)
    console.log('equipmentName:  ', payload.equipmentName)
    console.log('serviceId:      ', payload.serviceId)
    console.log('shopId:         ', payload.shopId)
    console.log('status:         ', payload.status)
    console.log('token:          ', payload.token)
    console.log('startedBy:      ', payload.startedBy)
    console.log('startedAt:      ', payload.startedAt)
    console.log('source:         ', payload.source)
    console.log('Full payload JSON:')
    console.log(JSON.stringify(payload, null, 2))
    console.log('====================================================')

    const stored = appendOrder(payload)

    // Light the LED for 5 seconds
    flashOrderReceived()

    return res.status(200).json({
      success: true,
      message: 'Order data received',
      data: {
        orderId: stored.orderId,
        receivedAt: stored.receivedAt,
      },
    })
  } catch (error) {
    console.error('[ordersController] startOrder error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to store order data',
    })
  }
}

const listOrders = (_req, res) => {
  try {
    const orders = readOrders()
    return res.status(200).json({
      success: true,
      message: 'Orders retrieved',
      data: orders,
      count: orders.length,
    })
  } catch (error) {
    console.error('[ordersController] listOrders error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to read orders',
    })
  }
}

module.exports = {
  startOrder,
  listOrders,
}
