# دليل تكامل Supabase — RoboCycle

مرجع خطوة بخطوة لطبقة الواجهة الخلفية: المخطط، الأتمتة، RLS، وترحيل بيانات الضيف.

- **معرّف المشروع:** `kaanfupnhyleeuiqzvvq`
- **العنوان:** `https://kaanfupnhyleeuiqzvvq.supabase.co`

---

## ١. نقطة البداية: ما كان موجودًا مسبقًا

المشروع لم يبدأ من الصفر. كان فيه مخطط كامل مبني على **`wallet_key`** — نص عشوائي
يُخزَّن في `localStorage` ويُربط به كل شيء، بلا أي ارتباط بـ `auth.users`:

| الجدول | الدور |
|---|---|
| `device_categories` | فئات الأجهزة ونقاطها لكل كجم |
| `bins` | حاويات الاستلام |
| `rewards` | المكافآت وتكلفتها بالنقاط |
| `submissions` | عمليات التسليم |
| `points_ledger` | سجل حركات النقاط |
| `redemptions` | عمليات استبدال المكافآت |

ودوال RPC: `calc_points`, `verify_deposit`, `redeem_reward`, `wallet_balance`،
وعرضان: `v_recent_activity`, `v_impact_stats`.

**الوضع الأمني السابق:** كل سياسات RLS كانت `using (true)` — أي أن أي زائر يقرأ
سجلّ كل المستخدمين، و`insert ledger` كانت `with check (true)` أي أن أي شخص يمنح
نفسه نقاطًا بطلب واحد.

---

## ٢. الهجرات المُضافة

تُطبَّق بالترتيب عبر `supabase db push` أو من لوحة التحكم.

| # | الملف | الغرض |
|---|---|---|
| 00 | `20260901000000_baseline_schema.sql` | المخطط الأساسي (كان موجودًا بلا هجرة) |
| 01 | `20260922090000_profiles_and_auth.sql` | جدول `profiles` + إنشاؤه تلقائيًا عند التسجيل |
| 02 | `20260922090100_row_ownership.sql` | عمود `user_id` + فرض الملكية من الخادم |
| 03 | `20260922090200_points_automation.sql` | مشغّلات النقاط (منح/خصم/رصيد) |
| 04 | `20260922090300_rls_policies.sql` | سياسات RLS للخصوصية |
| 05 | `20260922090400_notification_events.sql` | طابور الأحداث + الإرسال عبر pg_net |
| 06 | `20260922090500_guest_claim.sql` | `claim_guest_wallet` + `get_my_summary` |
| 07 | `20260922090600_hardening.sql` | سحب الصلاحيات الزائدة + لوحة الصدارة |
| 08 | `20260922090700_reconcile_existing_rpcs.sql` | مواءمة `verify_deposit` و `redeem_reward` |
| 09 | `20260922090800_webhook_token.sql` | رمز مصادقة خاص بمسار الأحداث + تدويره |
| 10 | `20260922090900_reward_stock.sql` | مخزون المكافآت + الخصم الذرّي |

---

## ٣. نموذج الهوية: ثلاث حالات

```
┌────────────────────────┬──────────────┬─────────────┬────────────────────────┐
│ الحالة                 │ auth.users   │ user_id     │ ما يراه المستخدم       │
├────────────────────────┼──────────────┼─────────────┼────────────────────────┤
│ ضيف قديم (بلا جلسة)    │ لا يوجد      │ NULL        │ الصفوف اليتيمة فقط     │
│ ضيف بجلسة مجهولة       │ is_anonymous │ معرّفه      │ صفوفه هو فقط           │
│ حساب كامل              │ نعم          │ معرّفه      │ صفوفه هو فقط           │
└────────────────────────┴──────────────┴─────────────┴────────────────────────┘
```

**الوضع المفضّل للضيوف الجدد هو الجلسة المجهولة** (`signInAnonymously`): يحصل
الضيف على هوية حقيقية تحميها RLS، وترقيته لاحقًا إلى حساب كامل تتم عبر
`updateUser({ email, password })` مع **بقاء نفس `user_id`** — أي بلا ترحيل بيانات
إطلاقًا. مسار `localStorage` القديم يبقى مدعومًا للتوافق فقط.

