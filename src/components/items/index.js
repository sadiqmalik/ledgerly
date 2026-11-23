import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import itemAPI from '../../services/itemAPI';
import { useLedger } from '../../hooks/LedgerContext';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { inputCls, btnPrimary, btnSecondary, btnDanger, Field } from '../settings/ui';
import Select from '../common/Select';
import SharedBadge from '../common/SharedBadge';
import { StampFooter } from '../common/Stamp';
import MultiSelect from '../common/MultiSelect';
import { useBooks } from '../../hooks/BooksContext';
import { useAuth } from '../../auth/AuthContext';
import { canAccess } from '../../auth/roles';
import { hasResource, forBook } from '../../auth/resources.mjs';

const stamp = iso => (iso ? new Date(iso).toLocaleString() : '');

function ItemForm({ bookId, item, copyOf, locations, linkable, movable = [], onClose, onSaved }) {
  // A duplicate pre-fills every field from copyOf; Save creates a new item.
  const src = item || copyOf;
  // Location and ledgers belong to the item's main ledger; in another ledger they are shown, not edited.
  const isMain = !item || item.mainLedgerId === bookId;
  const fromOther = Boolean(copyOf && copyOf.mainLedgerId !== bookId);
  const [f, setF] = useState({
    name: src?.name || '', comment: src?.comment || '', locationId: fromOther ? '' : src?.locationId || '', owner: src?.owner || ''
  });
  const [extras, setExtras] = useState(() => (fromOther ? [] : (src?.ledgerIds || []).filter(x => x !== bookId && linkable.some(o => o.value === x))));
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (!f.name.trim()) { setError('Enter an item name.'); return; }
    const body = { name: f.name.trim(), comment: f.comment.trim() || null, locationId: f.locationId || null, owner: f.owner.trim() || null };
    if (!isMain) delete body.locationId; else body.extraLedgerIds = extras;
    if (item && isMain && moveTo) { body.moveToLedgerId = moveTo; body.locationId = null; body.extraLedgerIds = extras.filter(x => x !== moveTo); }
    setBusy(true);
    try {
      if (item) await itemAPI.updateItem(bookId, item.id, body); else await itemAPI.createItem(bookId, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  };

  return (
    <Modal title={item ? 'Edit item' : copyOf ? 'Duplicate item' : 'Add item'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <Field label="Item"><input className={inputCls} value={f.name} onChange={set('name')} required maxLength={200} /></Field>
        {isMain ? (
          <Field label="Location">
            <Select className={inputCls} value={f.locationId} onChange={set('locationId')}>
              <option value="">(none)</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.place ? ` (${l.place})` : ''}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Location">
            <p className="text-sm">{item.locationName ? `${item.locationName}${item.place ? ` \u00B7 ${item.place}` : ''}` : '(none)'}
              <span className="block text-xs text-muted-foreground">Change it in {item.sharedFrom}, the item's main ledger.</span></p>
          </Field>
        )}
        {isMain && linkable.length > 0 && (
          <Field label="Also show in ledgers">
            <MultiSelect label="Also show in ledgers" options={linkable} value={extras} onChange={setExtras} allLabel="No other ledger" />
          </Field>
        )}
        {item && isMain && movable.length > 0 && (
          <Field label="Move to ledger">
            <Select className={inputCls} value={moveTo} onChange={e => setMoveTo(e.target.value)}>
              <option value="">Keep in this ledger</option>
              {movable.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            {moveTo && <span className="mt-1 block text-xs text-muted-foreground">The location is cleared: choose one in the new ledger afterwards.</span>}
          </Field>
        )}
        <Field label="Owner">
          <input className={inputCls} value={f.owner} onChange={set('owner')} maxLength={200} placeholder="Who it belongs to" />
        </Field>
        <Field label="Comment"><textarea rows={3} className={inputCls} value={f.comment} onChange={set('comment')} maxLength={4000} /></Field>
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function LocationsModal({ bookId, locations, canEdit, onClose, onChanged }) {
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingLoc, setPendingLoc] = useState(null); // location awaiting delete confirmation, else null
  const [deleting, setDeleting] = useState(false);

  const reset =() => { setName(''); setPlace(''); setEditId(null); };
  const save = async e => {
    e.preventDefault();
    if (!name.trim()) { setError('Enter a location name.'); return; }
    const body = { name: name.trim(), place: place.trim() || null };
    setBusy(true);
    try {
      if (editId) await itemAPI.updateLocation(bookId, editId, body); else await itemAPI.createLocation(bookId, body);
      reset(); setError(''); onChanged();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };
  const remove = async l => {
    setDeleting(true);
    try { await itemAPI.deleteLocation(bookId, l.id); setError(''); onChanged(); } catch (err) { setError(errorMessage(err)); }
    setDeleting(false);
  };

  return (
    <>
    <Modal title="Locations" onClose={onClose}>
      <div className="space-y-3">
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        {!locations.length && <p className="text-sm text-muted-foreground">No locations yet.</p>}
        <ul className="space-y-1" style={{ listStyle: 'none' }}>
          {locations.map(l => (
            <li key={l.id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1 text-sm">
              <span className="min-w-0 truncate">{l.name}{l.place ? ` · ${l.place}` : ''} <span className="text-xs text-muted-foreground">({l.itemCount})</span></span>
              {canEdit && (
                <span className="flex shrink-0 gap-2">
                  <button type="button" className={`${btnSecondary} !px-2 !py-1`} onClick={() => { setEditId(l.id); setName(l.name); setPlace(l.place || ''); }}>Edit</button>
                  <button type="button" className={`${btnDanger} !px-2 !py-1`} onClick={() => setPendingLoc(l)}>Delete</button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form onSubmit={save} className="space-y-2">
            <Field label="Location name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={120} /></Field>
            <Field label="Country or place"><input className={inputCls} value={place} onChange={e => setPlace(e.target.value)} maxLength={120} /></Field>
            <div className="flex gap-2">
              <button type="submit" className={btnPrimary} disabled={busy}>{editId ? 'Update location' : 'Add location'}</button>
              {editId && <button type="button" className={btnSecondary} onClick={reset}>Cancel edit</button>}
            </div>
          </form>
        )}
      </div>
    </Modal>
    {pendingLoc && (
      <ConfirmDialog
        title="Delete location?"
        message={`Delete location "${pendingLoc.name}"?`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={async () => { await remove(pendingLoc); setPendingLoc(null); }}
        onCancel={() => setPendingLoc(null)}
      />
    )}
    </>
  );
}

export default function ItemTracker() {
  const { book, canEdit } = useLedger();
  const { books } = useBooks();
  const { account } = useAuth();
  // Ledgers an item of this one may also be shown in: Editor there and the Item Vault page there.
  const linkable = useMemo(() => books.filter(b => b.id !== book.id && canAccess(account, b.id, 'editor') && hasResource(forBook(account, b.id), 'items'))
    .map(b => ({ value: b.id, label: b.name })), [books, book.id, account]);
  // Moving an item needs the Admin role in both ledgers and the Item Vault page in the new one (a super admin: any ledger).
  const movable = useMemo(() => books.filter(b => b.id !== book.id && (account?.isSuperAdmin || (canAccess(account, book.id, 'admin') && canAccess(account, b.id, 'admin') && hasResource(forBook(account, b.id), 'items'))))
    .map(b => ({ value: b.id, label: b.name })), [books, book.id, account]);
  const [items, setItems] = useState(null);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | item
  const [showLocations, setShowLocations] = useState(false);
  const [pendingItem, setPendingItem] = useState(null); // item awaiting delete confirmation, else null
  const [deleting, setDeleting] = useState(false);
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN(x => x + 1), []);
  const bookRef = useRef(book.id);
  bookRef.current = book.id;

  // A different book starts clean: no old rows, search text or open dialogs.
  useEffect(() => {
    setItems(null); setLocations([]); setError(''); setQ(''); setEditing(null); setShowLocations(false); setPendingItem(null);
  }, [book.id]);

  useEffect(() => {
    let off = false;
    Promise.all([itemAPI.getItems(book.id), itemAPI.getLocations(book.id)])
      .then(([i, l]) => { if (!off) { setItems(i); setLocations(l); setError(''); } })
      .catch(e => { if (!off) setError(errorMessage(e)); });
    return () => { off = true; };
  }, [book.id, n]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items || [];
    return (items || []).filter(i => [i.name, i.comment, i.locationName, i.place, i.owner].some(v => (v || '').toLowerCase().includes(term)));
  }, [items, q]);

  const remove = async i => {
    const id = book.id;
    setDeleting(true);
    try { await itemAPI.deleteItem(id, i.id); if (bookRef.current === id) reload(); } catch (e) { if (bookRef.current === id) setError(errorMessage(e)); }
    setDeleting(false);
  };

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} onClick={() => setShowLocations(true)}>Locations</button>
          {canEdit && <button type="button" className={btnPrimary} onClick={() => setEditing({})}>Add item</button>}
        </div>
      </div>
      <input type="search" aria-label="Search" placeholder="Search" className={`${inputCls} !mt-0 md:!w-64`} value={q} onChange={e => setQ(e.target.value)} />
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      {items && !shown.length && <p className="text-sm text-muted-foreground">No items.</p>}

      {shown.length > 0 && (
        <div className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))]">
          {shown.map(i => (
            <div key={i.id} role={canEdit && !i.sharedFrom ? 'button' : undefined} tabIndex={canEdit && !i.sharedFrom ? 0 : undefined}
              onClick={canEdit && !i.sharedFrom ? () => setEditing(i) : undefined}
              onKeyDown={canEdit && !i.sharedFrom ? e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setEditing(i); } } : undefined}
              className={`flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-4 text-sm text-foreground ${canEdit && !i.sharedFrom ? 'cursor-pointer hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent' : ''}`}>
              <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="min-w-0 break-words text-lg font-semibold">{i.name}</h2><SharedBadge kind="item" ledgerNames={i.ledgerNames} /></div>
              {(i.locationName || i.owner || i.sharedFrom) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {i.sharedFrom && !account?.accessCode && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"><span className="text-muted-foreground">From</span><span className="min-w-0 truncate font-medium text-foreground">{i.sharedFrom}</span></span>}
                  {i.locationName && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"><span className="text-muted-foreground">Location</span><span className="min-w-0 truncate font-medium text-foreground">{i.locationName}{i.place ? ` \u00B7 ${i.place}` : ''}</span></span>}
                  {i.owner && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs"><span className="text-muted-foreground">Owner</span><span className="min-w-0 truncate font-medium text-foreground">{i.owner}</span></span>}
                </div>
              )}
              {i.comment && <p className="mt-2 whitespace-pre-wrap break-words border-t border-border pt-2 text-sm text-muted-foreground">{i.comment}</p>}
              <div className="mt-auto">
                {canEdit && (
                  <span className="flex flex-wrap items-center justify-end gap-2 pt-3" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                    <button type="button" className={`${btnSecondary} !px-2 !py-1 text-xs`} onClick={() => setEditing({ copy: i })}>Duplicate</button>
                    {!i.sharedFrom && <button type="button" className={`${btnDanger} !px-2 !py-1 text-xs`} onClick={() => setPendingItem(i)}>Delete</button>}
                  </span>
                )}
                <StampFooter createdAt={i.createdAt} updatedAt={i.updatedAt} />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ItemForm bookId={book.id} item={editing.id ? editing : null} copyOf={editing.copy} locations={locations} linkable={linkable} movable={movable}
          onClose={() => setEditing(null)} onSaved={() => { reload(); setEditing(null); }} />
      )}
      {showLocations && (
        <LocationsModal bookId={book.id} locations={locations} canEdit={canEdit} onClose={() => setShowLocations(false)} onChanged={reload} />
      )}
      {pendingItem && (
        <ConfirmDialog
          title="Delete item?"
          message={`Delete "${pendingItem.name}"?`}
          confirmLabel="Delete"
          tone="danger"
          busy={deleting}
          onConfirm={async () => { await remove(pendingItem); setPendingItem(null); }}
          onCancel={() => setPendingItem(null)}
        />
      )}
    </section>
  );
}
