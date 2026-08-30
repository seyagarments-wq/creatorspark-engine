-- Create a function to automatically assign new creators to the first brand
CREATE OR REPLACE FUNCTION public.auto_assign_creator_to_brand()
RETURNS TRIGGER AS $$
DECLARE
  first_brand_id uuid;
  new_profile_id uuid;
BEGIN
  -- Only process creator role assignments
  IF NEW.role = 'creator' THEN
    -- Get the first/default brand
    SELECT id INTO first_brand_id FROM public.brands ORDER BY created_at ASC LIMIT 1;
    
    -- Get the profile ID for this user
    SELECT id INTO new_profile_id FROM public.profiles WHERE user_id = NEW.user_id;
    
    -- If we have both a brand and a profile, create the assignment
    IF first_brand_id IS NOT NULL AND new_profile_id IS NOT NULL THEN
      INSERT INTO public.creator_brands (creator_id, brand_id, status)
      VALUES (new_profile_id, first_brand_id, 'active')
      ON CONFLICT (creator_id, brand_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to run after user_roles insert
DROP TRIGGER IF EXISTS auto_assign_brand_trigger ON public.user_roles;
CREATE TRIGGER auto_assign_brand_trigger
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_creator_to_brand();