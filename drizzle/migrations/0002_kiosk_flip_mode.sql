ALTER TABLE public.kiosk_status ADD COLUMN IF NOT EXISTS flip_mode text NOT NULL DEFAULT 'auto' CHECK (flip_mode IN ('auto','on','off'));
ALTER TABLE public.kiosk_status ADD COLUMN IF NOT EXISTS orientation text;
ALTER TABLE public.kiosk_status ADD COLUMN IF NOT EXISTS flipped boolean NOT NULL DEFAULT false;