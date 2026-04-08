// ─── Booking Controller ──────────────────────────────────────────────────────
// Handles creating bookings and fetching booking history.

const supabase = require('../config/supabaseClient');
const { generateQR } = require('../services/qrService');

// POST /api/book — Create a new booking
async function createBooking(req, res) {
  try {
    const { id, user_id } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing slot id.' });
    }

    // 1. Fetch the slot
    const { data: slot, error: slotErr } = await supabase
      .from('parking_slots')
      .select('*')
      .eq('id', parseInt(id, 10))
      .single();

    if (slotErr || !slot) {
      return res.status(404).json({ error: 'Slot not found.' });
    }

    if (slot.available_slots <= 0) {
      return res.status(400).json({ error: 'No available slots. Lot is full.' });
    }

    // 2. Decrement available slots
    const { error: updateErr } = await supabase
      .from('parking_slots')
      .update({ available_slots: slot.available_slots - 1 })
      .eq('id', slot.id);

    if (updateErr) throw updateErr;

    // 3. Create booking record
    const now = new Date();
    const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 hours

    const bookingId = `BK${Date.now()}`;
    const startTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);
    const endTimeStr = endTime.toISOString().replace('T', ' ').substring(0, 19);

    const bookingRecord = {
      user_id: user_id || null,
      slot_id: slot.id,
      start_time: now.toISOString(),
      end_time: endTime.toISOString(),
      status: 'confirmed',
      qr_code: bookingId, // Will be updated with QR data
    };

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert(bookingRecord)
      .select()
      .single();

    if (bookErr) throw bookErr;

    // 4. Generate QR code
    const qrBase64 = await generateQR({
      booking_id: bookingId,
      parking_name: slot.name,
      start_time: startTimeStr,
      end_time: endTimeStr,
    });

    // 5. Update booking with QR data
    await supabase
      .from('bookings')
      .update({ qr_code: bookingId })
      .eq('id', booking.id);

    // 6. Log to parking_history
    const durationHours = 2;
    await supabase.from('parking_history').insert({
      user_id: user_id || null,
      slot_id: slot.id,
      duration: durationHours,
      price: (slot.price || 0) * durationHours,
    });

    // 7. Response matching frontend expectations
    return res.json({
      success: true,
      message: 'Booking confirmed',
      qr: qrBase64,
      slot: {
        id: slot.id,
        name: slot.name,
        lat: slot.latitude,
        lng: slot.longitude,
        status: 'booked',
        availableSlots: slot.available_slots - 1,
        totalSlots: slot.total_slots,
      },
      booking: {
        booking_id: bookingId,
        parking_name: slot.name,
        in_time: startTimeStr,
        valid_till: endTimeStr,
      },
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
      .from('parking_history')
      .select(`
        id,
        duration,
        price,
        created_at,
        parking_slots (
          id,
          name,
          latitude,
          longitude
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.json(data);
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
        parking_slots (
          id,
          name,
          latitude,
          longitude
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .order('start_time', { ascending: false });

    if (error) throw error;

    return res.json(data);
  } catch (err) {
    console.error('getActiveBookings error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
}

module.exports = { createBooking, getHistory, getActiveBookings };
