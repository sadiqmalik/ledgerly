import React, { useEffect, useRef, useState } from 'react';
import dataAPI, { api } from '../../services/dataAPI';
import { useBooks } from '../../hooks/BooksContext';
import { LedgerPages, pagesText } from './ResourcePicker';
import { CODE_RESOURCES, forBook, resourcesOf } from '../../auth/resources.mjs';
import { useAuth } from '../../auth/AuthContext';
import { errorText, inputCls, btnPrimary, btnSecondary, btnDanger, Badge, ToggleGrid } from '../settings/ui';
import Select from '../common/Select';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import PromptDialog from '../common/PromptDialog';

const ownOnly = (own, ids) => Object.fromEntries(ids.filter(id => Array.isArray(own[id])).map(id => [id, own[id]]));
const union = (ids, own, pagesOf) => CODE_RESOURCES.filter(k => ids.some(id => (own[id] ?? pagesOf(id)).includes(k)));

const when = iso => (iso ? new Date(iso).toLocaleString() : '—');

// An access code lets someone view the chosen ledgers. It never allows changes. The code is shown once, on creation.
// scoped: a ledger Admin managing their own codes (Settings). The owner is the signed-in account, so there is no owner
// choice and no account list (the API would refuse it).
export default function AccessCodesPanel({ intent, onIntentDone, onBack, scoped = false }) {
  const { books } = useBooks();
  const { account: me } = useAuth();
  const [codes, setCodes] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState([]);
  const [ownerId, setOwnerId] = useState(scoped ? me?.id || '' : '');
  const [own, setOwn] = useState({}); // own pages per ledger, for the code being created
  const [accounts, setAccounts] = useState([]);
  const [editing, setEditing] = useState(null); // { id, name, bookIds, own, accountId, touched }
  const [creating, setCreating] = useState(false);
  const [codesLoaded, setCodesLoaded] = useState(false);
  const [accountsLoaded, setAccountsLoaded] = useState(scoped);
  const [created, setCreated] = useState(null);
  const [shown, setShown] = useState(null); // { name, code } while the Show code dialog is open
  const [copied, setCopied] = useState(false);
  const [revealingId, setRevealingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  // { kind: 'reset' | 'revoke' | 'delete', code } while a dialog is open, otherwise null.
  const [dialog, setDialog] = useState(null);
  const [resetting, setResetting] = useState(false);
  const closeDialog = () => setDialog(null);
  // True while a dialog opened from an admin card's intent is up; closing it returns to the Admins tab, once.
  const fromAdmin = useRef(false);
  const goBack = () => { if (fromAdmin.current) { fromAdmin.current = false; onBack && onBack(); } };
  const closeEditing = () => { setEditing(null); goBack(); };
  const closeCreating = () => { setCreating(false); goBack(); };

  const load = async () => {
    try {
      setCodes(await dataAPI.listAccessCodes());
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCodesLoaded(true);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (scoped) return;
    api.get('/admin/accounts').then(res => setAccounts((res.data.accounts || []).filter(a => !a.disabled))).catch(err => setError(errorText(err))).finally(() => setAccountsLoaded(true));
  }, []);

  // A jump from an admin's card: open that code's edit dialog or the New code form with the owner preselected.
  useEffect(() => {
    if (!intent || !codesLoaded || !accountsLoaded) return;
    fromAdmin.current = false;
    if (intent.editId) {
      const c = codes.find(x => x.id === intent.editId);
      if (c) {
        setError('');
        const o = intent.ownerId ? accounts.find(a => a.id === intent.ownerId) : null;
        const base = { id: c.id, name: c.name, resources: c.resources || [], bookIds: c.bookIds, own: c.bookResources || {}, accountId: c.accountId || '', touched: false };
        if (o) {
          // Linking: start on this admin with only the ledgers the admin can see.
          const ids = new Set((o.isSuperAdmin ? books : books.filter(b => (o.memberships || []).some(m => m.bookId === b.id))).map(b => b.id));
          // Keep the code's ledgers the admin has; when none overlap, start with all of the admin's ledgers so it can be saved.
          const kept = c.bookIds.filter(id => ids.has(id));
          const bookIds = kept.length ? kept : [...ids];
          setEditing({ ...base, accountId: o.id, bookIds, own: ownOnly(base.own, bookIds), touched: true });
        } else setEditing(base);
        fromAdmin.current = Boolean(intent.back);
      }
    } else if (intent.newOwnerId) {
      setError(''); setOwnerId(intent.newOwnerId); setSelected([]); setOwn({}); setCreating(true);
      fromAdmin.current = Boolean(intent.back);
    }
    onIntentDone && onIntentDone();
  }, [intent, codesLoaded, accountsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountOf = id => (scoped ? (id ? me : undefined) : accounts.find(a => a.id === id));
  const ownerBooks = owner => (scoped ? books.filter(b => (me?.memberships || []).some(m => m.bookId === b.id && m.role === 'admin')) : owner?.isSuperAdmin ? books : books.filter(b => (owner?.memberships || []).some(m => m.bookId === b.id)));
  const ownerPages = (owner, bookId) => {
    if (!owner) return [];
    if (scoped) return resourcesOf(forBook(me, bookId)).filter(k => CODE_RESOURCES.includes(k));
    if (owner.isSuperAdmin) return CODE_RESOURCES;
    const m = (owner.memberships || []).find(x => x.bookId === bookId);
    return (m?.resources ?? owner.resources ?? []).filter(k => CODE_RESOURCES.includes(k));
  };
  const ownerSelect = (value, onChange) => (scoped ? null : (
    <label className="block text-sm font-medium text-foreground">
      Admin (owner)
      <Select value={value} onChange={e => onChange(e.target.value)} disabled={busy}>
        <option value="">Choose an admin</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.username}{a.name ? ` (${a.name})` : ''}</option>)}
      </Select>
    </label>
  ));
  const owner = accountOf(ownerId);
  const editOwner = accountOf(editing?.accountId);

  const bookName = id => books.find(b => b.id === id)?.name || id;

  const create = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setCreated(await dataAPI.createAccessCode(name, selected, code, union(selected, own, id => ownerPages(owner, id)), ownOnly(own, selected), scoped ? me.id : ownerId));
      setName('');
      setCode('');
      setSelected([]);
      setOwn({});
      setOwnerId('');
      closeCreating();
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const reset = c => setDialog({ kind: 'reset', code: c });

  // Runs the reset; the dialog stays open (busy) until the request finishes, then closes either way.
  const submitReset = async (c, entered) => {
    setError('');
    setResetting(true);
    try {
      setCreated(await dataAPI.resetAccessCode(c.id, entered));
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setResetting(false);
      closeDialog();
    }
  };

  const savePages = async () => {
    setError('');
    setBusy(true);
    try {
      await dataAPI.setAccessCodeResources(editing.id, union(editing.bookIds, editing.own, id => (editing.accountId ? ownerPages(editOwner, id) : editing.resources)), ownOnly(editing.own, editing.bookIds), editing.bookIds, scoped ? me.id : (editing.accountId || undefined));
      closeEditing();
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async c => {
    try {
      await dataAPI.revokeAccessCode(c.id);
      if (created && created.id === c.id) setCreated(null);
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const reveal = async c => {
    setError('');
    setRevealingId(c.id);
    try {
      setShown({ name: c.name, code: await dataAPI.revealAccessCode(c.id) });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRevealingId(null);
    }
  };
  const closeShown = () => { setShown(null); setCopied(false); };
  const copyShown = async () => {
    try { await navigator.clipboard.writeText(shown.code); setCopied(true); } catch (err) { setError(errorText(err)); }
  };

  const restore = async c => {
    setError('');
    try {
      await dataAPI.restoreAccessCode(c.id);
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const remove = async c => {
    setError('');
    setDeletingId(c.id);
    try {
      await dataAPI.deleteAccessCode(c.id);
      if (created && created.id === c.id) setCreated(null);
      if (editing?.id === c.id) setEditing(null);
      await load();
    } catch (err) {
      setError(errorText(err));
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">An access code is view only: it lets someone read the selected ledgers and pages, and never change anything.</p>
        <button type="button" className={btnPrimary} onClick={() => { fromAdmin.current = false; setError(''); setCreating(true); }}>New access code</button>
      </div>
      {error && !creating && !editing && <div className="alert alert-error" role="alert">{error}</div>}
      {created && (
        <div className="alert alert-success" role="status">
          Access code for "{created.name}": <strong style={{ fontFamily: 'monospace', userSelect: 'all' }}>{created.code}</strong>
          <div>Copy it now. It cannot be shown again.</div>
        </div>
      )}

      <ul className="grid items-start gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {codes.map(c => (
          <li key={c.id} className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
            <p className="flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
              <span className="min-w-0 truncate">{c.name}</span> {c.revokedAt ? <Badge>revoked</Badge> : <Badge>active</Badge>}
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Ledgers</dt><dd className="min-w-0">{c.bookIds.map(bookName).join(', ') || 'None'}</dd></div>
              {!scoped && <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Admin</dt><dd className="min-w-0">{c.accountId ? (accountOf(c.accountId)?.username || c.accountId) : <Badge>Not linked</Badge>}</dd></div>}
              {Object.entries(c.bookResources || {}).map(([id, list]) => (
                <div key={id} className="flex gap-2"><dt className="w-20 shrink-0 truncate text-muted-foreground" title={bookName(id)}>{bookName(id)}</dt><dd className="min-w-0"><span className="text-muted-foreground">own pages: </span>{pagesText(list)}</dd></div>
              ))}
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Created</dt><dd className="min-w-0">{when(c.createdAt)} by {c.createdBy}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-muted-foreground">Last used</dt><dd className="min-w-0">{when(c.lastUsedAt)}</dd></div>
            </dl>
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              {!c.revokedAt && <button type="button" className={btnSecondary} onClick={() => { fromAdmin.current = false; setError(''); setEditing({ id: c.id, name: c.name, resources: c.resources || [], bookIds: c.bookIds, own: c.bookResources || {}, accountId: scoped ? me.id : (c.accountId || ''), touched: false }); }}>Edit</button>}
              {!c.revokedAt && <button type="button" className={btnSecondary} onClick={() => reset(c)}>Reset code</button>}
              {!scoped && !c.revokedAt && (
                <button type="button" className={btnSecondary} disabled={!c.revealable || revealingId === c.id} title={c.revealable ? undefined : 'Reset this code once to make it viewable'} onClick={() => reveal(c)}>
                  {revealingId === c.id ? 'Loading…' : 'Show code'}
                </button>
              )}
              {!c.revokedAt && <button type="button" className={btnDanger} onClick={() => revoke(c)}>Revoke</button>}
              {c.revokedAt && <button type="button" className={btnPrimary} onClick={() => restore(c)}>Restore</button>}
              <button type="button" className={btnDanger} disabled={deletingId === c.id} onClick={() => setDialog({ kind: 'delete', code: c })}>
                {deletingId === c.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
        {codes.length === 0 && <li className="text-sm text-muted-foreground">No access codes yet.</li>}
      </ul>
      {shown && (
        <Modal title={`Access code for "${shown.name}"`} onClose={closeShown}>
          <div className="space-y-3">
            <div className="alert alert-success" role="status">
              <strong style={{ fontFamily: 'monospace', userSelect: 'all', wordBreak: 'break-all' }}>{shown.code}</strong>
            </div>
            <p className="text-xs text-muted-foreground">Shown to super administrators and written to the audit log.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} onClick={copyShown}>{copied ? 'Copied' : 'Copy'}</button>
              <button type="button" className={btnSecondary} onClick={closeShown}>Close</button>
            </div>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal title="New access code" onClose={closeCreating} wide>
          <form onSubmit={create} className="space-y-4">
            {error && <p role="alert" className="text-sm text-negative">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-foreground">
                Name
                <input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={80} required autoFocus />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Access code (optional)
                <input className={inputCls} value={code} onChange={e => setCode(e.target.value)} maxLength={64} autoComplete="off" spellCheck={false} placeholder="Leave blank to generate one" />
              </label>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">8-64 characters, case-sensitive, for example family-view-2026. It is shown once, after you create it.</p>
            {ownerSelect(ownerId, v => { setOwnerId(v); setSelected([]); setOwn({}); })}
            <p className="text-sm font-medium text-foreground">Ledgers and pages (view only)</p>
            <LedgerPages forCode books={ownerBooks(owner)} selected={selected} onSelect={setSelected} disabled={busy || !owner}
              own={own} onOwn={(id, v) => setOwn(p => { const n = { ...p }; if (v) n[id] = v; else delete n[id]; return n; })}
              inheritedOf={id => ownerPages(owner, id)} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={btnPrimary} disabled={busy || !name.trim() || !(scoped ? me?.id : ownerId) || selected.length === 0}>{busy ? 'Creating...' : 'Create access code'}</button>
              <button type="button" className={btnSecondary} onClick={closeCreating} disabled={busy}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit access code" onClose={closeEditing} wide bare>
          <div className="space-y-4">
            {error && <p role="alert" className="text-sm text-negative">{error}</p>}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Edit access code</div>
                <h3 className="mt-0.5 break-words text-xl font-semibold text-foreground" style={{ margin: 0 }}>{editing.name}</h3>
              </div>
              <button type="button" aria-label="Close" onClick={closeEditing} className="btn shrink-0 px-2 py-1">&times;</button>
            </div>
            {ownerSelect(editing.accountId, v => setEditing(e => {
              // Changing the admin keeps the ledgers (and own pages) the new admin has; when none overlap it starts with all of theirs.
              const ids = ownerBooks(accountOf(v)).map(b => b.id);
              const kept = e.bookIds.filter(id => ids.includes(id));
              const bookIds = v ? (kept.length ? kept : ids) : e.bookIds;
              return { ...e, accountId: v, bookIds, own: ownOnly(e.own, bookIds), touched: true };
            }))}
            {!scoped && !editing.accountId && <p className="text-xs text-muted-foreground">Not linked to an admin yet: link one so it inherits their pages</p>}
            {!scoped && editing.accountId && ownerBooks(editOwner).length === 0 && <p className="text-xs text-negative">This admin has no ledgers yet. Give them a ledger first (Admin → Admins → Edit ledgers), then link the code.</p>}
            <p className="text-sm font-medium text-foreground">Ledgers and pages (view only)</p>
            <LedgerPages forCode books={editing.accountId ? ownerBooks(editOwner) : books} selected={editing.bookIds} disabled={busy}
              onSelect={next => setEditing(e => ({ ...e, bookIds: next, touched: true }))}
              own={editing.own} onOwn={(id, v) => setEditing(e => { const n = { ...e.own }; if (v) n[id] = v; else delete n[id]; return { ...e, own: n, touched: true }; })}
              inheritedOf={id => (editing.accountId ? ownerPages(editOwner, id) : editing.resources)}
              allowedOf={editing.accountId ? undefined : () => CODE_RESOURCES}
              inheritLabel={editing.accountId ? undefined : 'Same as the code\'s default pages'} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={busy || editing.bookIds.length === 0 || (editing.touched && !editing.accountId)} onClick={savePages}>{busy ? 'Saving...' : 'Save'}</button>
              <button type="button" className={btnSecondary} disabled={busy} onClick={closeEditing}>Cancel</button>
            </div>
            {editing.bookIds.length === 0 && <p className="text-xs text-muted-foreground">Switch Access on for at least one ledger to save.</p>}
            {editing.touched && !editing.accountId && <p className="text-xs text-muted-foreground">Choose the admin (owner) to save.</p>}
          </div>
        </Modal>
      )}
      {dialog?.kind === 'reset' && (
        <PromptDialog
          title="Reset access code"
          message={`New access code for "${dialog.code.name}" (8-64 characters). Leave blank to generate a strong one. The old code stops working and anyone signed in with it is signed out immediately.`}
          label="New access code"
          placeholder="Leave blank to generate a strong code"
          confirmLabel="Reset code"
          busy={resetting}
          validate={v => (v === '' || (v.length >= 8 && v.length <= 64) ? '' : 'Access code must be 8-64 characters.')}
          onSubmit={v => submitReset(dialog.code, v)}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <ConfirmDialog
          title="Revoke access code?"
          message={`Revoke the access code "${dialog.code.name}"? Anyone signed in with it is signed out immediately.`}
          confirmLabel="Revoke"
          tone="danger"
          onConfirm={() => { const c = dialog.code; closeDialog(); revoke(c); }}
          onCancel={closeDialog}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete access code?"
          message={`Permanently delete the access code "${dialog.code.name}"? This cannot be undone. Anyone signed in with it is signed out immediately.`}
          confirmLabel="Delete"
          tone="danger"
          onConfirm={() => { const c = dialog.code; closeDialog(); remove(c); }}
          onCancel={closeDialog}
        />
      )}
    </div>
  );
}
