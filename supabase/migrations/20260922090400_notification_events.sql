-- ============================================================================
-- RoboCycle — 05. طابور الأحداث + إرسالها إلى Edge Function / Webhook
-- ----------------------------------------------------------------------------
-- نمط outbox: المشغّلات تكتب صفًا في notification_events (سريع وموثوق داخل
-- المعاملة)، ثم دالة الإرسال تستدعي Edge Function عبر pg_net بشكل غير متزامن.
-- إن لم تُضبط أسرار الإرسال بعد، يبقى الحدث pending بلا فشل — يمكن ضبطها
-- لاحقًا وإعادة إرسال المتراكم عبر public.dispatch_pending_events().
-- ============================================================================

create extension if not exists pg_net;
create schema if not exists private;

-- ------------------------------------------------------------ جدول الأحداث
create table if not exists public.notification_events (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users (id) on delete cascade,
  wallet_key   text,
  event_type   text        not null check (event_type in ('points_threshold', 'reward_redeemed', 'submission_verified')),
  payload      jsonb       not null default '{}'::jsonb,
  status       text        not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts     integer     not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.notification_events is 'طابور أحداث صادرة (outbox): عتبات النقاط، الاستبدال، توثيق العمليات.';

create index if not exists notification_events_pending_idx
  on public.notification_events (created_at) where status = 'pending';
create index if not exists notification_events_user_idx
  on public.notification_events (user_id, created_at desc);

-- عتبة واحدة لكل مستخدم مرة واحدة فقط
create unique index if not exists notification_events_threshold_uniq
  on public.notification_events (user_id, ((payload ->> 'threshold')::int))
  where event_type = 'points_threshold' and user_id is not null;

alter table public.notification_events enable row level security;

drop policy if exists notification_events_select_own on public.notification_events;
create policy notification_events_select_own on public.notification_events
  for select to authenticated
  using (user_id = (select auth.uid()));
-- لا سياسة INSERT/UPDATE: الكتابة حصرًا عبر المشغّلات (security definer).

-- ----------------------------------------------- عتبات النقاط القابلة للضبط
create table if not exists public.points_thresholds (
  threshold  integer primary key check (threshold > 0),
  label_ar   text    not null,
  is_active  boolean not null default true
);

alter table public.points_thresholds enable row level security;
drop policy if exists points_thresholds_select on public.points_thresholds;
create policy points_thresholds_select on public.points_thresholds
  for select to anon, authenticated using (is_active);

insert into public.points_thresholds (threshold, label_ar) values
  (100,  'أول ١٠٠ نقطة 🎉'),
  (250,  'وصلت ٢٥٠ نقطة'),
  (500,  'وصلت ٥٠٠ نقطة — مكافآت جديدة متاحة'),
  (1000, 'ألف نقطة! 🏆'),
  (2500, 'بطل إعادة التدوير — ٢٥٠٠ نقطة')
on conflict (threshold) do nothing;

-- ------------------------------------------------- 1) تجاوز عتبة النقاط
create or replace function public.emit_points_threshold_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  if new.points <= old.points then
    return new;                                   -- الخصم لا يُطلق تنبيهًا
  end if;

  for t in
    select threshold, label_ar
      from public.points_thresholds
     where is_active
       and threshold >  old.points
       and threshold <= new.points
     order by threshold
  loop
    insert into public.notification_events (user_id, wallet_key, event_type, payload)
    values (
      new.id, new.wallet_key, 'points_threshold',
      jsonb_build_object(
        'threshold',    t.threshold,
        'label_ar',     t.label_ar,
        'points',       new.points,
        'display_name', new.display_name
      )
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_emit_threshold_events on public.profiles;
create trigger profiles_emit_threshold_events
  after update of points on public.profiles
  for each row execute function public.emit_points_threshold_events();

-- ------------------------------------------------- 2) استبدال مكافأة
create or replace function public.emit_redemption_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select name_ar into v_title from public.rewards where id = new.reward_id;

  insert into public.notification_events (user_id, wallet_key, event_type, payload)
  values (
    new.user_id, new.wallet_key, 'reward_redeemed',
    jsonb_build_object(
      'redemption_id', new.id,
      'reward_id',     new.reward_id,
      'reward_name_ar', coalesce(v_title, new.reward_id),
      'cost_points',   new.cost_points,
      'voucher_code',  new.voucher_code
    )
  );
  return new;
