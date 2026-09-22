/**
 * notify-events — مستهلك أحداث RoboCycle.
 *
 * تستدعيها قاعدة البيانات عبر pg_net عند إدراج صف في notification_events،
 * أو يدويًا عبر public.dispatch_pending_events().
 *
 * المصادقة: رمز عشوائي خاص بهذا المسار، مُخزَّن في Vault. الدالة لا تحمل نسخة
 * منه، بل تتحقّق عبر verify_webhook_token باستخدام مفتاح الخدمة الذي تحقنه
 * Supabase تلقائيًا — فلا يوجد سرّ مكتوب في الشيفرة أو في متغيّرات البيئة.
 *
 * verify_jwt معطّل عمدًا: المُستدعي هو قاعدة البيانات لا مستخدم بجلسة.
 *
 * النشر:
 *   supabase functions deploy notify-events --project-ref kaanfupnhyleeuiqzvvq
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

type EventType = 'points_threshold' | 'reward_redeemed' | 'submission_verified';

interface EventPayload {
  event_id: number;
  event_type: EventType;
  user_id: string | null;
  wallet_key: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** رسالة عربية واحدة لكل نوع حدث. */
function buildMessage(event: EventPayload): { title: string; body: string } {
  const p = event.payload;

  switch (event.event_type) {
    case 'points_threshold':
      return {
        title: String(p.label_ar ?? 'إنجاز جديد'),
        body: `وصل رصيدك إلى ${p.points} نقطة. تفقّدي المكافآت المتاحة الآن.`,
      };
    case 'reward_redeemed':
      return {
        title: 'تم استبدال مكافأتك',
        body: `${p.reward_name_ar} — رمز القسيمة ${p.voucher_code}. خُصمت ${p.cost_points} نقطة.`,
      };
    case 'submission_verified':
      return {
        title: 'تم توثيق عملية إعادة التدوير',
        body: `أضفنا ${p.points} نقطة إلى رصيدك. شكرًا لمساهمتك!`,
      };
    default:
      return { title: 'تحديث', body: 'لديك تحديث جديد في حسابك.' };
  }
}

/**
 * أرسلي الإشعار عبر قناتك المفضّلة.
 *
 * نقطة الربط الوحيدة بالعالم الخارجي — أضيفي هنا Resend للبريد أو Twilio
 * لواتساب، أو اكتفي بمتغيّر ROBOCYCLE_EXTERNAL_WEBHOOK لتمرير الحدث إلى
 * Make / n8n / Zapier.
 */
async function deliver(event: EventPayload, message: { title: string; body: string }) {
  const externalWebhook = Deno.env.get('ROBOCYCLE_EXTERNAL_WEBHOOK');

  if (externalWebhook) {
    const response = await fetch(externalWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, message }),
    });
    if (!response.ok) {
      throw new Error(`فشل الـ webhook الخارجي: ${response.status}`);
    }
    return;
  }

  // لا قناة مضبوطة بعد: نكتفي بالتسجيل حتى لا يفشل الحدث.
  console.log('notify-events', event.event_type, message.title, message.body);
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: tokenOk, error: tokenError } = await admin.rpc('verify_webhook_token', {
    p_token: token,
  });
  if (tokenError || tokenOk !== true) {
    return new Response('Unauthorized', { status: 401 });
  }

  let event: EventPayload;
  try {
    event = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  if (typeof event?.event_id !== 'number') {
    return new Response('Bad Request', { status: 400 });
  }

  try {
    await deliver(event, buildMessage(event));
    await admin.rpc('mark_event_processed', { p_event_id: event.event_id, p_ok: true });
    return Response.json({ ok: true, event_id: event.event_id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.rpc('mark_event_processed', {
      p_event_id: event.event_id,
      p_ok: false,
      p_error: message.slice(0, 500),
    });
    // 200 مقصود: الحدث سُجِّل كـ failed، ولا فائدة من إعادة محاولة pg_net.
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
});
