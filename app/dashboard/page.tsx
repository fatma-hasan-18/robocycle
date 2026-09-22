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
  next_threshold?: { threshold: number; label_ar: string; remaining: number } | null;
};

const STATUS_AR: Record<string, string> = {
  analyzed: 'بانتظار الإيداع',
  deposited: 'بانتظار التوثيق',
  verified: 'موثَّق',
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('ar-KW', { dateStyle: 'medium' }).format(new Date(iso));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { claim?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { redirect } = await import('next/navigation');
    redirect('/enter?next=/dashboard');
  }

  const [summaryResult, submissionsResult, ledgerResult] = await Promise.all([
    supabase.rpc('get_my_summary'),
    supabase
      .from('submissions')
      .select('id, device_label, category_id, status, points, deposit_code, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('points_ledger')
      .select('id, delta, reason_ar, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const summary = (summaryResult.data ?? { ok: false }) as Summary;
  const submissions = submissionsResult.data ?? [];
  const ledger = ledgerResult.data ?? [];

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
      </div>

      <div className="nav">
        <Link href="/recycle">
          <button type="button">أعيدي تدوير جهاز</button>
        </Link>
        <Link href="/rewards">
          <button className="secondary" type="button">المكافآت</button>
        </Link>
      </div>

      {submissions.length > 0 && (
        <div className="card">
          <h2>عملياتي</h2>
          {submissions.map((s) => (
            <div className="history-row" key={s.id}>
              <span>
                {s.device_label ?? s.category_id}
                <br />
                <span className="when">
                  {formatDate(s.created_at)} · {STATUS_AR[s.status] ?? s.status}
                  {s.status === 'analyzed' && s.deposit_code ? ` · ${s.deposit_code}` : ''}
                </span>
              </span>
              <span>{s.points > 0 ? `${s.points} نقطة` : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {ledger.length > 0 && (
        <div className="card">
          <h2>سجلّ النقاط</h2>
          {ledger.map((row) => (
            <div className="history-row" key={row.id}>
              <span>
                {row.reason_ar}
                <br />
                <span className="when">{formatDate(row.created_at)}</span>
              </span>
              <span className={row.delta > 0 ? 'delta-plus' : 'delta-minus'}>
                {row.delta > 0 ? `+${row.delta}` : row.delta}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <form action={signOut}>
          <button className="secondary" type="submit">
            تسجيل الخروج
          </button>
        </form>
      </div>
    </main>
  );
}
