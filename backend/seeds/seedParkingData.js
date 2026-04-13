// ─── ParkIQ Seed Script: Chromepet & Tambaram ────────────────────────────────
// Generates and inserts 50 realistic parking locations (Public & Residential)
// Usage: node backend/seeds/seedParkingData.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Init Supabase
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

// Realistic Data for Chromepet, Tambaram, Pallavaram, Sanatorium
const parkingData = [
  // ─── PUBLIC PARKING (25) ───
  { id: 1, name: "Chromepet Railway Station Parking", type: "public", area: "Chromepet", lat: 12.9516, lng: 80.1462, total_slots: 80, available_slots: 35, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 2, name: "Chromepet Bus Stand Lot", type: "public", area: "Chromepet", lat: 12.9530, lng: 80.1448, total_slots: 100, available_slots: 42, price_per_hour: 15, vehicle_type: "motorcycle", image_url: "" },
  { id: 3, name: "MIT Gate Surface Parking", type: "public", area: "Chromepet", lat: 12.9485, lng: 80.1402, total_slots: 40, available_slots: 15, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 4, name: "Kumaran Kundram Temple Lot", type: "public", area: "Chromepet", lat: 12.9460, lng: 80.1418, total_slots: 30, available_slots: 10, price_per_hour: 10, vehicle_type: "car", image_url: "" },
  { id: 5, name: "Saravana Stores Parking", type: "public", area: "Chromepet", lat: 12.9505, lng: 80.1435, total_slots: 150, available_slots: 85, price_per_hour: 30, vehicle_type: "car", image_url: "" },
  { id: 6, name: "Tambaram Railway Station East", type: "public", area: "Tambaram", lat: 12.9230, lng: 80.1130, total_slots: 200, available_slots: 120, price_per_hour: 20, vehicle_type: "motorcycle", image_url: "" },
  { id: 7, name: "Tambaram Railway Station West", type: "public", area: "Tambaram", lat: 12.9255, lng: 80.1085, total_slots: 180, available_slots: 60, price_per_hour: 25, vehicle_type: "car", image_url: "" },
  { id: 8, name: "Tambaram MEPZ Parking", type: "public", area: "Tambaram", lat: 12.9365, lng: 80.1170, total_slots: 300, available_slots: 150, price_per_hour: 40, vehicle_type: "car", image_url: "" },
  { id: 9, name: "Hindu Mission Hospital Parking", type: "public", area: "Tambaram", lat: 12.9280, lng: 80.1115, total_slots: 50, available_slots: 20, price_per_hour: 30, vehicle_type: "car", image_url: "" },
  { id: 10, name: "Tambaram Sanatorium Station", type: "public", area: "Sanatorium", lat: 12.9405, lng: 80.1337, total_slots: 90, available_slots: 45, price_per_hour: 15, vehicle_type: "motorcycle", image_url: "" },
  { id: 11, name: "TB Hospital Visitor Lot", type: "public", area: "Sanatorium", lat: 12.9388, lng: 80.1350, total_slots: 40, available_slots: 30, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 12, name: "Pallavaram Railway Station", type: "public", area: "Pallavaram", lat: 12.9682, lng: 80.1496, total_slots: 110, available_slots: 40, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 13, name: "Pallavaram Cantonment Board", type: "public", area: "Pallavaram", lat: 12.9710, lng: 80.1550, total_slots: 35, available_slots: 18, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 14, name: "Pallavaram Friday Market", type: "public", area: "Pallavaram", lat: 12.9650, lng: 80.1420, total_slots: 200, available_slots: 50, price_per_hour: 20, vehicle_type: "motorcycle", image_url: "" },
  { id: 15, name: "Vels University Public Lot", type: "public", area: "Pallavaram", lat: 12.9590, lng: 80.1565, total_slots: 60, available_slots: 25, price_per_hour: 30, vehicle_type: "car", image_url: "" },
  { id: 16, name: "Chennai Airport Metro Parking", type: "public", area: "Pallavaram", lat: 12.9790, lng: 80.1630, total_slots: 250, available_slots: 130, price_per_hour: 50, vehicle_type: "car", image_url: "" },
  { id: 17, name: "Chitlapakkam Lake View Lot", type: "public", area: "Chitlapakkam", lat: 12.9330, lng: 80.1380, total_slots: 25, available_slots: 12, price_per_hour: 10, vehicle_type: "car", image_url: "" },
  { id: 18, name: "Varadharaja Theatre Parking", type: "public", area: "Chitlapakkam", lat: 12.9360, lng: 80.1345, total_slots: 75, available_slots: 30, price_per_hour: 25, vehicle_type: "motorcycle", image_url: "" },
  { id: 19, name: "Vettri Theatres Complex", type: "public", area: "Chromepet", lat: 12.9510, lng: 80.1420, total_slots: 120, available_slots: 40, price_per_hour: 35, vehicle_type: "car", image_url: "" },
  { id: 20, name: "Grand Galada Mall", type: "public", area: "Pallavaram", lat: 12.9705, lng: 80.1585, total_slots: 400, available_slots: 210, price_per_hour: 50, vehicle_type: "car", image_url: "" },
  { id: 21, name: "Chromepet GH Parking", type: "public", area: "Chromepet", lat: 12.9525, lng: 80.1475, total_slots: 60, available_slots: 20, price_per_hour: 10, vehicle_type: "motorcycle", image_url: "" },
  { id: 22, name: "Sri Sairam Campus Lot", type: "public", area: "Tambaram", lat: 12.9430, lng: 80.1140, total_slots: 150, available_slots: 90, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 23, name: "Madras Christian College", type: "public", area: "Tambaram", lat: 12.9200, lng: 80.1190, total_slots: 80, available_slots: 40, price_per_hour: 20, vehicle_type: "motorcycle", image_url: "" },
  { id: 24, name: "Tambaram Bus Terminus", type: "public", area: "Tambaram", lat: 12.9235, lng: 80.1110, total_slots: 130, available_slots: 50, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 25, name: "Hasthinapuram Bus Stand", type: "public", area: "Chromepet", lat: 12.9450, lng: 80.1520, total_slots: 45, available_slots: 25, price_per_hour: 15, vehicle_type: "motorcycle", image_url: "" },

  // ─── RESIDENTIAL PARKING (25) ───
  { id: 26, name: "Radha Nagar House Parking", type: "residential", area: "Chromepet", lat: 12.9541, lng: 80.1415, total_slots: 2, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 27, name: "Nehru Nagar Garage", type: "residential", area: "Chromepet", lat: 12.9575, lng: 80.1380, total_slots: 1, available_slots: 1, price_per_hour: 10, vehicle_type: "motorcycle", image_url: "" },
  { id: 28, name: "Anna Nagar Ext Driveway", type: "residential", area: "Chromepet", lat: 12.9520, lng: 80.1360, total_slots: 3, available_slots: 2, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 29, name: "New Colony Residence", type: "residential", area: "Chromepet", lat: 12.9560, lng: 80.1450, total_slots: 2, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 30, name: "Purushotham Nagar Home", type: "residential", area: "Chromepet", lat: 12.9480, lng: 80.1455, total_slots: 1, available_slots: 0, price_per_hour: 15, vehicle_type: "motorcycle", image_url: "" },
  { id: 31, name: "Tambaram West Villa", type: "residential", area: "Tambaram", lat: 12.9224, lng: 80.1060, total_slots: 2, available_slots: 2, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 32, name: "Krishna Nagar Apartment", type: "residential", area: "Tambaram", lat: 12.9195, lng: 80.1020, total_slots: 4, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 33, name: "Lakshmipuram Private Lot", type: "residential", area: "Tambaram", lat: 12.9260, lng: 80.1005, total_slots: 3, available_slots: 3, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 34, name: "Irumbuliyur House Portico", type: "residential", area: "Tambaram", lat: 12.9150, lng: 80.1050, total_slots: 1, available_slots: 1, price_per_hour: 10, vehicle_type: "motorcycle", image_url: "" },
  { id: 35, name: "Selaiyur Independent House", type: "residential", area: "Tambaram", lat: 12.9180, lng: 80.1350, total_slots: 2, available_slots: 1, price_per_hour: 18, vehicle_type: "car", image_url: "" },
  { id: 36, name: "Camp Road Residential", type: "residential", area: "Tambaram", lat: 12.9140, lng: 80.1420, total_slots: 1, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 37, name: "Mahalakshmi Nagar Slot", type: "residential", area: "Tambaram", lat: 12.9110, lng: 80.1280, total_slots: 2, available_slots: 0, price_per_hour: 20, vehicle_type: "motorcycle", image_url: "" },
  { id: 38, name: "Poondi Bazaar Backyard", type: "residential", area: "Tambaram", lat: 12.9285, lng: 80.1165, total_slots: 3, available_slots: 2, price_per_hour: 12, vehicle_type: "motorcycle", image_url: "" },
  { id: 39, name: "Chitlapakkam South Street", type: "residential", area: "Chitlapakkam", lat: 12.9348, lng: 80.1363, total_slots: 2, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 40, name: "Sembakkam Gate Driveway", type: "residential", area: "Chitlapakkam", lat: 12.9300, lng: 80.1450, total_slots: 1, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 41, name: "Zamin Pallavaram House", type: "residential", area: "Pallavaram", lat: 12.9620, lng: 80.1480, total_slots: 2, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 42, name: "Keelkattalai Safe Park", type: "residential", area: "Pallavaram", lat: 12.9550, lng: 80.1680, total_slots: 3, available_slots: 2, price_per_hour: 18, vehicle_type: "car", image_url: "" },
  { id: 43, name: "Rajendra Nagar Porch", type: "residential", area: "Pallavaram", lat: 12.9690, lng: 80.1520, total_slots: 1, available_slots: 1, price_per_hour: 12, vehicle_type: "motorcycle", image_url: "" },
  { id: 44, name: "Sanatorium East Street", type: "residential", area: "Sanatorium", lat: 12.9420, lng: 80.1355, total_slots: 2, available_slots: 2, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 45, name: "Sanatorium West Home", type: "residential", area: "Sanatorium", lat: 12.9410, lng: 80.1310, total_slots: 1, available_slots: 0, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 46, name: "Hasthinapuram Backlane", type: "residential", area: "Chromepet", lat: 12.9440, lng: 80.1490, total_slots: 1, available_slots: 1, price_per_hour: 10, vehicle_type: "motorcycle", image_url: "" },
  { id: 47, name: "Pammal Main Road House", type: "residential", area: "Pallavaram", lat: 12.9730, lng: 80.1380, total_slots: 3, available_slots: 1, price_per_hour: 20, vehicle_type: "car", image_url: "" },
  { id: 48, name: "Anakaputhur Villa", type: "residential", area: "Pallavaram", lat: 12.9770, lng: 80.1300, total_slots: 2, available_slots: 2, price_per_hour: 15, vehicle_type: "car", image_url: "" },
  { id: 49, name: "Peerkankaranai Home", type: "residential", area: "Tambaram", lat: 12.9090, lng: 80.0980, total_slots: 1, available_slots: 1, price_per_hour: 12, vehicle_type: "car", image_url: "" },
  { id: 50, name: "Perungalathur Driveway", type: "residential", area: "Tambaram", lat: 12.9030, lng: 80.0930, total_slots: 2, available_slots: 1, price_per_hour: 15, vehicle_type: "car", image_url: "" }
];

