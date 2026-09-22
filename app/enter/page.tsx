import { redirect } from 'next/navigation';

import { safeInternalPath } from '@/lib/auth/routes';
import { createClient } from '@/lib/supabase/server';

import EnterForm from './EnterForm';

export const metadata = { title: 'الدخول — روبو سايكل' };

export default async function EnterPage({
  searchParams,
}: {
  searchParams: { next?: string; upgrade?: string };
}) {
  // منع الإعادة المفتوحة: المسارات الداخلية فقط.
  const next = safeInternalPath(searchParams.next, '/dashboard');
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
