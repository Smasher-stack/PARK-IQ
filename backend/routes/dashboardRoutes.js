// ─── Dashboard Routes ─────────────────────────────────────────────────────────
// Protected routes for Driver and Owner dashboard data.

const express = require('express');
const router = express.Router();
const { getUserDashboard, getOwnerDashboard } = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/authMiddleware');

// GET /api/dashboard/user — Driver dashboard stats (auth required)
router.get('/user', authMiddleware, getUserDashboard);

// GET /api/dashboard/owner — Owner dashboard data (auth required)
router.get('/owner', authMiddleware, getOwnerDashboard);

module.exports = router;
