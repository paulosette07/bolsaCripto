-- =============================================================================
-- Bolsa Monitor — schema inicial
-- Rodar no SQL Editor do Supabase (Database > SQL Editor > New query > Run).
-- O script é idempotente: pode ser executado mais de uma vez sem erro.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'asset_type') then
    create type public.asset_type as enum ('stock', 'crypto');
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_condition') then
    create type public.alert_condition as enum ('above', 'below');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles — espelho de auth.users com dado de aplicação
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text        not null,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil do usuário, criado automaticamente no signup.';

-- -----------------------------------------------------------------------------
-- portfolio — posições do usuário (ações/FIIs e cripto)
-- numeric(28,8) comporta frações de cripto (0.00000001 BTC) sem erro de float.
-- -----------------------------------------------------------------------------
create table if not exists public.portfolio (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  ticker     text        not null,
  asset_type public.asset_type not null,
  crypto_id  text,
  quantity   numeric(28, 8) not null,
  avg_price  numeric(18, 8),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint portfolio_quantity_positive check (quantity > 0),
  constraint portfolio_avg_price_non_negative check (avg_price is null or avg_price >= 0),
  constraint portfolio_ticker_uppercase check (ticker = upper(ticker) and length(ticker) between 1 and 20),
  constraint portfolio_crypto_id_required check (asset_type <> 'crypto' or crypto_id is not null),
  constraint portfolio_unique_asset unique (user_id, ticker, asset_type)
);

comment on table public.portfolio is 'Carteira: quantidade exata de cotas (bolsa) ou frações (cripto).';
comment on column public.portfolio.crypto_id is 'Id canônico da CoinGecko (ex: bitcoin). NULL para ativos de bolsa.';
comment on column public.portfolio.avg_price is 'Preço médio de aquisição em BRL. Opcional, usado para lucro/prejuízo.';

-- -----------------------------------------------------------------------------
-- price_alerts — regras de preço-alvo
-- -----------------------------------------------------------------------------
create table if not exists public.price_alerts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  ticker              text        not null,
  asset_type          public.asset_type not null,
  crypto_id           text,
  condition           public.alert_condition not null,
  target_price        numeric(18, 8) not null,
  is_active           boolean     not null default true,
  cooldown_minutes    integer     not null default 60,
  last_notified_at    timestamptz,
  last_checked_price  numeric(18, 8),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint price_alerts_target_positive check (target_price > 0),
  constraint price_alerts_ticker_uppercase check (ticker = upper(ticker) and length(ticker) between 1 and 20),
  constraint price_alerts_cooldown_range check (cooldown_minutes between 5 and 10080),
  constraint price_alerts_crypto_id_required check (asset_type <> 'crypto' or crypto_id is not null)
);

comment on table public.price_alerts is 'Alertas de preço-alvo avaliados pelo cron (web) e pelo timer (desktop).';
comment on column public.price_alerts.last_notified_at is 'Usado como claim atômico: só quem atualiza esta coluna envia o e-mail.';

-- -----------------------------------------------------------------------------
-- alert_events — auditoria de disparos
-- -----------------------------------------------------------------------------
create table if not exists public.alert_events (
  id               uuid primary key default gen_random_uuid(),
  alert_id         uuid references public.price_alerts (id) on delete set null,
  user_id          uuid        not null references auth.users (id) on delete cascade,
  ticker           text        not null,
  asset_type       public.asset_type not null,
  condition        public.alert_condition not null,
  target_price     numeric(18, 8) not null,
  price_at_trigger numeric(18, 8) not null,
  sent_via         text        not null default 'email',
  provider         text,
  status           text        not null default 'sent',
  error_message    text,
  created_at       timestamptz not null default now(),

  constraint alert_events_sent_via_valid check (sent_via in ('email', 'cron', 'desktop')),
  constraint alert_events_status_valid check (status in ('sent', 'failed'))
);

comment on table public.alert_events is 'Log imutável de alertas disparados, por canal e status.';

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
create index if not exists profiles_email_idx        on public.profiles (email);
create index if not exists portfolio_user_id_idx     on public.portfolio (user_id);
create index if not exists price_alerts_user_id_idx  on public.price_alerts (user_id);
create index if not exists price_alerts_due_idx      on public.price_alerts (is_active) where is_active;
create index if not exists alert_events_user_idx     on public.alert_events (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists portfolio_set_updated_at on public.portfolio;
create trigger portfolio_set_updated_at
  before update on public.portfolio
  for each row execute function public.set_updated_at();

drop trigger if exists price_alerts_set_updated_at on public.price_alerts;
create trigger price_alerts_set_updated_at
  before update on public.price_alerts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Criação automática de perfil no signup
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.portfolio    enable row level security;
alter table public.price_alerts enable row level security;
alter table public.alert_events enable row level security;

-- profiles: cada usuário lê e edita apenas o próprio perfil
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- portfolio: CRUD restrito ao dono
drop policy if exists "portfolio_select_own" on public.portfolio;
create policy "portfolio_select_own" on public.portfolio
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "portfolio_insert_own" on public.portfolio;
create policy "portfolio_insert_own" on public.portfolio
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "portfolio_update_own" on public.portfolio;
create policy "portfolio_update_own" on public.portfolio
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "portfolio_delete_own" on public.portfolio;
create policy "portfolio_delete_own" on public.portfolio
  for delete to authenticated
  using (auth.uid() = user_id);

-- price_alerts: CRUD restrito ao dono
drop policy if exists "price_alerts_select_own" on public.price_alerts;
create policy "price_alerts_select_own" on public.price_alerts
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "price_alerts_insert_own" on public.price_alerts;
create policy "price_alerts_insert_own" on public.price_alerts
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "price_alerts_update_own" on public.price_alerts;
create policy "price_alerts_update_own" on public.price_alerts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "price_alerts_delete_own" on public.price_alerts;
create policy "price_alerts_delete_own" on public.price_alerts
  for delete to authenticated
  using (auth.uid() = user_id);

-- alert_events: leitura do próprio histórico; escrita apenas via service_role
-- (o service_role ignora RLS, portanto não precisa de policy de insert)
drop policy if exists "alert_events_select_own" on public.alert_events;
create policy "alert_events_select_own" on public.alert_events
  for select to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on public.profiles     from anon;
revoke all on public.portfolio    from anon;
revoke all on public.price_alerts from anon;
revoke all on public.alert_events from anon;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update         on public.profiles     to authenticated;
grant select, insert, update, delete on public.portfolio    to authenticated;
grant select, insert, update, delete on public.price_alerts to authenticated;
grant select                         on public.alert_events to authenticated;

grant all on public.profiles, public.portfolio, public.price_alerts, public.alert_events
  to service_role;

-- -----------------------------------------------------------------------------
-- Recarrega o cache de schema do PostgREST (evita PGRST205 após criar tabelas)
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';
