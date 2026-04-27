
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Team members can update clients" ON public.clients;
DROP POLICY IF EXISTS "Team members can update analyses" ON public.analyses;
DROP POLICY IF EXISTS "Team members can manage conversion points" ON public.conversion_points;

-- Tighter update policies
CREATE POLICY "Creators or admins can update clients"
  ON public.clients FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creators or admins can update analyses"
  ON public.analyses FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- Conversion points: tied to analysis ownership
CREATE POLICY "Creators or admins can insert conversion points"
  ON public.conversion_points FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = analysis_id
        AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Creators or admins can update conversion points"
  ON public.conversion_points FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = analysis_id
        AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Creators or admins can delete conversion points"
  ON public.conversion_points FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.analyses a
      WHERE a.id = analysis_id
        AND (a.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- Restrict execute on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
