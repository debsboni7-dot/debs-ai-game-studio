-- Subscription, invoice, price-catalog, purchase-order and rate-card schema.
-- No prices are seeded: proposed commercial prices still require final approval.

create table public.debs_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null check (length(btrim(plan_code)) between 1 and 60),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  currency char(3) not null check (currency in ('XOF', 'EUR', 'USD')),
  amount_minor bigint not null check (amount_minor >= 0),
  monthly_credit_grant bigint not null check (monthly_credit_grant >= 0),
  max_mission_seconds integer not null check (max_mission_seconds >= 3600),
  is_active boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from),
  unique (plan_code, billing_interval, currency, effective_from)
);

create index debs_plan_prices_active_lookup_idx
  on public.debs_plan_prices(plan_code, billing_interval, currency, effective_from desc)
  where is_active = true;

create table public.debs_credit_pack_catalog (
  id uuid primary key default gen_random_uuid(),
  pack_code text not null check (length(btrim(pack_code)) between 1 and 60),
  currency char(3) not null check (currency in ('XOF', 'EUR', 'USD')),
  amount_minor bigint not null check (amount_minor > 0),
  credit_amount bigint not null check (credit_amount > 0),
  is_active boolean not null default false,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from),
  unique (pack_code, currency, effective_from)
);

create index debs_credit_pack_catalog_active_lookup_idx
  on public.debs_credit_pack_catalog(pack_code, currency, effective_from desc)
  where is_active = true;

create table public.debs_ai_rate_cards (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(btrim(provider)) between 1 and 80),
  model text not null check (length(btrim(model)) between 1 and 120),
  version text not null check (length(btrim(version)) between 1 and 80),
  input_credits_per_million bigint not null check (input_credits_per_million >= 0),
  cached_input_credits_per_million bigint not null check (cached_input_credits_per_million >= 0),
  output_credits_per_million bigint not null check (output_credits_per_million >= 0),
  effective_from timestamptz not null,
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from),
  unique (provider, model, version)
);

create index debs_ai_rate_cards_active_lookup_idx
  on public.debs_ai_rate_cards(provider, model, effective_from desc);

alter table public.debs_ai_usage_records
  add column rate_card_id uuid references public.debs_ai_rate_cards(id) on delete restrict;

create table public.debs_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  plan_code text not null check (length(btrim(plan_code)) between 1 and 60),
  billing_interval text not null check (billing_interval in ('monthly', 'annual')),
  currency char(3) not null check (currency in ('XOF', 'EUR', 'USD')),
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  provider text not null check (length(btrim(provider)) between 1 and 80),
  provider_subscription_id text,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  grace_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start),
  unique (provider, provider_subscription_id)
);

create index debs_subscriptions_user_status_idx
  on public.debs_subscriptions(user_id, status, current_period_end desc);

create table public.debs_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  subscription_id uuid references public.debs_subscriptions(id) on delete restrict,
  provider text not null check (length(btrim(provider)) between 1 and 80),
  provider_invoice_id text,
  invoice_number text,
  status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible', 'refunded')),
  currency char(3) not null check (currency in ('XOF', 'EUR', 'USD')),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  tax_minor bigint not null default 0 check (tax_minor >= 0),
  total_minor bigint not null check (total_minor >= 0 and total_minor = subtotal_minor + tax_minor),
  due_at timestamptz,
  paid_at timestamptz,
  hosted_invoice_url text,
  pdf_url text,
  line_items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);

create index debs_invoices_user_created_idx
  on public.debs_invoices(user_id, created_at desc);

create table public.debs_credit_pack_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  pack_code text not null check (length(btrim(pack_code)) between 1 and 60),
  provider text not null check (length(btrim(provider)) between 1 and 80),
  provider_order_id text,
  status text not null check (status in ('created', 'pending', 'paid', 'failed', 'canceled', 'refunded', 'partially_refunded')),
  currency char(3) not null check (currency in ('XOF', 'EUR', 'USD')),
  amount_minor bigint not null check (amount_minor > 0),
  credit_amount bigint not null check (credit_amount > 0),
  idempotency_key text not null unique check (length(btrim(idempotency_key)) between 1 and 200),
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_order_id)
);

create index debs_credit_pack_orders_user_created_idx
  on public.debs_credit_pack_orders(user_id, created_at desc);

-- All billing state is server-written. Users may read only their own records.
alter table public.debs_plan_prices enable row level security;
alter table public.debs_credit_pack_catalog enable row level security;
alter table public.debs_ai_rate_cards enable row level security;
alter table public.debs_subscriptions enable row level security;
alter table public.debs_invoices enable row level security;
alter table public.debs_credit_pack_orders enable row level security;

create policy "public can read active plan prices"
  on public.debs_plan_prices for select to anon, authenticated
  using (
    is_active = true and effective_from <= now()
    and (effective_until is null or now() < effective_until)
  );

create policy "public can read active credit packs"
  on public.debs_credit_pack_catalog for select to anon, authenticated
  using (
    is_active = true and effective_from <= now()
    and (effective_until is null or now() < effective_until)
  );

create policy "subscription owner can read own subscriptions"
  on public.debs_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "invoice owner can read own invoices"
  on public.debs_invoices for select to authenticated
  using (user_id = (select auth.uid()));

create policy "credit pack order owner can read own orders"
  on public.debs_credit_pack_orders for select to authenticated
  using (user_id = (select auth.uid()));

create policy "deny client access to AI rate cards"
  on public.debs_ai_rate_cards for all to anon, authenticated
  using (false) with check (false);

revoke all on table public.debs_plan_prices, public.debs_credit_pack_catalog,
  public.debs_ai_rate_cards, public.debs_subscriptions,
  public.debs_invoices, public.debs_credit_pack_orders
from public, anon, authenticated;

grant select on table public.debs_plan_prices, public.debs_credit_pack_catalog to anon, authenticated;
grant select on table public.debs_subscriptions, public.debs_invoices, public.debs_credit_pack_orders to authenticated;

grant select, insert, update on table public.debs_plan_prices,
  public.debs_credit_pack_catalog, public.debs_ai_rate_cards,
  public.debs_subscriptions, public.debs_invoices,
  public.debs_credit_pack_orders to service_role;

revoke delete, truncate on table public.debs_plan_prices,
  public.debs_credit_pack_catalog, public.debs_ai_rate_cards,
  public.debs_subscriptions, public.debs_invoices,
  public.debs_credit_pack_orders from service_role;
