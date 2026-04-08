require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { faker } = require('@faker-js/faker');
const supabase = require('../config/supabaseClient');

const CHENNAI_CENTER = { lat: 13.0827, lng: 80.2707 };
const TOTAL_LOCATIONS = 350;

// Random coordinate generator around a center (approx bounds)
function generateRandomCoord(center, maxDistanceKm) {
  const r_earth = 6371;
  const dy = (Math.random() - 0.5) * 2 * maxDistanceKm;
  const dx = (Math.random() - 0.5) * 2 * maxDistanceKm;
  const new_lat = center.lat + (dy / r_earth) * (180 / Math.PI);
  const new_lng = center.lng + (dx / r_earth) * (180 / Math.PI) / Math.cos(center.lat * Math.PI / 180);
  return { lat: parseFloat(new_lat.toFixed(5)), lng: parseFloat(new_lng.toFixed(5)) };
}

async function seedSyntheticData() {
  console.log(`🚀 Generating ${TOTAL_LOCATIONS} synthetic parking slots for ParkIQ...`);
  
  const slots = [];
  
  // Starting ID sequentially from 100 so it doesn't collide with existing seeded 1-30 IDs
  let currentId = 100;

  for (let i = 0; i < TOTAL_LOCATIONS; i++) {
    // Determine type realistically
    const typeRoll = Math.random();
    const type = typeRoll > 0.8 ? 'residential' : 'public';
    
    // Bounds: 12km max spread across the city
    const coords = generateRandomCoord(CHENNAI_CENTER, 12);
    
    // Calculate realistic volume pricing and sizing
    const tSlots = faker.number.int({ min: 10, max: 150 });
    const aSlots = faker.number.int({ min: 0, max: tSlots });
    const pValue = faker.helpers.arrayElement([20.00, 30.00, 40.00, 50.00, 75.00, 100.00]);

    // Name generation
    const prefix = faker.location.street();
    const suffix = type === 'public' ? faker.helpers.arrayElement(['Plaza', 'Mall Parking', 'Lot', 'Garage', 'Center']) : 'Street Parking';
    
    slots.push({
      id: currentId++,
      name: `${prefix} ${suffix}`,
      latitude: coords.lat,
      longitude: coords.lng,
      total_slots: tSlots,
      available_slots: aSlots,
      type: type,
      price: pValue
    });
  }

  // Break array into chunks of 100 to prevent Supabase payload rejections
  const chunkSize = 100;
  for (let i = 0; i < slots.length; i += chunkSize) {
    const chunk = slots.slice(i, i + chunkSize);
    const { error } = await supabase.from('parking_slots').upsert(chunk, { onConflict: 'id' });
    
    if (error) {
      console.error('❌ Error executing Supabase payload chunk:', error.message);
    } else {
      console.log(`✅ Uploaded chunk ${Math.ceil(i/chunkSize) + 1}/${Math.ceil(slots.length/chunkSize)}`);
    }
  }

  console.log('🎉 Synthetic data generation complete! ParkIQ scaled successfully.');
}

seedSyntheticData();
