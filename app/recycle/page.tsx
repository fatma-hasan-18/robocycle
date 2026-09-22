import { createClient } from '@/lib/supabase/server';

import RecycleFlow, { type Bin, type Category } from './RecycleFlow';

export const metadata = { title: 'أعيدي التدوير — روبو سايكل' };

export default async function RecyclePage() {
  const supabase = createClient();

  const [{ data: { user } }, categoriesResult, binsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('device_categories')
      .select('id, name_ar, points_per_kg, hazard_bonus, hazard_label_ar')
      .order('sort_order'),
    supabase
      .from('bins')
      .select('id, name_ar, area_ar, distance_km, fill_pct, open_until')
      .eq('is_active', true)
      .order('sort_order'),
  ]);

  return (
    <main>
      <RecycleFlow
        categories={(categoriesResult.data ?? []) as Category[]}
        bins={(binsResult.data ?? []) as Bin[]}
        isGuest={!user}
      />
    </main>
  );
}
