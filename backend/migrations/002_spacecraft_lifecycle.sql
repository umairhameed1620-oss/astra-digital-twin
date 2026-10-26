-- Migration: 002_spacecraft_lifecycle
-- Adds a mission lifecycle to spacecraft: designed -> launched -> operational -> decommissioned
-- Keeps 'simulating' (used by the simulation engine) and 'archived' (used by soft delete).
-- Safe to run more than once.

ALTER TABLE spacecraft DROP CONSTRAINT IF EXISTS spacecraft_status_check;

ALTER TABLE spacecraft
  ADD CONSTRAINT spacecraft_status_check
  CHECK (status IN ('designed', 'launched', 'operational', 'simulating', 'decommissioned', 'archived'));
