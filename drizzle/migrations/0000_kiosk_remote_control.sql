CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TABLE public.kiosk_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  last_seen timestamptz NOT NULL DEFAULT now(),
  current_screen text NOT NULL DEFAULT 'attract',
  camera_ok boolean NOT NULL DEFAULT false,
  ai_ok boolean NOT NULL DEFAULT false,
  ai_latency_ms integer,
  last_ai_success_at timestamptz,
  last_error text,
  app_version text NOT NULL DEFAULT 'principal',
  user_agent text,
  viewport text,
  session_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiosk_status TO authenticated;
GRANT ALL ON public.kiosk_status TO service_role;
ALTER TABLE public.kiosk_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage kiosk status"
ON public.kiosk_status FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.kiosk_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id uuid REFERENCES public.kiosk_status(id) ON DELETE CASCADE NOT NULL,
  command text NOT NULL CHECK (command IN ('refresh', 'reset_experience', 'test_ai')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  result text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiosk_commands TO authenticated;
GRANT ALL ON public.kiosk_commands TO service_role;
ALTER TABLE public.kiosk_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage kiosk commands"
ON public.kiosk_commands FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX kiosk_status_last_seen_idx ON public.kiosk_status (last_seen DESC);
CREATE INDEX kiosk_commands_pending_idx ON public.kiosk_commands (kiosk_id, created_at DESC) WHERE acknowledged_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.kiosk_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kiosk_commands;