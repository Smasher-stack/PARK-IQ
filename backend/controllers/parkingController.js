// ─── Parking Controller ──────────────────────────────────────────────────────
// Handles fetching parking data from Supabase (parking_locations table).

const supabase = require('../config/supabaseClient');
const { getDistanceKm } = require('../utils/geoUtils');
const { rankParkingSlots } = require('../services/intelligenceService');

const fs = require('fs');
const path = require('path');

// GET /api/parking — Return all parking locations
async function getAllSlots(req, res) {
  try {
    const { data, error } = await supabase
      .from('parking_locations')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    // Map DB column names to the format the frontend expects
    const slots = data.map(row => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      status: deriveStatus(row.available_slots, row.total_slots),
      availableSlots: row.available_slots,
      totalSlots: row.total_slots,
      type: row.type,
      price: row.price_per_hour,
    }));

    return res.json(slots);
  } catch (err) {
    if (!err.message.includes('fetch failed')) {
      console.error('getAllSlots error:', err.message);
    }
    
    // Offline fallback
    try {
        const dataPath = path.join(__dirname, '..', '..', 'data', 'data.json');
        const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        
        const offlineSlots = rawData.map(slot => ({
          id: slot.id,
          name: slot.name,
          lat: slot.lat,
          lng: slot.lng,
          status: deriveStatus(slot.availableSlots || slot.available_slots, slot.totalSlots || slot.total_slots),
          availableSlots: slot.availableSlots || slot.available_slots || 0,
          totalSlots: slot.totalSlots || slot.total_slots || 0,
          type: slot.type || 'public',
          price: slot.price || slot.price_per_hour || 30,
        }));
        
        return res.json(offlineSlots);
    } catch (fsErr) {
        return res.status(500).json({ error: 'Failed to fetch parking slots.' });
    }
  }
}

// GET /api/parking/nearby?lat=X&lng=Y&radius=3&preference=fastest
async function getNearbySlots(req, res) {
  try {
    const { lat, lng, radius = 3, limit = 10, preference = 'smart' } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng query params are required.' });
    }

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxLimit = parseInt(limit, 10);

    const { data, error } = await supabase
      .from('parking_locations')
      .select('*');

    if (error) throw error;

    // Map to standard format before scoring
    const standardFormat = data.map(row => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      status: deriveStatus(row.available_slots, row.total_slots),
      availableSlots: row.available_slots,
      totalSlots: row.total_slots,
      type: row.type,
      price: row.price_per_hour,
    }));

    // Pass through the Intelligence Service scoring engine
    const rankedCandidates = await rankParkingSlots(standardFormat, userLat, userLng, { preference });
    const topMatches = rankedCandidates.slice(0, maxLimit);

    return res.json(topMatches);
  } catch (err) {
      if (!err.message.includes('fetch failed')) console.error('getNearbySlots error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch nearby slots.' });
  }
}

// GET /api/parking/:id — Return a single parking location
async function getSlotById(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('parking_locations')
      .select('*')
      .eq('id', parseInt(id, 10))
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Slot not found.' });
    }

    const slot = {
      id: data.id,
      name: data.name,
      lat: data.lat,
      lng: data.lng,
      status: deriveStatus(data.available_slots, data.total_slots),
      availableSlots: data.available_slots,
      totalSlots: data.total_slots,
      type: data.type,
      price: data.price_per_hour,
    };

    return res.json(slot);
  } catch (err) {
    if (!err.message.includes('fetch failed')) console.error('getSlotById error:', err.message);
    
    // Offline fallback
    try {
        const { id } = req.params;
        const dataPath = path.join(__dirname, '..', '..', 'data', 'data.json');
        const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        
        const slotData = rawData.find(s => s.id === parseInt(id, 10));
        if (!slotData) return res.status(404).json({ error: 'Slot not found.' });

        const slot = {
          id: slotData.id,
          name: slotData.name,
          lat: slotData.lat,
          lng: slotData.lng,
          status: deriveStatus(slotData.availableSlots || slotData.available_slots, slotData.totalSlots || slotData.total_slots),
          availableSlots: slotData.availableSlots || slotData.available_slots || 0,
          totalSlots: slotData.totalSlots || slotData.total_slots || 0,
          type: slotData.type || 'public',
          price: slotData.price || slotData.price_per_hour || 30,
        };
        
        return res.json(slot);
    } catch (fsErr) {
        return res.status(500).json({ error: 'Failed to fetch slot.' });
    }
  }
}

// POST /api/parking — Create a new parking location
async function createSlot(req, res) {
  try {
    const { name, lat, lng, total_slots, price_per_hour, type } = req.body;

    if (!name || !lat || !lng || total_slots === undefined) {
      return res.status(400).json({ error: 'Missing required parking slot fields.' });
    }

    const { data: maxData } = await supabase
      .from('parking_locations')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    
    const newId = (maxData && maxData.length > 0) ? maxData[0].id + 1 : 1;

    const newSlot = {
      id: newId,
      name,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      total_slots: parseInt(total_slots, 10),
      available_slots: parseInt(total_slots, 10),
      price_per_hour: price_per_hour ? parseFloat(price_per_hour) : 30.00,
      type: type || 'public',
      vehicle_type: 'car'
    };

    const { data, error } = await supabase
      .from('parking_locations')
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

// ─── Live Simulation & Crowdsource ─────────────────────────────────────────

let simulationTimer = null;

// POST /api/parking/simulate — Toggles a living demand simulation
async function simulateDemand(req, res) {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
    return res.status(200).json({ message: "Traffic simulation halted.", active: false });
  }

  simulationTimer = setInterval(async () => {
    try {
      const { data, error } = await supabase
        .from('parking_locations')
        .select('id, available_slots, total_slots')
        .limit(15);
      if (error || !data) return;

      for (const slot of data) {
        const delta = Math.floor(Math.random() * 5) - 2;
        let newAvail = slot.available_slots + delta;
        if (newAvail < 0) newAvail = 0;
        if (newAvail > slot.total_slots) newAvail = slot.total_slots;
        
        await supabase.from('parking_locations').update({ available_slots: newAvail }).eq('id', slot.id);
      }
    } catch (e) {
      if (!e.message.includes('fetch failed')) {
        console.error("Simulation Tick Error", e.message || e);
      }
    }
  }, 15000);

  return res.status(200).json({ message: "Living Traffic Simulation Engaged.", active: true });
}

// POST /api/parking/report-slot — Crowdsourced updates
async function reportSlot(req, res) {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ error: "Missing slot ID or status" });

  try {
    const { data: slot, error: fetchErr } = await supabase
      .from('parking_locations')
      .select('available_slots, total_slots')
      .eq('id', id)
      .single();
    if (fetchErr) throw fetchErr;

    let newAvail = slot.available_slots;
    if (status === 'full') newAvail = 0;
    else if (status === 'available') {
      newAvail = Math.min(slot.available_slots + 3, slot.total_slots);
    }

    const { error: upErr } = await supabase
      .from('parking_locations')
      .update({ available_slots: newAvail })
      .eq('id', id);
    if (upErr) throw upErr;

    return res.status(200).json({ success: true, message: `Slot ${id} updated to ${newAvail}` });
  } catch (err) {
    console.error('reportSlot error:', err.message);
    return res.status(500).json({ error: 'Failed to process crowdsourced report.' });
  }
}

module.exports = { getAllSlots, getNearbySlots, getSlotById, createSlot, simulateDemand, reportSlot };
