-- Migration: 006_validation
-- Validation runs: ASTRA's own prediction compared with each CDM issued for the same pair of objects.

ALTER TABLE spacecraft ADD COLUMN IF NOT EXISTS alerts_muted BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS validation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual', 'scheduled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  summary JSONB NOT NULL DEFAULT '{}',
  rows JSONB NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_validation_runs_user ON validation_runs(user_id, created_at DESC);
