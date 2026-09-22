import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import GuestBalance from './GuestBalance';
import RewardCard, { type Reward } from './RewardCard';

export const metadata = { title: 'المكافآت — روبو سايكل' };

type Summary = { ok?: boolean; points?: number; display_name?: string };

export default async function RewardsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ثلاثة استعلامات مستقلة — تُنفَّذ معًا بدل التتابع.
  const [rewardsResult, summaryResult, leaderboardResult] = await Promise.all([
    supabase
      .from('rewards')
      .select('id, name_ar, detail_ar, cost_points, worth_kwd, stock')
      .eq('is_active', true)
      .order('sort_order'),
    user ? supabase.rpc('get_my_summary') : Promise.resolve({ data: null }),
    supabase.rpc('get_leaderboard', { p_limit: 5 }),
  ]);

  const rewards = (rewardsResult.data ?? []) as Reward[];
  const summary = (summaryResult.data ?? null) as Summary | null;
  const leaderboard = leaderboardResult.data ?? [];

  const balance = user && summary?.ok ? (summary.points ?? 0) : null;

  return (
    <main>
      <div className="card">
        <h1>المكافآت</h1>
        <p className="sub">استبدلي نقاطك بمكافآت من شركائنا.</p>

        {user ? (
          <div className="stat">
            <span>رصيدك</span>
            <span>{balance ?? 0} نقطة</span>
          </div>
        ) : (
          <GuestBalance />
        )}

        {!user && (
          <p className="notice ok">
            أنت في وضع الضيف — نقاطك محفوظة على هذا الجهاز.{' '}
            <Link href="/enter">أنشئي حسابًا</Link> للاحتفاظ بها على كل أجهزتك.
          </p>
        )}
      </div>

      <div className="rewards">
        {rewards.length === 0 ? (
          <div className="card">
            <p className="sub">لا توجد مكافآت متاحة حاليًا.</p>
          </div>
        ) : (
          rewards.map((reward) => (
            <RewardCard key={reward.id} reward={reward} balance={balance} />
          ))
        )}
      </div>

      {leaderboard.length > 0 && (
        <div className="card">
          <h2>لوحة الصدارة</h2>
          <p className="sub">أعلى المساهمين في إعادة التدوير.</p>
          {leaderboard.map((row) => (
            <div className="stat" key={`${row.rank}-${row.display_name}`}>
              <span>
                {row.rank}. {row.display_name}
              </span>
              <span>{row.points} نقطة</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <Link href="/">
          <button className="secondary" type="button">
            العودة للرئيسية
          </button>
        </Link>
      </div>
    </main>
  );
}
