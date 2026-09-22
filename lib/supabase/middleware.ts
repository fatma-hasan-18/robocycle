/**
 * تحديث جلسة Supabase على كل طلب + حماية المسارات.
 *
 * ملاحظة مهمة: لا تضع أي منطق بين createServerClient و getUser()، فقد يؤدي
 * ذلك إلى تسجيل خروج عشوائي بسبب انتهاء صلاحية التوكن.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { isProtectedPath, isPublicPath } from '@/lib/auth/routes';

import type { Database } from './types';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // وضع الضيف محفوظ: المستخدم المجهول (is_anonymous) له جلسة صالحة ويمر
  // من هنا بلا اعتراض؛ الحماية تخصّ المسارات التي تتطلّب حسابًا كاملًا فقط.
  if (isProtectedPath(pathname) && !isPublicPath(pathname)) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/enter';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }

    if (user.is_anonymous) {
      const url = request.nextUrl.clone();
      url.pathname = '/enter';
      url.searchParams.set('upgrade', '1');
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  // يجب إرجاع supabaseResponse نفسه (لا نسخة جديدة) حتى لا تضيع الكوكيز.
  return supabaseResponse;
}
