-- Migration: 003_operations
-- Real orbit data on twins, persisted conjunction events, CDMs, alerting, mission timestamps.
-- Idempotent: safe to run on databases that already have some of these objects.

-- ---- Real orbit data (NORAD-linked or operator-supplied TLE) ----
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS norad_id INTEGER;
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS tle_line1 TEXT;
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS tle_line2 TEXT;
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS tle_epoch TIMESTAMP;
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS tle_source VARCHAR(20);
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS tle_updated_at TIMESTAMP;
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS last_screened_at TIMESTAMP;

ALTER TABLE spacecraft DROP CONSTRAINT IF EXISTS spacecraft_tle_source_check;
ALTER TABLE spacecraft ADD CONSTRAINT spacecraft_tle_source_check
  CHECK (tle_source IS NULL OR tle_source IN ('celestrak', 'manual', 'spacetrack'));

CREATE INDEX IF NOT EXISTS idx_spacecraft_norad ON spacecraft(norad_id) WHERE is_deleted = false;

-- ---- Missions: lifecycle timestamps ----
ALTER TABLE missions ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

-- ---- Conjunction events (from screening runs and from CDMs) ----
CREATE TABLE IF NOT EXISTS conjunction_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_key VARCHAR(200) UNIQUE NOT NULL,
  spacecraft_id UUID NOT NULL REFERENCES spacecraft(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_id VARCHAR(40) NOT NULL,
  object_name VARCHAR(200),
  source VARCHAR(20) NOT NULL DEFAULT 'screening' CHECK (source IN ('screening', 'cdm')),
  tca TIMESTAMP NOT NULL,
  miss_km DOUBLE PRECISION NOT NULL,
  rel_speed_kms DOUBLE PRECISION,
  pc DOUBLE PRECISION,
  pc_method VARCHAR(80),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('nominal', 'warning', 'critical')),
  max_severity VARCHAR(20) NOT NULL DEFAULT 'nominal' CHECK (max_severity IN ('nominal', 'warning', 'critical')),
  data JSONB NOT NULL DEFAULT '{}',
  first_seen TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conj_events_sc_tca ON conjunction_events(spacecraft_id, tca DESC);
CREATE INDEX IF NOT EXISTS idx_conj_events_user ON conjunction_events(user_id, last_seen DESC);

-- ---- Conjunction Data Messages (uploaded or pulled from Space-Track) ----
CREATE TABLE IF NOT EXISTS cdms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spacecraft_id UUID NOT NULL REFERENCES spacecraft(id) ON DELETE CASCADE,
  cdm_id VARCHAR(120) NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('upload', 'spacetrack')),
  tca TIMESTAMP NOT NULL,
  object_id VARCHAR(40),
  object_name VARCHAR(200),
  miss_km DOUBLE PRECISION,
  pc_reported DOUBLE PRECISION,
  pc_foster DOUBLE PRECISION,
  pc_note TEXT,
  parsed JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (spacecraft_id, cdm_id)
);
CREATE INDEX IF NOT EXISTS idx_cdms_sc_tca ON cdms(spacecraft_id, tca DESC);

-- ---- Alerting ----
CREATE TABLE IF NOT EXISTS alert_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  email_to VARCHAR(200),
  slack_enabled BOOLEAN NOT NULL DEFAULT false,
  slack_webhook_url TEXT,
  min_severity VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (min_severity IN ('warning', 'critical')),
  screening_interval_hours INTEGER NOT NULL DEFAULT 6 CHECK (screening_interval_hours BETWEEN 1 AND 48),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  event_id UUID REFERENCES conjunction_events(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'slack', 'inapp')),
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(300) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_user_created ON alerts(user_id, created_at DESC);
