-- ASTRA Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  organisation VARCHAR(150),
  role VARCHAR(50) DEFAULT 'engineer',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Spacecraft
CREATE TABLE IF NOT EXISTS spacecraft (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('satellite', 'rocket', 'station', 'rover')),
  description TEXT,
  components JSONB DEFAULT '[]',
  config JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'designed' CHECK (status IN ('designed', 'simulating', 'archived')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Missions
CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE SET NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  objectives JSONB DEFAULT '[]',
  timeline JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'aborted')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Telemetry Logs
CREATE TABLE IF NOT EXISTS telemetry_logs (
  id BIGSERIAL PRIMARY KEY,
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Fault Events
CREATE TABLE IF NOT EXISTS fault_events (
  id BIGSERIAL PRIMARY KEY,
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  fault_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  description TEXT,
  injected_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- AI Chat History
CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_spacecraft_user ON spacecraft(user_id);
CREATE INDEX IF NOT EXISTS idx_missions_user ON missions(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_spacecraft ON telemetry_logs(spacecraft_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_logs(timestamp);

