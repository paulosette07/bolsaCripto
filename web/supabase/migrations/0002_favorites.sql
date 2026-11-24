-- =============================================================================
-- Bolsa Monitor — favoritos
-- Rodar no SQL Editor do Supabase (Database > SQL Editor > New query > Run).
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- favorites — ativos que o usuário marcou para acompanhar no Mercado
-- Sem quantidade nem preço médio: favoritar não é comprar. Quem tem posição
-- usa `portfolio`; aqui é só a lista de atalhos do Mercado.
-- -----------------------------------------------------------------------------
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  ticker     text        not null,
  asset_type public.asset_type not null,
  crypto_id  text,
  created_at timestamptz not null default now(),

  constraint favorites_ticker_uppercase check (ticker = upper(ticker) and length(ticker) between 1 and 20),
  constraint favorites_crypto_id_required check (asset_type <> 'crypto' or crypto_id is not null),
  constraint favorites_unique_asset unique (user_id, ticker, asset_type)
);

comment on table public.favorites is 'Ativos favoritados, exibidos como cards na área de Mercado.';
comment on column public.favorites.crypto_id is 'Id canônico da CoinGecko (ex: bitcoin). NULL para ativos de bolsa.';

create index if not exists favorites_user_id_idx on public.favorites (user_id, created_at);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.favorites enable row level security;

drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on public.favorites from anon;

grant select, insert, delete on public.favorites to authenticated;
grant all                     on public.favorites to service_role;

-- -----------------------------------------------------------------------------
-- Recarrega o cache de schema do PostgREST (evita PGRST205 após criar tabela)
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';
