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

const c = {
  card: "#0e1834",
  cardSoft: "#111c3c",
  line: "rgba(136, 163, 218, 0.24)",
  lineSoft: "rgba(136, 163, 218, 0.16)",
  charcoal: "#eef4ff",
  secondary: "#c1cceb",
  muted: "#95a6d3",
  faint: "#7383ae",
  coral: "#ff8c4b",
  teal: "#34d2be",
  amber: "#f6b35f",
};

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
      <div
        className="rounded-[24px] overflow-hidden relative border"
        style={{
          background: c.card,
          borderColor: c.line,
          boxShadow: "0 30px 70px -45px rgba(0, 0, 0, 0.9)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle 420px at top right, rgba(255,140,75,0.18), transparent 58%), radial-gradient(circle 280px at bottom left, rgba(52,210,190,0.16), transparent 62%)",
          }}
        />
        <div className={`relative ${compact ? 'p-6' : 'p-8 md:p-10'}`}>
          <div className={compact ? '' : 'grid md:grid-cols-[1fr_160px] gap-8 items-start'}>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] mb-3" style={{ color: c.muted }}>
                {page.hero_subtitle}
              </p>
              <h1 className={`font-sans font-bold leading-[1.15] tracking-tight ${compact ? 'text-[28px]' : 'text-[36px] md:text-[44px]'}`} style={{ color: c.charcoal }}>
                {page.page_title}
              </h1>
              <p className={`font-sans leading-[1.7] mt-3 max-w-xl ${compact ? 'text-[14px]' : 'text-[16px]'}`} style={{ color: c.secondary }}>
                {page.hero_description}
              </p>
            </div>
            {!compact && (
              <div className="text-right">
                <div className="font-sans text-[56px] font-black leading-none" style={{ color: c.coral, textShadow: "0 0 26px rgba(255,140,75,0.25)" }}>
                  {page.impact_score}
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] mt-1" style={{ color: c.muted }}>Mojo Score Impact</p>
              </div>
            )}
          </div>
          {page.score_detail && !compact && (
            <div
              className="rounded-xl p-4 mt-5 border"
              style={{ background: "rgba(255,255,255,0.03)", borderColor: c.lineSoft }}
            >
              <p className="font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>{page.score_detail}</p>
            </div>
          )}
        </div>
      </div>

      {/* Process steps */}
      {processSteps.length > 0 && (
        <div className={`grid grid-cols-2 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-4'} gap-3 mt-4`}>
          {processSteps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl p-4 text-center border"
              style={{
                background: c.cardSoft,
                borderColor: c.line,
                boxShadow: "0 18px 45px -36px rgba(0,0,0,0.88)",
              }}
            >
              <div className="mb-2 text-[20px] font-semibold" style={{ color: c.teal }}>{step.icon}</div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: c.secondary }}>
                {step.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Content sections */}
      <div className="space-y-4 mt-4">
        {sections.map((section) => (
          <div
            key={section.num}
            className="rounded-[22px] p-6 md:p-8 border"
            style={{
              background: c.cardSoft,
              borderColor: c.line,
              boxShadow: "0 20px 48px -38px rgba(0,0,0,0.9)",
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <span
                className="inline-flex w-[36px] h-[36px] rounded-full font-sans text-[14px] font-bold items-center justify-center shrink-0"
                style={{ background: c.amber, color: "#0e142c" }}
              >
                {section.num}
              </span>
              <h2 className={`font-sans font-bold ${compact ? 'text-[20px]' : 'text-[24px] md:text-[28px]'}`} style={{ color: c.charcoal }}>
                {section.title}
              </h2>
            </div>
            <div
              className="prose max-w-none font-sans text-[14px] leading-[1.8] [&_blockquote]:border-l [&_blockquote]:border-[#ff8c4b]/60 [&_blockquote]:pl-4 [&_strong]:font-semibold [&_li]:mb-1"
              style={{ color: c.secondary }}
              dangerouslySetInnerHTML={{ __html: section.content }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
