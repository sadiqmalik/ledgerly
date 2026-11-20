import { useState } from 'react';
import FundsTab from './FundsTab';
import HoldersTab from './HoldersTab';
import CategoriesTab from './CategoriesTab';
import PartiesTab from './PartiesTab';
import YearsTab from './YearsTab';
import DataTab from './DataTab';
import LedgerTab from './LedgerTab';
import { settingsTabs as optionalTabs } from '../../optionalModules';
import DashboardTab from './DashboardTab';
import AppearanceTab from './AppearanceTab';
import CurrencyLabel from '../common/CurrencyLabel';

// Tab groups, in display order.
const GROUPS = ['Ledger setup', 'Display'];

// Who may edit each tab. Admins edit everything; editors edit People only; viewers see read-only tables.
const TABS = [
  { key: 'funds', label: 'Funds', group: 'Ledger setup', Component: FundsTab, editableBy: ['admin'] },
  { key: 'accounts', label: 'Accounts', group: 'Ledger setup', Component: HoldersTab, editableBy: ['admin'] },
  { key: 'categories', label: 'Categories', group: 'Ledger setup', Component: CategoriesTab, editableBy: ['admin'] },
  { key: 'people', label: 'People', group: 'Ledger setup', Component: PartiesTab, editableBy: ['admin', 'editor'] },
  ...optionalTabs,
  { key: 'years', label: 'Years', group: 'Ledger setup', Component: YearsTab, editableBy: ['admin'] },
  { key: 'ledger', label: 'Ledger', group: 'Ledger setup', Component: LedgerTab, editableBy: ['admin'] },
  { key: 'appearance', label: 'Appearance', group: 'Display', Component: AppearanceTab, editableBy: ['admin'], hideReadOnly: true },
  { key: 'dashboard', label: 'Dashboard', group: 'Display', Component: DashboardTab, editableBy: ['admin', 'editor', 'viewer'], hideReadOnly: true },
  { key: 'data', label: 'Data', group: 'Ledger setup', Component: DataTab, editableBy: ['admin', 'editor', 'viewer'], hideReadOnly: true },
];

export default function Settings({ book, role }) {
  const [tabKey, setTabKey] = useState('funds');
  if (!book) return null;

  const tab = TABS.find(t => t.key === tabKey);
  const canEdit = tab.editableBy.includes(role);
  const Current = tab.Component;

  return (
    <section className="w-full min-w-0 space-y-5">
      <div><h2 className="text-xl font-semibold text-foreground">Settings</h2><p className="text-sm text-muted-foreground">Ledger: {book.name} · base currency <CurrencyLabel code={book.baseCurrency} />. Ledger setup is shared by everyone on this ledger. Appearance is personal, with a ledger default set by an administrator; the Dashboard visuals choice applies to this browser only.</p></div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-2 md:flex-row md:gap-0">
        {GROUPS.map((group, i) => (
          <div key={group} className={`min-w-0 flex-1 ${i > 0 ? 'md:border-l md:border-border md:pl-4' : ''}`}>
            <p className="px-3 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</p>
            <div role="tablist" aria-label={group} className="flex gap-1 overflow-x-auto p-1">
              {TABS.filter(t => t.group === group).map(t => {
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
