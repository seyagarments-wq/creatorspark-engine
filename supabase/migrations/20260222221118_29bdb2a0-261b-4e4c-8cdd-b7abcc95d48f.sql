
-- Track onboarding reminder emails sent to approved creators
CREATE TABLE public.onboarding_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES public.referral_applications(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reminder_day INTEGER NOT NULL, -- 1, 2, or 5
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Prevent sending same reminder twice
CREATE UNIQUE INDEX idx_onboarding_reminders_unique ON public.onboarding_reminders (application_id, reminder_day);

-- Enable RLS
ALTER TABLE public.onboarding_reminders ENABLE ROW LEVEL SECURITY;

-- Only admins and service role can manage
CREATE POLICY "Admins can manage onboarding reminders"
  ON public.onboarding_reminders
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
