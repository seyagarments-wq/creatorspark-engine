-- Create invites table for invite-only registration
CREATE TABLE public.invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  role app_role NOT NULL DEFAULT 'creator',
  invited_by uuid REFERENCES auth.users(id),
  used_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Only admins can manage invites
CREATE POLICY "Admins can manage invites"
ON public.invites
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can validate an invite token (for signup flow)
CREATE POLICY "Anyone can validate invite tokens"
ON public.invites
FOR SELECT
USING (token IS NOT NULL);

-- Create index for faster token lookups
CREATE INDEX idx_invites_token ON public.invites(token);
CREATE INDEX idx_invites_email ON public.invites(email);