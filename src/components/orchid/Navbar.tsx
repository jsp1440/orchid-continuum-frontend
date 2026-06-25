import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, LogIn, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/auth/AuthModal';
import FavoritesMenu from './FavoritesMenu';

/**
 * FRONTEND-R1 navigation shell.
 *
 * The v0.1 Preview Release keeps unfinished prototype modules out of the main
 * public navigation while preserving their routes for direct/deep links. This
 * makes the public journey coherent without deleting active development work.
 */

type Linkish = {
  label: string;
  route?: string;
  href?: string;
  external?: boolean;
  description?: string;
  badge?: string;
};

const PRIMARY: Linkish[] = [
  { label: 'Home', route: '/' },
  { label: 'Atlas', route: '/atlas' },
  { label: 'Species', route: '/species' },
  { label: 'Research', route: '/research' },
  { label: 'About', route: '/about' },
];

interface MoreGroup {
  title: string;
  items: Linkish[];
}

const MORE_GROUPS: MoreGroup[] = [
  {
    title: 'Release-ready hubs',
    items: [
      { label: 'Partners', route: '/partners', description: 'Advisors, institutions, and collaboration pathways' },
      { label: 'Get Involved', route: '/get-involved', description: 'Volunteer, donate, join, or support the Continuum' },
      { label: 'Conservation Hub', route: '/conservation', description: 'Conservation projects and organizational context', badge: 'Preview' },
    ],
  },
  {
    title: 'Coming online',
    items: [
      { label: 'Education', route: '/education', description: 'Glossary, BloomBot, and learning materials', badge: 'Preview' },
      { label: 'University', route: '/coming-soon/university', description: 'Open educational pathways on the knowledge graph', badge: 'Soon' },
      { label: 'Orchid Societies', route: '/societies', description: 'Society tools and federation features', badge: 'Prototype' },
    ],
  },
];

const ALL_SECONDARY: Linkish[] = MORE_GROUPS.flatMap((g) => g.items);

interface NavbarProps {
  /** Pixels to push the fixed header down, for example under the status banner. */
  topOffset?: number;
}

