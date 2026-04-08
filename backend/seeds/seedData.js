// ─── Seed Script ─────────────────────────────────────────────────────────────
// Reads data/data.json and inserts all parking slots into Supabase.
// Run with: npm run seed

require('dotenv').config();

const supabase = require('../config/supabaseClient');
const fs = require('fs');
const path = require('path');

async function seed() {
  console.log('🌱 Seeding parking_slots table...\n');

  const dataPath = path.join(__dirname, '..', '..', 'data', 'data.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error('❌ data/data.json not found at:', dataPath);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // Map JSON fields to DB column names
  const rows = rawData.map(slot => ({
    id: slot.id,
    name: slot.name,
    latitude: slot.lat,
    longitude: slot.lng,
    total_slots: slot.totalSlots,
    available_slots: slot.availableSlots,
    type: 'public',
    price: 30,   // Default ₹30/hr
  }));

  // Upsert (insert or update) so this script is idempotent
  const { data, error } = await supabase
    .from('parking_slots')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`✅ Successfully seeded ${rows.length} parking slots.`);
  process.exit(0);
}

seed();
