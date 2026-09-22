import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import RewardsList from './RewardsList';
import { type Reward } from './RewardCard';

export const metadata = { title: 'المكافآت — روبو سايكل' };

type Summary = { ok?: boolean; points?: number };

export default async function RewardsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  return (
    <main>
      <RewardsList
        rewards={rewards}
        serverBalance={user && summary?.ok ? (summary.points ?? 0) : null}
        isGuest={!user}
      />

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
