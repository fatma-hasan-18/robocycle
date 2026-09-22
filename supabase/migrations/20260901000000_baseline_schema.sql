-- ============================================================================
-- RoboCycle — 00. المخطط الأساسي (baseline)
-- ----------------------------------------------------------------------------
-- هذا المخطط كان موجودًا في المشروع قبل هجرات المصادقة والأتمتة، لكنه لم يكن
-- مُسجَّلًا كهجرة — أي أن `supabase db push` على قاعدة جديدة كان يفشل، لأن
-- الهجرة 02 تُعدّل جداول لا وجود لها بعد.
--
-- الملف مكتوب بصيغة idempotent بالكامل (IF NOT EXISTS / ON CONFLICT)، فتشغيله
-- على القاعدة الحالية لا يغيّر شيئًا، وعلى قاعدة فارغة يبني الأساس.
--
-- ملاحظة: الأعمدة التي تضيفها الهجرات اللاحقة (user_id، redemption_id،
-- stock) ليست هنا عمدًا — مكانها هجراتها.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------- الجداول
create table if not exists public.device_categories (
  id              text    primary key,
  name_ar         text    not null,
  points_per_kg   integer not null check (points_per_kg > 0),
  hazard_bonus    integer not null default 0 check (hazard_bonus >= 0),
  hazard_label_ar text,
  sort_order      integer not null default 0
);

create table if not exists public.bins (
  id          uuid        primary key default gen_random_uuid(),
  name_ar     text        not null,
  area_ar     text,
  distance_km numeric,
  fill_pct    integer     not null default 0 check (fill_pct >= 0 and fill_pct <= 100),
  open_until  text,
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.rewards (
  id          text    primary key,
  name_ar     text    not null,
  detail_ar   text,
  cost_points integer not null check (cost_points > 0),
  worth_kwd   numeric,
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);

create table if not exists public.submissions (
  id               uuid        primary key default gen_random_uuid(),
  wallet_key       text        not null,
  display_name     text        not null default 'مستخدم',
  category_id      text        not null references public.device_categories (id),
  device_label     text,
  est_weight_kg    numeric     not null check (est_weight_kg > 0),
  actual_weight_kg numeric     check (actual_weight_kg > 0),
  confidence       integer     check (confidence >= 0 and confidence <= 100),
  recoverables     jsonb       not null default '[]'::jsonb,
  hazards          jsonb       not null default '[]'::jsonb,
  points           integer     not null default 0 check (points >= 0),
  bin_id           uuid        references public.bins (id),
  deposit_code     text,
  status           text        not null default 'analyzed'
                     check (status in ('analyzed', 'deposited', 'verified')),
  is_seed          boolean     not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists submissions_recent_idx on public.submissions (created_at desc);
create index if not exists submissions_status_idx on public.submissions (status);

create table if not exists public.points_ledger (
  id            bigint generated always as identity primary key,
  wallet_key    text        not null,
  delta         integer     not null check (delta <> 0),
  reason_ar     text        not null,
  submission_id uuid        references public.submissions (id) on delete set null,
  reward_id     text        references public.rewards (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists ledger_wallet_idx on public.points_ledger (wallet_key, created_at desc);

create table if not exists public.redemptions (
  id           uuid        primary key default gen_random_uuid(),
  wallet_key   text        not null,
  reward_id    text        not null references public.rewards (id),
  cost_points  integer     not null,
  voucher_code text        not null,
  created_at   timestamptz not null default now()
);

-- -------------------------------------------------------------- الدوال
create or replace function public.calc_points(
  p_category_id text,
  p_weight_kg   numeric,
  p_has_hazard  boolean default false
)
returns integer
language plpgsql
stable
set search_path = public
as $$
declare
  v_per_kg integer;
  v_bonus  integer;
begin
  select points_per_kg, hazard_bonus into v_per_kg, v_bonus
    from public.device_categories where id = p_category_id;
  if v_per_kg is null then
    raise exception 'فئة غير معروفة: %', p_category_id;
  end if;
  return round(p_weight_kg * v_per_kg)::int + case when p_has_hazard then v_bonus else 0 end;
end;
$$;

create or replace function public.wallet_balance(p_wallet_key text)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(delta), 0)::int from public.points_ledger where wallet_key = p_wallet_key;
$$;

-- النسخة الأساسية. الهجرة 08 تُزيل منها كتابة السجل بعد إضافة المشغّلات،
-- والهجرة 10 تضيف فحص المخزون.
create or replace function public.verify_deposit(p_submission_id uuid, p_actual_weight_kg numeric)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_sub    public.submissions;
  v_points integer;
begin
  select * into v_sub from public.submissions where id = p_submission_id;
  if v_sub.id is null then raise exception 'تسليم غير موجود'; end if;
  if v_sub.status = 'verified' then raise exception 'هذا التسليم معتمد مسبقاً'; end if;

  v_points := public.calc_points(v_sub.category_id, p_actual_weight_kg,
                                 jsonb_array_length(v_sub.hazards) > 0);

  update public.submissions
     set actual_weight_kg = p_actual_weight_kg, points = v_points, status = 'verified'
   where id = p_submission_id;

  insert into public.points_ledger (wallet_key, delta, reason_ar, submission_id)
  values (v_sub.wallet_key, v_points, 'تسليم ' || coalesce(v_sub.device_label, 'جهاز'), p_submission_id);

  return v_points;
end;
$$;

create or replace function public.redeem_reward(p_wallet_key text, p_reward_id text)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_reward  public.rewards;
  v_balance integer;
  v_code    text;
begin
  select * into v_reward from public.rewards where id = p_reward_id and is_active;
  if v_reward.id is null then raise exception 'مكافأة غير متاحة'; end if;

  v_balance := public.wallet_balance(p_wallet_key);
  if v_balance < v_reward.cost_points then
    raise exception 'الرصيد لا يكفي: لديك % والمطلوب %', v_balance, v_reward.cost_points;
  end if;

  v_code := 'RC-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into public.redemptions (wallet_key, reward_id, cost_points, voucher_code)
  values (p_wallet_key, p_reward_id, v_reward.cost_points, v_code);
  insert into public.points_ledger (wallet_key, delta, reason_ar, reward_id)
  values (p_wallet_key, -v_reward.cost_points, 'استبدال: ' || v_reward.name_ar, p_reward_id);

  return json_build_object('voucher_code', v_code,
                           'balance', public.wallet_balance(p_wallet_key),
                           'reward', v_reward.name_ar);
end;
$$;

-- -------------------------------------------------------------- العروض
-- الهجرة 08 تحوّلهما إلى security_invoker = off كي تبقيا شاملتين بعد RLS.
create or replace view public.v_recent_activity as
  select s.id,
         s.display_name,
         coalesce(s.device_label, dc.name_ar) as device_label,
         s.points,
         s.is_seed,
         s.created_at
    from public.submissions s
    join public.device_categories dc on dc.id = s.category_id
   where s.status = 'verified'
   order by s.created_at desc
   limit 20;

create or replace view public.v_impact_stats as
  select count(*) filter (where status = 'verified') as devices_count,
         round(coalesce(sum(actual_weight_kg) filter (where status = 'verified'), 0) / 1000.0, 2) as tons_diverted,
         round(coalesce(sum(points) filter (where status = 'verified'), 0)::numeric / 500.0, 0) as kwd_value,
         (select count(*) from public.bins where is_active) as bins_count
    from public.submissions;

-- ---------------------------------------------------------------- RLS
-- سياسات مفتوحة تناسب وضع الضيف وحده. الهجرة 04 تستبدلها بسياسات الخصوصية.
alter table public.device_categories enable row level security;
alter table public.bins              enable row level security;
alter table public.rewards           enable row level security;
alter table public.submissions       enable row level security;
alter table public.points_ledger     enable row level security;
alter table public.redemptions       enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='device_categories') then
    create policy "read categories" on public.device_categories for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bins') then
    create policy "read bins" on public.bins for select to anon, authenticated using (is_active);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rewards') then
    create policy "read rewards" on public.rewards for select to anon, authenticated using (is_active);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='submissions') then
    create policy "read submissions"   on public.submissions for select to anon, authenticated using (true);
    create policy "insert submissions" on public.submissions for insert to anon, authenticated
      with check (est_weight_kg > 0 and est_weight_kg <= 100 and length(display_name) <= 40);
    create policy "verify submissions" on public.submissions for update to anon, authenticated
      using (status <> 'verified') with check (status = 'verified');
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='points_ledger') then
    create policy "read ledger"   on public.points_ledger for select to anon, authenticated using (true);
    create policy "insert ledger" on public.points_ledger for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='redemptions') then
    create policy "read redemptions"   on public.redemptions for select to anon, authenticated using (true);
    create policy "insert redemptions" on public.redemptions for insert to anon, authenticated with check (true);
  end if;
