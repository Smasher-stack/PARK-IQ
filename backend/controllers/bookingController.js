// ─── Booking Controller ──────────────────────────────────────────────────────
// Handles creating bookings and fetching booking history.

const supabase = require('../config/supabaseClient');
const { generateQR } = require('../services/qrService');

const fs = require('fs');
const path = require('path');

// POST /api/book — Create a new booking
async function createBooking(req, res) {
  try {
    const { id, user_id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing slot id.' });
    }
    
    if (!user_id) {
      return res.status(401).json({ error: 'User must be authenticated.' });
    }

    let slot = null;
    let isOffline = false;

    // 1. Fetch the slot
    try {
      const { data, error: slotErr } = await supabase
        .from('parking_locations')
        .select('*')
        .eq('id', parseInt(id, 10))
        .single();

      if (slotErr || !data) throw slotErr || new Error("Not found");
      slot = data;
    } catch (dbErr) {
      // OFFLINE FALLBACK
      isOffline = true;
      const dataPath = path.join(__dirname, '..', '..', 'data', 'data.json');
      if (fs.existsSync(dataPath)) {
        const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        slot = rawData.find(s => s.id === parseInt(id, 10));
      }
    }

    if (!slot) {
      return res.status(404).json({ error: 'Slot not found.' });
    }

    const availableSlots = slot.availableSlots !== undefined ? slot.availableSlots : slot.available_slots;
    const totalSlots = slot.totalSlots !== undefined ? slot.totalSlots : slot.total_slots;
    const price = slot.price !== undefined ? slot.price : (slot.price_per_hour || 30);

    if (availableSlots <= 0) {
      return res.status(400).json({ error: 'No available slots. Lot is full.' });
    }

    // 2. Decrement available slots (if online)
    if (!isOffline) {
      await supabase
        .from('parking_locations')
        .update({ available_slots: availableSlots - 1 })
        .eq('id', slot.id);
    }

    // 3. Create booking record
    const now = new Date();
    const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours

    const bookingId = `BK${Date.now()}`;
    const startTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const endTimeStr = endTime.toISOString().replace('T', ' ').substring(0, 19);

    const durationHours = 2;
    const totalPrice = price * durationHours;

    if (!isOffline) {
      try {
        // Insert booking
        const { data: booking, error: bookErr } = await supabase
          .from('bookings')
          .insert({
            user_id: user_id,
            parking_id: slot.id,
            price: totalPrice,
            start_time: now.toISOString(),
            end_time: endTime.toISOString(),
            status: 'confirmed',
            qr_code: bookingId
          })
          .select()
          .single();

        if (bookErr) throw bookErr;

      } catch (insertErr) {
        console.error("DB Insert bypassed:", insertErr.message);
      }
    }

    // 4. Generate QR code
    const qrBase64 = await generateQR({
      booking_id: bookingId,
      parking_name: slot.name,
      start_time: startTimeStr,
      end_time: endTimeStr,
    });

    // 7. Response matching frontend expectations
    return res.json({
      success: true,
      message: 'Booking confirmed',
      qr: qrBase64,
      slot: {
        id: slot.id,
        name: slot.name,
        lat: slot.lat || slot.latitude,
        lng: slot.lng || slot.longitude,
        status: 'booked',
        availableSlots: availableSlots - 1,
        totalSlots: totalSlots,
      },
      booking: {
        booking_id: bookingId,
        parking_name: slot.name,
        in_time: startTimeStr,
        valid_till: endTimeStr,
      },
      _offline: isOffline
    });
  } catch (err) {
    console.error('createBooking error:', err.message);
    return res.status(500).json({ error: 'Booking failed. Please try again.' });
  }
}

// GET /api/history/:userId — Get booking history for a user
async function getHistory(req, res) {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        price,
        start_time,
        end_time,
        created_at,
        parking_locations (
          id,
          name,
          lat,
          lng
        )
      `)
      .eq('user_id', userId)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform for backwards compatibility with frontend expectation
    const transformed = (data || []).map(b => {
      // Calculate duration manually if historical format expected
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      let durationHours = (end - start) / (1000 * 60 * 60);

      // Provide fallback alias `parking_slots`
      return {
        id: b.id,
        price: b.price,
        duration: durationHours,
        created_at: b.created_at,
        parking_slots: {
          id: b.parking_locations?.id,
          name: b.parking_locations?.name,
          latitude: b.parking_locations?.lat,
          longitude: b.parking_locations?.lng
        }
      };
    });

    return res.json(transformed);
  } catch (err) {
    console.error('getHistory error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch history.' });
  }
}

// GET /api/bookings/:userId — Get active bookings for a user
async function getActiveBookings(req, res) {
  try {
    const { userId } = req.params;

    const { data, error } = await supabase
      .from('bookings')
      .select(`
        id,
        start_time,
        end_time,
        status,
        qr_code,
        parking_locations (
          id,
          name,
          lat,
          lng
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('start_time', { ascending: false });

    if (error) throw error;

    const transformed = (data || []).map(b => ({
      ...b,
      parking_slots: {
         id: b.parking_locations?.id,
         name: b.parking_locations?.name,
         latitude: b.parking_locations?.lat,
         longitude: b.parking_locations?.lng
      }
    }));

    return res.json(transformed);
  } catch (err) {
    console.error('getActiveBookings error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
}

module.exports = { createBooking, getHistory, getActiveBookings };
