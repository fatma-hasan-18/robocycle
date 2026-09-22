/**
 * عميل Supabase للمتصفح (Client Components).
 *
 * يُستخدم في المكوّنات التي تحمل "use client" فقط. الجلسة تُحفظ في كوكيز
 * يقرأها الخادم أيضًا، فيبقى المستخدم مسجَّلًا عبر SSR.
 */
import { createBrowserClient } from '@supabase/ssr';

import type { Database } from './types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
