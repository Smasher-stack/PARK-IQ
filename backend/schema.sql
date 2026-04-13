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


-- ─── 2. PARKING LOCATIONS TABLE ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS parking_locations (
  id              BIGSERIAL PRIMARY KEY,
  owner_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL, -- 'public' | 'residential'
  area            TEXT        NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  total_slots     INT         NOT NULL DEFAULT 0,
  available_slots INT         NOT NULL DEFAULT 0,
  price_per_hour  NUMERIC(8,2) DEFAULT 0,
  vehicle_type    TEXT        DEFAULT 'car',
  image_url       TEXT
);

-- Index for owner lookups
CREATE INDEX IF NOT EXISTS idx_parking_locations_owner ON parking_locations(owner_id);


-- ─── 3. BOOKINGS TABLE ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parking_id  BIGINT      NOT NULL REFERENCES parking_locations(id) ON DELETE CASCADE,
  start_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time    TIMESTAMPTZ NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0,
  qr_code     TEXT,
  status      TEXT        DEFAULT 'confirmed',         -- 'confirmed' | 'completed' | 'cancelled'
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for user and parking lookups
CREATE INDEX IF NOT EXISTS idx_bookings_user    ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_parking ON bookings(parking_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);


-- ─── 4. ROW LEVEL SECURITY (RLS) ────────────────────────────────────────────
-- Using service-role key bypasses RLS, but enable it for future anon access.

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings          ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (already the default, but explicit is better)
CREATE POLICY "Service role full access" ON users             FOR ALL USING (true);
CREATE POLICY "Service role full access" ON parking_locations FOR ALL USING (true);
CREATE POLICY "Service role full access" ON bookings          FOR ALL USING (true);
