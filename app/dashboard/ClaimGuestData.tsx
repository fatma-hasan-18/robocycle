'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { migrateGuestDataIfNeeded } from '@/lib/guest/migrate';

/**
 * يشغّل ترحيل بيانات الضيف مرة واحدة بعد أول دخول ناجح.
 *
 * يُركَّب في صفحة الوجهة بعد /auth/callback (الذي يضيف ?claim=1).
 */
export default function ClaimGuestData({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    migrateGuestDataIfNeeded().then((result) => {
      if (cancelled) return;

      if (result.status === 'claimed' && result.submissions + result.ledgerEntries > 0) {
        setMessage(
          `تم نقل ${result.submissions} عملية من وضع الضيف. رصيدك الآن ${result.points} نقطة.`,
        );
        router.refresh();
      }
      // الفشل لا يُعرض للمستخدم: البيانات لم تُفقد، وسنعيد المحاولة لاحقًا.
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, router]);

  if (!message) return null;
  return <p className="notice ok">{message}</p>;
}
