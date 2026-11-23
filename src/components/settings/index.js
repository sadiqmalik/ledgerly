import { useState } from 'react';
import useHashQuery from '../../hooks/useHashQuery';
import { groupSlug, resolveGroup } from '../../utils/groupSlug';
import FundsTab from './FundsTab';
import HoldersTab from './HoldersTab';
import CategoriesTab from './CategoriesTab';
import PartiesTab from './PartiesTab';
import YearsTab from './YearsTab';
import DataTab from './DataTab';
import { DetailsTab, MembersTab } from './LedgerTab';
import { settingsTabs as optionalTabs } from '../../optionalModules';
import DashboardTab from './DashboardTab';
import AppearanceTab from './AppearanceTab';
import PageNamesTab from './PageNamesTab';
import CodesTab from './CodesTab';
import { useAuth } from '../../auth/AuthContext';
import CurrencyLabel from '../common/CurrencyLabel';

// Tab groups, in display order. Everything here belongs to the ledger that is open: its details and lists, who can use
// it, its data downloads and how it looks. (App-wide things, such as all ledgers, users, access codes and currencies,
// are on the Administration page for super administrators.)
const GROUPS = ['Access', 'Ledgers', 'Settings', 'Data'];

// Who may edit each tab. Admins edit everything; editors edit People only; viewers see read-only tables.
const TABS = [
  { key: 'details', label: 'Details', group: 'Ledgers', Component: DetailsTab, editableBy: ['admin'] },
  { key: 'funds', label: 'Funds', group: 'Ledgers', Component: FundsTab, editableBy: ['admin'] },
  { key: 'accounts', label: 'Accounts', group: 'Ledgers', Component: HoldersTab, editableBy: ['admin'] },
  { key: 'categories', label: 'Categories', group: 'Ledgers', Component: CategoriesTab, editableBy: ['admin'] },
  { key: 'people', label: 'People', group: 'Ledgers', Component: PartiesTab, editableBy: ['admin', 'editor'] },
  ...optionalTabs.map(t => ({ ...t, group: 'Ledgers' })),
  { key: 'years', label: 'Years', group: 'Ledgers', Component: YearsTab, editableBy: ['admin'] },
  { key: 'members', label: 'Members', group: 'Access', Component: MembersTab, editableBy: ['admin'], visibleTo: ['admin'], hideForSuper: true }, // a super administrator sets roles on Admin > Admins
  { key: 'codes', label: 'Access codes', group: 'Access', Component: CodesTab, editableBy: ['admin'], visibleTo: ['admin'], hideReadOnly: true, hideForSuper: true }, // super administrators manage codes on the Admin page
  { key: 'data', label: 'Data', group: 'Data', Component: DataTab, editableBy: ['admin', 'editor', 'viewer'], hideReadOnly: true },
  { key: 'pagenames', label: 'Page names', group: 'Settings', Component: PageNamesTab, editableBy: ['admin'], hideReadOnly: true, visibleTo: ['admin'] },
  { key: 'appearance', label: 'Appearance', group: 'Settings', Component: AppearanceTab, editableBy: ['admin'], hideReadOnly: true },
  { key: 'dashboard', label: 'Dashboard', group: 'Settings', Component: DashboardTab, editableBy: ['admin', 'editor', 'viewer'], hideReadOnly: true },
];

// The groups that have at least one tab this role may see, in display order (the sidebar lists these).
export const visibleGroups = (role, isSuper = false) => GROUPS.filter(g => TABS.some(t => t.group === g && (!t.visibleTo || t.visibleTo.includes(role)) && !(isSuper && t.hideForSuper)));

export default function Settings({ book, role }) {
  const { account } = useAuth();
  const isSuper = Boolean(account?.isSuperAdmin);
  const [query, setQuery] = useHashQuery();
  const params = new URLSearchParams(query);
  const [tabKey, setTabKey] = useState(() => {
    const t = params.get('tab');
    return TABS.some(x => x.key === t) ? t : 'details';
  });
  if (!book) return null;

  const shownTabs = TABS.filter(t => (!t.visibleTo || t.visibleTo.includes(role)) && !(isSuper && t.hideForSuper));
  const currentTab = shownTabs.find(t => t.key === tabKey) || shownTabs[0];
  // The group comes from ?group=; without it, the group of the current tab.
  const groupParam = resolveGroup(params.get('group'), GROUPS.filter(g => shownTabs.some(t => t.group === g)));
  const group = groupParam || currentTab.group;
  // A super admin's section can continue on the Admin page: a leading link pill to the other page's tab.
  const other = !isSuper ? null : group === 'Ledgers' ? { href: '#/admin?group=ledgers&tab=ledgers', label: 'All ledgers' } : group === 'Settings' ? { href: '#/admin?group=settings&tab=currencies', label: 'Currencies' } : null;
  const groupTabs = shownTabs.filter(t => t.group === group);
  // A tab from another group is replaced by the first tab of the chosen group.
  const tab = groupTabs.find(t => t.key === currentTab.key) || groupTabs[0];
  const canEdit = tab.editableBy.includes(role);
  const Current = tab.Component;
  const pick = key => { setTabKey(key); setQuery(`group=${groupSlug(group)}&tab=${key}`, { replace: true }); };

  return (
    <section className="w-full min-w-0 space-y-5">
      <div><p className="text-sm text-muted-foreground">Ledger: {book.name} · base currency <CurrencyLabel code={book.baseCurrency} />. The setup tabs are shared by everyone on this ledger. Appearance is personal, with a ledger default set by an administrator; the Dashboard visuals choice applies to this browser only.</p></div>

      <div className="rounded-xl border border-border bg-card p-2">
        <div role="tablist" aria-label={group} className="flex min-w-0 flex-wrap gap-1">
          {other && <a href={other.href} className="ml-1 whitespace-nowrap rounded-lg border border-accent/50 px-3 py-1.5 text-sm font-medium text-accent no-underline transition-colors hover:bg-accent/10" title="Opens another page">{other.label} &rarr;</a>}
          {groupTabs.map(t => {
            const selected = t.key === tab.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => pick(t.key)}
                className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  selected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {!canEdit && !tab.hideReadOnly && (
        <p className="text-sm text-muted-foreground">Read-only: your role cannot change this section.</p>
      )}

      <Current key={tab.key} bookId={book.id} canEdit={canEdit} />
    </section>
  );
}