> ⚠️ **الجلسات المجهولة معطّلة حاليًا في هذا المشروع.** تم التحقّق بنداء فعلي
> على `/auth/v1/signup` فأعاد `anonymous_provider_disabled`. هذا الإعداد لا
> يمكن تغييره عبر API — يلزم تفعيله من اللوحة:
> **Dashboard → Authentication → Sign In / Providers → Allow anonymous sign-ins**.
>
> إلى أن يُفعَّل، يتراجع `continueAsGuest` تلقائيًا إلى وضع الضيف المحلي
> (`localStorage`) — وهو ما كان التطبيق يعمل به أصلًا، فلا شيء ينكسر. بعد
> التفعيل يبدأ المسار الأفضل بلا أي تغيير في الشيفرة.
>
> **تنبيه على وجهة الضيف:** الضيف — بجلسة مجهولة أو بدونها — لا يملك حسابًا
> كاملًا، فوجهته لا يجوز أن تكون مسارًا محميًا وإلا أعاده middleware إلى
> `/enter` ودار في حلقة مغلقة. تتكفّل `guestDestination` بذلك، وتغطّيها
> اختبارات `tests/routes.test.ts`.

---

## ٤. أتمتة النقاط

مصدر حقيقة واحد: النقاط لا تُكتب من العميل أبدًا، بل تتولّد من المشغّلات.

```
submissions.status → 'verified'
        │
        ├─ award_points_for_submission  ─→ points_ledger (+points)
        └─ emit_submission_verified_event ─→ notification_events

redemptions (INSERT)
        │
        ├─ guard_redemption_balance  (قبل) ─→ يرفض إن كان الرصيد لا يكفي
        ├─ charge_points_for_redemption ─→ points_ledger (−cost_points)
        └─ emit_redemption_event ─→ notification_events

points_ledger (أي تغيير)
        └─ apply_ledger_to_profile ─→ profiles.points

profiles.points (ارتفاع)
        └─ emit_points_threshold_events ─→ notification_events
```

**ضمانات:**

- **عدم التكرار:** فهرسان جزئيان فريدان على `points_ledger(submission_id)` و
  `(redemption_id)`؛ فحتى لو أدرج العميل صف السجل بنفسه لا يُحتسب مرتين.
- **عدم السالب:** قيد `profiles_points_non_negative` خط دفاع أخير ضد
  الاستبدال بلا رصيد، حتى في حالات التزامن.
- **التكلفة من الخادم:** `guard_redemption_balance` يتجاهل `cost_points`
  المُرسَل من العميل ويقرأها من جدول `rewards`.
- **الملكية من الخادم:** `set_row_owner` يستبدل أي `user_id`/`wallet_key` يرسله
  العميل بقيم صاحب الجلسة.

### تخصيص توزيع النقاط

النقاط تُحسب في `calc_points` من `device_categories`:

```sql
-- كل كجم من الهواتف = ٦٠ نقطة، مع ١٥٠ نقطة إضافية للأجهزة الخطرة
update public.device_categories
   set points_per_kg = 60, hazard_bonus = 150
 where id = 'phone';
```

### تخصيص العتبات

```sql
insert into public.points_thresholds (threshold, label_ar)
values (5000, 'سفير إعادة التدوير 🌟');
```

---

## ٥. سياسات RLS

| الجدول | القراءة | الكتابة |
|---|---|---|
| `profiles` | صاحبه فقط | لا إدراج/حذف من العميل |
| `submissions` | صفوفه + الصفوف اليتيمة | إدراج بقيود الوزن والاسم |
| `points_ledger` | صفوفه + الصفوف اليتيمة | **لا إدراج لمن لديه جلسة** |
| `redemptions` | صفوفه + الصفوف اليتيمة | إدراج بقيد طول القسيمة |
| `notification_events` | صاحبه فقط | لا كتابة من العميل |
| `bins` / `rewards` / `device_categories` | عامة | لا كتابة |

**ملاحظة عن الصفوف اليتيمة:** الصفوف التي `user_id` فيها `NULL` تبقى مقروءة
للجميع — وهذا مقصود للحفاظ على عمل وضع الضيف القديم دون كسر. بعد نقل كل
المستخدمين إلى الجلسات المجهولة، يمكن تشديدها بحذف `user_id is null` من شرط
الـ `using` في الهجرة 04.

