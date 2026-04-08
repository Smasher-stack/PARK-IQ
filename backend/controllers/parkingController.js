// ─── Parking Controller ──────────────────────────────────────────────────────
// Handles fetching parking slot data from Supabase.

const supabase = require('../config/supabaseClient');
const { getDistanceKm } = require('../utils/geoUtils');

// GET /api/parking — Return all parking slots
async function getAllSlots(req, res) {
  try {
    const { data, error } = await supabase
      .from('parking_slots')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    // Map DB column names to the format the frontend expects
    const slots = data.map(row => ({
      id: row.id,
      name: row.name,
      lat: row.latitude,
      lng: row.longitude,
      status: deriveStatus(row.available_slots, row.total_slots),
      availableSlots: row.available_slots,
      totalSlots: row.total_slots,
      type: row.type,
      price: row.price,
    }));

    return res.json(slots);
  } catch (err) {
    console.error('getAllSlots error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch parking slots.' });
  }
}

// GET /api/parking/nearby?lat=X&lng=Y&radius=3
async function getNearbySlots(req, res) {
  try {
    const { lat, lng, radius = 3, limit = 10 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query params are required.' });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxRadius = parseFloat(radius);
    const maxLimit = parseInt(limit, 10);

    const { data, error } = await supabase
      .from('parking_slots')
      .select('*');

    if (error) throw error;

    // Filter + sort by distance server-side
    let nearby = data
      .map(row => ({
        id: row.id,
        name: row.name,
        lat: row.latitude,
        lng: row.longitude,
        status: deriveStatus(row.available_slots, row.total_slots),
        availableSlots: row.available_slots,
        totalSlots: row.total_slots,
        type: row.type,
        price: row.price,
        distance: getDistanceKm(userLat, userLng, row.latitude, row.longitude),
      }))
      .filter(slot => slot.distance <= maxRadius)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxLimit);

    // Fallback: if nothing within radius, return closest 5
    if (nearby.length === 0) {
      nearby = data
        .map(row => ({
          id: row.id,
          name: row.name,
          lat: row.latitude,
          lng: row.longitude,
          status: deriveStatus(row.available_slots, row.total_slots),
          availableSlots: row.available_slots,
          totalSlots: row.total_slots,
          type: row.type,
          price: row.price,
          distance: getDistanceKm(userLat, userLng, row.latitude, row.longitude),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);
    }

    return res.json(nearby);
  } catch (err) {
    console.error('getNearbySlots error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch nearby slots.' });
  }
}

// GET /api/parking/:id — Return a single parking slot
async function getSlotById(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('parking_slots')
      .select('*')
      .eq('id', parseInt(id, 10))
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Slot not found.' });
    }

    const slot = {
      id: data.id,
      name: data.name,
      lat: data.latitude,
      lng: data.longitude,
      status: deriveStatus(data.available_slots, data.total_slots),
      availableSlots: data.available_slots,
      totalSlots: data.total_slots,
      type: data.type,
      price: data.price,
    };

    return res.json(slot);
  } catch (err) {
    console.error('getSlotById error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch slot.' });
  }
}

// POST /api/parking — Create a new parking slot
async function createSlot(req, res) {
  try {
    const { name, latitude, longitude, total_slots, price, type } = req.body;

    if (!name || !latitude || !longitude || total_slots === undefined) {
      return res.status(400).json({ error: 'Missing required parking slot fields.' });
    }

    // Auto-generate ID or let Supabase handle if it's serial. Assume we need to find max ID since it's `INT`
    const { data: maxData } = await supabase.from('parking_slots').select('id').order('id', { ascending: false }).limit(1);
    const newId = (maxData && maxData.length > 0) ? maxData[0].id + 1 : 1;

    const newSlot = {
      id: newId,
      name,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      total_slots: parseInt(total_slots, 10),
      available_slots: parseInt(total_slots, 10), // Initially all available
      price: price ? parseFloat(price) : 30.00,
      type: type || 'public'
    };

    const { data, error } = await supabase
      .from('parking_slots')
      .insert(newSlot)
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error('createSlot error:', err.message);
    return res.status(500).json({ error: 'Failed to create parking slot.' });
  }
}

// Helper: derive status string from availability numbers
function deriveStatus(available, total) {
  if (available === 0) return 'booked';
  if (available <= Math.ceil(total * 0.15)) return 'limited';
  return 'available';
}

// ─── Massive Scale Extensions ──────────────────────────────────────────────────

let simulationTimer = null;

// POST /api/parking/simulate — Toggles a living background loop mapping variable capacity
async function simulateDemand(req, res) {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
    return res.status(200).json({ message: "Traffic simulation halted.", active: false });
  }

  // Engage Living Traffic Algorithm every 15 seconds
  simulationTimer = setInterval(async () => {
    try {
      const { data, error } = await supabase.from('parking_slots').select('id, available_slots, total_slots').limit(15);
      if (error || !data) return;

      for (const slot of data) {
        // Randomly modify availability simulating people leaving/arriving
        const delta = Math.floor(Math.random() * 5) - 2; // -2 to +2
        let newAvail = slot.available_slots + delta;
        
        if (newAvail < 0) newAvail = 0;
        if (newAvail > slot.total_slots) newAvail = slot.total_slots;
        
        await supabase.from('parking_slots').update({ available_slots: newAvail }).eq('id', slot.id);
      }
    } catch (e) {
      console.error("Simulation Tick Error", e);
    }
  }, 15000);

  return res.status(200).json({ message: "Living Traffic Simulation Engaged.", active: true });
}

// POST /api/parking/report-slot — Crowdsourced updates
async function reportSlot(req, res) {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ error: "Missing slot ID or status" });

  try {
    const { data: slot, error: fetchErr } = await supabase.from('parking_slots').select('available_slots, total_slots').eq('id', id).single();
    if (fetchErr) throw fetchErr;

    let newAvail = slot.available_slots;
    if (status === 'full') newAvail = 0;
    else if (status === 'available') {
      newAvail = Math.min(slot.available_slots + 3, slot.total_slots);
    }

    const { error: upErr } = await supabase.from('parking_slots').update({ available_slots: newAvail }).eq('id', id);
    if (upErr) throw upErr;

    return res.status(200).json({ success: true, message: `Slot ${id} updated to ${newAvail}` });
  } catch (err) {
    console.error('reportSlot error:', err.message);
    return res.status(500).json({ error: 'Failed to process crowdsourced report.' });
  }
}

module.exports = { getAllSlots, getNearbySlots, getSlotById, createSlot, simulateDemand, reportSlot };
