'use client';

/**
 * وضع الضيف: إدارة مفتاح المحفظة المحلي.
 *
 * التطبيق الحالي يخزّن مفتاحًا عشوائيًا في localStorage ويربط به كل عمليات
 * الضيف. هذا الملف يحافظ على ذلك السلوك ويضيف خطوة الترحيل عند التسجيل.
 */

const WALLET_KEY_STORAGE = 'robocycle.wallet_key';
const CLAIMED_FLAG = 'robocycle.wallet_claimed';

/** مفتاح بطول 24 حرفًا — ضمن حدود القيد في قاعدة البيانات (12..64). */
function generateWalletKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `g_${hex}`;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // وضع التصفح الخاص أو تخزين معطّل
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* تجاهُل: التطبيق يجب أن يعمل بلا تخزين محلي */
  }
}

/** يقرأ مفتاح المحفظة الحالي أو ينشئ واحدًا جديدًا. */
export function getOrCreateWalletKey(): string {
  const existing = safeGet(WALLET_KEY_STORAGE);
  if (existing && existing.length >= 12 && existing.length <= 64) {
    return existing;
  }
  const fresh = generateWalletKey();
  safeSet(WALLET_KEY_STORAGE, fresh);
  return fresh;
}

/** يقرأ المفتاح دون إنشاء واحد جديد. */
export function peekWalletKey(): string | null {
  const key = safeGet(WALLET_KEY_STORAGE);
  return key && key.length >= 12 && key.length <= 64 ? key : null;
}

/** هل رُحِّلت هذه المحفظة إلى حساب من قبل؟ */
export function isWalletClaimed(): boolean {
  return safeGet(CLAIMED_FLAG) === '1';
}

export function markWalletClaimed(): void {
  safeSet(CLAIMED_FLAG, '1');
}
