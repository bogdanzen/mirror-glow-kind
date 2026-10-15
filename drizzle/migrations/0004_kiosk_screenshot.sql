ALTER TABLE public.kiosk_commands DROP CONSTRAINT kiosk_commands_command_check;
ALTER TABLE public.kiosk_commands ADD CONSTRAINT kiosk_commands_command_check CHECK (command = ANY (ARRAY['refresh','reset_experience','test_ai','ping','screenshot']));
ALTER TABLE public.kiosk_status ADD COLUMN IF NOT EXISTS screenshot text, ADD COLUMN IF NOT EXISTS screenshot_at timestamptz;