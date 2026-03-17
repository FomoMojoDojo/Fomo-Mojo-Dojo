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

const c = {
  bg: '#faf7f6',
  line: '#DDE6D1',
  charcoal: '#233C4B',
  secondary: '#46606D',
  muted: '#6E847F',
  faint: '#C8D8CA',
  coral: '#FF7D2D',
};

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
      <div className="min-h-screen" style={{ background: c.bg }}>
        <TopNav />
        <div className="flex items-center justify-center py-32">
          <p className="font-mono text-[13px]" style={{ color: c.muted }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen" style={{ background: c.bg }}>
        <TopNav />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <h1 className="font-sans text-[28px] font-bold mb-2" style={{ color: c.charcoal }}>Page Not Found</h1>
            <Link to="/" className="font-mono text-[12px] transition-colors" style={{ color: c.coral }}>← Back to Map</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <TopNav />
      <main className="max-w-content mx-auto py-7 px-4 sm:px-6 md:px-9 pb-12">
        {/* Breadcrumb */}
        <div className="mb-5">
          <Link to="/" className="font-mono text-[11px] uppercase tracking-[0.08em] transition-colors" style={{ color: c.muted }}>
            Map View
          </Link>
          <span className="font-mono text-[11px] mx-2" style={{ color: c.faint }}>›</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
            {page.phase} · {page.page_number}
          </span>
        </div>

        <MethodologyContent page={page} />
      </main>
    </div>
  );
}
