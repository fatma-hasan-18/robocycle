import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = createClient();

  // إحصاءات مجتمعية: تعمل للضيف والمستخدم المسجَّل على حدّ سواء.
  const { data: stats } = await supabase.from('v_impact_stats').select('*').single();

  return (
    <main>
      <div className="card">
        <h1>روبو سايكل</h1>
        <p className="sub">أعيدي تدوير أجهزتك الإلكترونية واكسبي نقاطًا ومكافآت.</p>

        <div className="stat">
          <span>أجهزة أُعيد تدويرها</span>
          <span>{stats?.devices_count ?? 0}</span>
        </div>
        <div className="stat">
          <span>أطنان مُحوَّلة عن المكبّات</span>
          <span>{stats?.tons_diverted ?? 0}</span>
        </div>
        <div className="stat">
          <span>حاويات نشطة</span>
          <span>{stats?.bins_count ?? 0}</span>
        </div>

        <div className="divider" />
        <Link href="/enter">
          <button type="button">ابدئي الآن</button>
        </Link>
      </div>
    </main>
  );
}
