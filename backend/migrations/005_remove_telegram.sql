-- Migration: 005_remove_telegram
-- Telegram alerts were removed; drop the columns added by 004.

ALTER TABLE alert_settings DROP COLUMN IF EXISTS telegram_enabled;
ALTER TABLE alert_settings DROP COLUMN IF EXISTS telegram_chat_id;
ALTER TABLE alert_settings DROP COLUMN IF EXISTS telegram_chat_name;
ALTER TABLE alert_settings DROP COLUMN IF EXISTS telegram_link_code;
ALTER TABLE alert_settings DROP COLUMN IF EXISTS telegram_link_expires;

DELETE FROM alerts WHERE channel = 'telegram';
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_channel_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_channel_check CHECK (channel IN ('email', 'slack', 'inapp'));
