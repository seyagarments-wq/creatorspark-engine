-- Add unique constraint to user_id column in user_roles table
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- Insert creator role for the existing user who is stuck
INSERT INTO user_roles (user_id, role) 
VALUES ('895fd267-8fba-43d0-b727-5d4c32a97db1', 'creator')
ON CONFLICT (user_id) DO NOTHING;