**العروض المجتمعية:** `v_recent_activity` و `v_impact_stats` ضُبطت على
`security_invoker = off` عمدًا لتبقى شاملة رغم RLS — فهي لا تكشف أي معرّف
(لا `wallet_key` ولا `user_id` ولا `deposit_code`)، بل الاسم المعروض والنقاط فقط.
مدقّق Supabase سيرصدهما كـ `security_definer_view`، وهذا متوقّع.

---

## ٦. الأحداث والتنبيهات

نمط **outbox**: المشغّل يكتب صفًا في `notification_events` داخل المعاملة (سريع
وموثوق)، ثم `pg_net` يستدعي Edge Function بشكل غير متزامن.

### الحالة: مُفعَّل ومُختبَر ✅

الهجرة 09 ولّدت رمزًا عشوائيًا (٢٥٦ بت) وخزّنته في Vault، ودالة `notify-events`
منشورة ونشطة. لا توجد خطوة يدوية متبقية في هذا المسار.

**المصادقة لا تستخدم مفتاح الخدمة.** الرمز خاص بهذا المسار وحده ولا يغادر
القاعدة إلا في ترويسة الطلب؛ وتتحقّق منه Edge Function عبر
`verify_webhook_token` مستخدمةً مفتاح الخدمة الذي تحقنه Supabase تلقائيًا في
بيئتها. أي أنه لا يوجد سرّ مكتوب في الشيفرة ولا في متغيّرات البيئة.

تدوير الرمز — بلا أي خطوة يدوية، فالطرفان يقرآنه من Vault:

```sql
select public.rotate_webhook_token();
```

**نتيجة الاختبار الحقيقي** (حدثان عبر `verify_deposit`):

| الحالة | النتيجة |
|---|---|
| رمز صحيح | `200 {"ok":true}` → الحدث `sent` |
| رمز خاطئ | `401 Unauthorized` |
| بلا رمز | `401 Unauthorized` |

لإرسال ما تراكم (بعد عطل مثلًا):

```sql
select public.dispatch_pending_events(100);
```

### الربط بقنوات خارجية (Make / n8n / Twilio / Resend)

في `supabase/functions/notify-events/index.ts` هناك دالة `deliver` واحدة — وهي
نقطة الربط الوحيدة. أبسط طريقة: اضبطي متغيّر البيئة

```bash
supabase secrets set ROBOCYCLE_EXTERNAL_WEBHOOK="https://hook.eu2.make.com/xxxx"
```

فيُمرَّر كل حدث إلى Make/n8n مع رسالة عربية جاهزة (`title` و `body`).

---

## ٧. ترحيل بيانات الضيف

| المسار | الآلية |
|---|---|
| جلسة مجهولة → حساب كامل | `updateUser({ email, password })` — نفس `user_id`، **بلا ترحيل** |
| `localStorage` قديم → حساب | `claim_guest_wallet(wallet_key)` مرة واحدة بعد الدخول |

`claim_guest_wallet` تنقل **الصفوف اليتيمة فقط** (`user_id is null`)، وترفض
المحفظة المرتبطة بحساب آخر، وتعيد بناء الرصيد من السجل بعد النقل.

```ts
const { data, error } = await supabase.rpc('claim_guest_wallet', {
  p_wallet_key: walletKey,
});
// → { ok: true, submissions: 3, ledger_entries: 3, points: 240, ... }
```

في التطبيق يتم ذلك تلقائيًا: `/auth/callback` يضيف `?claim=1`، فيشغّل مكوّن
`ClaimGuestData` الترحيل مرة واحدة.

> **اعتبار أمني:** `wallet_key` سرٌّ بحكم الأمر الواقع — من يعرفه يطالب ببياناته.
> لذا تُرفض المفاتيح الأقصر من ١٢ حرفًا، والمفاتيح المولَّدة عشوائية بـ 96 بت.

---

## ٨. طبقة Next.js

```
lib/supabase/client.ts      عميل المتصفح
lib/supabase/server.ts      عميل الخادم (+ createAdminClient لمفتاح الخدمة)
lib/supabase/middleware.ts  تجديد الجلسة + حماية المسارات
lib/supabase/types.ts       أنواع مُولَّدة — npm run db:types
lib/guest/wallet.ts         مفتاح المحفظة المحلي (آمن بلا localStorage)
lib/guest/migrate.ts        استدعاء claim_guest_wallet
lib/auth/actions.ts         Server Actions: دخول/تسجيل/OTP/ضيف/ترقية/خروج
lib/auth/routes.ts          قواعد المسارات المحمية ومنع الإعادة المفتوحة
middleware.ts               نقطة الدخول
```

