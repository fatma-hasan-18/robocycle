-- ============================================================================
-- RoboCycle — 04. سياسات RLS (خصوصية المستخدم)
-- ----------------------------------------------------------------------------
-- الوضع السابق: كل صفوف submissions/points_ledger/redemptions كانت مقروءة
-- لأي زائر (`using (true)`) وقابلة للإدراج بلا قيد — أي أن أي شخص يستطيع
-- قراءة سجل الجميع أو منح نفسه نقاطًا.
--
-- الوضع بعد هذه الهجرة:
--   * صف يملكه مستخدم (user_id not null) → صاحبه فقط يقرأه
--   * صف قديم بلا مالك (user_id is null)  → يبقى كما كان (توافق وضع الضيف)
--   * النقاط تُكتب حصريًا عبر مشغّلات الأتمتة، لا من العميل
--   * لوحة الصدارة تُعرض عبر view مُجمّع لا يكشف صفوفًا فردية
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.submissions        enable row level security;
alter table public.points_ledger      enable row level security;
alter table public.redemptions        enable row level security;
alter table public.bins               enable row level security;
alter table public.rewards            enable row level security;
alter table public.device_categories  enable row level security;

-- -------------------------------------------------------------- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ملاحظة: لا توجد سياسة INSERT/DELETE — الإنشاء يتم حصريًا عبر مشغّل
-- handle_new_user، والحذف يتبع حذف الحساب (on delete cascade).

-- ----------------------------------------------------------- submissions
drop policy if exists "read submissions" on public.submissions;
drop policy if exists submissions_select_own on public.submissions;
create policy submissions_select_own on public.submissions
  for select to anon, authenticated
  using (
    user_id is null                        -- صفوف الضيف القديمة (سلوك سابق)
    or user_id = (select auth.uid())
  );

drop policy if exists "insert submissions" on public.submissions;
drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
  for insert to anon, authenticated
  with check (
    est_weight_kg > 0
    and est_weight_kg <= 100
    and char_length(display_name) <= 40
    -- user_id/wallet_key يُفرضان عبر مشغّل set_row_owner
  );

drop policy if exists "verify submissions" on public.submissions;
drop policy if exists submissions_update_own on public.submissions;
create policy submissions_update_own on public.submissions
  for update to anon, authenticated
  using (
    status <> 'verified'
    and (user_id is null or user_id = (select auth.uid()))
  )
  with check (
    status = 'verified'
    and (user_id is null or user_id = (select auth.uid()))
  );

-- --------------------------------------------------------- points_ledger
drop policy if exists "read ledger" on public.points_ledger;
drop policy if exists points_ledger_select_own on public.points_ledger;
create policy points_ledger_select_own on public.points_ledger
  for select to anon, authenticated
  using (
    user_id is null
    or user_id = (select auth.uid())
  );

-- الإدراج المباشر مسموح فقط للمسار القديم (ضيف بلا جلسة). أي مستخدم لديه
-- جلسة لا يستطيع منح نفسه نقاطًا — المشغّلات وحدها تكتب هنا.
drop policy if exists "insert ledger" on public.points_ledger;
drop policy if exists points_ledger_insert_legacy on public.points_ledger;
create policy points_ledger_insert_legacy on public.points_ledger
  for insert to anon
  with check ((select auth.uid()) is null);

-- ----------------------------------------------------------- redemptions
drop policy if exists "read redemptions" on public.redemptions;
drop policy if exists redemptions_select_own on public.redemptions;
create policy redemptions_select_own on public.redemptions
  for select to anon, authenticated
  using (
    user_id is null
    or user_id = (select auth.uid())
  );

drop policy if exists "insert redemptions" on public.redemptions;
drop policy if exists redemptions_insert on public.redemptions;
create policy redemptions_insert on public.redemptions
  for insert to anon, authenticated
  with check (char_length(voucher_code) between 4 and 32);

-- ------------------------------------------------- جداول مرجعية للقراءة فقط
drop policy if exists "read bins" on public.bins;
create policy bins_select on public.bins
  for select to anon, authenticated using (is_active);

drop policy if exists "read rewards" on public.rewards;
create policy rewards_select on public.rewards
  for select to anon, authenticated using (is_active);

drop policy if exists "read categories" on public.device_categories;
create policy device_categories_select on public.device_categories
  for select to anon, authenticated using (true);

-- ------------------------------------------------------- لوحة الصدارة
-- تُنشأ كدالة SECURITY DEFINER في الهجرة 07 (لا كـ view يتجاوز RLS ضمنيًا،
-- فذلك يرصده مدقّق Supabase الأمني كخطأ security_definer_view).
