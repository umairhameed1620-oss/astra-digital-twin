-- Migration: 004_telegram
-- Telegram alert channel: per-user chat linked through a one-time /start code.

ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(40);
ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS telegram_chat_name VARCHAR(200);
ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(40);
ALTER TABLE alert_settings ADD COLUMN IF NOT EXISTS telegram_link_expires TIMESTAMP;

ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_channel_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_channel_check CHECK (channel IN ('email', 'slack', 'telegram', 'inapp'));
