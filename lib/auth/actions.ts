'use server';

/**
 * Server Actions للمصادقة.
 *
 * كلها تعمل على الخادم، فلا يصل مفتاح الخدمة ولا أسرار أخرى إلى المتصفح.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { createClient } from '@/lib/supabase/server';

import { GUEST_HOME, guestDestination, safeInternalPath } from './routes';

export type AuthState = { error?: string; message?: string };

function siteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const host = headers().get('host') ?? 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

/** تسجيل الدخول بالبريد وكلمة المرور. */
export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeInternalPath(String(formData.get('next') ?? ''), '/dashboard');

  if (!email || !password) {
    return { error: 'البريد وكلمة المرور مطلوبان.' };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'تعذّر تسجيل الدخول. تحقّقي من البريد وكلمة المرور.' };
  }

  revalidatePath('/', 'layout');
  redirect(next);
}

/**
 * إنشاء حساب جديد.
 *
 * يُمرَّر wallet_key ضمن بيانات المستخدم ليلتقطه مشغّل handle_new_user
 * ويربط ملف المستخدم بمحفظة الضيف مباشرة.
 */
export async function signUpWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '').trim();
  const walletKey = String(formData.get('wallet_key') ?? '').trim();

  if (!email || password.length < 8) {
    return { error: 'البريد مطلوب وكلمة المرور ٨ أحرف على الأقل.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      data: {
        display_name: displayName || 'مستخدم',
        ...(walletKey.length >= 12 && walletKey.length <= 64
          ? { wallet_key: walletKey }
          : {}),
      },
    },
  });

  if (error) {
    return { error: 'تعذّر إنشاء الحساب. قد يكون البريد مستخدمًا بالفعل.' };
  }

  // تأكيد البريد مفعّل: لا توجد جلسة بعد، والمستخدم يحتاج فتح الرابط.
  if (data.user && !data.session) {
    return { message: 'أرسلنا رابط التأكيد إلى بريدك. افتحيه لإكمال التسجيل.' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

/** إرسال رمز/رابط دخول لمرة واحدة (OTP) دون كلمة مرور. */
export async function signInWithOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'أدخلي بريدك الإلكتروني.' };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });

  if (error) return { error: 'تعذّر إرسال رمز الدخول. حاولي مجددًا.' };
  return { message: 'أرسلنا رابط الدخول إلى بريدك.' };
}

/**
 * متابعة كضيف.
 *
 * تُنشئ جلسة مجهولة حقيقية في Supabase بدل ترك المستخدم بلا هوية. الفائدة:
 * صفوفه تُنسب إلى user_id فتحميها سياسات RLS، وترقيته لاحقًا إلى حساب كامل
 * تتم عبر updateUser دون أي ترحيل بيانات.
 */
export async function continueAsGuest(formData: FormData): Promise<void> {
  // الضيف لا يملك حسابًا كاملًا، فوجهته لا يجوز أن تكون مسارًا محميًا وإلا
  // أعاده middleware إلى /enter فورًا ودار المستخدم في حلقة مغلقة.
  const next = guestDestination(String(formData.get('next') ?? ''));
  const supabase = createClient();

  const { error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: 'ضيف' } },
  });

  // الجلسات المجهولة قد تكون معطّلة في إعدادات المشروع
  // (Authentication → Sign In / Providers → Allow anonymous sign-ins).
  // عندها يتراجع التطبيق إلى وضع الضيف المحلي المعتمد على localStorage،
  // وهو المسار الذي كان التطبيق يعمل به أصلًا — فلا شيء ينكسر.
  if (error) {
    redirect(`${GUEST_HOME}?guest=local`);
  }

  revalidatePath('/', 'layout');
  redirect(next);
}

/** ترقية جلسة الضيف المجهولة إلى حساب كامل (نفس user_id، بلا ترحيل). */
export async function upgradeGuestAccount(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '').trim();

  if (!email || password.length < 8) {
    return { error: 'البريد مطلوب وكلمة المرور ٨ أحرف على الأقل.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.is_anonymous) {
    return { error: 'لا توجد جلسة ضيف لترقيتها.' };
  }

  const { error } = await supabase.auth.updateUser({
    email,
    password,
    data: { display_name: displayName || 'مستخدم' },
  });

  if (error) {
    return { error: 'تعذّرت ترقية الحساب. قد يكون البريد مستخدمًا بالفعل.' };
  }

  revalidatePath('/', 'layout');
  return { message: 'أرسلنا رابط التأكيد إلى بريدك لإكمال الترقية.' };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/enter');
}
