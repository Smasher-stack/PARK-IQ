// ─── Parking Routes ──────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { getAllSlots, getNearbySlots, getSlotById, createSlot, simulateDemand, reportSlot } = require('../controllers/parkingController');

// GET /api/parking       — All slots
router.get('/', getAllSlots);

// GET /api/parking/nearby — Filtered by distance
router.get('/nearby', getNearbySlots);

// GET /api/parking/:id   — Single slot
router.get('/:id', getSlotById);

// POST /api/parking      — Create new slot
router.post('/', createSlot);

// POST /api/parking/simulate — Toggle live demand simulation
router.post('/simulate', simulateDemand);

// POST /api/parking/report-slot — Crowdsourced availability update
router.post('/report-slot', reportSlot);

module.exports = router;
