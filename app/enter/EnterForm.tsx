'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  continueAsGuest,
  signInWithOtp,
  signInWithPassword,
  signUpWithPassword,
  upgradeGuestAccount,
  type AuthState,
} from '@/lib/auth/actions';
import { getOrCreateWalletKey, peekWalletKey } from '@/lib/guest/wallet';

type Mode = 'signin' | 'signup' | 'otp';

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'لحظة…' : children}
    </button>
  );
}

function Notice({ state }: { state: AuthState }) {
  if (state.error) return <p className="notice error">{state.error}</p>;
  if (state.message) return <p className="notice ok">{state.message}</p>;
  return null;
}

export default function EnterForm({
  next,
  upgrade,
}: {
  next: string;
  upgrade: boolean;
}) {
  const [mode, setMode] = useState<Mode>(upgrade ? 'signup' : 'signin');
  const [walletKey, setWalletKey] = useState('');

  const [signInState, signInAction] = useFormState(signInWithPassword, {});
  const [signUpState, signUpAction] = useFormState(
    upgrade ? upgradeGuestAccount : signUpWithPassword,
    {},
  );
  const [otpState, otpAction] = useFormState(signInWithOtp, {});

  // مفتاح المحفظة يُقرأ في المتصفح فقط (localStorage غير متاح على الخادم)،
  // ويُرسَل مع التسجيل ليربط مشغّل handle_new_user بيانات الضيف بالحساب.
  useEffect(() => {
    setWalletKey(peekWalletKey() ?? '');
  }, []);

  return (
    <div className="card">
      <h1>{upgrade ? 'أكملي إنشاء حسابك' : 'مرحبًا بك في روبو سايكل'}</h1>
      <p className="sub">
        {upgrade
          ? 'نقاطك وعملياتك محفوظة — أضيفي بريدًا وكلمة مرور للاحتفاظ بها على كل أجهزتك.'
          : 'سجّلي دخولك للاحتفاظ بنقاطك، أو تابعي كضيف وجرّبي التطبيق أولًا.'}
      </p>

      {!upgrade && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'signin'} onClick={() => setMode('signin')}>
            دخول
          </button>
          <button role="tab" aria-selected={mode === 'signup'} onClick={() => setMode('signup')}>
            حساب جديد
          </button>
          <button role="tab" aria-selected={mode === 'otp'} onClick={() => setMode('otp')}>
            رابط بالبريد
          </button>
        </div>
      )}

      {mode === 'signin' && !upgrade && (
        <form action={signInAction}>
          <Notice state={signInState} />
          <input type="hidden" name="next" value={next} />

          <label htmlFor="signin-email">البريد الإلكتروني</label>
          <input id="signin-email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="signin-password">كلمة المرور</label>
          <input
            id="signin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          <SubmitButton>تسجيل الدخول</SubmitButton>
        </form>
      )}

      {mode === 'signup' && (
        <form action={signUpAction}>
          <Notice state={signUpState} />
          <input type="hidden" name="wallet_key" value={walletKey} />

          <label htmlFor="signup-name">الاسم</label>
          <input id="signup-name" name="display_name" type="text" maxLength={40} />

          <label htmlFor="signup-email">البريد الإلكتروني</label>
          <input id="signup-email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="signup-password">كلمة المرور (٨ أحرف فأكثر)</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />

          <SubmitButton>{upgrade ? 'ترقية الحساب' : 'إنشاء الحساب'}</SubmitButton>
        </form>
      )}

      {mode === 'otp' && !upgrade && (
        <form action={otpAction}>
          <Notice state={otpState} />
          <label htmlFor="otp-email">البريد الإلكتروني</label>
          <input id="otp-email" name="email" type="email" autoComplete="email" required />
          <SubmitButton>أرسلي رابط الدخول</SubmitButton>
        </form>
      )}

      {!upgrade && (
        <>
          <div className="divider">أو</div>
          <form
            action={continueAsGuest}
            onSubmit={() => {
              // نضمن وجود مفتاح محفظة محلي حتى لو تعذّرت الجلسة المجهولة.
              getOrCreateWalletKey();
            }}
          >
            <input type="hidden" name="next" value={next} />
            <button className="secondary" type="submit">
              المتابعة كضيف
            </button>
          </form>
        </>
      )}
    </div>
  );
}
