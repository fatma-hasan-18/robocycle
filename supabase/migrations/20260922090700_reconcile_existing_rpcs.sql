-- ============================================================================
-- RoboCycle — 08. مواءمة دوال RPC الموجودة مع أتمتة النقاط الجديدة
-- ----------------------------------------------------------------------------
-- المشروع يحتوي مسبقًا على verify_deposit و redeem_reward، وكلٌّ منهما كان
-- يُدرج صف points_ledger بنفسه. بعد إضافة مشغّلات الأتمتة صار ذلك يتعارض:
--
--   verify_deposit : المشغّل يُدرج صف السجل عند تحويل الحالة إلى verified، ثم
--                    تحاول الدالة إدراج صف ثانٍ بنفس submission_id فيصطدم
--                    بالفهرس الفريد points_ledger_submission_uniq وتفشل الدالة.
--
--   redeem_reward  : المشغّل يخصم التكلفة، ثم تخصمها الدالة مرة ثانية
--                    (صفّها القديم بلا redemption_id فلا يمنعه الفهرس) →
--                    خصم مضاعف.
--
-- الحل: تبقى الدالتان بنفس التوقيع وقيمة الإرجاع (حتى لا تتغيّر الواجهة)،
-- لكن تُزال منهما كتابة السجل ويُترك ذلك للمشغّلات وحدها — مصدر حقيقة واحد
-- لأي مسار كتابة.
-- ============================================================================

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
  if v_sub.id is null then
    raise exception 'تسليم غير موجود';
  end if;
  if v_sub.status = 'verified' then
    raise exception 'هذا التسليم معتمد مسبقاً';
  end if;

  v_points := public.calc_points(v_sub.category_id, p_actual_weight_kg,
                                 jsonb_array_length(v_sub.hazards) > 0);

  -- مشغّل award_points_for_submission يتكفّل بصف points_ledger وبتحديث الرصيد،
  -- ومشغّل emit_submission_verified_event يتكفّل بالحدث.
  update public.submissions
     set actual_weight_kg = p_actual_weight_kg,
         points           = v_points,
         status           = 'verified'
   where id = p_submission_id;

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
  v_uid     uuid := auth.uid();
  v_wallet  text := p_wallet_key;
  v_balance integer;
  v_code    text;
begin
  select * into v_reward from public.rewards where id = p_reward_id and is_active;
  if v_reward.id is null then
    raise exception 'مكافأة غير متاحة';
  end if;

  -- مستخدم مسجَّل: المحفظة والرصيد من ملفه الشخصي، لا مما يرسله العميل.
  if v_uid is not null then
    select wallet_key, points into v_wallet, v_balance from public.profiles where id = v_uid;
  else
    v_balance := public.wallet_balance(v_wallet);
  end if;

  if coalesce(v_balance, 0) < v_reward.cost_points then
    raise exception 'الرصيد لا يكفي: لديك % والمطلوب %', coalesce(v_balance, 0), v_reward.cost_points;
  end if;

  v_code := 'RC-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  -- مشغّل charge_points_for_redemption يتكفّل بالخصم، و emit_redemption_event بالحدث.
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

-- ---------------------------------------------------------------------------
-- العروض المجتمعية: تبقى شاملة رغم تشديد RLS
-- ---------------------------------------------------------------------------
-- v_recent_activity و v_impact_stats كانت security_invoker = true، فبعد تشديد
-- RLS صار كل مستخدم يرى إحصاءات صفوفه فقط — أي أن "أثر المجتمع" ينهار.
-- العرضان لا يكشفان أي معرّف (لا wallet_key ولا user_id ولا deposit_code)، بل
-- الاسم المعروض والجهاز والنقاط فقط، لذا يُسمح لهما بتجاوز RLS عمدًا.
-- ملاحظة: مدقّق Supabase سيرصدهما كـ security_definer_view — وهذا مقصود.
alter view public.v_recent_activity set (security_invoker = off);
alter view public.v_impact_stats    set (security_invoker = off);
