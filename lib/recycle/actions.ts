'use server';

/**
 * مسار إعادة التدوير: إنشاء التسليم ← تأكيد الإيداع ← التوثيق.
 *
 * النقاط لا تُرسل من هنا إطلاقًا — قاعدة البيانات تحسبها من فئة الجهاز ووزنه.
 */
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export type SubmissionState = {
  error?: string;
  submissionId?: string;
  depositCode?: string;
  binName?: string;
};

export type DepositState = { error?: string; confirmed?: boolean };
export type VerifyState = { error?: string; points?: number };

const DB_MESSAGES = [
  'رمز الإيداع غير صحيح',
  'تم تأكيد هذا التسليم مسبقاً',
  'هذا التسليم لا يخصّك',
  'هذا التسليم معتمد مسبقاً',
  'تسليم غير موجود',
  'وزن غير صالح',
  'فئة غير معروفة',
];

function toUserMessage(message: string): string {
  return DB_MESSAGES.some((m) => message.includes(m))
    ? message.replace(/^[A-Z_]+:\s*/, '')
    : 'تعذّر إتمام العملية. حاولي مرة أخرى.';
}

/** تقدير النقاط قبل التسليم — يُحسب في الخادم عبر calc_points. */
export async function estimatePoints(
  categoryId: string,
  weightKg: number,
  hasHazard: boolean,
): Promise<number | null> {
  if (!categoryId || !Number.isFinite(weightKg) || weightKg <= 0) return null;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('calc_points', {
    p_category_id: categoryId,
    p_weight_kg: weightKg,
    p_has_hazard: hasHazard,
  });

  return error ? null : (data as number);
}

export async function createSubmission(
  _prev: SubmissionState,
  formData: FormData,
): Promise<SubmissionState> {
  const categoryId = String(formData.get('category_id') ?? '').trim();
  const deviceLabel = String(formData.get('device_label') ?? '').trim();
  const binId = String(formData.get('bin_id') ?? '').trim();
  const walletKey = String(formData.get('wallet_key') ?? '').trim();
  const hasHazard = formData.get('has_hazard') === 'on';
  const weight = Number(formData.get('est_weight_kg'));

  if (!categoryId) return { error: 'اختاري فئة الجهاز.' };
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return { error: 'الوزن التقديري يجب أن يكون بين ٠ و ١٠٠ كجم.' };
  }
  if (!binId) return { error: 'اختاري حاوية للإيداع.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && (walletKey.length < 12 || walletKey.length > 64)) {
    return { error: 'تعذّر تحديد محفظتك. حدّثي الصفحة وحاولي مجددًا.' };
  }

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      // للمستخدم المسجَّل يستبدل مشغّل set_row_owner هذه القيمة بمحفظته.
      wallet_key: walletKey || 'pending',
      display_name: 'مستخدم',
      category_id: categoryId,
      device_label: deviceLabel || null,
      est_weight_kg: weight,
      hazards: hasHazard ? ['بطارية'] : [],
      bin_id: binId,
      // points و status و deposit_code كلها من الخادم — لا تُرسل هنا.
    })
    .select('id, deposit_code, bins(name_ar)')
    .single();

  if (error || !data) {
    return { error: toUserMessage(error?.message ?? '') };
  }

  revalidatePath('/dashboard');

  return {
    submissionId: data.id,
    depositCode: data.deposit_code ?? undefined,
    binName: (data.bins as { name_ar: string } | null)?.name_ar,
  };
}

/** تأكيد الإيداع في الحاوية — يتطلّب رمز الإيداع. */
export async function confirmDeposit(
  _prev: DepositState,
  formData: FormData,
): Promise<DepositState> {
  const submissionId = String(formData.get('submission_id') ?? '').trim();
  const code = String(formData.get('deposit_code') ?? '').trim();

  if (!submissionId || !code) return { error: 'أدخلي رمز الإيداع.' };

  const supabase = createClient();
  const { error } = await supabase.rpc('confirm_deposit', {
    p_submission_id: submissionId,
    p_deposit_code: code,
  });

  if (error) return { error: toUserMessage(error.message) };

  revalidatePath('/dashboard');
  return { confirmed: true };
}

/**
 * توثيق التسليم ومنح النقاط.
 *
 * في نشر حقيقي يستدعيها طرف الحاوية أو الموظّف بعد الوزن الفعلي، لا المستخدم.
 * انظري الملاحظة الأمنية في الهجرة 11 لقصرها على service_role.
 */
export async function verifySubmission(
  _prev: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  const submissionId = String(formData.get('submission_id') ?? '').trim();
  const weight = Number(formData.get('actual_weight_kg'));

  if (!submissionId) return { error: 'تسليم غير محدَّد.' };
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    return { error: 'الوزن الفعلي يجب أن يكون بين ٠ و ١٠٠ كجم.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc('verify_deposit', {
    p_submission_id: submissionId,
    p_actual_weight_kg: weight,
  });

  if (error) return { error: toUserMessage(error.message) };

  revalidatePath('/dashboard');
  revalidatePath('/rewards');
  return { points: data as number };
}