**حماية المسارات مع الحفاظ على وضع الضيف:** `PROTECTED_PREFIXES` في
`lib/supabase/middleware.ts` تحدّد ما يتطلّب حسابًا كاملًا. الضيف بجلسة مجهولة
يمرّ في كل ما عداها، ويُوجَّه إلى `/enter?upgrade=1` عند محاولة دخول مسار محمي.

### متغيّرات البيئة

```bash
cp .env.example .env.local
```

| المتغيّر | أين يُستخدم |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | المتصفح والخادم |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | المتصفح والخادم (عام، محمي بـ RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | الخادم فقط — يتجاوز RLS بالكامل |
| `NEXT_PUBLIC_SITE_URL` | روابط تأكيد البريد و OAuth |

> `SUPABASE_SERVICE_ROLE_KEY` بلا بادئة `NEXT_PUBLIC_` عمدًا: أي متغيّر يحمل تلك
> البادئة يُحقن في حزمة المتصفح.

على Vercel: أضيفيها في Project Settings → Environment Variables، و في Supabase
Dashboard → Authentication → URL Configuration أضيفي نطاق الموقع إلى
**Redirect URLs**.

---

## ٨.٥ مخزون المكافآت

`rewards.stock`: `NULL` = كمية غير محدودة، والرقم = المتبقّي.

```sql
update public.rewards set stock = 50 where id = 'store5';   -- كمية محدودة
update public.rewards set stock = null where id = 'tree';    -- غير محدودة
```

الخصم يتم داخل مشغّل `BEFORE INSERT` عبر `UPDATE ... WHERE stock > 0`، وهو
يأخذ قفلًا على الصف، فالطلبات المتزامنة تتسلسل: لا ينزل المخزون تحت الصفر
ولا تُستبدل آخر قطعة مرتين. وحذف صف استبدال يعيد القطعة إلى المخزون
(ويعيد المشغّل النقاط تلقائيًا).

الحارس في المشغّل لا في الدالة عمدًا: الإدراج المباشر في `redemptions`
يتجاوز `redeem_reward` لكنه لا يتجاوز المشغّل.

---

## ٩. التحقّق من الهجرات

```bash
npm run db:verify
```

يشغّل PostgreSQL محليًا، يحاكي ما توفّره منصّة Supabase (الأدوار، `auth`،
Vault، `pg_net`)، ثم يطبّق ملفات `supabase/migrations` بالترتيب على قاعدة
فارغة.

سبب وجوده: المخطط الأساسي لم يكن مُسجَّلًا كهجرة، فكان `supabase db push`
على قاعدة جديدة يفشل — الهجرة 02 تُعدّل جداول لا وجود لها. الهجرة 00 تسدّ
هذه الفجوة، وهذا السكربت يمنع تكرارها.

**تحقّق التطابق:** بصمة المخطط الناتج عن إعادة التشغيل تطابق بصمة المشروع
الحيّ تمامًا — ٢٠٧ كائنات، `md5 = 381a6113…` على الجانبين.

---

## ١٠. الصيانة

```sql
-- إعادة بناء الأرصدة من السجل (بعد ترحيل أو لإصلاح انحراف)
select public.recalculate_points();        -- للجميع
select public.recalculate_points('<uuid>'); -- لمستخدم واحد

-- الأحداث المعلّقة والفاشلة
select status, count(*) from public.notification_events group by status;
select id, event_type, last_error from public.notification_events where status = 'failed';
```

---

## ١١. تحذيرات المدقّق المتوقّعة

بعد التطبيق يبقى في `get_advisors(type: 'security')`:

| التحذير | الحالة |
|---|---|
| `security_definer_view` على `v_recent_activity` / `v_impact_stats` | **مقصود** — إحصاءات مجتمعية بلا معرّفات |
| `anon/authenticated_security_definer_function_executable` على `get_leaderboard`, `claim_guest_wallet`, `get_my_summary` | **مقصود** — هذه هي دوال RPC المخصّصة للعميل |
| `extension_in_public` على `pg_net` | لا يمكن نقله: الامتداد يملك مخطط `net` الخاص به. دواله ليست في `public` فعليًا |

أي تحذير آخر يستحق المراجعة.
