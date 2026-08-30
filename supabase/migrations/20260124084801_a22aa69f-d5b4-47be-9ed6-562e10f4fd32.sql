-- Allow creators to create DMs with admins
CREATE POLICY "Creators can create DMs" 
ON public.direct_messages 
FOR INSERT 
TO authenticated
WITH CHECK (
  participant1_id = auth.uid() 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = participant2_id AND role = 'admin'
  )
);