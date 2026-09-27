import React, { useState, useEffect, useRef } from 'react';
import { Menu, X, ChevronDown, ExternalLink, Gauge, User as UserIcon, LogOut, LogIn } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import AuthModal from '@/components/auth/AuthModal';
import { atlasWorkspaceCalyxHref, atlasWorkspaceResearchHref, atlasWorkspaceSpeciesHref } from '@/lib/featuredTaxonNavigation';
import FavoritesMenu from './FavoritesMenu';

/**
 * Botanical-journal navigation for the Orchid Continuum platform shell.
 *
 * Light cream bar with a forest-green wordmark, IBM Plex Mono nav labels,
 * a grouped megamenu for the audience-aware hubs, and an auth-aware
 * Sign In / account menu on the right.
 */

type Linkish = {
  label: string;
  route?: string;
  href?: string;
  external?: boolean;
  description?: string;
};

const PRIMARY: Linkish[] = [
  { label: 'Home',         route: '/' },
  { label: 'Conservatory', route: '/conservatory' },
  { label: 'Atlas',        route: '/atlas' },
  { label: 'Species',      route: '/species' },
  { label: 'CALYX',        route: '/calyx' },
  { label: 'Education',    route: '/education' },
  { label: 'OASIS',        route: '/oacs' },
  { label: 'About',        route: '/about' },
];

interface MoreGroup { title: string; items: Linkish[] }

const MORE_GROUPS: MoreGroup[] = [
  {
    title: 'Communities',
    items: [
      { label: 'Ecosystems',       route: '/ecosystems',   description: 'Seven communities of practice' },
      { label: 'Conservation Hub', route: '/conservation', description: 'Organisations & project workspaces' },
      { label: 'Orchid Societies', route: '/societies',    description: 'Local chapters & member tools' },
      { label: 'Orchids on screen', route: '/culture/orchids-on-screen', description: 'What a century of film made of them' },
    ],
  },
  {
    title: 'Learning',
    items: [
      {
        label: 'Orchid Continuum University',
        route: '/university',
        description: 'Open educational pathways on the knowledge graph',
      },
      { label: 'Illustrated Lexicon', route: '/lexicon',    description: 'A–Z orchid terms with illustrations and provenance' },
      { label: 'Classroom',           route: '/classroom',  description: 'Teacher dashboards' },
      { label: 'Judging practice',    route: '/education/judging-practice', description: 'Score a rubric sheet criterion by criterion' },
      { label: 'Glossary & Physiology', route: '/education', description: 'BloomBot · glossary · physiology' },
    ],
  },
  {
    title: 'Research & support',
    items: [
      { label: 'Research Center', route: '/research',     description: 'Queries · traits · networks' },
      { label: 'Orchid identification', route: '/orchid-identification', description: 'Matrix-guided identification from observed characters' },
      { label: 'Literature',      route: '/literature',   description: 'The literature corpus · sign-in required' },
      { label: 'Partners',        route: '/partners',     description: 'Advisors & institutions' },
      { label: 'Get Involved',    route: '/get-involved', description: 'Volunteer · donate · join' },
    ],
  },
];

const ALL_SECONDARY: Linkish[] = MORE_GROUPS.flatMap(g => g.items);

interface NavbarProps {
  /** Pixels to push the fixed header down (e.g. for the status banner). */
  topOffset?: number;
}

