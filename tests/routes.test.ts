/**
 * اختبارات قواعد المسارات.
 *
 * التشغيل: npm test
 *
 * هذه القواعد تحكم إعادة التوجيه لكل زائر، وخطأ فيها يعني إمّا حلقة إعادة
 * توجيه مغلقة أمام الضيف، أو ثغرة إعادة توجيه مفتوحة إلى نطاق خارجي.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GUEST_HOME,
  guestDestination,
  isProtectedPath,
  isPublicPath,
  safeInternalPath,
} from '../lib/auth/routes.ts';

test('المسارات المحمية تُميَّز بدقة', () => {
  assert.equal(isProtectedPath('/dashboard'), true);
  assert.equal(isProtectedPath('/dashboard/history'), true);
  assert.equal(isProtectedPath('/rewards'), true);
  assert.equal(isProtectedPath('/'), false);
  assert.equal(isProtectedPath('/enter'), false);
  // لا يُخدع بمسار يبدأ بنفس الحروف
  assert.equal(isProtectedPath('/dashboard-public'), false);
  assert.equal(isProtectedPath('/profiles-of-others'), false);
});

test('المسارات العامة تُميَّز بدقة', () => {
  assert.equal(isPublicPath('/enter'), true);
  assert.equal(isPublicPath('/auth/callback'), true);
  assert.equal(isPublicPath('/dashboard'), false);
});

test('safeInternalPath يمنع الإعادة المفتوحة', () => {
  assert.equal(safeInternalPath('/dashboard', '/x'), '/dashboard');
  // نطاق خارجي
  assert.equal(safeInternalPath('https://evil.example', '/x'), '/x');
  // إعادة بروتوكول-نسبي: //evil.example تُفسَّر كنطاق خارجي في المتصفح
  assert.equal(safeInternalPath('//evil.example', '/x'), '/x');
  assert.equal(safeInternalPath(undefined, '/x'), '/x');
  assert.equal(safeInternalPath('', '/x'), '/x');
});

test('وجهة الضيف لا تكون مسارًا محميًا أبدًا', () => {
  // هذا هو جوهر حلقة إعادة التوجيه: الضيف لا يملك حسابًا كاملًا، فلو أُرسل
  // إلى /dashboard لأعاده middleware إلى /enter بلا نهاية.
  assert.equal(guestDestination('/dashboard'), GUEST_HOME);
  assert.equal(guestDestination('/rewards'), GUEST_HOME);
  assert.equal(guestDestination('/profile/settings'), GUEST_HOME);

  // المسارات العامة تُحترم كما هي
  assert.equal(guestDestination('/'), '/');
  assert.equal(guestDestination('/bins'), '/bins');

  // والإعادة المفتوحة ممنوعة هنا أيضًا
  assert.equal(guestDestination('https://evil.example'), GUEST_HOME);
  assert.equal(guestDestination(undefined), GUEST_HOME);
});
