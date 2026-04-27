
-- ============== ENUMS ==============
CREATE TYPE public.app_role AS ENUM ('admin', 'member');
CREATE TYPE public.analysis_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE public.conversion_type AS ENUM ('form', 'whatsapp', 'cta_button', 'thank_you_page', 'phone', 'email', 'other');
CREATE TYPE public.priority_level AS ENUM ('low', 'medium', 'high');

-- ============== UPDATED_AT FUNCTION ==============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== USER ROLES ==============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
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

CREATE POLICY "Users can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============== CLIENTS ==============
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view clients"
  ON public.clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team members can create clients"
  ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team members can update clients"
  ON public.clients FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete clients"
  ON public.clients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== ANALYSES ==============
CREATE TABLE public.analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status public.analysis_status NOT NULL DEFAULT 'pending',
  page_title TEXT,
  summary TEXT,
  measurement_plan JSONB,
  raw_metadata JSONB,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view analyses"
  ON public.analyses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team members can create analyses"
  ON public.analyses FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Team members can update analyses"
  ON public.analyses FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete analyses"
  ON public.analyses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_analyses_updated_at
  BEFORE UPDATE ON public.analyses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_analyses_client ON public.analyses(client_id);
CREATE INDEX idx_analyses_created_at ON public.analyses(created_at DESC);

-- ============== CONVERSION POINTS ==============
CREATE TABLE public.conversion_points (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  type public.conversion_type NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  css_selector TEXT,
  element_html TEXT,
  trigger_type TEXT,
  trigger_conditions JSONB,
  suggested_tag_name TEXT,
  suggested_event_name TEXT,
  priority public.priority_level NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversion_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view conversion points"
  ON public.conversion_points FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team members can manage conversion points"
  ON public.conversion_points FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX idx_conversion_points_analysis ON public.conversion_points(analysis_id);

-- ============== AUTO PROFILE + ROLE ON SIGNUP ==============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first_user;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first_user THEN 'admin'::public.app_role ELSE 'member'::public.app_role END);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
