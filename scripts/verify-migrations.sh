#!/usr/bin/env bash
#
# يتحقّق أن ملفات supabase/migrations تُطبَّق من الصفر على قاعدة فارغة.
#
# سبب وجوده: المخطط الأساسي لم يكن مُسجَّلًا كهجرة في البداية، فكانت الهجرات
# تفشل على أي قاعدة جديدة لأنها تُعدّل جداول غير موجودة. هذا السكربت يمنع
# تكرار ذلك.
#
# يشغّل PostgreSQL محليًا ويحاكي ما توفّره منصة Supabase (أدوار anon /
# authenticated، مخطط auth، Vault، pg_net). المحاكاة للتحقّق النحوي وترتيب
# الاعتماديات فقط — وليست بديلًا عن `supabase start`.
#
#   ./scripts/verify-migrations.sh
#
set -euo pipefail

PORT="${PGPORT_TEST:-55432}"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
MIGRATIONS="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "لم يُعثر على PostgreSQL في '$PGBIN' — ثبّتيه أو اضبطي PGBIN." >&2
  exit 127
fi

# PostgreSQL يرفض العمل بصلاحيات الجذر. عند التشغيل كـ root (حاويات CI عادةً)
# ننفّذ أوامر الخادم بمستخدم غير مميّز، ونضع كل شيء في مجلد يملكه.
RUN_AS="${PG_RUN_AS:-postgres}"
if [ "$(id -u)" -eq 0 ]; then
  id "$RUN_AS" >/dev/null 2>&1 || {
    echo "التشغيل كجذر يتطلّب مستخدمًا غير مميّز؛ اضبطي PG_RUN_AS." >&2; exit 1; }
  WORK="$(mktemp -d /var/tmp/robocycle-replay.XXXXXX)"
  chown "$RUN_AS" "$WORK"
  as_pg() { su "$RUN_AS" -c "$1"; }
else
  WORK="$(mktemp -d)"
  as_pg() { bash -c "$1"; }
fi

cleanup() {
  as_pg "'$PGBIN/pg_ctl' -D '$WORK/data' stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

as_pg "'$PGBIN/initdb' -D '$WORK/data' -U postgres --auth=trust" >/dev/null
as_pg "'$PGBIN/pg_ctl' -D '$WORK/data' -o '-p $PORT -k $WORK' -l '$WORK/pg.log' start" >/dev/null
sleep 1

psql() { as_pg "'$PGBIN/psql' -p '$PORT' -U postgres -h '$WORK' -v ON_ERROR_STOP=1 -q $*"; }

# عبر ملف لا عبر -c: غلاف su يمرّر الوسائط كسلسلة واحدة فتُكسَر الاقتباسات.
printf 'create database replay;\n' > "$WORK/createdb.sql"
chmod -R a+rX "$WORK"
psql -d postgres -f "$WORK/createdb.sql" >/dev/null

cat > "$WORK/stub.sql" <<'STUB'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists net;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to public;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, phone text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid; $$;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique, description text, secret text
);
create view vault.decrypted_secrets as
  select id, name, description, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
returns uuid language sql as $$
  insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id; $$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null)
returns void language sql as $$
  update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id; $$;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                                         headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 1::bigint $$;
grant usage on schema public to anon, authenticated, service_role;
STUB

chmod -R a+rX "$WORK"
psql -d replay -f "$WORK/stub.sql" >/dev/null
echo "✓ محاكاة كائنات Supabase جاهزة"

mkdir -p "$WORK/migrations"
cp "$MIGRATIONS"/*.sql "$WORK/migrations/"
# pg_net امتداد خاص بالمنصّة وغير متاح محليًا؛ البديل في المحاكاة أعلاه.
sed -i 's/^create extension if not exists pg_net;/-- [harness] pg_net stubbed/' "$WORK/migrations"/*.sql
chmod -R a+rX "$WORK"

failed=0
for f in "$WORK"/migrations/*.sql; do
  if psql -d replay -f "$f" >/dev/null 2>"$WORK/err.txt"; then
    echo "  ✓ $(basename "$f")"
  else
    echo "  ✗ $(basename "$f")"
    sed 's/^/      /' "$WORK/err.txt" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "فشلت إعادة تشغيل الهجرات." >&2
  exit 1
fi

echo "✓ كل الهجرات طُبِّقت بنجاح على قاعدة فارغة"
