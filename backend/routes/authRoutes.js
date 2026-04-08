// ─── User Routes ─────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const { register, login, getProfile } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/users/register — Create account
router.post('/register', register);

// POST /api/users/login    — Authenticate
router.post('/login', login);

// GET  /api/users/profile  — Protected: get logged-in user
router.get('/profile', authMiddleware, getProfile);

module.exports = router;
