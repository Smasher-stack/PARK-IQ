// ─── Booking Routes ──────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { createBooking, getHistory, getActiveBookings } = require('../controllers/bookingController');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * @swagger
 * /api/book:
 *   post:
 *     summary: Create a parking booking
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BookingRequest'
 *           example:
 *             slotId: 1
 *             duration: 2
 *             vehicleNumber: "TN 07 AB 1234"
 *     responses:
 *       201:
 *         description: Booking confirmed
 *       401:
 *         description: Unauthorized
 */
router.post('/', authMiddleware, createBooking);

/**
 * @swagger
 * /api/history/{userId}:
 *   get:
 *     summary: Get booking history for a user
 *     tags: [Booking]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         example: "user-uuid-123"
 *     responses:
 *       200:
 *         description: Array of past bookings
 */
router.get('/history/:userId', getHistory);

/**
 * @swagger
 * /api/bookings/active/{userId}:
 *   get:
 *     summary: Get active bookings for a user
 *     tags: [Booking]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of active bookings
 */
router.get('/active/:userId', getActiveBookings);

module.exports = router;
