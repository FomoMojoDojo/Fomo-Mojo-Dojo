import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import RichTextEditor from '@/components/cms/RichTextEditor';

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
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="font-mono text-[13px] text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const fieldClass = "w-full bg-background border border-border rounded-lg px-3 py-2.5 font-sans text-[14px] text-foreground focus:border-gold focus:outline-none transition-colors";
  const labelClass = "font-mono text-[10px] text-muted-foreground uppercase tracking-wide block mb-1";

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="bg-ink border-b border-[#2a2618] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="font-mono text-[11px] text-t-ds hover:text-t-dp uppercase">
            ← Back to Dashboard
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gold text-ink font-mono text-[11px] uppercase tracking-wide px-5 py-2 rounded-lg font-semibold hover:bg-gold-light transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEditing ? 'Update Page' : 'Create Page'}
          </button>
        </div>
      </div>

      <div className="max-w-[800px] mx-auto px-6 py-8">
        <h1 className="font-serif text-[22px] font-medium text-foreground mb-6">
          {isEditing ? `Edit: ${form.page_title}` : 'New Methodology Page'}
        </h1>

        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-4">
            <p className="font-mono text-[12px] text-danger">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Meta fields */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide border-b border-border pb-2">Page Meta</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Page Number</label>
                <input value={form.page_number} onChange={(e) => handleChange('page_number', e.target.value)} className={fieldClass} placeholder="01" />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Page Title</label>
                <input value={form.page_title} onChange={(e) => handleChange('page_title', e.target.value)} className={fieldClass} placeholder="Market Definition" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
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
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_published} onChange={(e) => handleChange('is_published', e.target.checked)} id="published" className="accent-gold" />
              <label htmlFor="published" className="font-mono text-[12px] text-foreground">Published</label>
            </div>
          </div>

          {/* Hero fields */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide border-b border-border pb-2">Hero Section</p>
            <div>
              <label className={labelClass}>Hero Subtitle</label>
              <input value={form.hero_subtitle} onChange={(e) => handleChange('hero_subtitle', e.target.value)} className={fieldClass} placeholder="Foundation Phase · Step 01" />
            </div>
            <div>
              <label className={labelClass}>Hero Description</label>
              <textarea value={form.hero_description} onChange={(e) => handleChange('hero_description', e.target.value)} className={`${fieldClass} h-24 resize-y`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
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

          {/* Content sections */}
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <div key={n} className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3 border-b border-border pb-2">
                <span className="w-7 h-7 rounded-full bg-gold text-ink font-mono text-[12px] flex items-center justify-center font-bold">{`0${n}`}</span>
                <input
                  value={form[`section${n}_title` as keyof PageForm] as string}
                  onChange={(e) => handleChange(`section${n}_title` as keyof PageForm, e.target.value)}
                  className="flex-1 bg-transparent border-none font-serif text-[16px] text-foreground focus:outline-none"
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
