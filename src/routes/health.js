const express = require('express')

const router = express.Router()

// GET /api/health
router.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Raspberry Pi server is running',
  })
})

module.exports = router
