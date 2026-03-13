import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompany';
import { MOCK_NAV_CONFIG } from '@/lib/mockData';
import { ChevronDown } from 'lucide-react';
import mojoLogo from '@/assets/mojo-logo.png';

const group1 = [
  { label: 'MAP VIEW', path: '/' },
  { label: 'ROUTES', path: '/routes' },
  { label: 'INPUTS', path: '/inputs' },
  { label: 'FILES', path: '/files' },
  { label: 'SCHEDULE SESSION', path: '#' },
];

const group2 = [
  { label: 'JOB STEPS', path: '/job-steps', flag: 'show_job_steps' as const },
  { label: 'STRATEGY', path: '/strategy', flag: 'show_strategy' as const },
  { label: 'OPPORTUNITIES', path: '/opportunities', flag: 'show_opps_map' as const },
  { label: 'POSITIONING', path: '/positioning', flag: 'show_positioning' as const },
  { label: 'ANALYTICS', path: '/analytics', flag: 'show_analytics' as const },
];

interface TopNavProps {
  onProcessClick?: () => void;
}


export default function TopNav({ onProcessClick }: TopNavProps) {
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const { companies, activeCompany, setActiveCompanyId } = useCompany();
  const [showSwitcher, setShowSwitcher] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const navConfig = MOCK_NAV_CONFIG;
  const visibleGroup2 = group2.filter((t) => navConfig[t.flag]);
  const companyName = activeCompany?.name?.trim() || 'No company selected';
  const companyMeta = activeCompany
    ? [
        'Strategy Map',
        activeCompany.quarter?.trim() || 'Quarter not set',
        activeCompany.archetype?.trim() || 'Archetype not set',
      ].join(' · ')
    : 'Select a company to view its map';

  // Close switcher on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function isActive(path: string) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  const tabClass = (path: string) =>
    `font-mono text-[12px] uppercase tracking-[0.08em] pb-[14px] pt-[15px] border-b-2 transition-colors whitespace-nowrap ${
      isActive(path)
        ? 'text-[#2c2925] border-[#2c2925]'
        : 'text-[#9a958d] border-transparent hover:text-[#2c2925]'
    }`;

  return (
    <nav className="h-[52px] bg-white border-b border-[#ebe7e0] flex items-center px-6 sticky top-0 z-50">
      {/* Logo */}
      <div className="flex items-center mr-6">
        <img src={mojoLogo} alt="Mojo" className="h-5" />
      </div>

      {/* Tab Group 1 */}
      <div className="flex items-center gap-5">
        {group1.map((tab) => (
          <Link key={tab.path} to={tab.path} className={tabClass(tab.path)}>
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Divider */}
      {visibleGroup2.length > 0 && (
        <div className="w-px h-5 bg-[#ebe7e0] mx-5" />
      )}

      {/* Tab Group 2 */}
      <div className="flex items-center gap-5">
        {visibleGroup2.map((tab) => (
          <Link key={tab.path} to={tab.path} className={tabClass(tab.path)}>
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Our Process link */}
      <>
        <div className="w-px h-5 bg-[#ebe7e0] mx-5" />
        <Link
          to="/process/mojomap"
          className={tabClass('/process/mojomap')}
        >
          Our Process
        </Link>
      </>

      <div className="flex-1" />

      {/* Company switcher */}
      <div className="relative" ref={switcherRef}>
        <button
          onClick={() => isAdmin && companies.length > 1 && setShowSwitcher(!showSwitcher)}
          className={`text-right mr-4 ${isAdmin && companies.length > 1 ? 'cursor-pointer hover:opacity-80' : ''} flex items-center gap-1.5`}
        >
          <div className="text-right">
            <p className="font-serif text-[14px] font-medium text-[#2c2925] leading-none">
              {companyName}
            </p>
            <p className="font-mono text-[10px] text-[#9a958d] uppercase tracking-[0.08em] mt-[2px]">
              {companyMeta}
            </p>
          </div>
          {isAdmin && companies.length > 1 && (
            <ChevronDown className={`w-3.5 h-3.5 text-[#9a958d] transition-transform ${showSwitcher ? 'rotate-180' : ''}`} />
          )}
        </button>

        {showSwitcher && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-[#ebe7e0] rounded-lg shadow-lg py-1 min-w-[240px] z-[60]">
            {companies.map((c) => (
              <button
                key={c.id}
                onClick={() => { setActiveCompanyId(c.id); setShowSwitcher(false); }}
                className={`w-full text-left px-4 py-2.5 hover:bg-[#f8f6f1] transition-colors ${
                  c.id === activeCompany?.id ? 'bg-[#f8f6f1]' : ''
                }`}
              >
                <p className="font-serif text-[13px] text-[#2c2925]">{c.name}</p>
                <p className="font-mono text-[9px] text-[#9a958d] uppercase tracking-wide">
                  {c.quarter} · {c.archetype}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Auth */}
      {user ? (
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link to="/admin" className="font-mono text-[11px] text-[#e8613a] uppercase tracking-[0.08em] hover:text-[#c04e2e] transition-colors">
              CMS
            </Link>
          )}
          <button
            onClick={() => signOut()}
            className="font-mono text-[11px] text-[#9a958d] uppercase tracking-[0.08em] hover:text-[#2c2925] transition-colors"
          >
            Sign Out
          </button>
        </div>
      ) : (
        <Link to="/login" className="font-mono text-[11px] text-[#e8613a] uppercase tracking-[0.08em] hover:text-[#c04e2e] transition-colors">
          Login
        </Link>
      )}
    </nav>
  );
}
