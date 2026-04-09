import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import TopNav from "@/components/layout/TopNav";
import { ArrowUpRight, Building2, Plus } from "lucide-react";

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
  const [error, setError] = useState("");
  const { signOut } = useAuth();

  const fetchPages = async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('methodology_pages')
      .select('id, slug, page_number, page_title, phase, is_published, sort_order, updated_at')
      .order('sort_order', { ascending: true });
    if (fetchError) {
      setError(fetchError.message);
      setPages([]);
      setLoading(false);
      return;
    }
    setPages((data as PageRow[]) || []);
    setError("");
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

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  return (
    <div className="admin-premium-scope min-h-screen bg-[radial-gradient(1200px_500px_at_20%_-10%,rgba(45,212,191,0.14),transparent),linear-gradient(180deg,#0a0f23_0%,#0d1530_100%)] text-[#eaf0ff]">
      <TopNav />
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-7 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-white/10 bg-[#121936]/85 p-5 shadow-[0_20px_55px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#9ea9cd]">Admin</p>
              <h1 className="mt-2 font-serif text-[28px] font-medium leading-tight text-[#f4f7ff]">Methodology Pages</h1>
              <p className="mt-2 max-w-2xl text-[14px] text-[#c4cce8]">
                Manage your process narrative pages and publishing state in one place.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.09em] text-[#d7def8] transition-colors hover:bg-white/10"
              >
                Back to App <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={signOut}
                className="inline-flex items-center rounded-lg border border-[#7d3f52] bg-[#311725] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.09em] text-[#ffb8cd] transition-colors hover:bg-[#3b1d2d]"
              >
                Sign Out
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              to="/admin/new"
              className="inline-flex items-center gap-2 rounded-lg border border-[#2cd3bd] bg-[#1e6b6a] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.09em] text-white transition-colors hover:bg-[#247a79]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add New Page
            </Link>
            <Link
              to="/admin/companies"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.09em] text-[#d7def8] transition-colors hover:bg-white/10"
            >
              <Building2 className="h-3.5 w-3.5" />
              Company Pages
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/10 bg-[#121936]/82 shadow-[0_20px_55px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
          <div className="border-b border-white/10 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[#a6b1d6]">
            Methodology Library
          </div>

          {loading ? (
            <p className="px-5 py-8 font-mono text-[13px] text-[#9ca8cf]">Loading pages...</p>
          ) : error ? (
            <div className="px-5 py-8">
              <p className="font-mono text-[12px] text-[#ffb8cd]">{error}</p>
              <button
                type="button"
                onClick={fetchPages}
                className="mt-3 rounded-md border border-white/15 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#d7def8] transition-colors hover:bg-white/10"
              >
                Retry
              </button>
            </div>
          ) : pages.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-serif text-[17px] text-[#d8def2]">No methodology pages yet.</p>
              <Link to="/admin/new" className="mt-3 inline-block font-mono text-[12px] text-[#62e1d4] hover:text-[#7fecdf]">
                Create your first page →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[#9ea9cd]">#</th>
                    <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[#9ea9cd]">Title</th>
                    <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[#9ea9cd]">Phase</th>
                    <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[#9ea9cd]">Updated</th>
                    <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[#9ea9cd]">Status</th>
                    <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.1em] text-[#9ea9cd]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map((page) => (
                    <tr key={page.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.03] last:border-0">
                      <td className="px-4 py-3 font-mono text-[13px] text-[#e4e9fa]">{page.page_number}</td>
                      <td className="px-4 py-3 font-serif text-[15px] text-[#eef2ff]">{page.page_title}</td>
                      <td className="px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[#b3bddf]">
                        {PHASE_LABELS[page.phase] || page.phase}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-[#9ea9cd]">{formatDate(page.updated_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => togglePublish(page.id, page.is_published)}
                          className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                            page.is_published
                              ? "border-[#2ecfb6]/45 bg-[#1f5d5d] text-[#9bf2df]"
                              : "border-white/15 bg-white/5 text-[#a9b4d6]"
                          }`}
                        >
                          {page.is_published ? "Published" : "Draft"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/process/${page.slug}`}
                            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#c8d1ef] transition-colors hover:bg-white/10"
                            target="_blank"
                          >
                            View
                          </Link>
                          <Link
                            to={`/admin/edit/${page.id}`}
                            className="rounded-md border border-[#2cd3bd]/35 bg-[#1f5d5d] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#95ecdd] transition-colors hover:bg-[#247070]"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(page.id, page.page_title)}
                            className="rounded-md border border-[#7d3f52] bg-[#311725] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#ffb8cd] transition-colors hover:bg-[#3b1d2d]"
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
        </section>
      </div>
    </div>
  );
}
