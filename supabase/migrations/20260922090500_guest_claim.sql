-- ============================================================================
-- RoboCycle — 06. ترحيل بيانات الضيف إلى حساب مسجَّل
-- ----------------------------------------------------------------------------
-- هناك مساران للترقية، والأول هو المفضّل:
--
--  (أ) ضيف بجلسة مجهولة (supabase.auth.signInAnonymously)
--      الترقية عبر supabase.auth.updateUser({ email, password }) تُبقي نفس
--      user_id، فلا حاجة لأي ترحيل — البيانات مرتبطة بالحساب أصلًا.
--
--  (ب) ضيف قديم بلا جلسة، بياناته مرتبطة بـ wallet_key في localStorage فقط.
--      بعد التسجيل يستدعي العميل claim_guest_wallet(wallet_key) مرة واحدة
--      لنقل ملكية الصفوف اليتيمة إلى الحساب الجديد.
-- ============================================================================

create or replace function public.claim_guest_wallet(p_wallet_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid           uuid := auth.uid();
  v_target_wallet text;
  v_submissions   integer := 0;
  v_ledger        integer := 0;
  v_redemptions   integer := 0;
  v_points        integer := 0;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED: يلزم تسجيل الدخول قبل ترحيل بيانات الضيف'
      using errcode = 'insufficient_privilege';
  end if;

  p_wallet_key := trim(coalesce(p_wallet_key, ''));

  -- مفتاح المحفظة سرّ بحكم الأمر الواقع؛ نرفض المفاتيح القصيرة القابلة للتخمين.
  if char_length(p_wallet_key) not between 12 and 64 then
    raise exception 'INVALID_WALLET_KEY: مفتاح المحفظة غير صالح'
      using errcode = 'check_violation';
  end if;

  -- محفظة يملكها حساب آخر لا تُنتزع منه.
  if exists (select 1 from public.profiles where wallet_key = p_wallet_key and id <> v_uid) then
    raise exception 'WALLET_ALREADY_CLAIMED: هذه المحفظة مرتبطة بحساب آخر'
      using errcode = 'unique_violation';
  end if;

  select wallet_key into v_target_wallet from public.profiles where id = v_uid;
  if v_target_wallet is null then
    raise exception 'PROFILE_MISSING: لا يوجد ملف شخصي لهذا الحساب';
  end if;

  perform set_config('robocycle.internal', 'on', true);

  -- تُنقل الصفوف اليتيمة فقط (user_id is null) — لا تُمسّ بيانات حساب آخر.
  update public.submissions
     set user_id = v_uid, wallet_key = v_target_wallet
   where wallet_key = p_wallet_key and user_id is null;
  get diagnostics v_submissions = row_count;

  update public.points_ledger
     set user_id = v_uid, wallet_key = v_target_wallet
   where wallet_key = p_wallet_key and user_id is null;
  get diagnostics v_ledger = row_count;

  update public.redemptions
     set user_id = v_uid, wallet_key = v_target_wallet
   where wallet_key = p_wallet_key and user_id is null;
  get diagnostics v_redemptions = row_count;

  -- إعادة بناء الرصيد من السجل بدل الاعتماد على المشغّل التراكمي أثناء النقل.
  select greatest(0, coalesce(sum(delta), 0))::integer into v_points
    from public.points_ledger where user_id = v_uid;

  update public.profiles set points = v_points where id = v_uid;

  perform set_config('robocycle.internal', 'off', true);

  return jsonb_build_object(
    'ok',                 true,
    'claimed_wallet_key', p_wallet_key,
    'wallet_key',         v_target_wallet,
    'submissions',        v_submissions,
    'ledger_entries',     v_ledger,
    'redemptions',        v_redemptions,
    'points',             v_points
  );
end;
$$;

revoke execute on function public.claim_guest_wallet(text) from public, anon;
grant   execute on function public.claim_guest_wallet(text) to authenticated;

-- ---------------------------------------------------------------------------
-- لقطة موحّدة لحالة المستخدم (نداء واحد بدل عدة استعلامات من العميل)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_p   public.profiles%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'AUTH_REQUIRED');
  end if;

  select * into v_p from public.profiles where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'PROFILE_MISSING');
  end if;

  return jsonb_build_object(
    'ok',           true,
    'id',           v_p.id,
    'display_name', v_p.display_name,
    'wallet_key',   v_p.wallet_key,
    'points',       v_p.points,
    'is_guest',     v_p.is_guest,
    'submissions',  (select count(*) from public.submissions  where user_id = v_uid),
    'redemptions',  (select count(*) from public.redemptions  where user_id = v_uid),
    'next_threshold', (
      select jsonb_build_object('threshold', t.threshold, 'label_ar', t.label_ar,
                                'remaining', t.threshold - v_p.points)
        from public.points_thresholds t
       where t.is_active and t.threshold > v_p.points
       order by t.threshold limit 1
    )
  );
end;
$$;

revoke execute on function public.get_my_summary() from public, anon;
grant   execute on function public.get_my_summary() to authenticated;
