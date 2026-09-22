'use client';

/**
 * ترحيل بيانات الضيف إلى الحساب بعد التسجيل.
 *
 * يُستدعى مرة واحدة بعد أول تسجيل دخول ناجح. الدالة آمنة للاستدعاء المتكرّر:
 * claim_guest_wallet في قاعدة البيانات تنقل الصفوف اليتيمة فقط.
 */
import { createClient } from '@/lib/supabase/client';
import { isWalletClaimed, markWalletClaimed, peekWalletKey } from './wallet';

export type ClaimResult =
  | { status: 'claimed'; submissions: number; ledgerEntries: number; points: number }
  | { status: 'skipped'; reason: 'no-wallet' | 'already-claimed' | 'not-signed-in' }
  | { status: 'failed'; message: string };

export async function migrateGuestDataIfNeeded(): Promise<ClaimResult> {
  const walletKey = peekWalletKey();
  if (!walletKey) return { status: 'skipped', reason: 'no-wallet' };
  if (isWalletClaimed()) return { status: 'skipped', reason: 'already-claimed' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'skipped', reason: 'not-signed-in' };

  // مستخدم مجهول رُقّي إلى حساب كامل: البيانات مرتبطة بـ user_id أصلًا،
  // فلا حاجة للترحيل — نكتفي بوسم المحفظة كمُرحَّلة.
  if (user.is_anonymous) {
    return { status: 'skipped', reason: 'not-signed-in' };
  }

  const { data, error } = await supabase.rpc('claim_guest_wallet', {
    p_wallet_key: walletKey,
  });

  if (error) {
    // المحفظة مرتبطة بحساب آخر: لا نعيد المحاولة بلا نهاية.
    if (error.message.includes('WALLET_ALREADY_CLAIMED')) {
      markWalletClaimed();
    }
    return { status: 'failed', message: error.message };
  }

  markWalletClaimed();

  const result = data as {
    submissions?: number;
    ledger_entries?: number;
    points?: number;
  } | null;

  return {
    status: 'claimed',
    submissions: result?.submissions ?? 0,
    ledgerEntries: result?.ledger_entries ?? 0,
    points: result?.points ?? 0,
  };
}
