import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import RichTextEditor from '@/components/cms/RichTextEditor';
import TopNav from '@/components/layout/TopNav';
import { ArrowUpRight, Save } from 'lucide-react';

interface PageForm {
  slug: string;
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
  sort_order: number;
  is_published: boolean;
}

const EMPTY: PageForm = {
  slug: '',
  page_number: '',
  page_title: '',
  phase: 'foundation',
  hero_subtitle: '',
  hero_description: '',
  impact_score: '+0',
  score_detail: '',
  process_steps: [],
  section1_title: 'What This Is',
  section1_content: '',
  section2_title: 'The Process',
  section2_content: '',
  section3_title: "What You'll Get",
  section3_content: '',
  section4_title: 'Why It Matters',
  section4_content: '',
  section5_title: 'What Happens Next',
  section5_content: '',
  sort_order: 0,
  is_published: false,
};

export default function AdminPageEditor() {
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState<PageForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    supabase
      .from('methodology_pages')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          navigate('/admin');
          return;
        }
        setForm({
          slug: data.slug,
          page_number: data.page_number,
          page_title: data.page_title,
          phase: data.phase,
          hero_subtitle: data.hero_subtitle,
          hero_description: data.hero_description,
          impact_score: data.impact_score,
          score_detail: data.score_detail,
          process_steps: (data.process_steps as { icon: string; label: string }[]) || [],
          section1_title: data.section1_title,
          section1_content: data.section1_content,
          section2_title: data.section2_title,
          section2_content: data.section2_content,
          section3_title: data.section3_title,
          section3_content: data.section3_content,
          section4_title: data.section4_title,
          section4_content: data.section4_content,
          section5_title: data.section5_title,
          section5_content: data.section5_content,
          sort_order: data.sort_order,
          is_published: data.is_published,
        });
        setLoading(false);
      });
  }, [id, navigate]);

  const autoSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleChange = (field: keyof PageForm, value: string | number | boolean) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'page_title' && !isEditing) {
        next.slug = autoSlug(value as string);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    if (!form.slug || !form.page_title || !form.page_number) {
      setError('Page number, title, and slug are required.');
      return;
    }
    setSaving(true);

    const payload = {
      ...form,
      process_steps: form.process_steps,
    };

    let result;
    if (isEditing) {
      result = await supabase.from('methodology_pages').update(payload).eq('id', id);
    } else {
      result = await supabase.from('methodology_pages').insert(payload);
    }

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
    } else {
      navigate('/admin');
    }
  };

  if (loading) {
    return (
      <div className="admin-premium-scope min-h-screen bg-[radial-gradient(1200px_500px_at_20%_-10%,rgba(45,212,191,0.14),transparent),linear-gradient(180deg,#0a0f23_0%,#0d1530_100%)]">
        <TopNav />
        <div className="flex items-center justify-center py-24">
          <p className="font-mono text-[13px] text-[#aab5d8]">Loading...</p>
        </div>
      </div>
    );
  }

  const fieldClass =
    "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 font-sans text-[14px] text-[#eef4ff] placeholder:text-[#8ea0cd] focus:border-[#34d2be] focus:outline-none";
  const labelClass = "mb-1 block font-mono text-[10px] uppercase tracking-wide text-[#9aa7cf]";

  return (
    <div className="admin-premium-scope min-h-screen bg-[radial-gradient(1200px_500px_at_20%_-10%,rgba(45,212,191,0.14),transparent),linear-gradient(180deg,#0a0f23_0%,#0d1530_100%)] text-[#eaf0ff]">
      <TopNav />
      <div className="mx-auto w-full max-w-[980px] px-4 pb-12 pt-7 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-white/10 bg-[#121936]/85 p-5 shadow-[0_20px_55px_-40px_rgba(0,0,0,0.9)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#9ea9cd]">
                {isEditing ? 'Edit Methodology Page' : 'Create Methodology Page'}
              </p>
              <h1 className="mt-2 font-serif text-[28px] font-medium leading-tight text-[#f4f7ff]">
                {isEditing ? `Edit: ${form.page_title}` : 'New Methodology Page'}
              </h1>
              <p className="mt-2 max-w-xl text-[14px] text-[#c4cce8]">
                Keep this page aligned with the workshop system and your current narrative style.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/admin"
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.09em] text-[#d7def8] transition-colors hover:bg-white/10"
              >
                Back to Methodology Pages <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg border border-[#2cd3bd] bg-[#1e6b6a] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.09em] text-white transition-colors hover:bg-[#247a79] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving...' : isEditing ? 'Update Page' : 'Create Page'}
              </button>
            </div>
          </div>
          {error && (
            <div className="mt-4 rounded-lg border border-[#7d3f52] bg-[#311725] p-3">
              <p className="font-mono text-[12px] text-[#ffb8cd]">{error}</p>
            </div>
          )}
        </section>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-white/10 bg-[#121936]/82 p-5 shadow-[0_20px_55px_-40px_rgba(0,0,0,0.9)]">
            <p className="border-b border-white/10 pb-2 font-mono text-[10px] uppercase tracking-wide text-[#a8b3d8]">Page Meta</p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={labelClass}>Page Number</label>
                <input value={form.page_number} onChange={(e) => handleChange('page_number', e.target.value)} className={fieldClass} placeholder="01" />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Page Title</label>
                <input value={form.page_title} onChange={(e) => handleChange('page_title', e.target.value)} className={fieldClass} placeholder="Market Definition" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className={labelClass}>Slug</label>
                <input value={form.slug} onChange={(e) => handleChange('slug', e.target.value)} className={fieldClass} placeholder="market-definition" />
              </div>
              <div>
                <label className={labelClass}>Phase</label>
                <select value={form.phase} onChange={(e) => handleChange('phase', e.target.value)} className={fieldClass}>
                  <option value="foundation">Foundation</option>
                  <option value="strategy">Strategy</option>
                  <option value="execution">Execution</option>
                  <option value="ongoing">Ongoing</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Sort Order</label>
                <input type="number" value={form.sort_order} onChange={(e) => handleChange('sort_order', parseInt(e.target.value) || 0)} className={fieldClass} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input type="checkbox" checked={form.is_published} onChange={(e) => handleChange('is_published', e.target.checked)} id="published" className="accent-[#34d2be]" />
              <label htmlFor="published" className="font-mono text-[12px] text-[#d7def8]">Published</label>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#121936]/82 p-5 shadow-[0_20px_55px_-40px_rgba(0,0,0,0.9)]">
            <p className="border-b border-white/10 pb-2 font-mono text-[10px] uppercase tracking-wide text-[#a8b3d8]">Hero Section</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass}>Hero Subtitle</label>
                <input value={form.hero_subtitle} onChange={(e) => handleChange('hero_subtitle', e.target.value)} className={fieldClass} placeholder="Foundation Phase · Step 01" />
              </div>
              <div>
                <label className={labelClass}>Hero Description</label>
                <textarea value={form.hero_description} onChange={(e) => handleChange('hero_description', e.target.value)} className={`${fieldClass} h-24 resize-y`} />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Impact Score</label>
                  <input value={form.impact_score} onChange={(e) => handleChange('impact_score', e.target.value)} className={fieldClass} placeholder="+12" />
                </div>
                <div>
                  <label className={labelClass}>Score Detail</label>
                  <textarea value={form.score_detail} onChange={(e) => handleChange('score_detail', e.target.value)} className={`${fieldClass} h-20 resize-y`} />
                </div>
              </div>
            </div>
          </div>

          {([1, 2, 3, 4, 5] as const).map((n) => (
            <div key={n} className="rounded-xl border border-white/10 bg-[#121936]/82 p-5 shadow-[0_20px_55px_-40px_rgba(0,0,0,0.9)]">
              <div className="mb-3 flex items-center gap-3 border-b border-white/10 pb-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff8c4b] font-mono text-[12px] font-bold text-[#0f1736]">
                  {`0${n}`}
                </span>
                <input
                  value={form[`section${n}_title` as keyof PageForm] as string}
                  onChange={(e) => handleChange(`section${n}_title` as keyof PageForm, e.target.value)}
                  className="flex-1 bg-transparent font-serif text-[16px] text-[#eef4ff] outline-none placeholder:text-[#8ea0cd]"
                  placeholder={`Section ${n} Title`}
                />
              </div>
              <RichTextEditor
                content={form[`section${n}_content` as keyof PageForm] as string}
                onChange={(html) => handleChange(`section${n}_content` as keyof PageForm, html)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
