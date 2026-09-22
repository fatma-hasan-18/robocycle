-- ============================================================================
-- RoboCycle — 01. Profiles + ربط المصادقة (auth.users)
-- ----------------------------------------------------------------------------
-- المخطط الحالي مبني على `wallet_key` (نص عشوائي يُخزَّن في localStorage لوضع
-- الضيف). هذه الهجرة تضيف طبقة الحسابات فوقه *دون* كسر وضع الضيف:
--   * كل مستخدم في auth.users يحصل تلقائيًا على صف في public.profiles
--   * profiles.wallet_key هو نفس المفتاح المستخدم في بقية الجداول
--   * profiles.points هو الرصيد المحسوب آليًا من points_ledger
-- ============================================================================

create table if not exists public.profiles (
  id           uuid        primary key references auth.users (id) on delete cascade,
  display_name text        not null default 'مستخدم',
  wallet_key   text        not null unique,
  points       integer     not null default 0,
  is_guest     boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_points_non_negative check (points >= 0),
  constraint profiles_display_name_len    check (char_length(display_name) between 1 and 40),
  constraint profiles_wallet_key_len      check (char_length(wallet_key) between 12 and 64)
);

comment on table  public.profiles            is 'ملف المستخدم العام. صف واحد لكل auth.users.';
comment on column public.profiles.wallet_key is 'مفتاح المحفظة المستخدم في submissions/points_ledger/redemptions.';
comment on column public.profiles.points     is 'رصيد النقاط. يُحدَّث آليًا عبر مشغّل points_ledger — لا تُحدِّثه من العميل.';
comment on column public.profiles.is_guest   is 'true لمستخدمي signInAnonymously؛ يتحوّل إلى false عند التسجيل الكامل.';

create index if not exists profiles_wallet_key_idx on public.profiles (wallet_key);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ------------------------------------------- إنشاء الملف الشخصي عند التسجيل
-- يُشتق wallet_key من بيانات التسجيل إن وُجد (لترحيل بيانات الضيف مباشرة)،
-- وإلا يُولَّد مفتاح ثابت من معرّف المستخدم. أي تعارض على المفتاح يسقط بهدوء
-- إلى المفتاح المولَّد حتى لا يفشل التسجيل نفسه.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fallback_key text := 'u_' || replace(new.id::text, '-', '');
  v_wallet_key   text;
  v_name         text;
begin
  v_wallet_key := nullif(trim(new.raw_user_meta_data ->> 'wallet_key'), '');
  if v_wallet_key is null or char_length(v_wallet_key) not between 12 and 64 then
    v_wallet_key := v_fallback_key;
  end if;

  v_name := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  if v_name is null or char_length(v_name) > 40 then
    v_name := 'مستخدم';
  end if;

  begin
    insert into public.profiles (id, display_name, wallet_key, is_guest)
    values (new.id, v_name, v_wallet_key, coalesce(new.is_anonymous, false))
    on conflict (id) do nothing;
  exception
    when unique_violation then
      -- مفتاح المحفظة محجوز لمستخدم آخر: استخدم المفتاح المولَّد بدلًا منه.
      insert into public.profiles (id, display_name, wallet_key, is_guest)
      values (new.id, v_name, v_fallback_key, coalesce(new.is_anonymous, false))
      on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------- ترقية الضيف إلى حساب كامل (updateUser email)
-- عند تحويل مستخدم مجهول إلى حساب دائم يبقى نفس user_id، فتُحدَّث الراية فقط
-- ولا حاجة لأي ترحيل بيانات.
create or replace function public.sync_guest_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set is_guest = coalesce(new.is_anonymous, false)
   where id = new.id
     and is_guest is distinct from coalesce(new.is_anonymous, false);
  return new;
end;
$$;

drop trigger if exists on_auth_user_upgraded on auth.users;
create trigger on_auth_user_upgraded
  after update of is_anonymous, email, phone on auth.users
  for each row execute function public.sync_guest_flag();

-- ----------------------- ملفات للمستخدمين الموجودين مسبقًا (تشغيل آمن متكرر)
insert into public.profiles (id, display_name, wallet_key, is_guest)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), 'مستخدم'),
       'u_' || replace(u.id::text, '-', ''),
       coalesce(u.is_anonymous, false)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;
