import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface PageRow {
  id: string;
  slug: string;
  page_number: string;
  page_title: string;
  phase: string;
  is_published: boolean;
  sort_order: number;
  updated_at: string;
}

const PHASE_LABELS: Record<string, string> = {
  foundation: 'Foundation',
  strategy: 'Strategy',
  execution: 'Execution',
  ongoing: 'Ongoing',
};

export default function AdminDashboard() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const fetchPages = async () => {
    const { data } = await supabase
      .from('methodology_pages')
      .select('id, slug, page_number, page_title, phase, is_published, sort_order, updated_at')
      .order('sort_order', { ascending: true });
    setPages((data as PageRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchPages(); }, []);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await supabase.from('methodology_pages').delete().eq('id', id);
    fetchPages();
  };

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from('methodology_pages').update({ is_published: !current }).eq('id', id);
    fetchPages();
  };

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="bg-ink border-b border-[#2a2618] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-[5px] bg-gold flex items-center justify-center">
            <span className="font-serif text-ink text-[15px] font-bold">M</span>
          </div>
          <div>
            <span className="font-sans text-[14px] font-bold text-gold tracking-wide uppercase">CMS Admin</span>
            <p className="font-mono text-[10px] text-t-ds">Methodology Pages</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="font-mono text-[11px] text-t-ds hover:text-t-dp transition-colors uppercase">
            ← Back to App
          </Link>
          <button onClick={signOut} className="font-mono text-[11px] text-danger hover:opacity-80 uppercase">
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-[1060px] mx-auto px-6 py-8">
        {/* Quick links */}
        <div className="mb-6">
          <Link
            to="/admin/companies"
            className="inline-flex items-center gap-2 bg-card border border-border rounded-xl px-5 py-3 hover:border-gold transition-colors"
          >
            <span className="font-mono text-[11px] text-gold uppercase tracking-wide font-semibold">Manage Companies</span>
            <span className="font-mono text-[10px] text-muted-foreground">Switch between client instances →</span>
          </Link>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-[24px] font-medium text-foreground">Methodology Pages</h1>
          <Link
            to="/admin/new"
            className="bg-gold text-ink font-mono text-[11px] uppercase tracking-wide px-5 py-2.5 rounded-lg font-semibold hover:bg-gold-light transition-colors"
          >
            + Add New Page
          </Link>
        </div>

        {loading ? (
          <p className="font-mono text-[13px] text-muted-foreground">Loading…</p>
        ) : pages.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <p className="font-serif text-[16px] text-muted-foreground mb-3">No methodology pages yet.</p>
            <Link to="/admin/new" className="font-mono text-[12px] text-gold hover:underline">
              Create your first page →
            </Link>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-mono text-[10px] text-muted-foreground uppercase tracking-wide px-4 py-3">#</th>
                  <th className="text-left font-mono text-[10px] text-muted-foreground uppercase tracking-wide px-4 py-3">Title</th>
                  <th className="text-left font-mono text-[10px] text-muted-foreground uppercase tracking-wide px-4 py-3">Phase</th>
                  <th className="text-left font-mono text-[10px] text-muted-foreground uppercase tracking-wide px-4 py-3">Status</th>
                  <th className="text-right font-mono text-[10px] text-muted-foreground uppercase tracking-wide px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id} className="border-b border-border last:border-0 hover:bg-cream transition-colors">
                    <td className="px-4 py-3 font-mono text-[13px] text-foreground font-medium">{page.page_number}</td>
                    <td className="px-4 py-3 font-serif text-[14px] text-foreground">{page.page_title}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground uppercase">{PHASE_LABELS[page.phase] || page.phase}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => togglePublish(page.id, page.is_published)}
                        className={`font-mono text-[10px] uppercase px-2 py-1 rounded cursor-pointer ${
                          page.is_published
                            ? 'bg-forest/20 text-forest'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {page.is_published ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/process/${page.slug}`}
                          className="font-mono text-[10px] text-muted-foreground hover:text-foreground uppercase px-2 py-1"
                          target="_blank"
                        >
                          View
                        </Link>
                        <Link
                          to={`/admin/edit/${page.id}`}
                          className="font-mono text-[10px] text-gold hover:text-gold-light uppercase px-2 py-1"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(page.id, page.page_title)}
                          className="font-mono text-[10px] text-danger hover:opacity-80 uppercase px-2 py-1 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
