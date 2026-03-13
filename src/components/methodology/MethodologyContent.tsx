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

interface Props {
  page: PageData;
  compact?: boolean;
}

export default function MethodologyContent({ page, compact = false }: Props) {
  const sections = [
    { num: '01', title: page.section1_title, content: page.section1_content },
    { num: '02', title: page.section2_title, content: page.section2_content },
    { num: '03', title: page.section3_title, content: page.section3_content },
    { num: '04', title: page.section4_title, content: page.section4_content },
    { num: '05', title: page.section5_title, content: page.section5_content },
  ].filter((s) => s.content);

  const processSteps = (page.process_steps as { icon: string; label: string }[]) || [];

  return (
    <div>
      {/* Hero card */}
      <div className="bg-ink rounded-2xl overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle 300px at top right, rgba(240,216,96,0.06), transparent)',
          }}
        />
        <div className={`relative ${compact ? 'p-6' : 'p-8 md:p-10'}`}>
          <div className={compact ? '' : 'grid md:grid-cols-[1fr_160px] gap-8 items-start'}>
            <div>
              <p className="font-mono text-[10px] text-t-ds uppercase tracking-[0.14em] mb-3">
                {page.hero_subtitle}
              </p>
              <h1 className={`font-serif font-bold text-gold leading-[1.15] tracking-tight ${compact ? 'text-[28px]' : 'text-[36px] md:text-[44px]'}`}>
                {page.page_title}
              </h1>
              <p className={`font-serif text-t-ds leading-[1.7] mt-3 max-w-xl ${compact ? 'text-[14px]' : 'text-[16px]'}`}>
                {page.hero_description}
              </p>
            </div>
            {!compact && (
              <div className="text-right">
                <div className="font-serif text-[56px] font-bold text-gold leading-none">
                  {page.impact_score}
                </div>
                <p className="font-mono text-[10px] text-t-ds uppercase tracking-[0.1em] mt-1">Mojo Score Impact</p>
              </div>
            )}
          </div>
          {page.score_detail && !compact && (
            <div className="bg-ink-sub border-l-[3px] border-gold rounded-r-lg p-4 mt-5">
              <p className="font-serif text-[13px] text-t-ds leading-[1.7]">{page.score_detail}</p>
            </div>
          )}
        </div>
      </div>

      {/* Process steps */}
      {processSteps.length > 0 && (
        <div className={`grid grid-cols-2 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-3 mt-4`}>
          {processSteps.map((step, i) => (
            <div key={i} className="bg-cream-mid rounded-lg p-4 text-center border-t-[3px] border-gold">
              <div className="text-[24px] mb-2">{step.icon}</div>
              <p className="font-mono text-[11px] font-semibold text-t-muted uppercase tracking-[0.06em]">{step.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Content sections */}
      <div className="space-y-4 mt-4">
        {sections.map((section) => (
          <div key={section.num} className="bg-cream-mid rounded-xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex w-[36px] h-[36px] rounded-full bg-gold text-ink font-serif text-[16px] font-bold items-center justify-center shrink-0">
                {section.num}
              </span>
              <h2 className={`font-serif font-bold text-foreground ${compact ? 'text-[20px]' : 'text-[24px] md:text-[28px]'}`}>
                {section.title}
              </h2>
            </div>
            <div
              className="prose max-w-none font-serif text-[14px] text-t-secondary leading-[1.8] [&_strong]:text-foreground [&_a]:text-gold [&_li]:mb-1"
              dangerouslySetInnerHTML={{ __html: section.content }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
