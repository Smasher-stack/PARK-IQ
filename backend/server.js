// ─── ParkIQ Backend Server ───────────────────────────────────────────────────
// Express server with Supabase integration, CORS, and modular routing.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Swagger API Documentation ──────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ParkIQ API Docs'
}));

// ─── Serve Frontend Static Files ─────────────────────────────────────────────
// Serves the frontend directory so the app works as a single deployment unit
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── API Routes ──────────────────────────────────────────────────────────────
const parkingRoutes = require('./routes/parkingRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const authRoutes = require('./routes/authRoutes');

app.use('/api/parking', parkingRoutes);
app.use('/api/slots', parkingRoutes);      // Alias: frontend currently calls /api/slots
app.use('/api/book', bookingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/history', require('./routes/bookingRoutes')); // Alias for history
app.use('/api/dashboard', require('./routes/dashboardRoutes')); // Driver + Owner Dashboard

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── SPA Fallback ────────────────────────────────────────────────────────────
// For any route not matched by API or static files, serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'map.html'));
});

// ─── Start Server ────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n  🅿️  ParkIQ Backend running on http://localhost:${PORT}`);
  console.log(`  📚 Swagger API Docs: http://localhost:${PORT}/api-docs`);
  console.log(`  📡 API endpoints:`);
  console.log(`     GET  /api/parking`);
  console.log(`     GET  /api/parking/nearby?lat=X&lng=Y`);
  console.log(`     POST /api/parking/route`);
  console.log(`     GET  /api/parking/:id`);
  console.log(`     POST /api/book`);
  console.log(`     GET  /api/history/:userId`);
  console.log(`     POST /api/auth/register`);
  console.log(`     POST /api/auth/login`);
  console.log(`     GET  /api/auth/profile  (auth required)\n`);
});

// Graceful error handling
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ❌ Port ${PORT} is already in use.`);
    console.error(`  💡 Run this to fix: taskkill /F /IM node.exe\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

module.exports = app;
