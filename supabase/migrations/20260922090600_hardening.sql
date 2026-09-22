-- ============================================================================
-- RoboCycle — 07. تشديد الصلاحيات (استجابة لمدقّق Supabase الأمني)
-- ----------------------------------------------------------------------------
-- 1) دوال المشغّلات كانت مكشوفة كنقاط RPC على /rest/v1/rpc/<name>. هي تفشل
--    خارج سياق المشغّل، لكن لا سبب لإبقائها قابلة للاستدعاء أصلًا.
-- 2) touch_updated_at كانت بلا search_path ثابت.
-- 3) استبدال view لوحة الصدارة بدالة SECURITY DEFINER صريحة بدل view يتجاوز
--    RLS ضمنيًا (يرصده المدقّق كخطأ security_definer_view).
-- ============================================================================

-- ------------------------------------------- 1) تثبيت search_path للدالة العادية
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- --------------------------- 2) سحب EXECUTE من كل دوال المشغّلات الداخلية
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.apply_ledger_to_profile()',
    'public.award_points_for_submission()',
    'public.charge_points_for_redemption()',
    'public.dispatch_notification_event()',
    'public.emit_points_threshold_events()',
    'public.emit_redemption_event()',
    'public.emit_submission_verified_event()',
    'public.guard_redemption_balance()',
    'public.handle_new_user()',
    'public.set_row_owner()',
    'public.sync_guest_flag()',
    'public.touch_updated_at()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

-- --------------------------------- 3) لوحة الصدارة كدالة بدل view متجاوز لـ RLS
drop view if exists public.leaderboard;

create or replace function public.get_leaderboard(p_limit integer default 20)
returns table (rank bigint, display_name text, points integer)
language sql
security definer
set search_path = public
as $$
  select rank() over (order by p.points desc) as rank,
         p.display_name,
         p.points
    from public.profiles p
   where p.points > 0
     and not p.is_guest
   order by p.points desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

comment on function public.get_leaderboard(integer) is
  'لوحة صدارة مُجمّعة: تكشف الاسم والنقاط فقط ولا تسمح بقراءة صفوف profiles.';

revoke all     on function public.get_leaderboard(integer) from public;
grant  execute on function public.get_leaderboard(integer) to anon, authenticated;

-- الدوال المقصود استدعاؤها من العميل (تأكيد صريح)
revoke all     on function public.claim_guest_wallet(text) from public, anon;
grant  execute on function public.claim_guest_wallet(text) to authenticated;
revoke all     on function public.get_my_summary() from public, anon;
grant  execute on function public.get_my_summary() to authenticated;
