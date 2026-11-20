import React, { useEffect, useRef, useState } from 'react';
import AccountMenu from '../components/AccountMenu';
import AppearanceMenu from '../components/common/AppearanceMenu';
import NewLedgerModal from '../components/NewLedgerModal';
import useHashRoute from '../hooks/useHashRoute';
import { useAuth } from '../auth/AuthContext';
import { api } from '../services/dataAPI';
import { readLocal, writeLocal } from '../components/common/format';
import { setTheme } from '../theme';
import { hasResource, routeResource } from '../auth/resources.mjs';
import CurrencyLabel from '../components/common/CurrencyLabel';
import useLoanRegisters from '../components/loans/useLoanRegisters';

// a sidebar with grouped navigation and icons, a collapse
// button on desktop, and a sheet on phones and tablets. Routes are the hash paths App.js uses.
// Dashboard is one top-level item above the groups. Loans sits in Money (it is money you lent) and, like Projects, opens
// a list of its own entries; unlike Ledger and Projects it does not depend on the selected ledger.
const DASHBOARD_ITEM = { path: '/', label: 'Dashboard', icon: 'dashboard' };
const NAV_GROUPS = [
  { label: 'Money', items: [
    { path: '/ledger', label: 'Ledger', icon: 'ledger' },
    { path: '/projects', label: 'Projects', icon: 'projects' },
    { path: '/loans', label: 'Loans', icon: 'loans' },
    { path: '/reports', label: 'Reports', icon: 'reports' },
  ] },
  { label: 'Files', items: [
    { path: '/documents', label: 'Documents', icon: 'documents' },
    { path: '/items', label: 'Item tracker', icon: 'items' },
  ] },
  { label: 'Admin Setup', items: [{ path: '/settings', label: 'Settings', icon: 'settings' }] },
];

// Shown only to super administrators (the admin page checks again). It joins the Admin Setup group.
const SETUP_LABEL = 'Admin Setup';
const ADMIN_ITEM = { path: '/admin', label: 'Users & ledgers', icon: 'users' };
const withAdminItem = groups => (groups.some(g => g.label === SETUP_LABEL)
  ? groups.map(g => (g.label === SETUP_LABEL ? { ...g, items: [...g.items, ADMIN_ITEM] } : g))
  : [...groups, { label: SETUP_LABEL, items: [ADMIN_ITEM] }]);

const ALL_ITEMS = [DASHBOARD_ITEM, ...NAV_GROUPS.flatMap(group => group.items), ADMIN_ITEM];

const ICON_PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  ledger: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </>
  ),
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  reports: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
  documents: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
      <path d="M8 13h8M8 17h5" />
    </>
  ),
  items: (
    <>
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2.2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  loans: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.7c0 2.2-5 1.2-5 3.6 0 1.1 1.1 1.7 2.5 1.7s2.5-.6 2.5-1.7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  collapse: <path d="m15 6-6 6 6 6" />,
  expand: <path d="m9 6 6 6-6 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
};

