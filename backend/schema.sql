-- ASTRA Database Schema
-- Run this in PostgreSQL to set up the database

CREATE DATABASE astradb;

\c astradb;

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  organisation VARCHAR(255),
  role VARCHAR(50) DEFAULT 'engineer',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Spacecraft twins table
CREATE TABLE spacecraft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('satellite', 'rocket', 'space_station', 'rover')),
  description TEXT,
  status VARCHAR(50) DEFAULT 'design' CHECK (status IN ('design', 'simulation', 'active', 'decommissioned')),
  mission_profile JSONB DEFAULT '{}',
  orbital_parameters JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Spacecraft components table
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  category VARCHAR(100) NOT NULL CHECK (category IN ('power', 'propulsion', 'thermal', 'comms', 'attitude_control', 'structure', 'payload', 'navigation')),
  specifications JSONB DEFAULT '{}',
  mass_kg DECIMAL(10,4) DEFAULT 0,
  power_consumption_w DECIMAL(10,4) DEFAULT 0,
  power_generation_w DECIMAL(10,4) DEFAULT 0,
  position_x DECIMAL(10,4) DEFAULT 0,
  position_y DECIMAL(10,4) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'nominal',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Telemetry data table
CREATE TABLE telemetry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT NOW(),
  subsystem VARCHAR(100) NOT NULL,
  parameter VARCHAR(100) NOT NULL,
  value DECIMAL(15,6) NOT NULL,
  unit VARCHAR(50),
  status VARCHAR(50) DEFAULT 'nominal' CHECK (status IN ('nominal', 'warning', 'critical'))
);

-- Mission events log
CREATE TABLE mission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  description TEXT,
  severity VARCHAR(50) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Simulation runs table
CREATE TABLE simulation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255),
  type VARCHAR(100) NOT NULL,
  parameters JSONB DEFAULT '{}',
  results JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Fault injection scenarios
CREATE TABLE fault_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spacecraft_id UUID REFERENCES spacecraft(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_component VARCHAR(255) NOT NULL,
  fault_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) DEFAULT 'minor' CHECK (severity IN ('minor', 'major', 'catastrophic')),
  parameters JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_spacecraft_user ON spacecraft(user_id);
CREATE INDEX idx_components_spacecraft ON components(spacecraft_id);
CREATE INDEX idx_telemetry_spacecraft ON telemetry(spacecraft_id);
CREATE INDEX idx_telemetry_timestamp ON telemetry(timestamp);
CREATE INDEX idx_mission_events_spacecraft ON mission_events(spacecraft_id);
CREATE INDEX idx_simulation_runs_spacecraft ON simulation_runs(spacecraft_id);

-- Insert default component library templates
INSERT INTO users (email, password_hash, full_name, organisation, role) VALUES
('admin@astra.space', '$2a$12$placeholder', 'ASTRA Admin', 'ASTRA Platform', 'admin');
