-- Migration: 001_initial_schema
-- ASTRA Enterprise Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  organisation VARCHAR(150),
  role VARCHAR(20) NOT NULL DEFAULT 'engineer' CHECK (role IN ('admin', 'engineer', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Spacecraft
CREATE TABLE IF NOT EXISTS spacecraft (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('satellite', 'rocket', 'station', 'rover')),
  description TEXT,
  components JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'designed' CHECK (status IN ('designed', 'simulating', 'archived')),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Missions
CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  objectives JSONB NOT NULL DEFAULT '[]',
  timeline JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'aborted')),
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Telemetry logs (partitioned by time for scale)
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id BIGSERIAL PRIMARY KEY,
  spacecraft_id UUID NOT NULL REFERENCES spacecraft(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  anomalies JSONB NOT NULL DEFAULT '[]',
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Fault events
CREATE TABLE IF NOT EXISTS fault_events (
  id BIGSERIAL PRIMARY KEY,
  spacecraft_id UUID NOT NULL REFERENCES spacecraft(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  fault_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'major' CHECK (severity IN ('minor', 'major', 'critical')),
  description TEXT,
  injected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- AI conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  session_id UUID NOT NULL DEFAULT uuid_generate_v4(),
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'aria')),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id VARCHAR(100),
  details JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Refresh tokens (managed in Redis, this is for admin visibility)
CREATE TABLE IF NOT EXISTS refresh_token_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  ip_address INET
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_spacecraft_user ON spacecraft(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_spacecraft_status ON spacecraft(status) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_spacecraft_type ON spacecraft(type) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_missions_user ON missions(user_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_missions_spacecraft ON missions(spacecraft_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_spacecraft ON telemetry_logs(spacecraft_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_spacecraft ON ai_conversations(spacecraft_id);
CREATE INDEX IF NOT EXISTS idx_fault_events_spacecraft ON fault_events(spacecraft_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_spacecraft_updated_at BEFORE UPDATE ON spacecraft FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_missions_updated_at BEFORE UPDATE ON missions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