function Icon({ name, className = '' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const isActive = (route, path) => route === path || (path !== '/' && route.startsWith(path + '/'));

const itemClass = (active, collapsed) => [
  'flex w-full items-center gap-3 rounded-lg text-sm font-medium no-underline transition-colors motion-reduce:transition-none',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2',
  active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
].join(' ');

// The list inside a group: a tree under the group label, or plain stacked icons in the icon-only sidebar.
const groupListProps = collapsed => (collapsed
  ? { className: 'flex flex-col gap-1', style: { listStyle: 'none', margin: 0, padding: 0 } }
  : { className: 'nav-tree nav-tree-group' });

// Which sidebar groups the person has folded, remembered in this browser. Missing or broken storage means all open.
const CLOSED_KEY = 'ledger.sidebar.groupsClosed';
const readClosed = () => { try { const v = JSON.parse(readLocal(CLOSED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

// One sidebar group: a label button with a chevron that folds the group's items. In the icon-only rail (collapsed)
// groups cannot be folded, so the label becomes a divider and the items always show. `dot` marks a folded group that
// holds the page you are on.
function GroupShell({ label, collapsed, dot = false, children }) {
  const [open, setOpen] = useState(() => !readClosed().includes(label));
  const toggle = () => setOpen(o => {
    const closed = readClosed().filter(k => k !== label);
    if (o) closed.push(label);
    writeLocal(CLOSED_KEY, JSON.stringify(closed));
    return !o;
  });
  const id = `nav-group-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1">
      {collapsed
        ? <div className="mx-3 my-1 border-t border-border" aria-hidden="true" />
        : (
          <button type="button" onClick={toggle} aria-expanded={open} aria-controls={id}
            className="flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Icon name="chevron" className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? '' : '-rotate-90'}`} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {!open && dot && <span aria-label="Contains the current page" className="size-1.5 shrink-0 rounded-full bg-accent" />}
          </button>
        )}
      {(collapsed || open) && <div id={id}>{children}</div>}
    </div>
  );
}

// The ledger switcher: the ledgers the account can use, one row each, in a small box at the top of the sidebar (no group
// label, since the Dashboard and the pages below show the selected ledger). The active one is highlighted; clicking switches to it.
function LedgerList({ books, book, onSelectBook, collapsed, onAfterSelect, canCreate, onCreate }) {
  return (
    <div role="group" aria-label="Ledgers" className={collapsed ? '' : 'rounded-xl border border-border bg-card p-1'}>
      <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {books.map(b => {
          const active = book?.id === b.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                title={collapsed ? b.name : undefined}
                aria-label={collapsed ? b.name : undefined}
                onClick={() => { onSelectBook(b.id); onAfterSelect && onAfterSelect(); }}
                className={itemClass(active, collapsed)}
              >
                <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold ${active ? 'bg-accent text-accent-foreground' : 'bg-muted text-foreground'}`}>
                  {b.name.slice(0, 1).toUpperCase()}
                </span>
                <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate text-left'}>{b.name}</span>
                {!collapsed && b.active === false && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Inactive</span>}
                {!collapsed && b.baseCurrency && <span className="shrink-0 text-xs text-muted-foreground"><CurrencyLabel code={b.baseCurrency} /></span>}
              </button>
            </li>
          );
        })}
        {canCreate && (
          <li>
            <button type="button" onClick={onCreate} title={collapsed ? 'New ledger' : undefined} aria-label={collapsed ? 'New ledger' : undefined}
              className={`${itemClass(false, collapsed)} border border-dashed border-border`}>
              <Icon name="plus" />
              <span className={collapsed ? 'sr-only' : 'truncate'}>New ledger</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

// Open projects as a child list under the Projects item, so one click jumps to a project. Loaded when first opened and
// again whenever the route changes while it is open (a new, closed or renamed project shows up).
function ProjectChildren({ bookId, route, onNavigate }) {
  const [projects, setProjects] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get(`/books/${bookId}/projects`)
      .then(r => { if (!cancelled) setProjects(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [bookId, route]);
  if (projects === null) return <p className="py-1 pl-10 text-xs text-muted-foreground">Loading...</p>;
  if (!projects.length) return <p className="py-1 pl-10 text-xs text-muted-foreground">No open projects</p>;
  // A plain tree: a thin guide line with a short branch to each project, text only (no backgrounds or boxes).
  return (
    <ul className="nav-tree max-h-[60vh] overflow-y-auto">
      {projects.map(p => {
        const active = route === `/projects/${p.id}`;
        return (
          <li key={p.id}>
            <a href={`#/projects/${p.id}`} aria-current={active ? 'page' : undefined} title={p.name} onClick={() => onNavigate && onNavigate()}
              className={`block truncate py-1 text-sm no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {p.name}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// The loans under the Loans item, as the same plain tree the projects use. New loans are made on the Loans page,
// the same way new projects are made on the Projects page.
function LoanChildren({ route, onNavigate }) {
  const { registers } = useLoanRegisters();
  if (!registers) return <p className="py-1 pl-10 text-xs text-muted-foreground">Loading...</p>;
  const shown = registers.filter(r => !r.settled || route === `/loans/${r.id}`);
  return (
    <ul className="nav-tree max-h-[60vh] overflow-y-auto">
      {shown.map(r => {
        const active = route === `/loans/${r.id}`;
        return (
          <li key={r.id}>
            <a href={`#/loans/${r.id}`} aria-current={active ? 'page' : undefined} title={r.name} onClick={() => onNavigate && onNavigate()}
              className={`block truncate py-1 text-sm no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {r.name}
            </a>
          </li>
        );
      })}
      {!shown.length && <li className="py-1 text-xs text-muted-foreground">No open loans</li>}
    </ul>
  );
}

// Items that open a child list under them (Projects, Loans). One row: the page link and, inside the same highlighted
// row, a small arrow that opens or closes the list. The open state is kept in this browser.
const EXPANDABLE = { '/projects': 'ledger.sidebar.projectsOpen', '/loans': 'ledger.sidebar.loansOpen' };
const rowLinkClass = active => [
  'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium no-underline',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
].join(' ');

function NavItem({ item, active, collapsed, onNavigate, renderChildren }) {
  const storeKey = EXPANDABLE[item.path];
  const expandable = Boolean(storeKey && renderChildren) && !collapsed;
  const [open, setOpen] = useState(() => (storeKey ? readLocal(storeKey) === '1' : false));
  const toggle = () => setOpen(o => { writeLocal(storeKey, o ? '0' : '1'); return !o; });
  const listId = `nav-${item.path.slice(1)}-list`;
  const link = (
    <a href={`#${item.path}`} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined} onClick={() => onNavigate && onNavigate()}
      className={expandable ? rowLinkClass(active) : itemClass(active, collapsed)}>
      <Icon name={item.icon} className={active ? 'text-accent' : ''} />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
    </a>
  );
  if (!expandable) return link;
  return (
    <>
      <div className={`flex items-center rounded-lg transition-colors motion-reduce:transition-none ${active ? 'bg-muted' : 'hover:bg-muted'}`}>
        {link}
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={listId}
          aria-label={`${open ? 'Hide' : 'Show'} ${item.label.toLowerCase()}`} title={`${open ? 'Hide' : 'Show'} ${item.label.toLowerCase()}`}
          className="mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <Icon name="chevron" className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? '' : '-rotate-90'}`} />
        </button>
      </div>
      {open && <div id={listId}>{renderChildren()}</div>}
    </>
  );
}

function NavLinks({ route, groups, collapsed, label, onNavigate, bookId }) {
  const childrenFor = item => {
    if (item.path === '/projects' && bookId) return () => <ProjectChildren bookId={bookId} route={route} onNavigate={onNavigate} />;
    if (item.path === '/loans') return () => <LoanChildren route={route} onNavigate={onNavigate} />;
    return null;
  };
  return (
    <nav aria-label={label} className="flex flex-col gap-4">
      {groups.map(group => (
        <GroupShell key={group.label} label={group.label} collapsed={collapsed} dot={group.items.some(i => isActive(route, i.path))}>
          <ul {...groupListProps(collapsed)}>
            {group.items.map(item => (
              <li key={item.path}>
                <NavItem item={item} active={isActive(route, item.path)} collapsed={collapsed} onNavigate={onNavigate} renderChildren={childrenFor(item)} />
              </li>
            ))}
          </ul>
        </GroupShell>
      ))}
    </nav>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    setTheme(next);
    setDark(next === 'dark');
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={dark}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

// Sidebar, phone sheet, top bar and page content. The ledger list lives in the sidebar, so every book is visible.
function AppShell({ books, book, onSelectBook, children }) {
  const route = useHashRoute();
  const { account } = useAuth();
  const isSuper = Boolean(account?.isSuperAdmin);
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const menuButtonRef = useRef(null);
  const sheetRef = useRef(null);

  const allowedGroups = NAV_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => hasResource(account, routeResource(item.path))) }))
    .filter(group => group.items.length > 0);
  const groups = isSuper ? withAdminItem(allowedGroups) : allowedGroups;
  const topItems = [DASHBOARD_ITEM].filter(item => hasResource(account, routeResource(item.path)));
  const activeItem = ALL_ITEMS.find(item => isActive(route, item.path));
  const pageTitle = activeItem ? activeItem.label : 'Ledger';

  const closeSheet = () => {
    setSheetOpen(false);
    menuButtonRef.current?.focus();
  };

  // While the sheet is open: Escape closes it, focus moves into it, and page scrolling stops.
  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSheetOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetRef.current?.querySelector('a, button')?.focus();

    // The sheet is hidden at 768px and wider, so an open sheet closes when the layout widens.
    const wideQuery = window.matchMedia('(min-width: 768px)');
    const onWide = () => { if (wideQuery.matches) setSheetOpen(false); };
    wideQuery.addEventListener('change', onWide);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      wideQuery.removeEventListener('change', onWide);
    };
  }, [sheetOpen]);

  const sidebarBody = collapsed => (
    <>
      <LedgerList
        books={books}
        book={book}
        onSelectBook={onSelectBook}
        collapsed={collapsed}
        onAfterSelect={() => setSheetOpen(false)}
        canCreate={isSuper}
        onCreate={() => { setCreating(true); setSheetOpen(false); }}
      />
      {topItems.length > 0 && (
        <nav aria-label="Dashboard">
          <ul className="flex flex-col gap-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {topItems.map(item => (
              <li key={item.path}><NavItem item={item} active={isActive(route, item.path)} collapsed={collapsed} onNavigate={() => setSheetOpen(false)} renderChildren={null} /></li>
            ))}
          </ul>
        </nav>
      )}
      <NavLinks label={collapsed ? 'Main navigation' : 'Sheet navigation'} route={route} groups={groups} collapsed={collapsed} onNavigate={() => setSheetOpen(false)} bookId={book?.id} />
    </>
  );

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={[
          'sticky top-0 hidden h-dvh shrink-0 flex-col self-start border-r border-border bg-card md:flex',
          'motion-safe:transition-[width] motion-safe:duration-200 motion-reduce:transition-none',
          collapsed ? 'w-16' : 'w-60',
        ].join(' ')}
        aria-label="Sidebar"
      >
        <div className={`flex items-center gap-2 py-4 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-base text-accent-foreground">📒</span>
              <span className="truncate text-sm font-semibold tracking-tight">Ledger</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} />
          </button>
        </div>
        <div className={`flex flex-1 flex-col gap-4 overflow-y-auto py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
          {sidebarBody(collapsed)}
        </div>
      </aside>

      {/* Phone and tablet sheet: opens from the menu button, closes on Escape or selection */}
      <div className="md:hidden">
        <div
          aria-hidden="true"
          onClick={closeSheet}
          className={[
            'fixed inset-0 z-40 bg-foreground/40',
            'motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none',
            sheetOpen ? 'visible opacity-100' : 'invisible opacity-0',
          ].join(' ')}
        />
        <div
          id="shell-sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal={sheetOpen ? 'true' : undefined}
          aria-label="Navigation"
          className={[
            'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card',
            'motion-safe:transition-[transform,visibility] motion-safe:duration-200 motion-reduce:transition-none',
            sheetOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
          ].join(' ')}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-4">
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-base text-accent-foreground">📒</span>
              <span className="truncate text-sm font-semibold tracking-tight">Ledger</span>
            </div>
            <button
              type="button"
              onClick={closeSheet}
              aria-label="Close navigation"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-2">
            {sidebarBody(false)}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              ref={menuButtonRef}
              onClick={() => setSheetOpen(true)}
              aria-label="Open navigation"
              aria-expanded={sheetOpen}
              aria-controls="shell-sheet"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground md:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="menu" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">{pageTitle}</h1>
              <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{book ? book.name : ''}</span>
                {book?.baseCurrency && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tracking-wide text-foreground"
                    title={`Base currency: ${book.baseCurrency}`} aria-label={`Base currency ${book.baseCurrency}`}><CurrencyLabel code={book.baseCurrency} /></span>
                )}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AppearanceMenu />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>

        <main
          id="shell-main"
          className="min-w-0 w-full flex-1 px-4 py-4 md:px-6 md:py-6"
        >
          {children}
        </main>
      </div>
      {creating && <NewLedgerModal onClose={() => setCreating(false)} />}
    </div>
  );
}

export default AppShell;
