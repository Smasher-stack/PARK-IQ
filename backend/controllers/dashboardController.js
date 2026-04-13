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
        slot_id,
        parking_slots ( id, name, latitude, longitude, price )
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

    // 4. Total spend from parking_history
    const { data: history, error: histErr } = await supabase
      .from('parking_history')
      .select('price')
      .eq('user_id', userId);

    const totalSpent = (history || []).reduce((sum, h) => sum + parseFloat(h.price || 0), 0);

    return res.json({
      stats: {
        totalBookings: (bookings || []).length,
        totalSpent: Math.round(totalSpent),
        activeBookingCount: activeBooking ? 1 : 0,
      },
      activeBooking: activeBooking
        ? {
            id: activeBooking.id,
            parkingName: activeBooking.parking_slots?.name || 'Unknown',
            lat: activeBooking.parking_slots?.latitude,
            lng: activeBooking.parking_slots?.longitude,
            startTime: activeBooking.start_time,
            endTime: activeBooking.end_time,
            qrCode: activeBooking.qr_code,
            status: activeBooking.status,
          }
        : null,
      recentBookings: recent.map(b => ({
        id: b.id,
        parkingName: b.parking_slots?.name || `Slot #${b.slot_id}`,
        date: b.start_time,
        price: b.parking_slots?.price
          ? `₹${(parseFloat(b.parking_slots.price) * 2).toFixed(0)}`
          : '₹60',
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
    // Fetch all parking locations (in a real app filtered by owner_id)
    const { data: locations, error: locErr } = await supabase
      .from('parking_locations')
      .select('*')
      .order('id', { ascending: true });

    if (locErr) throw locErr;

    // Today's bookings count (from bookings table, status = confirmed, created today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayBookings, error: todayErr } = await supabase
      .from('bookings')
      .select('id, parking_slots ( price )')
      .gte('start_time', todayStart.toISOString())
      .eq('status', 'confirmed');

    // Total earnings from parking_history
    const { data: earningsData, error: earningsErr } = await supabase
      .from('parking_history')
      .select('price');

    const todayEarnings = (todayBookings || []).reduce(
      (sum, b) => sum + parseFloat(b.parking_slots?.price || 30) * 2,
      0
    );
    const totalEarnings = (earningsData || []).reduce(
      (sum, h) => sum + parseFloat(h.price || 0),
      0
    );

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
      bookingsToday: (todayBookings || []).length,
      activeUsers: (todayBookings || []).length,
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
