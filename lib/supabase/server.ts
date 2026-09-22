/**
 * عملاء Supabase للخادم (Server Components / Route Handlers / Server Actions).
 */
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types';

/**
 * العميل العادي: يعمل بصلاحيات المستخدم الحالي، وتُطبَّق عليه سياسات RLS.
 * هذا هو ما تستخدمه في 99% من الحالات.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // الاستدعاء من Server Component: تحديث الكوكيز يتم في middleware.
            // تجاهُل الخطأ هنا آمن ما دام middleware يُحدِّث الجلسة.
          }
        },
      },
    },
  );
}

/**
 * عميل بصلاحيات الخدمة: يتجاوز RLS بالكامل.
 *
 * للمهام الإدارية فقط (توثيق التسليمات، معالجة الأحداث، السكربتات).
 * لا تستدعِه أبدًا من كود يصل إليه المتصفح.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY غير مضبوط — مطلوب لعميل الخدمة.');
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
