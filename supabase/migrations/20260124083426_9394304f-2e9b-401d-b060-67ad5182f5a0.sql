-- Make the videos bucket public so uploaded videos can be accessed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'videos';