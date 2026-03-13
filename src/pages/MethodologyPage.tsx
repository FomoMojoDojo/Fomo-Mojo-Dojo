import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import TopNav from '@/components/layout/TopNav';
import MethodologyContent from '@/components/methodology/MethodologyContent';

interface PageData {
  page_number: string;
  page_title: string;
  phase: string;
  hero_subtitle: string;
  hero_description: string;
  impact_score: string;
  score_detail: string;
  process_steps: { icon: string; label: string }[];
  section1_title: string;
  section1_content: string;
  section2_title: string;
  section2_content: string;
  section3_title: string;
  section3_content: string;
  section4_title: string;
  section4_content: string;
  section5_title: string;
  section5_content: string;
}

export default function MethodologyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from('methodology_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single()
      .then(({ data }) => {
        setPage(data as unknown as PageData | null);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream">
        <TopNav />
        <div className="flex items-center justify-center py-32">
          <p className="font-mono text-[13px] text-t-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen bg-cream">
        <TopNav />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <h1 className="font-serif text-[28px] text-foreground mb-2">Page Not Found</h1>
            <Link to="/" className="font-mono text-[12px] text-gold hover:text-gold-light transition-colors">← Back to Map</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <TopNav />
      <main className="max-w-content mx-auto py-7 px-9">
        {/* Breadcrumb */}
        <div className="mb-5">
          <Link to="/" className="font-mono text-[11px] text-t-muted hover:text-gold transition-colors uppercase tracking-[0.08em]">
            Map View
          </Link>
          <span className="font-mono text-[11px] text-t-faint mx-2">›</span>
          <span className="font-mono text-[11px] text-t-tertiary uppercase tracking-[0.08em]">
            {page.phase} · {page.page_number}
          </span>
        </div>

        <MethodologyContent page={page} />
      </main>
    </div>
  );
}
