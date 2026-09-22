import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'الحاويات — روبو سايكل' };

/** لون مؤشّر الامتلاء: أخضر حتى ٦٠٪، تحذير حتى ٨٥٪، ثم أحمر. */
function fillTone(pct: number): string {
  if (pct >= 85) return 'fill-high';
  if (pct >= 60) return 'fill-mid';
  return 'fill-low';
}

export default async function BinsPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from('bins')
    .select('id, name_ar, area_ar, distance_km, fill_pct, open_until')
    .eq('is_active', true)
    .order('sort_order');

  const bins = data ?? [];

  return (
    <main>
      <div className="card">
        <h1>حاويات الاستلام</h1>
        <p className="sub">اختاري الأقرب إليك، وتأكّدي من نسبة الامتلاء قبل التوجّه.</p>
      </div>

      <div className="rewards">
        {bins.length === 0 ? (
          <div className="card">
            <p className="sub">لا توجد حاويات متاحة حاليًا.</p>
          </div>
        ) : (
          bins.map((bin) => (
            <div className="reward" key={bin.id}>
              <div className="reward-head">
                <h3>{bin.name_ar}</h3>
                {bin.distance_km !== null && (
                  <span className="cost">{bin.distance_km} كم</span>
                )}
              </div>

              <div className="reward-meta">
                {bin.area_ar && <span>{bin.area_ar}</span>}
                {bin.open_until && <span>مفتوحة حتى {bin.open_until}</span>}
              </div>

              <div className="fill">
                <div className="fill-bar">
                  <div
                    className={`fill-value ${fillTone(bin.fill_pct)}`}
                    style={{ width: `${Math.min(100, Math.max(0, bin.fill_pct))}%` }}
                  />
                </div>
                <span className="fill-label">ممتلئة {bin.fill_pct}%</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <Link href="/recycle">
          <button type="button">أعيدي تدوير جهاز</button>
        </Link>
      </div>
    </main>
  );
}
