'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';

import {
  confirmDeposit,
  createSubmission,
  estimatePoints,
  verifySubmission,
  type DepositState,
  type SubmissionState,
  type VerifyState,
} from '@/lib/recycle/actions';
import { getOrCreateWalletKey } from '@/lib/guest/wallet';

export type Category = {
  id: string;
  name_ar: string;
  points_per_kg: number;
  hazard_bonus: number;
  hazard_label_ar: string | null;
};

export type Bin = {
  id: string;
  name_ar: string;
  area_ar: string | null;
  distance_km: number | null;
  fill_pct: number;
  open_until: string | null;
};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'لحظة…' : children}
    </button>
  );
}

export default function RecycleFlow({
  categories,
  bins,
  isGuest,
}: {
  categories: Category[];
  bins: Bin[];
  isGuest: boolean;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [weight, setWeight] = useState('');
  const [hasHazard, setHasHazard] = useState(false);
  const [binId, setBinId] = useState('');
  const [walletKey, setWalletKey] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);

  const [created, createAction] = useFormState<SubmissionState, FormData>(createSubmission, {});
  const [deposited, depositAction] = useFormState<DepositState, FormData>(confirmDeposit, {});
  const [verified, verifyAction] = useFormState<VerifyState, FormData>(verifySubmission, {});

  // الضيف يحتاج مفتاح محفظة ليُنسب إليه التسليم.
  useEffect(() => {
    if (isGuest) setWalletKey(getOrCreateWalletKey());
  }, [isGuest]);

  // التقدير يُحسب في الخادم بنفس دالة الاحتساب الفعلية، فلا يختلف رقمان.
  useEffect(() => {
    const kg = Number(weight);
    if (!categoryId || !Number.isFinite(kg) || kg <= 0) {
      setEstimate(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      estimatePoints(categoryId, kg, hasHazard).then((points) => {
        if (!cancelled) setEstimate(points);
      });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [categoryId, weight, hasHazard]);

  const category = categories.find((c) => c.id === categoryId);

  // ------------------------------------------------ بعد التوثيق: النتيجة
  if (verified.points !== undefined) {
    return (
      <div className="card">
        <h1>تمّ! 🎉</h1>
        <p className="sub">شكرًا لمساهمتك في تقليل النفايات الإلكترونية.</p>
        <div className="stat">
          <span>النقاط المضافة</span>
          <span>{verified.points} نقطة</span>
        </div>
        <div className="divider" />
        <Link href="/rewards">
          <button type="button">تصفّحي المكافآت</button>
        </Link>
      </div>
    );
  }

  // ------------------------------------- بعد الإنشاء: رمز الإيداع ثم التأكيد
  if (created.submissionId) {
    return (
      <div className="card">
        <h1>رمز الإيداع</h1>
        <p className="sub">
          خذي جهازك إلى {created.binName ?? 'الحاوية المختارة'} وأظهري هذا الرمز.
        </p>

        <p className="deposit-code">{created.depositCode}</p>

        {!deposited.confirmed ? (
          <form action={depositAction}>
            {deposited.error && <p className="notice error">{deposited.error}</p>}
            <input type="hidden" name="submission_id" value={created.submissionId} />
            <label htmlFor="code">أدخلي الرمز بعد الإيداع لتأكيده</label>
            <input
              id="code"
              name="deposit_code"
              type="text"
              autoComplete="off"
              placeholder="RC······"
              required
            />
            <Submit>تأكيد الإيداع</Submit>
          </form>
        ) : (
          <>
            <p className="notice ok">تم تأكيد الإيداع. بانتظار الوزن والتوثيق.</p>

            {/* في نشر حقيقي يقوم بهذه الخطوة طرف الحاوية أو الموظّف بعد الوزن
                الفعلي — لا المستخدم. معروضة هنا لإكمال التجربة أثناء التطوير. */}
            <form action={verifyAction}>
              {verified.error && <p className="notice error">{verified.error}</p>}
              <div className="divider">خطوة الموظّف (للتجربة)</div>
              <input type="hidden" name="submission_id" value={created.submissionId} />
              <label htmlFor="actual">الوزن الفعلي (كجم)</label>
              <input
                id="actual"
                name="actual_weight_kg"
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                defaultValue={weight}
                required
              />
              <Submit>توثيق ومنح النقاط</Submit>
            </form>
          </>
        )}
      </div>
    );
  }

  // ------------------------------------------------------- النموذج الأساسي
  return (
    <form action={createAction} className="card">
      <h1>أعيدي تدوير جهاز</h1>
      <p className="sub">اختاري الفئة وقدّري الوزن، ونحسب لك النقاط.</p>

      {created.error && <p className="notice error">{created.error}</p>}
      <input type="hidden" name="wallet_key" value={walletKey} />

      <label htmlFor="category">فئة الجهاز</label>
      <select
        id="category"
        name="category_id"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        required
      >
        <option value="">— اختاري —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name_ar} ({c.points_per_kg} نقطة/كجم)
          </option>
        ))}
      </select>

      <label htmlFor="label">وصف الجهاز (اختياري)</label>
      <input id="label" name="device_label" type="text" maxLength={60} placeholder="مثال: آيفون ١٢ قديم" />

      <label htmlFor="weight">الوزن التقديري (كجم)</label>
      <input
        id="weight"
        name="est_weight_kg"
        type="number"
        step="0.1"
        min="0.1"
        max="100"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        required
      />

      {category?.hazard_label_ar && (
        <label className="checkbox">
          <input
            type="checkbox"
            name="has_hazard"
            checked={hasHazard}
            onChange={(e) => setHasHazard(e.target.checked)}
          />
          يحتوي على {category.hazard_label_ar} (+{category.hazard_bonus} نقطة)
        </label>
      )}

      {estimate !== null && (
        <p className="notice ok">النقاط المتوقّعة: {estimate} نقطة</p>
      )}

      <label htmlFor="bin">حاوية الإيداع</label>
      <select
        id="bin"
        name="bin_id"
        value={binId}
        onChange={(e) => setBinId(e.target.value)}
        required
      >
        <option value="">— اختاري —</option>
        {bins.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name_ar}
            {b.area_ar ? ` — ${b.area_ar}` : ''}
            {b.distance_km !== null ? ` (${b.distance_km} كم)` : ''}
          </option>
        ))}
      </select>

      <Submit>إنشاء رمز الإيداع</Submit>
    </form>
  );
}
