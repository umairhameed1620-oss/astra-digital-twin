-- Migration: 008_teams_2fa_oem
-- Team accounts (organisations sharing a fleet), two-factor login, operator ephemerides (CCSDS OEM).

-- ---- Organisations ----
CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  require_2fa BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS org_role VARCHAR(20) NOT NULL DEFAULT 'owner'
  CHECK (org_role IN ('owner', 'admin', 'engineer', 'viewer'));

-- Every existing user becomes the owner of their own team (viewers stay read-only).
DO $$
DECLARE u RECORD; oid UUID;
BEGIN
  FOR u IN SELECT id, name, organisation, role FROM users WHERE organisation_id IS NULL LOOP
    INSERT INTO organisations (name) VALUES (COALESCE(NULLIF(TRIM(u.organisation), ''), u.name || '''s team')) RETURNING id INTO oid;
    UPDATE users SET organisation_id = oid, org_role = CASE WHEN u.role = 'viewer' THEN 'viewer' ELSE 'owner' END WHERE id = u.id;
  END LOOP;
END $$;
ALTER TABLE users ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organisation_id);

-- Shared data belongs to the organisation; user_id stays as "created by".
ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id);
UPDATE spacecraft s SET organisation_id = u.organisation_id FROM users u WHERE u.id = s.user_id AND s.organisation_id IS NULL;
ALTER TABLE spacecraft ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spacecraft_org ON spacecraft(organisation_id) WHERE is_deleted = false;

ALTER TABLE missions ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id);
UPDATE missions m SET organisation_id = u.organisation_id FROM users u WHERE u.id = m.user_id AND m.organisation_id IS NULL;
ALTER TABLE missions ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missions_org ON missions(organisation_id);

ALTER TABLE validation_runs ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id);
UPDATE validation_runs v SET organisation_id = u.organisation_id FROM users u WHERE u.id = v.user_id AND v.organisation_id IS NULL;
ALTER TABLE validation_runs ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_validation_runs_org ON validation_runs(organisation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'engineer', 'viewer')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  revoked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organisation_id);

-- ---- Two-factor authentication (TOTP, RFC 6238) ----
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;          -- AES-256-GCM encrypted
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret TEXT;  -- during setup, encrypted
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;     -- replay protection
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes JSONB NOT NULL DEFAULT '[]'; -- sha256 hashes, single use
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMP;

-- ---- Operator ephemerides (CCSDS OEM), stored converted to TEME ----
CREATE TABLE IF NOT EXISTS ephemerides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spacecraft_id UUID NOT NULL REFERENCES spacecraft(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  object_name VARCHAR(200),
  object_id VARCHAR(60),
  source_frame VARCHAR(20) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  stop_time TIMESTAMP NOT NULL,
  points INTEGER NOT NULL,
  states JSONB NOT NULL,      -- { t:[ms], r:[[x,y,z]...], v:[[vx,vy,vz]...] } TEME, km, km/s
  covariance JSONB,           -- [{ t, rtn: [[3x3]] km^2 }] position covariance in RTN, if provided
  is_active BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_ephemerides_sc ON ephemerides(spacecraft_id, created_at DESC) WHERE is_active;
