import React from 'react';
import { RESOURCES, CODE_RESOURCES, RESOURCE_LABELS } from '../../auth/resources.mjs';
import { Toggle, ToggleGrid } from '../settings/ui';

// Pages (resources) an account or access code may use, as switches. value is an array of keys.
// Switching all off is allowed: the account then sees a "no pages" screen.
export default function ResourcePicker({ value, onChange, disabled, legend = 'Pages', forCode = false, notebookLedgers = null, allowed = null }) {
  const keys = (forCode ? CODE_RESOURCES : RESOURCES).filter(k => !allowed || allowed.includes(k)); // access codes are view-only: no Settings page; allowed limits it to the owner's pages
  return (
    <div className="space-y-1">
      <ToggleGrid legend={legend} options={keys.map(key => ({ value: key, label: RESOURCE_LABELS[key] }))}
        value={value} onChange={onChange} disabled={disabled} minWidth={9} small />
      {forCode && value.includes('diary') && (
        <p className="text-xs text-muted-foreground">Notebook: view only, and only the notebooks linked to the ledgers this code is attached to. Private notebooks stay hidden.</p>
      )}
      {notebookLedgers && value.includes('diary') && (
        <p className="text-xs text-muted-foreground">
          Notebook: this admin can open the notebooks linked to ledgers they have a role in. A Viewer reads, an Editor or Admin changes. A notebook that is not linked to a ledger stays private to its owner.
          {notebookLedgers.length === 0 && ' Give them a role in a ledger first.'}
        </p>
      )}
      {value.length === 0 && <p className="text-xs text-muted-foreground">No pages: signing in will show an empty screen.</p>}
    </div>
  );
}

export const pagesText = resources => (resources.length ? resources.map(k => RESOURCE_LABELS[k] || k).join(', ') : 'No pages');

// One ledger's pages: the same switches as everywhere, preselected with the usual pages, so a ledger only needs the
// ones to switch off. titled adds a boxed card with the ledger's name (where the ledger is not shown already).
export function BookPages({ bookName, value, onChange, forCode = false, disabled, titled = false, allowed = null }) {
  const picker = <ResourcePicker forCode={forCode} legend={titled ? bookName : 'Pages in this ledger'} value={value} onChange={onChange} disabled={disabled} allowed={allowed} />;
  return titled ? <div className="rounded-lg border border-border bg-background px-3 py-2">{picker}</div> : picker;
}

// Ledgers for an access code, one card each: the ledger's name with an Access switch and, while it is on, an "Own pages"
// switch. Off: the code inherits its owner's pages in that ledger (shown as a line). On: the code has its own list,
// limited to what the owner has. own[id] is the code's own list (undefined = inherits); inheritedOf(id) the owner's pages.
export function LedgerPages({ books, selected, onSelect, own, onOwn, inheritedOf, allowedOf, inheritLabel = 'Same as the admin', forCode = false, disabled }) {
  const flip = (id, on) => onSelect(on ? [...selected, id] : selected.filter(x => x !== id));
  return (
    <div className="grid items-start gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
      {books.map(b => {
        const on = selected.includes(b.id);
        const mine = Array.isArray(own[b.id]);
        return (
          <div key={b.id} className="space-y-3 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-base font-semibold text-foreground">{b.name}</span>
              <div className="shrink-0"><Toggle label="Access" checked={on} disabled={disabled} onChange={v => flip(b.id, v)} /></div>
            </div>
            {on && (
              <>
                <Toggle compact label="Own pages" checked={mine} disabled={disabled} onChange={v => onOwn(b.id, v ? [...inheritedOf(b.id)] : undefined)} />
                {mine
                  ? <ResourcePicker forCode={forCode} legend="Pages" value={own[b.id]} onChange={v => onOwn(b.id, v)} disabled={disabled} allowed={allowedOf ? allowedOf(b.id) : inheritedOf(b.id)} />
                  : <p className="text-xs text-muted-foreground">{inheritLabel}: {pagesText(inheritedOf(b.id))}</p>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
