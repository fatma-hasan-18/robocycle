import { redirect } from 'next/navigation';

import Link from 'next/link';

import { signOut } from '@/lib/auth/actions';
import { createClient } from '@/lib/supabase/server';

import ClaimGuestData from './ClaimGuestData';

export const metadata = { title: 'حسابي — روبو سايكل' };

type Summary = {
  ok: boolean;
  display_name?: string;
  points?: number;
  submissions?: number;
  redemptions?: number;
  is_guest?: boolean;
  next_threshold?: { threshold: number; label_ar: string; remaining: number } | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { claim?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/enter?next=/dashboard');

  // نداء واحد بدل عدة استعلامات: الرصيد والعدادات والعتبة التالية.
  const { data } = await supabase.rpc('get_my_summary');
  const summary = (data ?? { ok: false }) as Summary;

  return (
    <main>
      <div className="card">
        <ClaimGuestData enabled={searchParams.claim === '1'} />

        <h1>أهلًا {summary.display_name ?? 'بك'}</h1>
        <p className="sub">لوحة نقاطك وعملياتك.</p>

        <div className="stat">
          <span>الرصيد</span>
          <span>{summary.points ?? 0} نقطة</span>
        </div>
        <div className="stat">
          <span>عمليات إعادة التدوير</span>
          <span>{summary.submissions ?? 0}</span>
        </div>
        <div className="stat">
          <span>المكافآت المستبدلة</span>
          <span>{summary.redemptions ?? 0}</span>
        </div>
        {summary.next_threshold && (
          <div className="stat">
            <span>{summary.next_threshold.label_ar}</span>
            <span>باقٍ {summary.next_threshold.remaining} نقطة</span>
          </div>
        )}

        <div className="divider" />
        <Link href="/rewards">
          <button type="button" style={{ marginBottom: '.5rem' }}>
            استبدال النقاط بمكافآت
          </button>
        </Link>
        <form action={signOut}>
          <button className="secondary" type="submit">
            تسجيل الخروج
          </button>
        </form>
      </div>
    </main>
  );
}
