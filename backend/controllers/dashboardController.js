// ─── Dashboard Controller ─────────────────────────────────────────────────────
// Provides aggregated data for Driver + Owner dashboard views.

const supabase = require('../config/supabaseClient');

// ─── DRIVER DASHBOARD ────────────────────────────────────────────────────────
// GET /api/dashboard/user  (requires auth)
async function getUserDashboard(req, res) {
  const userId = req.user.id;

  try {
    // 1. All bookings for this user (from bookings table)
    const { data: bookings, error: bookErr } = await supabase
      .from('bookings')
      .select(`
        id,
        start_time,
        end_time,
        status,
        qr_code,
        parking_id,
        price,
        parking_locations ( id, name, lat, lng, price_per_hour )
      `)
      .eq('user_id', userId)
      .order('start_time', { ascending: false });

    if (bookErr) throw bookErr;

    const now = new Date();

    // 2. Derive active booking (end_time in future AND status = 'confirmed')
    const activeBooking = (bookings || []).find(b =>
      b.status === 'confirmed' && new Date(b.end_time) > now
    ) || null;

    // 3. Recent 5 (skip the active one in the list if it's also in recent)
    const recent = (bookings || []).slice(0, 5);

    // 4. Total spend from all bookings
    const totalSpent = (bookings || []).reduce((sum, b) => sum + parseFloat(b.price || 0), 0);

    return res.json({
      stats: {
        totalBookings: (bookings || []).length,
        totalSpent: Math.round(totalSpent),
        activeBookingCount: activeBooking ? 1 : 0,
      },
      activeBooking: activeBooking
        ? {
            id: activeBooking.id,
            parkingName: activeBooking.parking_locations?.name || 'Unknown',
            lat: activeBooking.parking_locations?.lat,
            lng: activeBooking.parking_locations?.lng,
            startTime: activeBooking.start_time,
            endTime: activeBooking.end_time,
            qrCode: activeBooking.qr_code,
            status: activeBooking.status,
          }
        : null,
      recentBookings: recent.map(b => ({
        id: b.id,
        parkingName: b.parking_locations?.name || `Parking #${b.parking_id}`,
        date: b.start_time,
        price: b.price
          ? `₹${Math.round(parseFloat(b.price))}`
          : '₹0',
        status: b.status,
      })),
    });
  } catch (err) {
    if (!err.message.includes('fetch failed')) {
      console.error('getUserDashboard error:', err.message);
    }
    // Graceful offline response
    return res.json({
      stats: { totalBookings: 0, totalSpent: 0, activeBookingCount: 0 },
      activeBooking: null,
      recentBookings: [],
      _offline: true,
    });
  }
}

// ─── OWNER DASHBOARD ─────────────────────────────────────────────────────────
// GET /api/dashboard/owner  (requires auth)
async function getOwnerDashboard(req, res) {
  try {
    const userId = req.user.id;

    // Fetch all parking locations OWNED by this user
    const { data: locations, error: locErr } = await supabase
      .from('parking_locations')
      .select('*')
      .eq('owner_id', userId)
      .order('id', { ascending: true });

    if (locErr) throw locErr;

    const locationIds = (locations || []).map(loc => loc.id);

    if (locationIds.length === 0) {
      return res.json({
        parkingSpaces: [],
        bookingsToday: 0,
        activeUsers: 0,
        earnings: { today: 0, total: 0 },
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch all bookings for these locations to separate today vs total
    const { data: ownerBookings, error: ownerBookErr } = await supabase
      .from('bookings')
      .select('id, price, start_time, status')
      .in('parking_id', locationIds)
      .in('status', ['confirmed', 'completed']);

    if (ownerBookErr) throw ownerBookErr;

    const todayBookings = (ownerBookings || []).filter(
      b => new Date(b.start_time) >= todayStart
    );

    const todayEarnings = todayBookings.reduce(
      (sum, b) => sum + parseFloat(b.price || 0),
      0
    );
    const totalEarnings = (ownerBookings || []).reduce(
      (sum, b) => sum + parseFloat(b.price || 0),
      0
    );

    // Active Users (simplified) approx equal to today's bookings
    const activeUsers = new Set(todayBookings.map(b => b.id)).size;

    return res.json({
      parkingSpaces: (locations || []).map(loc => ({
        id: loc.id,
        name: loc.name,
        totalSlots: loc.total_slots,
        availableSlots: loc.available_slots,
        price: loc.price_per_hour,
        type: loc.type,
        area: loc.area,
        active: true,
      })),
      bookingsToday: todayBookings.length,
      activeUsers: activeUsers,
      earnings: {
        today: Math.round(todayEarnings),
        total: Math.round(totalEarnings),
      },
    });
  } catch (err) {
    if (!err.message.includes('fetch failed')) {
      console.error('getOwnerDashboard error:', err.message);
    }
    return res.json({
      parkingSpaces: [],
      bookingsToday: 0,
      activeUsers: 0,
      earnings: { today: 0, total: 0 },
      _offline: true,
    });
  }
}

module.exports = { getUserDashboard, getOwnerDashboard };
