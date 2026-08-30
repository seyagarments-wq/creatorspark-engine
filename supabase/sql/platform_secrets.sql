create table if not exists public.platform_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
grant all on public.platform_secrets to service_role;
alter table public.platform_secrets enable row level security;
