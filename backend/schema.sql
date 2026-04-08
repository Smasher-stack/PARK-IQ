-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  ParkIQ — Supabase Database Schema                                          ║
-- ║  Run these statements in the Supabase SQL Editor (Dashboard → SQL Editor)   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ─── 1. USERS TABLE ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  vehicle_type  TEXT        DEFAULT 'car',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Index for fast login lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- ─── 2. PARKING SLOTS TABLE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parking_slots (
  id              INT PRIMARY KEY,
  name            TEXT        NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  total_slots     INT         NOT NULL DEFAULT 0,
  available_slots INT         NOT NULL DEFAULT 0,
  type            TEXT        DEFAULT 'public',       -- 'public' | 'residential'
  price           NUMERIC(8,2) DEFAULT 30.00          -- price per hour in ₹
);


-- ─── 3. BOOKINGS TABLE ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  slot_id     INT         NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
  start_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time    TIMESTAMPTZ NOT NULL,
  qr_code     TEXT,
  status      TEXT        DEFAULT 'confirmed'         -- 'confirmed' | 'completed' | 'cancelled'
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_bookings_user   ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_slot   ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);


-- ─── 4. PARKING HISTORY TABLE ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parking_history (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  slot_id     INT         NOT NULL REFERENCES parking_slots(id) ON DELETE CASCADE,
  duration    NUMERIC(6,2) NOT NULL DEFAULT 0,         -- hours
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,        -- total cost in ₹
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_user ON parking_history(user_id);


-- ─── 5. ROW LEVEL SECURITY (RLS) ────────────────────────────────────────────
-- Using service-role key bypasses RLS, but enable it for future anon access.

ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_slots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_history ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (already the default, but explicit is better)
CREATE POLICY "Service role full access" ON users           FOR ALL USING (true);
CREATE POLICY "Service role full access" ON parking_slots   FOR ALL USING (true);
CREATE POLICY "Service role full access" ON bookings        FOR ALL USING (true);
CREATE POLICY "Service role full access" ON parking_history FOR ALL USING (true);
