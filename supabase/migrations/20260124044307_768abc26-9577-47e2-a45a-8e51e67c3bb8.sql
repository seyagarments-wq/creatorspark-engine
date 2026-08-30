-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'creator');

-- Create enum for video status
CREATE TYPE public.video_status AS ENUM ('pending', 'approved', 'rejected');

-- Create enum for payout status
CREATE TYPE public.payout_status AS ENUM ('pending', 'approved', 'paid');

-- Create enum for bounty status
CREATE TYPE public.bounty_status AS ENUM ('active', 'completed', 'cancelled');

-- Create profiles table for creator profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  payment_info TEXT,
  social_handles JSONB DEFAULT '{}',
  commission_percentage DECIMAL(5,2) DEFAULT 10.00,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Create videos table
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  unique_video_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  status video_status DEFAULT 'pending' NOT NULL,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create performance_data table
CREATE TABLE public.performance_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE NOT NULL,
  spend DECIMAL(12,2) DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create bounties table
CREATE TABLE public.bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  reward_amount DECIMAL(10,2) NOT NULL,
  milestone_type TEXT NOT NULL,
  milestone_value INTEGER NOT NULL,
  time_limit_days INTEGER,
  status bounty_status DEFAULT 'active' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create creator_bounties junction table for tracking bounty progress
CREATE TABLE public.creator_bounties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id UUID REFERENCES public.bounties(id) ON DELETE CASCADE NOT NULL,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  qualified BOOLEAN DEFAULT false,
  qualified_at TIMESTAMP WITH TIME ZONE,
  payout_approved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (bounty_id, creator_id, video_id)
);

-- Create payouts table
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payout_type TEXT NOT NULL,
  reference_id UUID,
  status payout_status DEFAULT 'pending' NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE
);

-- Create group_chats table
CREATE TABLE public.group_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create group_chat_members junction table
CREATE TABLE public.group_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (chat_id, user_id)
);

-- Create messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES public.group_chats(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  highlighted_video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get current user's profile id
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Videos policies
CREATE POLICY "Creators can view their own videos"
  ON public.videos FOR SELECT
  USING (creator_id = public.get_my_profile_id());

CREATE POLICY "Admins can view all videos"
  ON public.videos FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creators can insert their own videos"
  ON public.videos FOR INSERT
  WITH CHECK (creator_id = public.get_my_profile_id());

CREATE POLICY "Creators can update their pending videos"
  ON public.videos FOR UPDATE
  USING (creator_id = public.get_my_profile_id() AND status = 'pending');

CREATE POLICY "Admins can update any video"
  ON public.videos FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Performance data policies
CREATE POLICY "Creators can view their video performance"
  ON public.performance_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.videos
      WHERE videos.id = performance_data.video_id
        AND videos.creator_id = public.get_my_profile_id()
    )
  );

CREATE POLICY "Admins can manage all performance data"
  ON public.performance_data FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Bounties policies
CREATE POLICY "Everyone can view active bounties"
  ON public.bounties FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage bounties"
  ON public.bounties FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Creator bounties policies
CREATE POLICY "Creators can view their bounty progress"
  ON public.creator_bounties FOR SELECT
  USING (creator_id = public.get_my_profile_id());

CREATE POLICY "Admins can manage all creator bounties"
  ON public.creator_bounties FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Payouts policies
CREATE POLICY "Creators can view their own payouts"
  ON public.payouts FOR SELECT
  USING (creator_id = public.get_my_profile_id());

CREATE POLICY "Admins can manage all payouts"
  ON public.payouts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Group chats policies
CREATE POLICY "Members can view their chats"
  ON public.group_chats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_chat_members
      WHERE group_chat_members.chat_id = group_chats.id
        AND group_chat_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage group chats"
  ON public.group_chats FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Group chat members policies
CREATE POLICY "Members can view chat membership"
  ON public.group_chat_members FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage chat membership"
  ON public.group_chat_members FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Messages policies
CREATE POLICY "Members can view messages in their chats"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_chat_members
      WHERE group_chat_members.chat_id = messages.chat_id
        AND group_chat_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can send messages to their chats"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.group_chat_members
      WHERE group_chat_members.chat_id = messages.chat_id
        AND group_chat_members.user_id = auth.uid()
    )
  );

-- Notifications policies
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can create notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_data_updated_at
  BEFORE UPDATE ON public.performance_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bounties_updated_at
  BEFORE UPDATE ON public.bounties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;