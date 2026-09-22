# RoboCycle — روبو سايكل

تطبيق إعادة تدوير الأجهزة الإلكترونية: صوّري جهازك، سلّميه في أقرب حاوية،
واكسبي نقاطًا تستبدلينها بمكافآت.

- **الإطار:** Next.js 14 (App Router)
- **الواجهة الخلفية:** Supabase — PostgreSQL + Auth + RLS + Edge Functions
- **اللغة:** العربية (RTL على مستوى المستند)

## التشغيل محليًا

```bash
npm install
cp .env.example .env.local   # ثم املئي المفاتيح من لوحة Supabase
npm run dev
```

## تطبيق الهجرات

```bash
supabase link --project-ref kaanfupnhyleeuiqzvvq
supabase db push
```

## البنية

```
app/                    صفحات Next.js (/, /enter, /rewards, /dashboard, /auth/callback)
lib/supabase/           عملاء Supabase + الأنواع المُولَّدة
lib/auth/               Server Actions للمصادقة
lib/guest/              وضع الضيف وترحيل بياناته
supabase/migrations/    هجرات SQL
supabase/functions/     Edge Functions
tests/                  اختبارات
scripts/                أدوات التحقّق
docs/SUPABASE.md        دليل التكامل المفصّل
```

## أوامر مفيدة

| الأمر | الغرض |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run build` | بناء الإنتاج |
| `npm run typecheck` | فحص الأنواع |
| `npm test` | اختبارات قواعد المسارات |
| `npm run db:verify` | تطبيق الهجرات على قاعدة فارغة للتأكّد من سلامتها |
| `npm run db:types` | إعادة توليد `lib/supabase/types.ts` |

التفاصيل الكاملة للواجهة الخلفية في **[`docs/SUPABASE.md`](docs/SUPABASE.md)**.
