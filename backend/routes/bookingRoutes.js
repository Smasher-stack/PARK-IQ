// ─── Booking Routes ──────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { createBooking, getHistory, getActiveBookings } = require('../controllers/bookingController');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/book         — Create a booking (Protected)
router.post('/', authMiddleware, createBooking);

// GET /api/history/:userId — Booking history
router.get('/history/:userId', getHistory);

// GET /api/bookings/:userId — Active bookings
router.get('/active/:userId', getActiveBookings);

module.exports = router;