end;
$$;

-- ------------------------------------------------------- البيانات المرجعية
insert into public.device_categories (id, name_ar, points_per_kg, hazard_bonus, hazard_label_ar, sort_order) values
  ('phone',  'هواتف وأجهزة صغيرة',   300, 150, 'بطارية ليثيوم', 1),
  ('laptop', 'لابتوبات وأجهزة تقنية', 260, 150, 'بطارية ليثيوم', 2),
  ('screen', 'شاشات وتلفزيونات',     120, 200, 'زئبق',          3),
  ('cable',  'كوابل ومحوّلات',         90,   0, null,            4),
  ('large',  'أجهزة كبيرة',            60, 250, 'غاز تبريد',     5)
on conflict (id) do nothing;

insert into public.rewards (id, name_ar, cost_points, worth_kwd, is_active, sort_order) values
  ('cafe30',  'خصم 30% — كافيه شريك',            700, 1.40, true, 1),
  ('tree',    'زراعة شجرة باسمك',               1200, null, true, 2),
  ('store5',  'قسيمة 5 د.ك — متجر إلكترونيات',  2500, 5.00, true, 3)
on conflict (id) do nothing;

insert into public.bins (name_ar, area_ar, distance_km, fill_pct, open_until, is_active, sort_order)
select v.name_ar, v.area_ar, v.distance_km, v.fill_pct, v.open_until, true, v.sort_order
from (values
  ('الأفنيوز',        'الري',      2.4, 38, '23:00', 1),
  ('جامعة الكويت',    'الشدادية',  5.1, 64, '20:00', 2),
  ('سوق شرق',         'شرق',       7.8, 21, '22:00', 3),
  ('بلدية السالمية',  'السالمية',  9.3, 88, '19:00', 4)
) as v(name_ar, area_ar, distance_km, fill_pct, open_until, sort_order)
where not exists (select 1 from public.bins b where b.name_ar = v.name_ar);
