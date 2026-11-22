import { useState } from 'react';
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
import CurrencyLabel from '../common/CurrencyLabel';

// Tab groups, in display order. Everything here belongs to the ledger that is open: its details and lists, who can use
// it, its data downloads and how it looks. (App-wide things, such as all ledgers, users, access codes and currencies,
// are on the Administration page for super administrators.)
const GROUPS = ['This ledger', 'Access and data', 'Display'];

// Who may edit each tab. Admins edit everything; editors edit People only; viewers see read-only tables.
const TABS = [
  { key: 'details', label: 'Details', group: 'This ledger', Component: DetailsTab, editableBy: ['admin'] },
  { key: 'funds', label: 'Funds', group: 'This ledger', Component: FundsTab, editableBy: ['admin'] },
  { key: 'accounts', label: 'Accounts', group: 'This ledger', Component: HoldersTab, editableBy: ['admin'] },
  { key: 'categories', label: 'Categories', group: 'This ledger', Component: CategoriesTab, editableBy: ['admin'] },
  { key: 'people', label: 'People', group: 'This ledger', Component: PartiesTab, editableBy: ['admin', 'editor'] },
  ...optionalTabs.map(t => ({ ...t, group: 'This ledger' })),
  { key: 'years', label: 'Years', group: 'This ledger', Component: YearsTab, editableBy: ['admin'] },
  { key: 'members', label: 'Members', group: 'Access and data', Component: MembersTab, editableBy: ['admin'], visibleTo: ['admin'] },
  { key: 'data', label: 'Data', group: 'Access and data', Component: DataTab, editableBy: ['admin', 'editor', 'viewer'], hideReadOnly: true },
  { key: 'pagenames', label: 'Page names', group: 'Display', Component: PageNamesTab, editableBy: ['admin'], hideReadOnly: true, visibleTo: ['admin'] },
  { key: 'appearance', label: 'Appearance', group: 'Display', Component: AppearanceTab, editableBy: ['admin'], hideReadOnly: true },
  { key: 'dashboard', label: 'Dashboard', group: 'Display', Component: DashboardTab, editableBy: ['admin', 'editor', 'viewer'], hideReadOnly: true },
];

export default function Settings({ book, role }) {
  const [tabKey, setTabKey] = useState(() => {
    const t = new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab');
    return TABS.some(x => x.key === t) ? t : 'details';
  });
  if (!book) return null;

  const shownTabs = TABS.filter(t => !t.visibleTo || t.visibleTo.includes(role));
  const tab = shownTabs.find(t => t.key === tabKey) || shownTabs[0];
  const canEdit = tab.editableBy.includes(role);
  const Current = tab.Component;

  return (
    <section className="w-full min-w-0 space-y-5">
      <div><p className="text-sm text-muted-foreground">Ledger: {book.name} · base currency <CurrencyLabel code={book.baseCurrency} />. The setup tabs are shared by everyone on this ledger. Appearance is personal, with a ledger default set by an administrator; the Dashboard visuals choice applies to this browser only.</p></div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {GROUPS.filter(g => shownTabs.some(t => t.group === g)).map(group => (
          <div key={group} className="flex min-w-0 flex-col gap-1 px-3 py-2 md:flex-row md:items-center md:gap-4">
            <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground md:w-32">{group}</p>
            <div role="tablist" aria-label={group} className="flex min-w-0 flex-1 flex-wrap gap-1">
              {shownTabs.filter(t => t.group === group).map(t => {
                const selected = t.key === tabKey;
                return (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTabKey(t.key)}
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
        ))}
      </div>

      {!canEdit && !tab.hideReadOnly && (
        <p className="text-sm text-muted-foreground">Read-only: your role cannot change this section.</p>
      )}

      <Current key={tab.key} bookId={book.id} canEdit={canEdit} />
    </section>
  );
}
