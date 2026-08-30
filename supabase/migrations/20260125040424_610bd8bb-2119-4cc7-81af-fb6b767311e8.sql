-- Fix function search path for security
ALTER FUNCTION public.calculate_level(xp INTEGER) SET search_path = public;
ALTER FUNCTION public.xp_for_level(level INTEGER) SET search_path = public;