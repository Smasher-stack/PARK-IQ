// ─── Parking Routes ──────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { getAllSlots, getNearbySlots, getSlotById, createSlot, simulateDemand, reportSlot } = require('../controllers/parkingController');
const { calculateRoute } = require('../services/routeService');

/**
 * @swagger
 * /api/parking:
 *   get:
 *     summary: Get all parking slots
 *     tags: [Parking]
 *     responses:
 *       200:
 *         description: Array of all parking locations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ParkingSlot'
 */
router.get('/', getAllSlots);

/**
 * @swagger
 * /api/parking/nearby:
 *   get:
 *     summary: Get nearby parking ranked by intelligence score
 *     tags: [Parking]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         example: 12.9249
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         example: 80.1100
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 3
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Ranked parking results with scores and ETA
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ParkingSlot'
 */
router.get('/nearby', getNearbySlots);

/**
 * @swagger
 * /api/parking/route:
 *   post:
 *     summary: Calculate driving route between two points
 *     tags: [Routing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RouteRequest'
 *           example:
 *             start: { lat: 12.9249, lng: 80.1100 }
 *             end: { lat: 12.9516, lng: 80.1462 }
 *     responses:
 *       200:
 *         description: GeoJSON route with distance and duration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RouteResponse'
 *       500:
 *         description: Routing failed
 */
router.post('/route', async (req, res) => {
  try {
    const { start, end } = req.body;

    if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
      return res.status(400).json({ success: false, error: 'start and end with lat/lng are required.' });
    }

    const route = await calculateRoute(start, end);

    return res.json({
      success: true,
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      bbox: route.bbox,
      snappedStart: route.snappedStart,
      snappedEnd: route.snappedEnd
    });
  } catch (err) {
    console.error('Route calculation error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/parking/{id}:
 *   get:
 *     summary: Get a single parking slot by ID
 *     tags: [Parking]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Single parking slot details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ParkingSlot'
 *       404:
 *         description: Slot not found
 */
router.get('/:id', getSlotById);

/**
 * @swagger
 * /api/parking:
 *   post:
 *     summary: Create a new parking slot (admin)
 *     tags: [Parking]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *               total_slots:
 *                 type: integer
 *               price:
 *                 type: number
 *               type:
 *                 type: string
 *     responses:
 *       201:
 *         description: Slot created
 */
router.post('/', createSlot);

// POST /api/parking/simulate — Toggle live demand simulation
router.post('/simulate', simulateDemand);

// POST /api/parking/report-slot — Crowdsourced availability update
router.post('/report-slot', reportSlot);

module.exports = router;
