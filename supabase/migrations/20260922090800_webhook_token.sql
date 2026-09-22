-- ============================================================================
-- RoboCycle — 09. مصادقة الـ webhook برمز مخصّص بدل مفتاح الخدمة
-- ----------------------------------------------------------------------------
-- الهجرة 05 كانت ترسل SUPABASE_SERVICE_ROLE_KEY في ترويسة Authorization إلى
-- Edge Function. ذلك يعمل، لكنه يمرّر أقوى مفتاح في المشروع عبر الشبكة في كل
-- حدث، ويجعل تدويره مؤلمًا.
--
-- البديل هنا: رمز عشوائي (٢٥٦ بت) خاص بهذا المسار فقط، يُولَّد داخل القاعدة
-- ويُخزَّن في Vault ولا يغادرها إلا في ترويسة الطلب. تتحقّق منه Edge Function
-- عبر verify_webhook_token باستخدام مفتاح الخدمة الذي تحقنه Supabase تلقائيًا
-- في بيئتها — فلا يحتاج أحد إلى معرفة الرمز أو نسخه يدويًا.
--
-- تدوير الرمز لاحقًا: select public.rotate_webhook_token();
-- ============================================================================

-- --------------------------------------------- ضبط أسرار الإرسال (idempotent)
do $$
declare
  v_url   text := 'https://kaanfupnhyleeuiqzvvq.supabase.co/functions/v1/notify-events';
  v_token text;
begin
  if not exists (select 1 from vault.secrets where name = 'robocycle_webhook_url') then
    perform vault.create_secret(v_url, 'robocycle_webhook_url', 'عنوان Edge Function لاستقبال أحداث RoboCycle');
  end if;

  if not exists (select 1 from vault.secrets where name = 'robocycle_webhook_token') then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(v_token, 'robocycle_webhook_token', 'رمز مصادقة مسار الأحداث — خاص بهذا المسار وحده');
  end if;
end;
$$;

-- ------------------------------------- تحقّق Edge Function من الرمز عبر القاعدة
-- تُستدعى بمفتاح الخدمة (service_role) من داخل Edge Function فقط.
create or replace function public.verify_webhook_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text := private.get_secret('robocycle_webhook_token');
begin
  if v_expected is null or p_token is null then
    return false;
  end if;
  -- الرمز عشوائي بـ ٢٥٦ بت، فهجمات التوقيت غير عملية هنا.
  return p_token = v_expected;
end;
$$;

revoke all     on function public.verify_webhook_token(text) from public, anon, authenticated;
grant  execute on function public.verify_webhook_token(text) to service_role;

-- ------------------------------------------------------------- تدوير الرمز
create or replace function public.rotate_webhook_token()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select id into v_id from vault.secrets where name = 'robocycle_webhook_token';
  if v_id is null then
    perform vault.create_secret(v_token, 'robocycle_webhook_token', 'رمز مصادقة مسار الأحداث');
  else
    perform vault.update_secret(v_id, v_token);
  end if;
  return 'تم التدوير — لا حاجة لأي خطوة يدوية، فالطرفان يقرآن الرمز من Vault.';
end;
$$;

revoke all on function public.rotate_webhook_token() from public, anon, authenticated;
