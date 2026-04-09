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
  bg: '#070d20',
  secondary: '#c1cceb',
  muted: '#9ba9d3',
  faint: '#6f7da8',
  coral: '#ff8c4b',
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
          <p className="font-mono text-[13px]" style={{ color: c.muted }}>Loading...</p>
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
            <h1 className="mb-2 font-sans text-[28px] font-bold text-[#eef4ff]">Page Not Found</h1>
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
          "radial-gradient(1200px 500px at 18% -12%, rgba(52,210,190,0.18), transparent), radial-gradient(900px 420px at 92% 2%, rgba(255,140,75,0.14), transparent), linear-gradient(180deg,#070d20 0%, #0b1530 100%)",
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
