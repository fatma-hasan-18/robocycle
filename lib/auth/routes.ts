/**
 * مسارات التطبيق وقواعد الحماية — مصدر واحد يستخدمه middleware و Server Actions
 * معًا، حتى لا تتفرّع القائمتان وتتضاربا.
 */

/** مسارات تتطلّب حسابًا كاملًا (لا تكفي فيها جلسة ضيف). */
export const PROTECTED_PREFIXES = ['/dashboard', '/rewards', '/profile'] as const;

/** مسارات عامة دائمًا. */
export const PUBLIC_PREFIXES = ['/enter', '/auth', '/_next', '/favicon.ico'] as const;

/** وجهة الضيف الافتراضية — صفحة عامة لا تتطلّب حسابًا. */
export const GUEST_HOME = '/';

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * يقبل المسارات الداخلية فقط — يمنع الإعادة المفتوحة (open redirect) إلى
 * نطاق خارجي عبر ?next=https://...
 */
export function safeInternalPath(candidate: string | undefined, fallback: string): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//')) return fallback;
  return candidate;
}

/**
 * وجهة آمنة للضيف.
 *
 * الضيف — سواء بجلسة مجهولة أو بوضع localStorage — لا يملك حسابًا كاملًا، فلو
 * أرسلناه إلى مسار محمي لأعاده middleware إلى /enter فورًا، وتكرّرت الحلقة.
 */
export function guestDestination(candidate: string | undefined): string {
  const path = safeInternalPath(candidate, GUEST_HOME);
  return isProtectedPath(path) ? GUEST_HOME : path;
}
