-- ============================================================================
-- RoboCycle — 02. ربط الصفوف بالمستخدم (user_id)
-- ----------------------------------------------------------------------------
-- تُضاف الأعمدة كـ nullable عمدًا: الصفوف القديمة (وضع الضيف بدون جلسة) تبقى
-- بـ user_id = NULL، والصفوف الجديدة تُنسب آليًا إلى صاحب الجلسة.
-- ============================================================================

alter table public.submissions   add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.points_ledger add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.redemptions   add column if not exists user_id uuid references auth.users (id) on delete set null;

-- ربط سجل النقاط بعملية الاستبدال لضمان عدم تكرار الخصم
alter table public.points_ledger add column if not exists redemption_id uuid references public.redemptions (id) on delete cascade;

create index if not exists submissions_user_idx      on public.submissions   (user_id, created_at desc);
create index if not exists submissions_wallet_idx    on public.submissions   (wallet_key, created_at desc);
create index if not exists points_ledger_user_idx    on public.points_ledger (user_id, created_at desc);
create index if not exists points_ledger_wallet_idx  on public.points_ledger (wallet_key, created_at desc);
create index if not exists redemptions_user_idx      on public.redemptions   (user_id, created_at desc);
create index if not exists redemptions_wallet_idx    on public.redemptions   (wallet_key, created_at desc);

-- مفاتيح تفرّد جزئية: تمنع احتساب نفس العملية مرتين (العميل + المشغّل)
create unique index if not exists points_ledger_submission_uniq
  on public.points_ledger (submission_id) where submission_id is not null;
create unique index if not exists points_ledger_redemption_uniq
  on public.points_ledger (redemption_id) where redemption_id is not null;

-- ------------------------------------------------- نسب الصف إلى صاحب الجلسة
-- يمنع العميل من انتحال user_id أو wallet_key لمستخدم آخر: القيم تُفرض من
-- الخادم اعتمادًا على auth.uid(). الضيف بدون جلسة (anon نقي) يحتفظ بسلوكه
-- الحالي: wallet_key من العميل و user_id = NULL.
create or replace function public.set_row_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_wallet text;
begin
  -- مسار داخلي موثوق (مشغّلات الأتمتة): الصف يحمل مالكه الصحيح مسبقًا.
  if coalesce(current_setting('robocycle.internal', true), '') = 'on' then
    return new;
  end if;

  if v_uid is null then
    new.user_id := null;                       -- لا يمكن ادّعاء ملكية بلا جلسة
    return new;
  end if;

  select wallet_key into v_wallet from public.profiles where id = v_uid;

  new.user_id := v_uid;
  if v_wallet is not null then
    new.wallet_key := v_wallet;
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_set_owner   on public.submissions;
drop trigger if exists points_ledger_set_owner on public.points_ledger;
drop trigger if exists redemptions_set_owner   on public.redemptions;

create trigger submissions_set_owner
  before insert on public.submissions
  for each row execute function public.set_row_owner();

create trigger points_ledger_set_owner
  before insert on public.points_ledger
  for each row execute function public.set_row_owner();

create trigger redemptions_set_owner
  before insert on public.redemptions
  for each row execute function public.set_row_owner();