async function runSeed() {
  console.log('🔄 Starting parking data seed...');

  const restUrl = `${url}/rest/v1/parking_locations`;

  // Fetch existing records to prevent duplicates efficiently
  try {
    const fetchExisting = await fetch(`${restUrl}?select=id`, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });

    if (!fetchExisting.ok) {
        const errText = await fetchExisting.text();
        if (fetchExisting.status === 404 || errText.includes('42P01') || errText.includes('PGRST205')) {
          console.error("\n❌ The table 'parking_locations' does not exist in your Supabase database!");
          console.log("\n⚠️ Please run the following SQL command in your Supabase SQL Editor:");
          console.log(`
CREATE TABLE parking_locations (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('public', 'residential')),
  area TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  total_slots INT NOT NULL DEFAULT 0,
  available_slots INT NOT NULL DEFAULT 0,
  price_per_hour NUMERIC(8,2) DEFAULT 0,
  vehicle_type TEXT DEFAULT 'car',
  image_url TEXT
);
          `);
        } else {
          console.error("❌ Could not read from parking_locations table:", fetchExisting.status, errText);
        }
        process.exit(1);
    }

    const existingRecords = await fetchExisting.json();
    const existingIds = new Set((existingRecords || []).map(r => r.id));
    const recordsToInsert = parkingData.filter(r => !existingIds.has(r.id));

    if (recordsToInsert.length === 0) {
      console.log("✅ Seeding already complete. All records exist.");
      process.exit(0);
    }

    // Bulk Insert
    const insertReq = await fetch(restUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(recordsToInsert)
    });

    if (!insertReq.ok) {
      const errInsert = await insertReq.text();
      console.error("❌ Bulk insert failed:", insertReq.status, errInsert);
      process.exit(1);
    }

    console.log(`✅ Seeding Complete! Inserted: ${recordsToInsert.length}, Skipped: ${parkingData.length - recordsToInsert.length}`);
    process.exit(0);

  } catch (error) {
    console.error("❌ Fetch failed entirely. Check your network or VPN:", error.message);
    process.exit(1);
  }
}

runSeed();
