'use server';

/**
 * استبدال المكافآت.
 *
 * كل الفحوص الحقيقية في قاعدة البيانات: الرصيد والمخزون والتكلفة تُقرأ من
 * الخادم، والمشغّلات تخصم وتسجّل. هذه الدالة غلاف رفيع يترجم الأخطاء إلى
 * رسائل للمستخدم.
 */
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export type RedeemState = {
  error?: string;
  voucherCode?: string;
  rewardName?: string;
  balance?: number;
};

/**
 * رسائل الخطأ التي ترفعها دوال القاعدة عربية ومقصودة للعرض. أي خطأ آخر
 * (مشكلة شبكة، خلل غير متوقّع) يُستبدل برسالة عامة حتى لا تتسرّب تفاصيل
 * داخلية إلى الواجهة.
 */
const USER_FACING = [
  'الرصيد لا يكفي',
  'نفدت كمية هذه المكافأة',
  'مكافأة غير متاحة',
];

function toUserMessage(message: string): string {
  const match = USER_FACING.find((prefix) => message.includes(prefix));
  if (match) {
    // رسالة القاعدة قد تحمل أرقامًا مفيدة ("لديك ٣٠٠ والمطلوب ٧٠٠")
    return message.replace(/^[A-Z_]+:\s*/, '');
  }
  return 'تعذّر إتمام الاستبدال. حاولي مرة أخرى.';
}

export async function redeemReward(
  _prev: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const rewardId = String(formData.get('reward_id') ?? '').trim();
  const walletKey = String(formData.get('wallet_key') ?? '').trim();

  if (!rewardId) {
    return { error: 'لم تُحدَّد المكافأة.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // الضيف بلا جلسة يُعرّف نفسه بمفتاح المحفظة؛ المستخدم المسجَّل يتجاهله
  // الخادم ويقرأ محفظته من ملفه الشخصي.
  if (!user && (walletKey.length < 12 || walletKey.length > 64)) {
    return { error: 'ابدئي بإعادة تدوير جهاز أولًا لتجميع النقاط.' };
  }

  const { data, error } = await supabase.rpc('redeem_reward', {
    p_wallet_key: walletKey,
    p_reward_id: rewardId,
  });

  if (error) {
    return { error: toUserMessage(error.message) };
  }

  const result = data as {
    voucher_code?: string;
    reward?: string;
    balance?: number;
  } | null;

  revalidatePath('/rewards');
  revalidatePath('/dashboard');

  return {
    voucherCode: result?.voucher_code,
    rewardName: result?.reward,
    balance: result?.balance,
  };
}
