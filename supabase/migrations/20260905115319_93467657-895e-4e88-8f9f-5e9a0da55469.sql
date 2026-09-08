REVOKE ALL ON FUNCTION public.record_catch(text, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sell_fish(text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_catch(text, text, text, numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sell_fish(text, uuid, text, boolean) TO service_role;
NOTIFY pgrst, 'reload schema';