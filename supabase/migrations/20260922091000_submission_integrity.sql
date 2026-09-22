-- ============================================================================
-- RoboCycle — 11. نزاهة عمليات التسليم + رمز الإيداع
-- ----------------------------------------------------------------------------
-- ثغرة: سياسة التحديث الموروثة تسمح للعميل بتعيين status = 'verified' مباشرة،
-- وعمود points يُرسَل من العميل بلا فحص. ومشغّل منح النقاط يقرأ new.points كما
-- هي — أي أن أي زائر يستطيع:
--
--     insert submissions (points = 999999, status = 'analyzed')
--     update submissions set status = 'verified'
--     → ٩٩٩٩٩٩ نقطة بلا إعادة تدوير شيء
--
-- الإصلاح: النقاط لا تُقبل من العميل إطلاقًا، بل تُحسب في الخادم من فئة الجهاز
-- ووزنه عبر calc_points. والعميل لم يعد يستطيع تعيين 'verified' مباشرة —
-- التوثيق يمرّ حصرًا عبر verify_deposit.
--
-- مسار الحالة:  analyzed → deposited → verified
-- ============================================================================

-- ------------------------------------------------- 1) رمز إيداع يولّده الخادم
create or replace function public.generate_deposit_code()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- بلا أحرف ملتبسة (0/O، 1/I) ليسهل نطق الرمز وقراءته عند الحاوية
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code     text := '';
  v_bytes    bytea;
  i          integer;
begin
  if new.deposit_code is null then
    v_bytes := extensions.gen_random_bytes(6);
    for i in 0 .. 5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    new.deposit_code := 'RC' || v_code;
  end if;
  return new;
end;
$$;

revoke all on function public.generate_deposit_code() from public, anon, authenticated;

drop trigger if exists submissions_generate_deposit_code on public.submissions;
create trigger submissions_generate_deposit_code
  before insert on public.submissions
  for each row execute function public.generate_deposit_code();

-- --------------------------------------- 2) النقاط لا تُقبل من العميل أبدًا
-- يعمل بالاسم aab_ ليُنفَّذ بعد set_row_owner وقبل غيره (ترتيب أبجدي).
create or replace function public.aab_enforce_submission_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- المسار الداخلي الموثوق (verify_deposit) يضبط النقاط بنفسه بعد الحساب.
  if coalesce(current_setting('robocycle.internal', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- تقدير استرشادي فقط، محسوب في الخادم؛ النقاط الفعلية تُمنح عند التوثيق.
    new.points  := 0;
    new.status  := coalesce(nullif(new.status, 'verified'), 'analyzed');
    return new;
  end if;

  -- UPDATE من العميل: لا يغيّر النقاط ولا الوزن الفعلي ولا رمز الإيداع.
  new.points           := old.points;
  new.actual_weight_kg := old.actual_weight_kg;
  new.deposit_code     := old.deposit_code;
  return new;
end;
$$;

revoke all on function public.aab_enforce_submission_points() from public, anon, authenticated;

drop trigger if exists submissions_enforce_points on public.submissions;
create trigger submissions_enforce_points
  before insert or update on public.submissions
  for each row execute function public.aab_enforce_submission_points();

-- ------------------------------- 3) العميل لم يعد يستطيع تعيين 'verified'
drop policy if exists submissions_update_own on public.submissions;
create policy submissions_update_own on public.submissions
  for update to anon, authenticated
  using (
    status = 'analyzed'
    and (user_id is null or user_id = (select auth.uid()))
  )
  with check (
    status = 'deposited'
    and (user_id is null or user_id = (select auth.uid()))
  );

-- --------------------------------------- 4) تأكيد الإيداع برمز الإيداع
create or replace function public.confirm_deposit(p_submission_id uuid, p_deposit_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.submissions;
  v_uid uuid := auth.uid();
begin
  select * into v_sub from public.submissions where id = p_submission_id;
  if v_sub.id is null then
    raise exception 'تسليم غير موجود';
  end if;

  -- الصف المملوك لحساب آخر لا يُمَس. الصفوف اليتيمة (ضيف بلا جلسة) يحميها
  -- رمز الإيداع نفسه.
  if v_sub.user_id is not null and v_sub.user_id is distinct from v_uid then
    raise exception 'هذا التسليم لا يخصّك';
  end if;

  if upper(trim(coalesce(p_deposit_code, ''))) is distinct from upper(v_sub.deposit_code) then
    raise exception 'رمز الإيداع غير صحيح';
  end if;

  if v_sub.status <> 'analyzed' then
    raise exception 'تم تأكيد هذا التسليم مسبقاً';
  end if;

  update public.submissions set status = 'deposited' where id = p_submission_id;

  return jsonb_build_object('ok', true, 'status', 'deposited');
end;
$$;

revoke all     on function public.confirm_deposit(uuid, text) from public;
grant  execute on function public.confirm_deposit(uuid, text) to anon, authenticated;

-- ------------------------------------ 5) التوثيق: النقاط محسوبة في الخادم
-- تصير SECURITY DEFINER لأن سياسة RLS لم تعد تسمح بتعيين 'verified'.
create or replace function public.verify_deposit(p_submission_id uuid, p_actual_weight_kg numeric)
returns integer
language plpgsql
security definer
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
  if p_actual_weight_kg is null or p_actual_weight_kg <= 0 or p_actual_weight_kg > 100 then
    raise exception 'وزن غير صالح';
  end if;

  -- النقاط من فئة الجهاز ووزنه — لا مما يرسله العميل.
  v_points := public.calc_points(v_sub.category_id, p_actual_weight_kg,
                                 jsonb_array_length(v_sub.hazards) > 0);

  perform set_config('robocycle.internal', 'on', true);

  update public.submissions
     set actual_weight_kg = p_actual_weight_kg,
         points           = v_points,
         status           = 'verified'
   where id = p_submission_id;

  perform set_config('robocycle.internal', 'off', true);

  return v_points;
end;
$$;

-- ---------------------------------------------------------------------------
-- ملاحظة أمنية باقية
-- ---------------------------------------------------------------------------
-- النقاط صارت محسوبة في الخادم، لكن الوزن الفعلي ما زال يأتي من مُستدعي
-- verify_deposit. في نشر حقيقي يُفترض أن يستدعيها طرف الحاوية/الموظّف لا
-- المستخدم. لقصرها على الخادم الموثوق (service_role) نفّذي:
--
--   revoke execute on function public.verify_deposit(uuid, numeric)
--     from anon, authenticated;
--
-- تُركت متاحة للعميل الآن حتى تكتمل التجربة من طرف واحد أثناء التطوير.
