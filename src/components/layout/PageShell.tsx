import TopNav from './TopNav';

const linenBg = `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`;

interface PageShellProps {
  children: React.ReactNode;
  onProcessClick?: () => void;
  /** If true, skip the inner recessed field container (for pages that manage their own layout) */
  bare?: boolean;
  /** Extra className on the <main> element */
  mainClassName?: string;
}

export default function PageShell({ children, onProcessClick, bare, mainClassName }: PageShellProps) {
  return (
    <div
      className="min-h-screen"
      style={{ background: '#eae5db', backgroundImage: linenBg }}
    >
      <TopNav onProcessClick={onProcessClick} />
      <main className={mainClassName ?? 'max-w-content mx-auto pt-6 px-4 sm:px-6 md:px-9 pb-12'}>
        {bare ? children : (
          <div
            className="rounded-2xl p-5 sm:p-6"
            style={{
              background: '#ddd8cd',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(0,0,0,0.04)',
            }}
          >
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
