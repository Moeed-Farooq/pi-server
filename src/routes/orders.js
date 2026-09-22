const express = require('express')
const { startOrder, listOrders } = require('../controllers/ordersController')

const router = express.Router()

// POST /api/orders/start — receive order/equipment start from the store app
router.post('/start', startOrder)

// GET /api/orders — list all stored orders (for verification)
router.get('/', listOrders)

module.exports = router
