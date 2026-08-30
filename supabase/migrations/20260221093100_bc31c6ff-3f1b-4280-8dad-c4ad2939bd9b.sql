
ALTER TABLE public.videos 
ADD COLUMN admin_edited BOOLEAN DEFAULT FALSE,
ADD COLUMN commission_override NUMERIC;
