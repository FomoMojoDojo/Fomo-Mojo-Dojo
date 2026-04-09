type ClientSignalStateBannerProps = {
  level?: "EARLY SIGNAL" | "VALIDATED SIGNAL";
  subtitle?: string;
};

export default function ClientSignalStateBanner({
  level = "EARLY SIGNAL",
  subtitle = "Based on internal + public inputs. Not yet validated.",
}: ClientSignalStateBannerProps) {
  return (
    <div className="mb-4 inline-flex flex-col rounded-lg border border-rust/25 bg-rust/5 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-rust">{level}</p>
      <p className="mt-1 max-w-[640px] font-sans text-[12px] leading-[1.45] text-t-secondary">{subtitle}</p>
    </div>
  );
}
