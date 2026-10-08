CREATE TABLE public.debug_timings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('kiosk','server')),
  kind text NOT NULL CHECK (kind IN ('step','ai','ping','server_ai')),
  label text NOT NULL CHECK (char_length(label) <= 80),
  ms integer CHECK (ms >= 0 AND ms < 3600000),
  session_id text CHECK (char_length(session_id) <= 80),
  kiosk text CHECK (char_length(kiosk) <= 60),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(meta) < 2000)
);
GRANT INSERT ON public.debug_timings TO anon, authenticated;
GRANT SELECT, DELETE ON public.debug_timings TO authenticated;
GRANT ALL ON public.debug_timings TO service_role;
ALTER TABLE public.debug_timings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kiosk can write timings" ON public.debug_timings FOR INSERT TO anon, authenticated WITH CHECK (source = 'kiosk');
CREATE POLICY "Admins read timings" ON public.debug_timings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins clear timings" ON public.debug_timings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX debug_timings_created_idx ON public.debug_timings (created_at DESC);
ALTER TABLE public.kiosk_commands DROP CONSTRAINT IF EXISTS kiosk_commands_command_check;
ALTER TABLE public.kiosk_commands ADD CONSTRAINT kiosk_commands_command_check CHECK (command IN ('refresh','reset_experience','test_ai','ping'));