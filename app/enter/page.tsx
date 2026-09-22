import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import EnterForm from './EnterForm';

export const metadata = { title: 'الدخول — روبو سايكل' };

export default async function EnterPage({
  searchParams,
}: {
  searchParams: { next?: string; upgrade?: string };
}) {
  const rawNext = searchParams.next ?? '/dashboard';
  // منع الإعادة المفتوحة: المسارات الداخلية فقط.
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';
  const upgrade = searchParams.upgrade === '1';

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // مستخدم كامل بالفعل: لا داعي لعرض صفحة الدخول.
  if (user && !user.is_anonymous) {
    redirect(next);
  }

  return (
    <main>
      <EnterForm next={next} upgrade={upgrade || Boolean(user?.is_anonymous)} />
    </main>
  );
}
