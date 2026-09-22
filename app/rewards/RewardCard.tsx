'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { redeemReward, type RedeemState } from '@/lib/rewards/actions';
import { peekWalletKey } from '@/lib/guest/wallet';

export type Reward = {
  id: string;
  name_ar: string;
  detail_ar: string | null;
  cost_points: number;
  worth_kwd: number | null;
  stock: number | null;
};

function RedeemButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending}>
      {pending ? 'جارٍ الاستبدال…' : label}
    </button>
  );
}

export default function RewardCard({
  reward,
  balance,
}: {
  reward: Reward;
  /** رصيد المستخدم، أو null إن كان غير معروف بعد (ضيف قبل قراءة المحفظة). */
  balance: number | null;
}) {
  const [state, action] = useFormState<RedeemState, FormData>(redeemReward, {});
  const [walletKey, setWalletKey] = useState('');

  // مفتاح المحفظة موجود في المتصفح فقط؛ يُرسَل مع الطلب ليعرف الخادمُ الضيفَ.
  useEffect(() => {
    setWalletKey(peekWalletKey() ?? '');
  }, []);

  const soldOut = reward.stock !== null && reward.stock <= 0;
  const affordable = balance === null || balance >= reward.cost_points;
  const lowStock = reward.stock !== null && reward.stock > 0 && reward.stock <= 5;

  let label = 'استبدال';
  if (soldOut) label = 'نفدت الكمية';
  else if (!affordable) label = `تحتاجين ${reward.cost_points - (balance ?? 0)} نقطة`;

  return (
    <div className="reward">
      <div className="reward-head">
        <h3>{reward.name_ar}</h3>
        <span className="cost">{reward.cost_points} نقطة</span>
      </div>

      {reward.detail_ar && <p className="reward-detail">{reward.detail_ar}</p>}

      <div className="reward-meta">
        {reward.worth_kwd !== null && <span>القيمة {reward.worth_kwd} د.ك</span>}
        {reward.stock === null ? (
          <span>الكمية غير محدودة</span>
        ) : soldOut ? (
          <span className="danger">نفدت الكمية</span>
        ) : (
          <span className={lowStock ? 'danger' : undefined}>
            {lowStock ? `بقي ${reward.stock} فقط` : `متوفّر ${reward.stock}`}
          </span>
        )}
      </div>

      {state.voucherCode ? (
        <p className="notice ok">
          تم الاستبدال. رمز القسيمة <strong>{state.voucherCode}</strong>
          {typeof state.balance === 'number' && <> — رصيدك الآن {state.balance} نقطة.</>}
        </p>
      ) : (
        <form action={action}>
          {state.error && <p className="notice error">{state.error}</p>}
          <input type="hidden" name="reward_id" value={reward.id} />
          <input type="hidden" name="wallet_key" value={walletKey} />
          <RedeemButton disabled={soldOut || !affordable} label={label} />
        </form>
      )}
    </div>
  );
}
