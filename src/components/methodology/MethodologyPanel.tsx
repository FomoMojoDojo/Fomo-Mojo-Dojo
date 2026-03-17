import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import MethodologyContent from './MethodologyContent';

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

interface PageListItem {
  slug: string;
  page_number: string;
  page_title: string;
  phase: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initialSlug?: string | null;
}

const c = {
  bg: '#faf7f6',
  card: '#ffffff',
  line: '#DDE6D1',
  lineFaint: '#EEF3E9',
  charcoal: '#233C4B',
  secondary: '#46606D',
  muted: '#6E847F',
  faint: '#C8D8CA',
  coral: '#FF7D2D',
  amber: '#FAC846',
};

export default function MethodologyPanel({ open, onClose, initialSlug }: Props) {
  const [pages, setPages] = useState<PageListItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug || null);
  const [page, setPage] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch page list
  useEffect(() => {
    if (!open) return;
    supabase
      .from('methodology_pages')
      .select('slug, page_number, page_title, phase')
      .eq('is_published', true)
      .order('sort_order')
      .then(({ data }) => {
        setPages((data as PageListItem[]) || []);
      });
  }, [open]);

  // Set initial slug
  useEffect(() => {
    if (open && initialSlug) setSelectedSlug(initialSlug);
  }, [open, initialSlug]);

  // Fetch selected page
  useEffect(() => {
    if (!selectedSlug) { setPage(null); return; }
    setLoading(true);
    supabase
      .from('methodology_pages')
      .select('*')
      .eq('slug', selectedSlug)
      .eq('is_published', true)
      .single()
      .then(({ data }) => {
        setPage(data as unknown as PageData | null);
        setLoading(false);
      });
  }, [selectedSlug]);

  // ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedSlug) setSelectedSlug(null);
        else onClose();
      }
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose, selectedSlug]);

  // Group pages by phase
  const grouped = pages.reduce<Record<string, PageListItem[]>>((acc, p) => {
    (acc[p.phase] = acc[p.phase] || []).push(p);
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'rgba(35,60,75,0.24)', top: 52 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 z-50 flex flex-col"
        style={{
          top: 52,
          width: 560,
          height: 'calc(100vh - 52px)',
          background: c.bg,
          borderLeft: `1px solid ${c.line}`,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${c.line}` }}>
          <div className="flex items-center gap-2">
            {selectedSlug && (
              <button
                onClick={() => setSelectedSlug(null)}
                className="font-mono text-[11px] transition-colors uppercase tracking-[0.08em] mr-2 cursor-pointer"
                style={{ color: c.coral }}
              >
                ← All Pages
              </button>
            )}
            <h2 className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
              {selectedSlug ? page?.page_title || 'Loading…' : 'Our Process'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer text-sm"
            style={{ border: `1px solid ${c.line}`, color: c.muted, background: c.card }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {selectedSlug ? (
            loading ? (
              <p className="font-mono text-[13px] text-center py-12" style={{ color: c.muted }}>Loading…</p>
            ) : page ? (
              <MethodologyContent page={page} compact />
            ) : (
              <p className="font-mono text-[13px] text-center py-12" style={{ color: c.muted }}>Page not found.</p>
            )
          ) : (
            /* Page index grouped by phase */
            <div className="space-y-6">
              {Object.entries(grouped).map(([phase, items]) => (
                <div key={phase}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] pb-2 mb-3" style={{ color: c.muted, borderBottom: `1px solid ${c.line}` }}>
                    {phase}
                  </p>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <button
                        key={item.slug}
                        onClick={() => setSelectedSlug(item.slug)}
                        className="w-full text-left rounded-xl p-4 transition-colors cursor-pointer group border"
                        style={{ background: c.card, borderColor: c.line }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex w-[28px] h-[28px] rounded-full font-sans text-[12px] font-bold items-center justify-center shrink-0"
                            style={{ background: c.amber, color: c.charcoal }}
                          >
                            {item.page_number}
                          </span>
                          <span className="font-sans text-[15px] font-semibold transition-colors" style={{ color: c.charcoal }}>
                            {item.page_title}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 shrink-0" style={{ borderTop: `1px solid ${c.line}` }}>
          <button
            onClick={onClose}
            className="w-full font-mono text-[12px] transition-colors cursor-pointer py-1"
            style={{ color: c.muted }}
          >
            ← Back to Map View
          </button>
        </div>
      </div>
    </>
  );
}
