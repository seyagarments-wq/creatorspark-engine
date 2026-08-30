-- Make XP leveling 3x harder
CREATE OR REPLACE FUNCTION public.calculate_level(xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Harder leveling: each level requires 3x more XP than before
  -- Level 1: 0-149 XP, Level 2: 150-599 XP, Level 3: 600-1349 XP, etc.
  RETURN GREATEST(1, floor(sqrt(xp::float / 150)) + 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.xp_for_level(level integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Inverse of calculate_level formula
  RETURN ((level - 1) * (level - 1) * 150)::integer;
END;
$$;