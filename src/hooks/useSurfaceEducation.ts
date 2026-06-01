import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SurfaceEducationRow {
  id: string;
  surface_key: string;
  section_a_template: string | null;
  section_b_content: string | null;
  audience: 'client_and_operator' | 'admin_only';
  is_published: boolean;
  sort_order: number;
}

export function useSurfaceEducation(surfaceKey: string, isAdmin: boolean) {
  const [rows, setRows] = useState<SurfaceEducationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from('surface_educational_content')
      .select('id,surface_key,section_a_template,section_b_content,audience,is_published,sort_order')
      .eq('surface_key', surfaceKey)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[useSurfaceEducation] fetch error:', error.message);
          setRows([]);
        } else {
          const filtered = (data ?? []).filter(
            (r) => r.audience === 'client_and_operator' || isAdmin,
          );
          setRows(filtered as SurfaceEducationRow[]);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [surfaceKey, isAdmin]);

  return { rows, loading };
}
