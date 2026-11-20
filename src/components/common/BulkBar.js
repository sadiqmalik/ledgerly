import React, { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import PartyInput from './PartyInput';
import { errorMessage, findParty } from './format';
import { useLedger } from '../../hooks/LedgerContext';
import useProjectNames from '../../hooks/useProjectNames';
import dataAPI from '../../services/dataAPI';
import { inputCls } from '../settings/ui';

// Action bar for a multi-selection (see hooks/useSelection.js). Hidden when nothing is selected.
// Each picker opens the shared Modal; server errors show inside that modal. On success the selection is cleared
// and onDone(result) is called so the caller can reload (usually notifyChanged or the page's refresh).
export default function BulkBar({ rows, selection, onDone, showProject = false, showStatus = false }) {
  const { book, funds, categories, parties, canEdit } = useLedger();
  const projectNames = useProjectNames();
  const [action, setAction] = useState(null); // null | 'fund' | 'category' | 'party' | 'project' | 'status' | 'delete'
  const [value, setValue] = useState('');     // select value: '' = not chosen yet, 'none' = clear, otherwise an id
  const [partyText, setPartyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selection.someSelected;
  }, [selection.someSelected]);

  const selectedRows = useMemo(
    () => rows.filter(r => selection.isSelected(r.id)),
    // selection.selected changes identity on every toggle, so it drives the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selection.selected]
  );
  const activeFunds = useMemo(() => funds.filter(f => !f.archived), [funds]);
  const projectOptions = useMemo(
    () => Object.entries(projectNames)
      .filter(([, p]) => p.status !== 'closed')
      .sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [projectNames]
  );

  if (!canEdit || selection.count === 0) return null;

  const n = selection.count;
  const noun = n === 1 ? 'entry' : 'entries';
  const allExcluded = selectedRows.length > 0 && selectedRows.every(r => r.exclude);

  const openPicker = kind => {
    setError('');
    setValue('');
    setPartyText('');
    setAction(kind);
  };
  const close = () => { if (!busy) setAction(null); };

  // Sends one bulk request. `body` is { changes } or { delete: true }; ids come from the selection.
  const apply = async body => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await dataAPI.bulkEntries(book.id, { ids: selection.ids, ...body });
      setAction(null);
      selection.clear();
      if (onDone) onDone(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const applyParty = () => {
    const name = partyText.trim();
    if (!name) return;
    const match = findParty(parties, name);
    apply({ changes: match ? { partyId: match.id } : { partyName: name } });
  };

  const applyPicker = () => {
    if (action === 'fund') return apply({ changes: { fundId: value } });
    if (action === 'category') return apply({ changes: { categoryId: value === 'none' ? null : value } });
    if (action === 'project') return apply({ changes: { projectId: value === 'none' ? null : value } });
    if (action === 'party') return applyParty();
    if (action === 'delete') return apply({ delete: true });
    return undefined;
  };

  // Apply is only enabled once a real choice is made.
  const applyDisabled = busy || (
    action === 'fund' || action === 'category' || action === 'project' ? value === ''
      : action === 'party' ? !partyText.trim()
        : false
  );

  const modalError = error && action ? <p role="alert" className="text-sm text-negative">{error}</p> : null;
  const countLine = <p className="text-sm text-muted-foreground">Apply to {n} {noun}.</p>;

  const pickerBody = (() => {
    if (action === 'fund') {
      return (
        <div className="form-group"><label htmlFor="bulk-fund">Move to fund</label>
          <select id="bulk-fund" className={inputCls} value={value} onChange={e => setValue(e.target.value)} disabled={busy}>
            <option value="">Choose a fund</option>
            {activeFunds.map(f => <option key={f.id} value={f.id}>{f.name} ({f.currency})</option>)}
          </select></div>
      );
    }
    if (action === 'category') {
      return (
        <div className="form-group"><label htmlFor="bulk-category">Category</label>
          <select id="bulk-category" className={inputCls} value={value} onChange={e => setValue(e.target.value)} disabled={busy}>
            <option value="">Choose a category</option>
            <option value="none">(none)</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
      );
    }
    if (action === 'project') {
      return (
        <div className="form-group"><label htmlFor="bulk-project">Move to project</label>
          <select id="bulk-project" className={inputCls} value={value} onChange={e => setValue(e.target.value)} disabled={busy}>
            <option value="">Choose a project</option>
            <option value="none">(none: remove from its project)</option>
            {projectOptions.map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
          </select></div>
      );
    }
    if (action === 'party') {
      return (
        <div className="form-group"><label htmlFor="bulk-party">Party</label>
          <PartyInput id="bulk-party" value={partyText} onChange={setPartyText} parties={parties} disabled={busy} />
          <p className="mt-1 text-xs text-muted-foreground">A name that is not in the list is created on save.</p>
          <button type="button" className="btn mt-2 text-sm" onClick={() => apply({ changes: { partyId: null } })} disabled={busy}>
            Clear party
          </button>
        </div>
      );
    }
    if (action === 'status') {
      return (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => apply({ changes: { status: 'paid' } })}>Mark paid</button>
          <button type="button" className="btn" disabled={busy} onClick={() => apply({ changes: { status: 'pending' } })}>Mark pending</button>
        </div>
      );
    }
    if (action === 'delete') {
      return <p className="text-sm">Delete {n} selected {noun}? They will be removed from the ledger.</p>;
    }
    return null;
  })();

  const titles = {
    fund: 'Move to fund',
    category: 'Change category',
    party: 'Change party',
    project: 'Move to project',
    status: 'Paid or pending',
    delete: 'Delete entries'
  };
  const applyLabels = { fund: 'Move', category: 'Apply', party: 'Apply', project: 'Move', delete: 'Delete' };
  const showApply = action && action !== 'status';

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-3 text-card-foreground shadow-lg md:sticky md:bottom-0 md:rounded-xl md:border">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={selectAllRef}
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            aria-label="Select all entries on this page"
            checked={selection.allSelected}
            onChange={selection.toggleAll}
          />
          <span className="mr-2 text-sm font-medium" aria-live="polite">{n} selected</span>
          <button type="button" className="btn text-sm" onClick={() => openPicker('fund')}>Move to fund</button>
          <button type="button" className="btn text-sm" onClick={() => openPicker('category')}>Change category</button>
          <button type="button" className="btn text-sm" onClick={() => openPicker('party')}>Change party</button>
          {showProject && <button type="button" className="btn text-sm" onClick={() => openPicker('project')}>Move to project</button>}
          {showStatus && <button type="button" className="btn text-sm" onClick={() => openPicker('status')}>Mark paid / pending</button>}
          <button type="button" className="btn text-sm" disabled={busy}
            onClick={() => { setError(''); apply({ changes: { exclude: !allExcluded } }); }}>
            {allExcluded ? 'Include' : 'Exclude'}
          </button>
          <button type="button" className="btn text-sm text-negative" onClick={() => openPicker('delete')}>Delete</button>
          <button type="button" className="btn text-sm ml-auto" onClick={selection.clear}>Clear</button>
        </div>
        {error && !action && <p role="alert" className="mt-2 text-sm text-negative">{error}</p>}
      </div>

      {action && (
        <Modal key={action} title={titles[action]} onClose={close}>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (!applyDisabled && showApply) applyPicker(); }}>
            {pickerBody}
            {showApply && countLine}
            {modalError}
            {showApply && (
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
                <button type="submit" className={action === 'delete' ? 'btn btn-danger' : 'btn btn-primary'} disabled={applyDisabled}>
                  {busy ? 'Working...' : `${applyLabels[action]} ${n} ${noun}`}
                </button>
              </div>
            )}
            {action === 'status' && (
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
              </div>
            )}
          </form>
        </Modal>
      )}
    </>
  );
}
