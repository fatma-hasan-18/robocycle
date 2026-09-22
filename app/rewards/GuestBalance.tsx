'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { peekWalletKey } from '@/lib/guest/wallet';

/**
 * رصيد الضيف.
 *
 * نقاط الضيف محفوظة في القاعدة تحت مفتاح المحفظة، لكن المفتاح نفسه في
 * localStorage — فلا يمكن للخادم قراءته، ولذلك يُجلب الرصيد من المتصفح.
 */
export default function GuestBalance() {
  const [points, setPoints] = useState<number | null>(null);

  useEffect(() => {
    const walletKey = peekWalletKey();
    if (!walletKey) {
      setPoints(0);
      return;
    }

    let cancelled = false;
    createClient()
      .rpc('wallet_balance', { p_wallet_key: walletKey })
      .then(({ data }) => {
        if (!cancelled) setPoints(typeof data === 'number' ? data : 0);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="stat">
      <span>رصيدك (وضع الضيف)</span>
      <span>{points === null ? '…' : `${points} نقطة`}</span>
    </div>
  );
}
