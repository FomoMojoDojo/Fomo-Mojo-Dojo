import TopNav from './TopNav';

const linenBg = `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`;
const neutralCanvasBg = [
  "radial-gradient(1200px 480px at 12% -12%, rgba(35,60,75,0.06), transparent 62%)",
  "radial-gradient(900px 420px at 90% -18%, rgba(95,155,140,0.08), transparent 60%)",
  `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.012'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
].join(",");

interface PageShellProps {
  children: React.ReactNode;
  /** If true, skip the inner recessed field container (for pages that manage their own layout) */
  bare?: boolean;
  /** Extra className on the <main> element */
  mainClassName?: string;
  /** Visual tone for shell background */
  tone?: "default" | "neutral";
}

export default function PageShell({
  children,
  bare,
  mainClassName,
  tone = "default",
}: PageShellProps) {
  const isNeutral = tone === "neutral";

  return (
    <div
      className={isNeutral ? "min-h-screen bg-[#f4f7f7]" : "min-h-screen bg-cream"}
      style={isNeutral ? { backgroundImage: neutralCanvasBg } : { backgroundImage: linenBg }}
    >
      <TopNav />
      <main className={mainClassName ?? 'max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12'}>
        {bare ? children : (
          <div
            className={
              isNeutral
                ? "rounded-2xl border border-[#d8e1de] bg-white/95 p-5 shadow-sm sm:p-6"
                : "rounded-2xl bg-cream-mid p-5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.07),inset_0_0_0_1px_rgba(0,0,0,0.04)] sm:p-6"
            }
          >
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
