'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { peekWalletKey } from '@/lib/guest/wallet';

import RewardCard, { type Reward } from './RewardCard';

/**
 * يملك الرصيد ويمرّره للبطاقات.
 *
 * رصيد المستخدم المسجَّل يأتي من الخادم. أما الضيف فمفتاح محفظته في
 * localStorage ولا يستطيع الخادم قراءته، فيُجلب هنا مرة واحدة ويُشارَك مع كل
 * البطاقات — وإلا ظهر الرصيد صفرًا بينما تبقى أزرار الاستبدال مفعّلة.
 */
export default function RewardsList({
  rewards,
  serverBalance,
  isGuest,
}: {
  rewards: Reward[];
  serverBalance: number | null;
  isGuest: boolean;
}) {
  const [balance, setBalance] = useState<number | null>(serverBalance);

  useEffect(() => {
    if (!isGuest) return;

    const walletKey = peekWalletKey();
    if (!walletKey) {
      setBalance(0);
      return;
    }

    let cancelled = false;
    createClient()
      .rpc('wallet_balance', { p_wallet_key: walletKey })
      .then(({ data }) => {
        if (!cancelled) setBalance(typeof data === 'number' ? data : 0);
      });

    return () => {
      cancelled = true;
    };
  }, [isGuest]);

  return (
    <>
      <div className="card">
        <h1>المكافآت</h1>
        <p className="sub">استبدلي نقاطك بمكافآت من شركائنا.</p>

        <div className="stat">
          <span>{isGuest ? 'رصيدك (وضع الضيف)' : 'رصيدك'}</span>
          <span>{balance === null ? '…' : `${balance} نقطة`}</span>
        </div>

        {isGuest && (
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
    </>
  );
}