end;
$$;

drop trigger if exists redemptions_emit_event on public.redemptions;
create trigger redemptions_emit_event
  after insert on public.redemptions
  for each row execute function public.emit_redemption_event();

-- ------------------------------------------------- 3) توثيق عملية تدوير
create or replace function public.emit_submission_verified_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'verified' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'verified' then
    return new;
  end if;

  insert into public.notification_events (user_id, wallet_key, event_type, payload)
  values (
    new.user_id, new.wallet_key, 'submission_verified',
    jsonb_build_object(
      'submission_id', new.id,
      'category_id',   new.category_id,
      'device_label',  new.device_label,
      'points',        new.points,
      'deposit_code',  new.deposit_code
    )
  );
  return new;
end;
$$;

drop trigger if exists submissions_emit_verified_event on public.submissions;
create trigger submissions_emit_verified_event
  after insert or update of status on public.submissions
  for each row execute function public.emit_submission_verified_event();

-- ==========================================================================
-- الإرسال: pg_net → Edge Function
-- --------------------------------------------------------------------------
-- الأسرار تُقرأ من Supabase Vault وليس من الشيفرة. اضبطها مرة واحدة عبر:
--   select vault.create_secret('https://<ref>.functions.supabase.co/notify-events',
--                              'robocycle_webhook_url');
--   select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY>', 'robocycle_webhook_token');
-- ==========================================================================

create or replace function private.get_secret(p_name text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

revoke execute on function private.get_secret(text) from public, anon, authenticated;

create or replace function public.dispatch_notification_event()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url   text := private.get_secret('robocycle_webhook_url');
  v_token text := private.get_secret('robocycle_webhook_token');
begin
  if v_url is null or v_token is null then
    return new;                                   -- غير مضبوط بعد: يبقى pending
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_token
               ),
    body    := jsonb_build_object(
                 'event_id',   new.id,
                 'event_type', new.event_type,
                 'user_id',    new.user_id,
                 'wallet_key', new.wallet_key,
                 'payload',    new.payload,
                 'created_at', new.created_at
               ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notification_events_dispatch on public.notification_events;
create trigger notification_events_dispatch
  after insert on public.notification_events
  for each row execute function public.dispatch_notification_event();

-- إعادة إرسال ما تراكم قبل ضبط الأسرار (أو بعد فشل مؤقت)
create or replace function public.dispatch_pending_events(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public, net
as $$
declare
  v_url   text := private.get_secret('robocycle_webhook_url');
  v_token text := private.get_secret('robocycle_webhook_token');
  e       record;
  v_count integer := 0;
begin
  if v_url is null or v_token is null then
    raise exception 'WEBHOOK_NOT_CONFIGURED: اضبط robocycle_webhook_url و robocycle_webhook_token في Vault';
  end if;

  for e in
    select * from public.notification_events
     where status = 'pending' and attempts < 5
     order by created_at
     limit p_limit
  loop
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_token),
      body    := jsonb_build_object('event_id', e.id, 'event_type', e.event_type,
                                    'user_id', e.user_id, 'wallet_key', e.wallet_key,
                                    'payload', e.payload, 'created_at', e.created_at),
      timeout_milliseconds := 5000
    );
    update public.notification_events set attempts = attempts + 1 where id = e.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.dispatch_pending_events(integer) from public, anon, authenticated;

-- تُستدعى من Edge Function بمفتاح service_role بعد نجاح/فشل الإرسال
create or replace function public.mark_event_processed(p_event_id bigint, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notification_events
     set status       = case when p_ok then 'sent' else 'failed' end,
         last_error   = p_error,
         processed_at = now()
   where id = p_event_id;
$$;

revoke execute on function public.mark_event_processed(bigint, boolean, text) from public, anon, authenticated;
