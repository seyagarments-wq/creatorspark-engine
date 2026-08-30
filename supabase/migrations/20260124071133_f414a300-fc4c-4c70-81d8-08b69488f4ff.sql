-- Add email notification preferences to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_video_updates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_payout_updates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_bounty_updates BOOLEAN DEFAULT true;

-- Add notification_type column to notifications table for categorization
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'general';

-- Add email_sent column to track if email was sent
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT false;