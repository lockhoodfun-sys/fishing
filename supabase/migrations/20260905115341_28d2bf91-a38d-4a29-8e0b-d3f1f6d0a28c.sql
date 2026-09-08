CREATE POLICY "No direct access to profiles"
ON public.profiles FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);
CREATE POLICY "No direct access to fish inventory"
ON public.fish_inventory_items FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);
CREATE POLICY "No direct access to player rods"
ON public.player_rods FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);
CREATE POLICY "No direct access to player baits"
ON public.player_baits FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);
CREATE POLICY "No direct access to player boats"
ON public.player_boats FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);