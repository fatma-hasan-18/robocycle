-- ============================================================================
-- RoboCycle — 10. مخزون المكافآت
-- ----------------------------------------------------------------------------
-- المواصفة تطلب `stock` في جدول المكافآت، ولم يكن موجودًا: أي أن مكافأة
-- محدودة الكمية كان يمكن استبدالها بلا حدّ.
--
-- الدلالة: NULL = كمية غير محدودة، والرقم = المتبقّي.
-- الخصم يتم داخل مشغّل BEFORE بقفل صفّي، فالطلبات المتزامنة تتسلسل ولا يمكن
-- أن ينزل المخزون تحت الصفر ولا أن تُستبدل آخر قطعة مرتين.
-- ============================================================================

alter table public.rewards
  add column if not exists stock integer;

alter table public.rewards
  drop constraint if exists rewards_stock_non_negative;
alter table public.rewards
  add constraint rewards_stock_non_negative check (stock is null or stock >= 0);

comment on column public.rewards.stock is
  'الكمية المتبقية. NULL = غير محدودة. يُخصم آليًا عند الاستبدال — لا تُحدَّث من العميل.';

-- ------------------------------------------------- الخصم الذرّي من المخزون
-- مشغّل مستقل عن guard_redemption_balance حتى يبقى كلٌّ منهما مسؤولًا عن شيء
-- واحد. الاسم يبدأ بـ aa_ ليُنفَّذ أولًا: مشغّلات BEFORE تعمل بالترتيب الأبجدي،
-- ونريد رفض "نفد المخزون" قبل أي عمل آخر.
create or replace function public.aa_reserve_reward_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
begin
  select stock into v_stock from public.rewards where id = new.reward_id;

  if v_stock is null then
    return new;                                   -- كمية غير محدودة
  end if;

  -- UPDATE يأخذ قفلًا على الصف، فالمتزامنون ينتظرون دورهم ويرى كلٌّ منهم
  -- القيمة بعد خصم من سبقه.
  update public.rewards
     set stock = stock - 1
   where id = new.reward_id
     and stock > 0;

  if not found then
    raise exception 'REWARD_OUT_OF_STOCK: نفدت كمية هذه المكافأة'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.aa_reserve_reward_stock() from public, anon, authenticated;

drop trigger if exists aa_redemptions_reserve_stock on public.redemptions;
create trigger aa_redemptions_reserve_stock
  before insert on public.redemptions
  for each row execute function public.aa_reserve_reward_stock();

-- ---------------------------------- إعادة المخزون عند إلغاء عملية استبدال
-- حذف صف الاستبدال يعيد القطعة إلى المخزون (ومشغّل السجل يعيد النقاط).
create or replace function public.release_reward_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rewards
     set stock = stock + 1
   where id = old.reward_id
     and stock is not null;
  return old;
end;
$$;

revoke all on function public.release_reward_stock() from public, anon, authenticated;

drop trigger if exists redemptions_release_stock on public.redemptions;
create trigger redemptions_release_stock
  after delete on public.redemptions
  for each row execute function public.release_reward_stock();

-- ------------------------------------------- إتاحة المكافأة تشمل المخزون
-- redeem_reward كانت تتحقّق من is_active فقط. نضيف شرط المخزون حتى تُرفض
-- المكافأة الناضبة برسالة عربية واضحة بدل استثناء المشغّل الخام.
create or replace function public.redeem_reward(p_wallet_key text, p_reward_id text)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_reward  public.rewards;
  v_uid     uuid := auth.uid();
  v_wallet  text := p_wallet_key;
  v_balance integer;
  v_code    text;
begin
  select * into v_reward from public.rewards where id = p_reward_id and is_active;
  if v_reward.id is null then
    raise exception 'مكافأة غير متاحة';
  end if;

  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'نفدت كمية هذه المكافأة';
  end if;

  if v_uid is not null then
    select wallet_key, points into v_wallet, v_balance from public.profiles where id = v_uid;
  else
    v_balance := public.wallet_balance(v_wallet);
  end if;

  if coalesce(v_balance, 0) < v_reward.cost_points then
    raise exception 'الرصيد لا يكفي: لديك % والمطلوب %', coalesce(v_balance, 0), v_reward.cost_points;
  end if;

  v_code := 'RC-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into public.redemptions (wallet_key, reward_id, cost_points, voucher_code)
  values (v_wallet, p_reward_id, v_reward.cost_points, v_code);

  return json_build_object(
    'voucher_code', v_code,
    'balance',      case when v_uid is not null
                         then (select points from public.profiles where id = v_uid)
                         else public.wallet_balance(v_wallet) end,
    'reward',       v_reward.name_ar
  );
end;
$$;

-- المكافآت الحالية: كمية غير محدودة ما لم تُضبط صراحةً.
-- مثال لضبط كمية محدودة:
--   update public.rewards set stock = 50 where id = 'store5';
