-- ============================================================================
-- RoboCycle — 03. أتمتة النقاط
-- ----------------------------------------------------------------------------
-- تدفّق النقاط بالكامل داخل قاعدة البيانات، فلا يستطيع العميل تزوير رصيده:
--
--   submissions (verified)  ──trigger──▶  points_ledger (+points)
--   redemptions (insert)    ──trigger──▶  points_ledger (-cost_points)
--   points_ledger (insert)  ──trigger──▶  profiles.points (الرصيد التراكمي)
--
-- كل المشغّلات idempotent: الفهارس الجزئية الفريدة في الهجرة 02 تمنع احتساب
-- نفس العملية مرتين حتى لو أدرج العميل صف السجل بنفسه.
-- ============================================================================

-- ----------------------------------------- 1) الرصيد التراكمي في profiles
create or replace function public.apply_ledger_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null then
      update public.profiles set points = points + new.delta where id = new.user_id;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id is not null then
      update public.profiles set points = points - old.delta where id = old.user_id;
    end if;
    return old;
  end if;

  -- UPDATE: اعكس القديم وطبّق الجديد (قد يتغيّر المالك أو المقدار)
  if old.user_id is not null then
    update public.profiles set points = points - old.delta where id = old.user_id;
  end if;
  if new.user_id is not null then
    update public.profiles set points = points + new.delta where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists points_ledger_apply_to_profile on public.points_ledger;
create trigger points_ledger_apply_to_profile
  after insert or update or delete on public.points_ledger
  for each row execute function public.apply_ledger_to_profile();

-- --------------------------------- 2) منح النقاط عند توثيق عملية إعادة تدوير
create or replace function public.award_points_for_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points integer := coalesce(new.points, 0);
begin
  if new.status is distinct from 'verified' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'verified' then
    return new;                                   -- وُثّقت سابقًا، لا تكرار
  end if;
  if v_points <= 0 then
    return new;
  end if;

  perform set_config('robocycle.internal', 'on', true);

  insert into public.points_ledger (wallet_key, user_id, delta, reason_ar, submission_id)
  values (new.wallet_key, new.user_id, v_points, 'إعادة تدوير جهاز', new.id)
  on conflict (submission_id) where submission_id is not null do nothing;

  perform set_config('robocycle.internal', 'off', true);
  return new;
end;
$$;

drop trigger if exists submissions_award_points on public.submissions;
create trigger submissions_award_points
  after insert or update of status on public.submissions
  for each row execute function public.award_points_for_submission();

-- ------------------------------------ 3) خصم النقاط عند استبدال مكافأة
-- الفحص المسبق يمنع الاستبدال بدون رصيد كافٍ، وقيد profiles_points_non_negative
-- يشكّل خط الدفاع الأخير حتى في حالات التزامن.
create or replace function public.guard_redemption_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_cost    integer;
  v_owner   uuid;
begin
  select cost_points into v_cost from public.rewards where id = new.reward_id and is_active;
  if v_cost is null then
    raise exception 'REWARD_UNAVAILABLE: المكافأة غير متاحة' using errcode = 'check_violation';
  end if;

  new.cost_points := v_cost;                      -- التكلفة من الخادم لا من العميل

  -- لا نعتمد على new.user_id: مشغّلات BEFORE تُنفَّذ بترتيب أبجدي، وهذا المشغّل
  -- يسبق set_row_owner، فيكون new.user_id لا يزال NULL هنا. نحسب المالك بأنفسنا
  -- ليبقى الفحص صحيحًا مهما تغيّرت أسماء المشغّلات.
  v_owner := coalesce(new.user_id, auth.uid());

  if v_owner is null then
    return new;                                   -- وضع الضيف القديم: لا رصيد خادمي
  end if;

  select points into v_balance from public.profiles where id = v_owner for update;
  if coalesce(v_balance, 0) < v_cost then
    raise exception 'INSUFFICIENT_POINTS: الرصيد غير كافٍ (% < %)', coalesce(v_balance, 0), v_cost
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists redemptions_guard_balance on public.redemptions;
create trigger redemptions_guard_balance
  before insert on public.redemptions
  for each row execute function public.guard_redemption_balance();

create or replace function public.charge_points_for_redemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select name_ar into v_title from public.rewards where id = new.reward_id;

  perform set_config('robocycle.internal', 'on', true);

  insert into public.points_ledger (wallet_key, user_id, delta, reason_ar, reward_id, redemption_id)
  values (new.wallet_key, new.user_id, -new.cost_points,
          'استبدال: ' || coalesce(v_title, new.reward_id), new.reward_id, new.id)
  on conflict (redemption_id) where redemption_id is not null do nothing;

  perform set_config('robocycle.internal', 'off', true);
  return new;
end;
$$;

drop trigger if exists redemptions_charge_points on public.redemptions;
create trigger redemptions_charge_points
  after insert on public.redemptions
  for each row execute function public.charge_points_for_redemption();

-- ------------------------------------------------- 4) إعادة حساب الرصيد
-- أداة صيانة: تُعيد بناء profiles.points من سجل النقاط (تُستخدم بعد الترحيل
-- أو لإصلاح أي انحراف).
create or replace function public.recalculate_points(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  update public.profiles p
     set points = greatest(0, coalesce(l.total, 0))
    from (
      select pr.id as uid, (select sum(delta) from public.points_ledger where user_id = pr.id) as total
      from public.profiles pr
      where p_user_id is null or pr.id = p_user_id
    ) l
   where p.id = l.uid
     and p.points is distinct from greatest(0, coalesce(l.total, 0));
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.recalculate_points(uuid) from public, anon, authenticated;