const Navbar: React.FC<NavbarProps> = ({ topOffset = 0 }) => {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!accountOpen) return;
    const onClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [accountOpen]);

  const go = (l: Linkish) => {
    if (l.external && l.href) {
      window.open(l.href, '_blank', 'noopener,noreferrer');
    } else if (l.route) {
      navigate(l.route);
    }
    setOpen(false);
    setMoreOpen(false);
  };

  const isActive = (l: Linkish) => {
    if (l.external || !l.route) return false;
    if (l.route === '/') return location.pathname === '/';
    return location.pathname.startsWith(l.route);
  };

  const anySecondaryActive = ALL_SECONDARY.some((s) => isActive(s));
  const displayName =
    (user?.user_metadata && ((user.user_metadata as Record<string, unknown>).display_name as string | undefined)) ||
    user?.email?.split('@')[0] ||
    'Member';

  const renderLink = (l: Linkish, className: string) => {
    if (l.external && l.href) {
      return (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={className}>
          {l.label}
          <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
        </a>
      );
    }

    return (
      <button key={l.route || l.label} onClick={() => go(l)} className={className}>
        {l.label}
      </button>
    );
  };

  return (
    <>
      <header
        style={{ top: topOffset }}
        className={
          'fixed left-0 right-0 z-50 transition-colors duration-300 ' +
          (scrolled
            ? 'bg-[#faf7f2]/95 backdrop-blur-md border-b border-quiet shadow-[0_4px_24px_-12px_rgba(28,26,23,0.12)]'
            : 'bg-[#faf7f2]/80 backdrop-blur-sm border-b border-transparent')
        }
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 shrink-0 group" onClick={() => setOpen(false)}>
            <Monogram />
            <span className="font-display text-[1.15rem] tracking-wide text-ink group-hover:text-forest transition-colors">
              Orchid <span className="italic text-forest">Continuum</span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-5 xl:gap-6">
            {PRIMARY.map((l) =>
              renderLink(
                l,
                'font-mono text-[11px] tracking-[0.18em] uppercase transition-colors whitespace-nowrap inline-flex items-center gap-1 ' +
                  (isActive(l) ? 'text-forest' : 'text-charcoal/70 hover:text-forest'),
              ),
            )}

            <div className="relative" onMouseEnter={() => setMoreOpen(true)} onMouseLeave={() => setMoreOpen(false)}>
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className={
                  'inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors ' +
                  (anySecondaryActive ? 'text-forest' : 'text-charcoal/70 hover:text-forest')
                }
              >
                More
                <ChevronDown className={'h-3 w-3 transition-transform ' + (moreOpen ? 'rotate-180' : '')} />
              </button>

              {moreOpen && (
                <div className="absolute top-full right-0 mt-3 w-[520px] max-w-[calc(100vw-3rem)] rounded-sm border border-quiet bg-warm-white shadow-[0_24px_60px_-24px_rgba(28,26,23,0.25)] p-6">
                  <div className="grid grid-cols-2 gap-6">
                    {MORE_GROUPS.map((g) => (
                      <div key={g.title}>
                        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-3">
                          {g.title}
                        </div>
                        <ul className="space-y-1">
                          {g.items.map((it) => (
                            <li key={it.route || it.label}>
                              <button
                                onClick={() => go(it)}
                                className={
                                  'block w-full text-left rounded-sm px-3 py-2 transition-colors ' +
                                  (isActive(it) ? 'bg-[#f5f0e8] text-forest' : 'text-ink hover:bg-[#f5f0e8] hover:text-forest')
                                }
                              >
                                <div className="font-display text-[15px] inline-flex items-center gap-1.5">
                                  {it.label}
                                  {it.badge && (
                                    <span className="rounded-full border border-gold/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-gold">
                                      {it.badge}
                                    </span>
                                  )}
                                </div>
                                {it.description && (
                                  <div className="font-body text-[12px] text-charcoal/70 mt-0.5 leading-snug">
                                    {it.description}
                                  </div>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <FavoritesMenu />

            {user ? (
              <div className="relative" ref={accountRef}>
                <button
                  type="button"
                  onClick={() => setAccountOpen((o) => !o)}
                  className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase text-charcoal/75 hover:text-forest transition-colors"
                >
                  <span className="h-7 w-7 rounded-full bg-[#1f3d2b] text-[#faf7f2] inline-flex items-center justify-center font-display text-[13px]">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden xl:inline max-w-[120px] truncate">{displayName}</span>
                  <ChevronDown className={'h-3 w-3 transition-transform ' + (accountOpen ? 'rotate-180' : '')} />
                </button>

                {accountOpen && (
                  <div className="absolute top-full right-0 mt-3 w-56 rounded-sm border border-quiet bg-warm-white shadow-[0_24px_60px_-24px_rgba(28,26,23,0.25)] py-2">
                    <div className="px-4 py-2 border-b border-quiet">
                      <div className="font-display text-[14px] text-ink truncate">{displayName}</div>
                      <div className="font-mono text-[10px] tracking-[0.12em] text-charcoal/60 truncate">{user.email}</div>
                    </div>
                    <button
                      onClick={() => { setAccountOpen(false); navigate('/account'); }}
                      className="w-full text-left px-4 py-2 font-body text-[14px] text-ink hover:bg-[#f5f0e8] hover:text-forest inline-flex items-center gap-2"
                    >
                      <UserIcon className="h-3.5 w-3.5" /> My account
                    </button>
                    <button
                      onClick={() => { setAccountOpen(false); navigate('/collection'); }}
                      className="w-full text-left px-4 py-2 font-body text-[14px] text-ink hover:bg-[#f5f0e8] hover:text-forest"
                    >
                      My collection
                    </button>
                    <button
                      onClick={async () => { setAccountOpen(false); await signOut(); navigate('/'); }}
                      className="w-full text-left px-4 py-2 font-body text-[14px] text-[#7a2a28] hover:bg-[#fdf3f2] inline-flex items-center gap-2"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-charcoal/75 hover:text-forest transition-colors"
              >
                <LogIn className="h-3.5 w-3.5" /> Sign in
              </button>
            )}

            <button
              onClick={() => navigate('/get-involved')}
              className="font-mono text-[11px] tracking-[0.18em] uppercase px-4 py-2 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors whitespace-nowrap"
            >
              Join
            </button>
          </nav>

          <div className="flex items-center gap-4 lg:hidden">
            <FavoritesMenu />
            <button onClick={() => setOpen(!open)} className="text-ink" aria-label="Toggle navigation">
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {open && (
          <div className="lg:hidden bg-cream border-t border-quiet max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="px-6 py-5 flex flex-col gap-1">
              {user ? (
                <div className="mb-3 pb-3 border-b border-quiet flex items-center gap-3">
                  <span className="h-9 w-9 rounded-full bg-[#1f3d2b] text-[#faf7f2] inline-flex items-center justify-center font-display text-[15px]">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-[15px] text-ink truncate">{displayName}</div>
                    <div className="font-mono text-[10px] tracking-[0.12em] text-charcoal/60 truncate">{user.email}</div>
                  </div>
                  <button onClick={() => { setOpen(false); navigate('/account'); }} className="font-mono text-[10px] tracking-[0.2em] uppercase text-forest">
                    Account
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setOpen(false); setAuthOpen(true); }}
                  className="mb-2 inline-flex items-center justify-center gap-2 py-2.5 rounded-sm border border-forest/30 bg-warm-white text-forest font-mono text-[11px] tracking-[0.2em] uppercase"
                >
                  <LogIn className="h-3.5 w-3.5" /> Sign in
                </button>
              )}

              {PRIMARY.map((l) =>
                renderLink(
                  l,
                  'text-left py-2.5 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors inline-flex items-center gap-1.5 ' +
                    (isActive(l) ? 'text-forest' : 'text-charcoal/75 hover:text-forest'),
                ),
              )}

              {MORE_GROUPS.map((g) => (
                <div key={g.title} className="mt-4">
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-gold mb-2">
                    {g.title}
                  </div>
                  {g.items.map((it) => (
                    <button
                      key={it.route || it.label}
                      onClick={() => go(it)}
                      className={
                        'block w-full text-left py-2 font-display text-[15px] transition-colors ' +
                        (isActive(it) ? 'text-forest' : 'text-ink hover:text-forest')
                      }
                    >
                      {it.label}
                      {it.badge && <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-gold">{it.badge}</span>}
                    </button>
                  ))}
                </div>
              ))}

              {user && (
                <button
                  onClick={async () => { setOpen(false); await signOut(); navigate('/'); }}
                  className="mt-4 inline-flex items-center justify-center gap-2 py-2.5 rounded-sm border border-quiet text-[#7a2a28] font-mono text-[11px] tracking-[0.2em] uppercase"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              )}

              <button
                onClick={() => go({ label: 'Join', route: '/get-involved' })}
                className="mt-5 font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-2.5 rounded-full bg-[#1f3d2b] text-[#faf7f2]"
              >
                Join the Continuum
              </button>
            </div>
          </div>
        )}
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} initialMode="signin" />
    </>
  );
};

const Monogram: React.FC = () => (
  <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
    <g fill="none" stroke="#1f3d2b" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="16" r="14" stroke="#b8962a" strokeWidth="1" />
      <path d="M16,7 C12,11 12,15 16,17 C20,15 20,11 16,7 Z" />
      <path d="M9,18 C12,18 14,20 14,23 C11,23 9,21 9,18 Z" />
      <path d="M23,18 C20,18 18,20 18,23 C21,23 23,21 23,18 Z" />
      <path d="M16,17 L16,26" />
    </g>
  </svg>
);

export default Navbar;
