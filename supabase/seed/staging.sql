-- STAGING ONLY. Synthetic creators, videos and performance rows so the pay engine has
-- something to compute. Never run against production. Emails end in @staging.invalid.
-- Passwords are random here; set known ones afterwards with a separate, uncommitted statement.
-- Re-runnable: everything is keyed on fixed UUIDs and upserted.

-- ---------- auth users (admin + 3 creators) ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staging-admin@staging.invalid', extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Staging Admin"}', now() - interval '60 days', now(), false, '', '', '', ''),
 ('c0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ada.test@staging.invalid',     extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ada Test"}',      now() - interval '45 days', now(), false, '', '', '', ''),
 ('c0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ben.test@staging.invalid',     extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ben Test"}',      now() - interval '20 days', now(), false, '', '', '', ''),
 ('c0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cleo.test@staging.invalid',    extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Cleo Test"}',     now() - interval '14 days', now(), false, '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       now(), now(), now()
from auth.users u
where u.email like '%@staging.invalid' and u.email <> 'placeholder-migration-user@staging.invalid'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- ---------- brand ----------
insert into public.brands (id, name) values ('b0000000-0000-4000-8000-000000000001', 'Seya') on conflict (id) do nothing;

-- ---------- profiles + roles ----------
insert into public.profiles (id, user_id, full_name, email, status, country, created_at)
values
 ('f0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','Staging Admin','staging-admin@staging.invalid','active','US', now() - interval '60 days'),
 ('f0000000-0000-4000-8000-000000000011','c0000000-0000-4000-8000-000000000001','Ada Test','ada.test@staging.invalid','active','US', now() - interval '45 days'),
 ('f0000000-0000-4000-8000-000000000012','c0000000-0000-4000-8000-000000000002','Ben Test','ben.test@staging.invalid','active','GB', now() - interval '20 days'),
 ('f0000000-0000-4000-8000-000000000013','c0000000-0000-4000-8000-000000000003','Cleo Test','cleo.test@staging.invalid','active','US', now() - interval '14 days')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
 ('a0000000-0000-4000-8000-000000000001','admin'),
 ('c0000000-0000-4000-8000-000000000001','creator'),
 ('c0000000-0000-4000-8000-000000000002','creator'),
 ('c0000000-0000-4000-8000-000000000003','creator')
on conflict (user_id) do nothing;

insert into public.creator_brands (creator_id, brand_id, status)
select p.id, 'b0000000-0000-4000-8000-000000000001', 'active'
from public.profiles p where p.user_id in ('c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000003')
  and not exists (select 1 from public.creator_brands cb where cb.creator_id = p.id);

-- ---------- one active bounty ----------
insert into public.bounties (id, title, description, reward_amount, milestone_type, milestone_value, status)
values ('e0000000-0000-4000-8000-000000000001', 'Unboxing bounty', 'Film an unboxing of the box the day it lands.', 100, 'approved_uploads', 1, 'active')
on conflict (id) do nothing;

-- ---------- videos ----------
-- Ada: 24 approved non-bounty videos, first approved 30 days ago (so her first 4-week cycle is due). Test paths 3 and 9.
insert into public.videos (id, creator_id, unique_video_id, title, status, brand_id, video_url, created_at, approved_at, updated_at)
select ('d0000000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid,
       'f0000000-0000-4000-8000-000000000011',
       'VADA-' || g, 'ADA#' || g, 'approved', 'b0000000-0000-4000-8000-000000000001',
       'https://example.invalid/videos/ada-' || g || '.mov',
       now() - interval '31 days' + (g * interval '1 day'),
       now() - interval '30 days' + (g * interval '1 day'),
       now()
from generate_series(1, 24) g
on conflict (id) do nothing;

-- Ben: 5 approved, 2 pending, 1 approved BOUNTY video (must not earn $65). Test path 4.
insert into public.videos (id, creator_id, unique_video_id, title, status, brand_id, bounty_id, video_url, created_at, approved_at, updated_at)
select ('d0000000-0000-4000-8000-0000000002' || lpad(g::text, 2, '0'))::uuid,
       'f0000000-0000-4000-8000-000000000012',
       'VBEN-' || g, 'BEN#' || g,
       case when g <= 5 then 'approved'::video_status when g = 8 then 'approved'::video_status else 'pending'::video_status end,
       'b0000000-0000-4000-8000-000000000001',
       case when g = 8 then 'e0000000-0000-4000-8000-000000000001'::uuid else null end,
       'https://example.invalid/videos/ben-' || g || '.mov',
       now() - interval '18 days' + (g * interval '2 days'),
       case when g <= 5 or g = 8 then now() - interval '17 days' + (g * interval '2 days') else null end,
       now()
from generate_series(1, 8) g
on conflict (id) do nothing;

-- Cleo: signed up 14 days ago, uploaded nothing. Test path 8 (nothing forfeited, no warning).

-- ---------- performance_data: Ada's videos attribute $12,000 over the last 4 weeks (test path 5: 4% -> $480) ----------
insert into public.performance_data (video_id, metric_date, impressions, clicks, purchases, spend, revenue, recorded_at)
select v.id, (current_date - (7 * w))::date, 20000, 400, 8, 150.00, 125.00, now()
from public.videos v
cross join generate_series(0, 3) w
where v.creator_id = 'f0000000-0000-4000-8000-000000000011'
on conflict (video_id, metric_date) do update set revenue = excluded.revenue;
-- 24 videos x 4 weeks x $125 = $12,000 (spread over the last 4 weeks; most of it lands in the FIRST cycle)

-- Also put $12,000 into the CURRENT cycle so the bonus page shows 4% / $480 right away (test paths 5 and 6):
-- 24 videos x 2 days (today, yesterday) x $250.
insert into public.performance_data (video_id, metric_date, impressions, clicks, purchases, spend, revenue, recorded_at)
select v.id, (current_date - w)::date, 40000, 800, 16, 300.00, 250.00, now()
from public.videos v cross join generate_series(0, 1) w
where v.creator_id = 'f0000000-0000-4000-8000-000000000011' and v.status = 'approved'
on conflict (video_id, metric_date) do update set revenue = excluded.revenue;

select 'seeded' as result,
  (select count(*) from public.videos where creator_id='f0000000-0000-4000-8000-000000000011' and status='approved') as ada_approved,
  (select sum(revenue) from public.performance_data pd join public.videos v on v.id=pd.video_id where v.creator_id='f0000000-0000-4000-8000-000000000011') as ada_revenue,
  (select count(*) from public.videos where creator_id='f0000000-0000-4000-8000-000000000012' and status='approved' and bounty_id is null) as ben_approved_nonbounty;
