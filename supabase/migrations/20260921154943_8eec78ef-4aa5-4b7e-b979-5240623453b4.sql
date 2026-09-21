CREATE TABLE public.mirror_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  event text NOT NULL,
  device text NOT NULL DEFAULT 'kiosk',
  kiosk text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX mirror_events_created_at_idx ON public.mirror_events (created_at DESC);
CREATE INDEX mirror_events_event_idx ON public.mirror_events (event);
CREATE INDEX mirror_events_session_idx ON public.mirror_events (session_id);

GRANT SELECT, INSERT ON public.mirror_events TO anon;
GRANT SELECT, INSERT ON public.mirror_events TO authenticated;
GRANT ALL ON public.mirror_events TO service_role;

ALTER TABLE public.mirror_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can log an anonymous event"
  ON public.mirror_events FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anyone can read anonymous stats"
  ON public.mirror_events FOR SELECT TO anon, authenticated
  USING (true);