interface Props {
  label: string;
  detail: string;
  tone?: 'public' | 'internal';
  className?: string;
}

const toneStyles: Record<NonNullable<Props['tone']>, { border: string; bg: string; text: string; pill: string }> = {
  public: {
    border: '#d7c9a8',
    bg: '#f3ead5',
    text: '#5b513d',
    pill: '#b7791f',
  },
  internal: {
    border: '#c7d7c8',
    bg: '#e6efe6',
    text: '#3e5a42',
    pill: '#4f8b49',
  },
};

export default function AiBoundaryNote({ label, detail, tone = 'public', className = '' }: Props) {
  const style = toneStyles[tone];

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${className}`.trim()}
      style={{ borderColor: style.border, background: style.bg }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white"
          style={{ background: style.pill }}
        >
          {label}
        </span>
      </div>
      <p className="mt-2 font-sans text-[13px] leading-[1.65]" style={{ color: style.text }}>
        {detail}
      </p>
    </div>
  );
}
