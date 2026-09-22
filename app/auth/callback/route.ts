/**
 * تبادل كود OAuth / رابط البريد بجلسة.
 *
 * يُستدعى من روابط التأكيد التي تُرسلها Supabase.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  // منع الإعادة المفتوحة: نقبل المسارات الداخلية فقط.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/enter?error=missing_code`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/enter?error=auth_failed`);
  }

  // ?claim=1 يجعل صفحة الوجهة تشغّل ترحيل بيانات الضيف مرة واحدة.
  const separator = safeNext.includes('?') ? '&' : '?';
  return NextResponse.redirect(`${origin}${safeNext}${separator}claim=1`);
}
