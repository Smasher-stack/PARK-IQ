-- ─── 1. EXTEND parking_locations ─────────────────────────
ALTER TABLE parking_locations 
ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id);

-- ─── 2. EXTEND bookings ────────────────────────────────────
-- Add new columns
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS parking_id BIGINT REFERENCES parking_locations(id),
ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Ensure user_id isn't null. (Clean up any NULLs first, or set to an existing dummy user if this fails)
-- If there are rows where user_id is NULL, this will fail. Let's delete them to clean up or set them if known.
DELETE FROM bookings WHERE user_id IS NULL;
ALTER TABLE bookings ALTER COLUMN user_id SET NOT NULL;

-- ─── 3. DATA MIGRATION ─────────────────────────────────────
-- Migrate any remaining booking logic mapping (If slot_id exists in parking_locations, copy it over)
UPDATE bookings SET parking_id = slot_id WHERE parking_id IS NULL AND slot_id IS NOT NULL;

-- Migrate parking_history to bookings natively (If past data needs preserving)
-- By converting them to completed bookings.
INSERT INTO bookings (user_id, parking_id, start_time, end_time, price, status, created_at)
SELECT 
  h.user_id, 
  h.slot_id, 
  h.created_at - (h.duration || ' hours')::interval, -- Calculate start time back from created_at
  h.created_at, -- end time
  h.price, 
  'completed', 
  h.created_at
FROM parking_history h
-- Avoid duplicates if already run
WHERE NOT EXISTS (
  SELECT 1 FROM bookings b WHERE b.user_id = h.user_id AND b.parking_id = h.slot_id AND b.price = h.price AND b.end_time = h.created_at
);

-- ─── 4. CLEANUP ────────────────────────────────────────────
-- Drop slot_id from bookings
ALTER TABLE bookings DROP COLUMN IF EXISTS slot_id;

-- Drop obsolete tables safely
DROP TABLE IF EXISTS parking_history;
DROP TABLE IF EXISTS parking_slots;
