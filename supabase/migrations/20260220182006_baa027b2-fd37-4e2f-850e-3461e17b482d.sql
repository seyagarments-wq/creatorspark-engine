-- Allow senders to delete their own messages permanently
CREATE POLICY "Users can delete their own messages"
ON public.messages
FOR DELETE
USING (sender_id = auth.uid());

-- Allow admins to delete any message
CREATE POLICY "Admins can delete any message"
ON public.messages
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