const MOBILE_NAV_ID = 'site-mobile-nav';
const MORE_MENU_ID = 'site-more-menu';

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
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  // Mirrors of the More menu state that event handlers read synchronously: a
  // mouse's pointerenter and the click that follows it can arrive before
  // React re-renders, so a handler must not trust its closure's `moreOpen`.
  // `moreByHover` is true while it is open only because a mouse hovers it.
  const moreOpenRef = useRef(false);
  const moreByHover = useRef(false);
  const setMore = (next: boolean, byHover = false) => {
    moreOpenRef.current = next;
    moreByHover.current = next && byHover;
    setMoreOpen(next);
  };
  const accountTriggerRef = useRef<HTMLButtonElement>(null);

  const atlasGenus = (() => {
    if (!(location.pathname === '/atlas' || location.pathname.startsWith('/atlas/'))) return null;
    const values = (new URLSearchParams(location.search).get('genera') ?? '')
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);
    return values.length === 1 ? values[0] : null;
  })();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A press anywhere outside an open menu closes it. `pointerdown` covers
  // mouse, pen and touch alike (a tap elsewhere on a tablet closes it too).
  useEffect(() => {
    if (!moreOpen && !accountOpen) return;
    const onPointerDown = (e: Event) => {
      const target = e.target as Node;
      if (moreOpen && moreWrapRef.current && !moreWrapRef.current.contains(target)) setMore(false);
      if (accountOpen && accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [moreOpen, accountOpen]);

  // Escape closes whichever menu is open and hands focus back to the control
  // that opened it, so a keyboard user is never left on a vanished element.
  // The phone drawer is a disclosure panel inside the header, not a modal
  // dialog: the page behind it stays in the tab order, so no focus trap.
  useEffect(() => {
    if (!open && !moreOpen && !accountOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (open) { setOpen(false); toggleRef.current?.focus(); }
      if (moreOpen) { setMore(false); moreRef.current?.focus(); }
      if (accountOpen) { setAccountOpen(false); accountTriggerRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, moreOpen, accountOpen]);

  // Following a link (or the browser's back button) closes the menus.
  useEffect(() => {
    setOpen(false);
    setMore(false);
    setAccountOpen(false);
  }, [location.pathname]);

  // More is a disclosure: a click, tap or Enter/Space toggles it. A mouse
  // hovering it also opens it, and the click that follows a hover-open keeps
  // it open (pinning it) rather than shutting it in the same gesture. Only a
  // real mouse hovers: touch and pen taps ignore enter/leave, so a second tap
  // on a tablet closes it again.
  const onMorePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && !moreOpenRef.current) setMore(true, true);
  };
  const onMorePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && moreByHover.current) setMore(false);
  };
  const onMoreClick = () => setMore(moreByHover.current ? true : !moreOpenRef.current);

  // Tabbing (or otherwise moving focus) out of a menu closes it. A blur with
  // no new focus target (a press on the menu's own padding, or the window
  // losing focus) is left to the outside-press handler.
  const focusLeft = (e: React.FocusEvent<HTMLElement>) => {
    const next = e.relatedTarget as Node | null;
    return next !== null && !e.currentTarget.contains(next);
  };
  const onMoreBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (focusLeft(e)) setMore(false);
  };
  const onAccountBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (focusLeft(e)) setAccountOpen(false);
  };

  /** Where a navigation item points. Atlas hands its single genus on. */
  const hrefFor = (l: Linkish): string => {
    if (l.route === '/species' && atlasGenus) return atlasWorkspaceSpeciesHref(atlasGenus);
    if (l.route === '/calyx' && atlasGenus) return atlasWorkspaceCalyxHref(atlasGenus);
    if (l.route === '/research' && atlasGenus) return atlasWorkspaceResearchHref(atlasGenus);
    return l.route ?? '/';
  };

  const closeMenus = () => {
    setOpen(false);
    setMore(false);
    setAccountOpen(false);
  };

  const isActive = (l: Linkish) => {
    if (l.external || !l.route) return false;
    if (l.route === '/') return location.pathname === '/';
    return location.pathname.startsWith(l.route);
  };

  /** A navigation item as a real link: middle-clickable, announced as a link. */
  const navLink = (l: Linkish, className: string, children: React.ReactNode = l.label) => {
    if (l.external && l.href) {
      return <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={className}>{children}<ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" /></a>;
    }
    return <Link key={l.route} to={hrefFor(l)} aria-current={isActive(l) ? 'page' : undefined} onClick={closeMenus} className={className}>{children}</Link>;
  };

  const anySecondaryActive = ALL_SECONDARY.some(s => isActive(s));
  const displayName = (user?.user_metadata && (user.user_metadata as Record<string, unknown>).display_name as string | undefined) || user?.email?.split('@')[0] || 'Member';

  return (
    <>
      <header style={{ top: topOffset }} className={'fixed left-0 right-0 z-50 transition-colors duration-300 ' + (scrolled ? 'bg-[#faf7f2]/95 backdrop-blur-md border-b border-quiet shadow-[0_4px_24px_-12px_rgba(28,26,23,0.12)]' : 'bg-[#faf7f2]/80 backdrop-blur-sm border-b border-transparent')}>
        <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 shrink-0 group" onClick={closeMenus}>
            <Monogram />
            <span className="font-display text-[1.15rem] tracking-wide text-ink group-hover:text-forest transition-colors">Orchid <span className="italic text-forest">Continuum</span></span>
          </Link>
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-5 xl:gap-6">
            {PRIMARY.map(l => navLink(l, 'font-mono text-[11px] tracking-[0.18em] uppercase transition-colors whitespace-nowrap inline-flex items-center gap-1 ' + (isActive(l) ? 'text-forest' : 'text-charcoal hover:text-forest')))}
            <div ref={moreWrapRef} className="relative" onPointerEnter={onMorePointerEnter} onPointerLeave={onMorePointerLeave} onBlur={onMoreBlur}>
              <button ref={moreRef} type="button" aria-expanded={moreOpen} aria-controls={MORE_MENU_ID} onClick={onMoreClick} className={'inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors ' + (anySecondaryActive ? 'text-forest' : 'text-charcoal hover:text-forest')}>More<ChevronDown aria-hidden="true" className={'h-3 w-3 transition-transform ' + (moreOpen ? 'rotate-180' : '')} /></button>
              {moreOpen && <div id={MORE_MENU_ID} className="absolute top-full right-0 mt-3 w-[640px] max-w-[calc(100vw-3rem)] rounded-sm border border-quiet bg-warm-white shadow-[0_24px_60px_-24px_rgba(28,26,23,0.25)] p-6"><div className="grid grid-cols-3 gap-6">{MORE_GROUPS.map(g => <div key={g.title}><div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#806c39] mb-3">{g.title}</div><ul className="space-y-1">{g.items.map(it => <li key={it.route}>{navLink(it, 'block w-full text-left rounded-sm px-3 py-2 transition-colors ' + (isActive(it) ? 'bg-[#f5f0e8] text-forest' : 'text-ink hover:bg-[#f5f0e8] hover:text-forest'), <><div className="font-display text-[15px]">{it.label}</div>{it.description && <div className="font-body text-[12px] text-[#5c574f] mt-0.5 leading-snug">{it.description}</div>}</>)}</li>)}</ul></div>)}</div></div>}
            </div>
            <FavoritesMenu />
            {user ? <div className="relative" ref={accountRef} onBlur={onAccountBlur}><button ref={accountTriggerRef} type="button" aria-label="Account menu" aria-expanded={accountOpen} data-testid="account-menu" onClick={() => setAccountOpen(o => !o)} className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.18em] uppercase text-charcoal hover:text-forest transition-colors"><span className="h-7 w-7 rounded-full bg-[#1f3d2b] text-[#faf7f2] inline-flex items-center justify-center font-display text-[13px]">{displayName.charAt(0).toUpperCase()}</span><span className="hidden xl:inline max-w-[120px] truncate">{displayName}</span><ChevronDown aria-hidden="true" className={'h-3 w-3 transition-transform ' + (accountOpen ? 'rotate-180' : '')} /></button>{accountOpen && <div className="absolute top-full right-0 mt-3 w-56 rounded-sm border border-quiet bg-warm-white shadow-[0_24px_60px_-24px_rgba(28,26,23,0.25)] py-2"><div className="px-4 py-2 border-b border-quiet"><div className="font-display text-[14px] text-ink truncate">{displayName}</div><div className="font-mono text-[10px] tracking-[0.12em] text-[#5c574f] truncate">{user.email}</div></div><Link to="/account" onClick={closeMenus} className="w-full text-left px-4 py-2 font-body text-[14px] text-ink hover:bg-[#f5f0e8] hover:text-forest inline-flex items-center gap-2"><UserIcon className="h-3.5 w-3.5" aria-hidden="true" /> My account</Link><Link to="/conservatory" onClick={closeMenus} className="block w-full text-left px-4 py-2 font-body text-[14px] text-ink hover:bg-[#f5f0e8] hover:text-forest">My conservatory</Link><div className="mt-1 border-t border-quiet pt-1"><Link to="/mission-control" onClick={closeMenus} className="w-full text-left px-4 py-2 font-body text-[14px] text-ink hover:bg-[#f5f0e8] hover:text-forest inline-flex items-center gap-2" data-testid="account-mission-control"><Gauge className="h-3.5 w-3.5" aria-hidden="true" /> Mission Control</Link><div className="px-4 pb-1 font-mono text-[9px] tracking-[0.14em] uppercase text-[#5c574f]">Owner access required</div></div><button type="button" data-testid="account-sign-out" onClick={async () => { setAccountOpen(false); await signOut(); navigate('/'); }} className="w-full text-left px-4 py-2 font-body text-[14px] text-[#7a2a28] hover:bg-[#fdf3f2] inline-flex items-center gap-2"><LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out</button></div>}</div> : <button type="button" onClick={() => setAuthOpen(true)} className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-charcoal hover:text-forest transition-colors"><LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Sign in</button>}
            <Link to="/get-involved" onClick={closeMenus} className="font-mono text-[11px] tracking-[0.18em] uppercase px-4 py-2 rounded-full bg-[#1f3d2b] text-[#faf7f2] hover:bg-[#14281c] transition-colors whitespace-nowrap">Join</Link>
          </nav>
          <div className="flex items-center gap-4 lg:hidden"><FavoritesMenu /><button ref={toggleRef} type="button" onClick={() => setOpen(!open)} className="text-ink" aria-label="Toggle navigation" aria-expanded={open} aria-controls={MOBILE_NAV_ID}>{open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button></div>
        </div>
        {open && <nav id={MOBILE_NAV_ID} aria-label="Primary (menu)" className="lg:hidden bg-cream border-t border-quiet max-h-[calc(100vh-4rem)] overflow-y-auto"><div className="px-6 py-5 flex flex-col gap-1">{user ? <div className="mb-3 pb-3 border-b border-quiet flex items-center gap-3"><span className="h-9 w-9 rounded-full bg-[#1f3d2b] text-[#faf7f2] inline-flex items-center justify-center font-display text-[15px]" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span><div className="flex-1 min-w-0"><div className="font-display text-[15px] text-ink truncate">{displayName}</div><div className="font-mono text-[10px] tracking-[0.12em] text-[#5c574f] truncate">{user.email}</div></div><Link to="/account" onClick={closeMenus} className="font-mono text-[10px] tracking-[0.2em] uppercase text-forest">Account</Link><Link to="/mission-control" onClick={closeMenus} className="ml-3 font-mono text-[10px] tracking-[0.2em] uppercase text-forest" data-testid="account-mission-control-mobile">Mission</Link></div> : <button type="button" onClick={() => { setOpen(false); setAuthOpen(true); }} className="mb-2 inline-flex items-center justify-center gap-2 py-2.5 rounded-sm border border-forest/30 bg-warm-white text-forest font-mono text-[11px] tracking-[0.2em] uppercase"><LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Sign in</button>}{PRIMARY.map(l => navLink(l, 'text-left py-2.5 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors ' + (isActive(l) ? 'text-forest' : 'text-charcoal hover:text-forest')))}{MORE_GROUPS.map(g => <div key={g.title} className="mt-4"><div className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#806c39] mb-2">{g.title}</div>{g.items.map(it => navLink(it, 'block w-full text-left py-2 font-display text-[15px] transition-colors ' + (isActive(it) ? 'text-forest' : 'text-ink hover:text-forest')))}</div>)}{user && <button type="button" data-testid="account-sign-out-mobile" onClick={async () => { setOpen(false); await signOut(); navigate('/'); }} className="mt-4 inline-flex items-center justify-center gap-2 py-2.5 rounded-sm border border-quiet text-[#7a2a28] font-mono text-[11px] tracking-[0.2em] uppercase"><LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out</button>}<Link to="/get-involved" onClick={closeMenus} className="mt-5 text-center font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-2.5 rounded-full bg-[#1f3d2b] text-[#faf7f2]">Join the Continuum</Link></div></nav>}
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
