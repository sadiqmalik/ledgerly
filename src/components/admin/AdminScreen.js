import React, { useEffect, useState } from 'react';
import dataAPI, { api } from '../../services/dataAPI';
import { useAuth } from '../../auth/AuthContext';
import { useBooks } from '../../hooks/BooksContext';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import NewLedgerModal from '../NewLedgerModal';
import { Details, Members, DefaultLedger } from '../settings/LedgerTab';
import AccessCodesPanel from './AccessCodesPanel';
import CurrenciesPanel from './CurrenciesPanel';
import { BookPages, pagesText } from './ResourcePicker';
import NotebookPicker from './NotebookPicker';
import { DEFAULT_ALL_RESOURCES, RESOURCES } from '../../auth/resources.mjs';
import { errorText, inputCls, btnPrimary, btnSecondary, btnDanger, btnSm, btnSmDanger, btnSmPrimary, Badge, Toggle } from '../settings/ui';
import CurrencyLabel from '../common/CurrencyLabel';
import Select from '../common/Select';
import { StampFooter } from '../common/Stamp';
import useHiddenLedgers from '../../hooks/useHiddenLedgers';
import useHashQuery from '../../hooks/useHashQuery';
import { groupSlug, resolveGroup } from '../../utils/groupSlug';

// Super administrators only. Roles: a super administrator can do everything in every ledger; for each ledger a user is
// an Admin, Editor or Viewer, or has no access to it. Everything here is app-wide; the open ledger's own setup (funds,
// categories, members, ...) is on the Settings page.
export const ADMIN_GROUPS = ['Access', 'Ledgers', 'Settings'];
const GROUPS = ADMIN_GROUPS;
const TABS = [
  { key: 'users', label: 'Admins', group: 'Access' },
  { key: 'codes', label: 'Access codes', group: 'Access' },
  { key: 'ledgers', label: 'All ledgers', group: 'Ledgers' },
  { key: 'currencies', label: 'Currencies', group: 'Settings' },
];

const ROLES = [
  { value: 'none', label: 'No access' },
  { value: 'viewer', label: 'Viewer: read only' },
  { value: 'editor', label: 'Editor: add and change entries' },
  { value: 'admin', label: 'Admin: also settings and members' },
];

const ROLE_TEXT = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };

// Loan register roles, one select per register.
const LOAN_ROLES = [
  { value: 'none', label: 'No access' },
  { value: 'viewer', label: 'Viewer: read only' },
  { value: 'editor', label: 'Editor: add and change entries' },
  { value: 'admin', label: 'Admin: also edit and delete the loan' },
];

const MIN_PASSWORD = 6;

export default function AdminScreen() {
  const [query, setQuery] = useHashQuery();
  const params = new URLSearchParams(query);
  const [tab, setTab] = useState(() => TABS.find(t => t.key === params.get('tab'))?.key || 'users');
  const [codeIntent, setCodeIntent] = useState(null); // { editId, ownerId?, back? } | { newOwnerId, back } | null
  const { books } = useBooks();
  const groupParam = resolveGroup(params.get('group'), GROUPS);
  const currentTab = TABS.find(t => t.key === tab) || TABS[0];
  const group = groupParam || currentTab.group;
  const groupTabs = TABS.filter(t => t.group === group);
  const shown = groupTabs.find(t => t.key === currentTab.key) || groupTabs[0];
  const open = (key, g) => { setTab(key); setQuery(`group=${groupSlug(g || group)}&tab=${key}`, { replace: true }); };
  // A super admin's section can continue on the Settings page: one link pill to the other page's tabs.
  const other = !books.length ? null : group === 'Ledgers' ? { href: '#/settings?group=ledgers', label: 'This ledger' } : group === 'Settings' ? { href: '#/settings?group=settings', label: 'Display' } : null;
  const openCodes = intent => { setCodeIntent(intent); open('codes', 'Access'); };
  return (
    <section className="w-full min-w-0 space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Visible to super administrators only. Admins (super admins and normal admins), access codes, all ledgers and the currency list. The open ledger's own setup is under Settings.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-2">
        <div role="tablist" aria-label={group} className="flex min-w-0 flex-wrap gap-1">
          {groupTabs.map(t => {
            const selected = t.key === shown.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => open(t.key)}
                className={`whitespace-nowrap rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${selected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t.label}
              </button>
            );
          })}
          {other && <a href={other.href} className="ml-1 whitespace-nowrap rounded-lg border border-accent/50 px-3 py-1.5 text-sm font-medium text-accent no-underline transition-colors hover:bg-accent/10" title="Opens another page">{other.label} &rarr;</a>}
        </div>
      </div>

      {shown.key === 'users' ? <UsersPanel onOpenCodes={openCodes} /> : shown.key === 'ledgers' ? <LedgersPanel /> : shown.key === 'currencies' ? <CurrenciesPanel /> : <AccessCodesPanel intent={codeIntent} onIntentDone={() => setCodeIntent(null)} onBack={() => open('users', 'Access')} />}
    </section>
  );
}

// Access for each ledger, as a list of { bookId, role } with role none/viewer/editor/admin.
const accessFrom = (books, memberships = []) => Object.fromEntries(
  books.map(b => [b.id, memberships.find(m => m.bookId === b.id)?.role || 'none'])
);

// Every ledger carries its own page list: bookPages[bookId] when edited, else the seed (the account's usual pages).
const membershipsFrom = (access, bookPages = {}, seed = [], notebookOff = {}) => Object.entries(access)
  .filter(([, role]) => role !== 'none')
  // Settings only goes with the Admin role in that ledger.
  .map(([bookId, role]) => {
    const resources = (Array.isArray(bookPages[bookId]) ? bookPages[bookId] : seed).filter(k => role === 'admin' || k !== 'settings');
    const off = resources.includes('diary') ? notebookOff[bookId] : null;
    return { bookId, role, resources, ...(off && off.length ? { notebooksExcluded: off } : {}) };
  });
const notebookOffFrom = (memberships = []) => Object.fromEntries(
  memberships.filter(m => Array.isArray(m.notebooksExcluded) && m.notebooksExcluded.length).map(m => [m.bookId, m.notebooksExcluded])
);
const pagesFromMemberships = (memberships = []) => Object.fromEntries(
  memberships.filter(m => Array.isArray(m.resources)).map(m => [m.bookId, m.resources])
);

// Shared list of ledger roles: one select per ledger.
function AccessEditor({ books, access, onChange, disabled, bookPages, onBookPagesChange, globalPages = [], notebookOff = {}, onNotebookOffChange }) {
  if (books.length === 0) return <p className="text-sm text-muted-foreground">There are no ledgers yet. Create one first.</p>;
  return (
    <div className="grid items-start gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
      {books.map(b => (
        <div key={b.id} className="space-y-3 rounded-xl border border-border bg-card p-3 text-sm">
        <label className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">{b.name}</span>
          <Select
            aria-label={`Role in ${b.name}`}
            className={`${inputCls} !mt-0 !w-auto`}
            value={access[b.id] || 'none'}
            disabled={disabled}
            onChange={e => onChange({ ...access, [b.id]: e.target.value })}
          >
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </label>
        {onBookPagesChange && (access[b.id] || 'none') !== 'none' && (
          <BookPages bookName={b.name} value={(bookPages?.[b.id] ?? globalPages).filter(k => access[b.id] === 'admin' || k !== 'settings')} disabled={disabled}
            allowed={access[b.id] === 'admin' ? null : RESOURCES.filter(k => k !== 'settings')}
            onChange={v => onBookPagesChange({ ...bookPages, [b.id]: v })} />
        )}
        {onNotebookOffChange && (access[b.id] || 'none') !== 'none' && (bookPages?.[b.id] ?? globalPages).filter(k => access[b.id] === 'admin' || k !== 'settings').includes('diary') && (
          <NotebookPicker bookId={b.id} excluded={notebookOff[b.id] || []} disabled={disabled}
            onChange={v => onNotebookOffChange({ ...notebookOff, [b.id]: v })} />
        )}
        </div>
      ))}
    </div>
  );
}

// Loan access for each register, as a list of { registerId, role } with role none/viewer/editor/admin.
const loanAccessFrom = (registers, memberships = []) => Object.fromEntries(
  registers.map(r => [r.id, memberships.find(m => m.registerId === r.id)?.role || 'none'])
);

const loanMembershipsFrom = access => Object.entries(access)
  .filter(([, role]) => role !== 'none')
  .map(([registerId, role]) => ({ registerId, role }));

// One role select per loan register.
function LoanAccessEditor({ registers, access, onChange, disabled }) {
  if (registers.length === 0) return <p className="text-sm text-muted-foreground">No loans yet.</p>;
  return (
    <div className="space-y-2">
      {registers.map(r => (
        <label key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <span className="min-w-0 truncate font-medium text-foreground">{r.name}</span>
          <Select
            aria-label={`Loan role in ${r.name}`}
            className={`${inputCls} !mt-0 !w-auto`}
            value={access[r.id] || 'none'}
            disabled={disabled}
            onChange={e => onChange({ ...access, [r.id]: e.target.value })}
          >
            {LOAN_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </label>
      ))}
    </div>
  );
}

function UsersPanel({ onOpenCodes }) {
  const { account: me } = useAuth();
  const { books } = useBooks();
  const [accounts, setAccounts] = useState(null);
  const [registers, setRegisters] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState(0);
  const [codes, setCodes] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.get('/loans')
      .then(res => { if (!cancelled) setRegisters(Array.isArray(res.data) ? res.data : []); })
      .catch(err => { if (!cancelled) setError(errorText(err)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.get('/admin/accounts')
      .then(res => { if (!cancelled) { setAccounts(res.data.accounts || []); setError(''); } })
      .catch(err => { if (!cancelled) setError(errorText(err)); });
    return () => { cancelled = true; };
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    dataAPI.listAccessCodes()
      .then(list => { if (!cancelled) setCodes(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setCodes([]); });
    return () => { cancelled = true; };
  }, [version]);

  const bookName = id => books.find(b => b.id === id)?.name || id;
  const reload = () => setVersion(v => v + 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {accounts ? `${accounts.length} ${accounts.length === 1 ? 'admin' : 'admins'}.` : ''} A super admin has everything. A normal admin has only the ledgers, loans and pages you give.
        </p>
        <button type="button" className={btnPrimary} onClick={() => { setAdding(true); setNotice(''); }}>Add admin</button>
      </div>

      {error && <p role="alert" className="rounded-lg bg-muted px-3 py-2 text-sm text-negative">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-positive">{notice}</p>}

      {adding && (
        <AddUserForm
          books={books}
          registers={registers}
          onCancel={() => setAdding(false)}
          onDone={msg => { setAdding(false); setNotice(msg); setError(''); reload(); }}
        />
      )}

      {!accounts && !error && <p className="text-sm text-muted-foreground">Loading admins...</p>}

      {accounts && (
        <ul className="grid items-stretch gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))]" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {accounts.map(a => (
            <li key={a.id} className="flex">
              <UserCard
                account={a}
                books={books}
                registers={registers}
                codes={codes.filter(c => c.accountId === a.id)}
                unlinkedCodes={codes.filter(c => !c.accountId && !c.revokedAt)}
                onOpenCodes={onOpenCodes}
                isMe={a.id === me?.id}
                bookName={bookName}
                onChanged={reload}
                onNotice={setNotice}
                onError={setError}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddUserForm({ books, registers, onCancel, onDone }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [access, setAccess] = useState(() => accessFrom(books, []));
  const [bookPages, setBookPages] = useState({});
  const [notebookOff, setNotebookOff] = useState({});
  const [loanAccess, setLoanAccess] = useState(() => loanAccessFrom(registers, []));
  const [isSuper, setIsSuper] = useState(false);
  const [pages, setPages] = useState([...DEFAULT_ALL_RESOURCES]); // the Notebook is off until you switch it on
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) { setError(`The password must be at least ${MIN_PASSWORD} characters.`); return; }
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/accounts', { username: username.trim(), email: email.trim(), name: name.trim(), password, isSuperAdmin: isSuper, ...(isSuper ? {} : { memberships: membershipsFrom(access, bookPages, pages, notebookOff), loanMemberships: loanMembershipsFrom(loanAccess), resources: Object.keys(loanAccess).some(k => loanAccess[k] !== 'none') ? ['loans'] : [] }) });
      onDone(`${username.trim() || email.trim()} was added. Give them the password in person; they can change it after signing in.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add admin" onClose={onCancel} wide>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">Name
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} required maxLength={120} />
        </label>
        <label className="block text-sm font-medium text-foreground">Username
          <input className={inputCls} value={username} onChange={e => setUsername(e.target.value)} maxLength={40} autoCapitalize="none" spellCheck={false} placeholder="Taken from the email if left empty" />
        </label>
        <label className="block text-sm font-medium text-foreground">Email (optional)
          <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} maxLength={200} />
        </label>
        <label className="block text-sm font-medium text-foreground sm:col-span-2">Starting password (at least {MIN_PASSWORD} characters)
          <input type="password" autoComplete="new-password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} required minLength={MIN_PASSWORD} />
        </label>
      </div>

      <Toggle label="Super admin"
        hint="On: has every ledger, loan and page and needs no specific access. Off: a normal admin, who only gets the ledgers, loans and pages you choose below."
        checked={isSuper} onChange={setIsSuper} disabled={busy} />

      {!isSuper && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Ledgers this admin can use (and their role in each)</p>
            <AccessEditor books={books} access={access} onChange={setAccess} disabled={busy} bookPages={bookPages} onBookPagesChange={setBookPages} globalPages={pages} notebookOff={notebookOff} onNotebookOffChange={setNotebookOff} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Loans this admin can use (and their role in each)</p>
            <LoanAccessEditor registers={registers} access={loanAccess} onChange={setLoanAccess} disabled={busy} />
          </div>
        </>
      )}

      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={btnPrimary} disabled={busy || (!username.trim() && !email.trim())}>{busy ? 'Adding...' : 'Add admin'}</button>
        <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
    </Modal>
  );
}

function UserCard({ account: a, books, registers, codes = [], unlinkedCodes = [], onOpenCodes, isMe, bookName, onChanged, onNotice, onError }) {
  const [mode, setMode] = useState(null); // null | 'access' | 'loans' | 'pages' | 'profile' | 'password' | 'delete'
  const [access, setAccess] = useState({});
  const [bookPages, setBookPages] = useState({});
  const [notebookOff, setNotebookOff] = useState({});
  const [loanAccess, setLoanAccess] = useState({});
  const [password, setPassword] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [profile, setProfile] = useState({ name: '', username: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [typeDialog, setTypeDialog] = useState(false);

  const run = async (fn, success) => {
    setBusy(true);
    setLocalError('');
    try {
      await fn();
      onError('');
      onNotice(success);
      setMode(null);
      setPassword('');
      setConfirmEmail('');
      onChanged();
    } catch (err) {
      setLocalError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const startAccess = () => { setAccess(accessFrom(books, a.memberships)); setBookPages(pagesFromMemberships(a.memberships)); setNotebookOff(notebookOffFrom(a.memberships)); setLocalError(''); setMode('access'); };

  const saveAccess = () => run(
    () => api.put(`/admin/accounts/${a.id}/memberships`, { memberships: membershipsFrom(access, bookPages, a.resources || [], notebookOff) }),
    `Access for ${a.username} saved.`
  );

  const registerName = id => registers.find(r => r.id === id)?.name || id;

  const startLoans = () => { setLoanAccess(loanAccessFrom(registers, a.loanMemberships)); setLocalError(''); setMode('loans'); };

  const saveLoans = () => run(
    () => api.put('/admin/accounts/' + a.id + '/loan-memberships', { loanMemberships: loanMembershipsFrom(loanAccess) }),
    `Loan access for ${a.username} saved.`
  );


  const startProfile = () => { setProfile({ name: a.name || '', username: a.username || '', email: a.email || '' }); setLocalError(''); setMode('profile'); };

  const profileChanges = () => {
    const c = {};
    if (profile.name.trim() !== (a.name || '')) c.name = profile.name.trim();
    if (profile.username.trim() !== (a.username || '')) c.username = profile.username.trim();
    if (profile.email.trim() !== (a.email || '')) c.email = profile.email.trim() || null;
    return c;
  };
  const profileDirty = Object.keys(profileChanges()).length > 0;
  const profileValid = profile.name.trim() !== '' && profile.username.trim() !== '';

  const saveProfile = e => {
    e.preventDefault();
    if (!profileDirty || !profileValid) return;
    run(() => api.put(`/admin/accounts/${a.id}/profile`, profileChanges()), `Details for ${a.username} saved.`);
  };

  const resetPassword = e => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) { setLocalError(`The password must be at least ${MIN_PASSWORD} characters.`); return; }
    run(() => api.post(`/admin/accounts/${a.id}/password`, { password }), `Password reset for ${a.username}. Their sessions were signed out.`);
  };

  const changeType = () => run(
    () => api.put(`/admin/accounts/${a.id}/type`, { isSuperAdmin: !a.isSuperAdmin }),
    a.isSuperAdmin ? `${a.username} is now a normal admin. Give them their ledgers, loans and pages.` : `${a.username} is now a super admin.`
  ).finally(() => setTypeDialog(false));

  const toggleDisabled = () => run(
    () => api.put(`/admin/accounts/${a.id}/status`, { disabled: !a.disabled }),
    `${a.username} ${a.disabled ? 'enabled' : 'disabled'}.`
  );

  const remove = () => run(() => api.delete(`/admin/accounts/${a.id}`), `${a.username} was deleted.`);

  const locked = a.lockedUntil && new Date(a.lockedUntil) > new Date();

  return (
    <article className="flex h-full min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <header className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-foreground">
          {(a.name || a.username).slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {a.name || a.username}
            {isMe && <Badge>you</Badge>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{a.username}{a.email ? ` · ${a.email}` : ''}</p>
          <p className="mt-1 flex flex-wrap gap-1 text-xs">
            {a.isSuperAdmin ? <span className="rounded bg-accent px-1.5 py-0.5 text-accent-foreground">Super admin</span> : <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Admin</span>}
            {a.disabled && <span className="rounded bg-negative/15 px-1.5 py-0.5 text-negative">Disabled</span>}
            {locked && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Locked after failed sign-ins</span>}
          </p>
        </div>
      </header>

      {a.isSuperAdmin && (
        <p className="text-sm text-muted-foreground">Everything: every ledger, loan and page, so no specific access is needed. The Notebook only ever shows their own entries.</p>
      )}

      {!a.isSuperAdmin && mode !== 'access' && (
        <div className="text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ledgers</p>
          {a.memberships?.length ? (
            <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {a.memberships.map(m => (
                <li key={m.bookId} className="rounded-md border border-border px-2 py-0.5 text-xs">
                  {bookName(m.bookId)} <span className="text-muted-foreground">· {ROLE_TEXT[m.role] || m.role}{Array.isArray(m.resources) ? ` · ${pagesText(m.resources)}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No ledger access{a.isSuperAdmin ? ' (a super admin can open every ledger)' : ''}.</p>
          )}
        </div>
      )}

      {!a.isSuperAdmin && mode !== 'loans' && (
        <div className="text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Loans</p>
          {a.loanMemberships?.length ? (
            <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {a.loanMemberships.map(m => (
                <li key={m.registerId} className="rounded-md border border-border px-2 py-0.5 text-xs">
                  {registerName(m.registerId)} <span className="text-muted-foreground">· {ROLE_TEXT[m.role] || m.role}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No loan access{a.isSuperAdmin ? ' (a super admin can open every loan)' : ''}.</p>
          )}
        </div>
      )}


      {mode !== 'access' && mode !== 'loans' && onOpenCodes && (
        <div className="text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Access codes</p>
          <ul className="flex flex-wrap gap-1.5" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {codes.map(c => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenCodes({ editId: c.id, back: true })} className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground hover:bg-muted">
                  {c.name}{c.revokedAt && <span className="text-muted-foreground"> · revoked</span>}
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => onOpenCodes({ newOwnerId: a.id, back: true })} className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">+ New code</button>
            </li>
            <li>
              {unlinkedCodes.length ? (
                <Select value="" onChange={e => e.target.value && onOpenCodes({ editId: e.target.value, ownerId: a.id, back: true })} className="rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-xs text-muted-foreground" aria-label="Link existing code">
                  <option value="">Link existing code</option>
                  {unlinkedCodes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              ) : (
                <button type="button" disabled title="No unlinked codes" className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground opacity-50">Link existing code</button>
              )}
            </li>
          </ul>
        </div>
      )}

      {mode === 'loans' && (
        <div className="space-y-3 rounded-lg bg-muted p-3">
          <p className="text-sm font-medium text-foreground">Loan access for {a.email}</p>
          <LoanAccessEditor registers={registers} access={loanAccess} onChange={setLoanAccess} disabled={busy} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={busy} onClick={saveLoans}>{busy ? 'Saving...' : 'Save loan access'}</button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {mode === 'access' && (
        <div className="space-y-3 rounded-lg bg-muted p-3">
          <p className="text-sm font-medium text-foreground">Access for {a.email}</p>
          <AccessEditor books={books} access={access} onChange={setAccess} disabled={busy} bookPages={bookPages} onBookPagesChange={setBookPages} globalPages={a.resources || []} notebookOff={notebookOff} onNotebookOffChange={setNotebookOff} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={busy} onClick={saveAccess}>{busy ? 'Saving...' : 'Save access'}</button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {!a.isSuperAdmin && <button type="button" className={btnSm} onClick={startAccess}>Edit ledgers</button>}
          {!a.isSuperAdmin && <button type="button" className={btnSm} onClick={startLoans}>Edit loans</button>}
          <button type="button" className={btnSm} onClick={startProfile}>Edit details</button>
          <button type="button" className={btnSm} onClick={() => { setMode('password'); setLocalError(''); }}>Reset password</button>
          {!isMe && <button type="button" className={btnSm} disabled={busy} onClick={() => setTypeDialog(true)}>{a.isSuperAdmin ? 'Make normal admin' : 'Make super admin'}</button>}
          {!isMe && (
            <button type="button" className={btnSm} disabled={busy} onClick={toggleDisabled}>
              {a.disabled ? 'Enable' : 'Disable'}
            </button>
          )}
          {!isMe && <button type="button" className={btnSmDanger} onClick={() => { setMode('delete'); setLocalError(''); }}>Delete admin</button>}
        </div>
      )}

      {mode === 'profile' && (
        <form onSubmit={saveProfile} className="mt-auto space-y-2 rounded-lg bg-muted p-3">
          <label className="block text-sm font-medium text-foreground">
            Name
            <input className={inputCls} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} required />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Username
            <input className={inputCls} value={profile.username} placeholder={a.username} autoComplete="off"
              onChange={e => setProfile({ ...profile, username: e.target.value })} required />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Used to sign in. 2-40 letters, digits, . _ -</span>
          </label>
          <label className="block text-sm font-medium text-foreground">
            Email (optional)
            <input type="email" className={inputCls} value={profile.email} autoComplete="off"
              onChange={e => setProfile({ ...profile, email: e.target.value })} />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">Leave empty to remove</span>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={busy || !profileDirty || !profileValid}>{busy ? 'Saving...' : 'Save details'}</button>
            <button type="button" className={btnSecondary} disabled={busy} onClick={() => { setMode(null); setLocalError(''); }}>Cancel</button>
          </div>
        </form>
      )}

      {mode === 'password' && (
        <form onSubmit={resetPassword} className="mt-auto space-y-2 rounded-lg bg-muted p-3">
          <label className="block text-sm font-medium text-foreground">
            New password (at least {MIN_PASSWORD} characters)
            <input type="password" autoComplete="new-password" className={inputCls} value={password}
              onChange={e => setPassword(e.target.value)} required minLength={MIN_PASSWORD} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={busy}>{busy ? 'Saving...' : 'Save password'}</button>
            <button type="button" className={btnSecondary} onClick={() => { setMode(null); setPassword(''); setLocalError(''); }}>Cancel</button>
          </div>
        </form>
      )}

      {mode === 'delete' && (
        <div className="mt-auto space-y-2 rounded-lg border border-negative p-3">
          <p className="text-sm text-foreground">This deletes {a.email} and signs them out. Type the email to confirm.</p>
          <input aria-label="Type the username to confirm" className={inputCls} value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className={btnDanger} disabled={busy || confirmEmail.trim().toLowerCase() !== a.username.toLowerCase()} onClick={remove}>
              {busy ? 'Deleting...' : 'Delete admin'}
            </button>
            <button type="button" className={btnSecondary} onClick={() => { setMode(null); setConfirmEmail(''); setLocalError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {localError && <p role="alert" className="text-sm text-negative">{localError}</p>}
      {typeDialog && (
        <ConfirmDialog
          title={a.isSuperAdmin ? 'Make normal admin?' : 'Make super admin?'}
          message={a.isSuperAdmin
            ? `${a.username} will lose access to everything except the ledgers, loans and pages you give them afterwards. They are signed out and must sign in again.`
            : `${a.username} will get every ledger, loan and page and can manage other admins. They are signed out and must sign in again.`}
          confirmLabel={a.isSuperAdmin ? 'Make normal admin' : 'Make super admin'}
          busy={busy} onConfirm={changeType} onCancel={() => setTypeDialog(false)} />
      )}
      <StampFooter className="!mt-0" extra={a.lastLoginAt ? `Last sign-in ${new Date(a.lastLoginAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''} />
    </article>
  );
}

function LedgersPanel() {
  const { books, selectBook, reloadBooks } = useBooks();
  const [creating, setCreating] = useState(false);
  const [reactivating, setReactivating] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [disabling, setDisabling] = useState(null);
  const [editing, setEditing] = useState(null);
  const { account: me } = useAuth();
  const { hidden, toggle: toggleHiddenLedger } = useHiddenLedgers();
  const reactivate = async () => {
    setBusy(true); setErr('');
    try {
      await api.put(`/books/${reactivating.id}/active`, { active: true });
      await reloadBooks();
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false); setReactivating(null);
    }
  };
  const disable = async () => {
    setBusy(true); setErr('');
    try {
      await api.put(`/books/${disabling.id}/active`, { active: false });
      const next = books.find(b => b.id !== disabling.id && b.active !== false);
      await reloadBooks(next?.id);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false); setDisabling(null);
    }
  };
  const removeLedger = async () => {
    setBusy(true); setErr('');
    try {
      await api.delete(`/books/${deleting.id}`, { params: { confirm: deleting.name } });
      const next = books.find(b => b.id !== deleting.id && b.active !== false);
      await reloadBooks(next?.id);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false); setDeleting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{books.length} {books.length === 1 ? 'ledger' : 'ledgers'}. Pick one to open it.</p>
        <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>New ledger</button>
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {books.map(b => (
          <li key={b.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">
                {b.name}
                {b.active === false && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle text-xs font-normal text-muted-foreground">Inactive</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">ID {b.id}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Base currency <span className="rounded bg-muted px-1.5 py-0.5 font-semibold text-foreground"><CurrencyLabel code={b.baseCurrency} /></span>
            </p>
            <div className="space-y-2">
              <Toggle compact label="Active" checked={b.active !== false}
                onChange={on => (on ? setReactivating(b) : setDisabling(b))} />
              <p className="text-xs text-muted-foreground">{b.active === false ? 'Hidden from its members. Switch on to bring it back.' : 'Visible to its members. Switch off to hide it; nothing is deleted.'}</p>
              {b.active !== false && (
                <>
                  <DefaultLedger key={`dl${b.id}`} bookId={b.id} compact />
                  <p className="text-xs text-muted-foreground">Personal: this ledger opens first when you sign in.</p>
                  <Toggle compact label="Show in ledger switcher" checked={!hidden.includes(b.id)} onChange={() => toggleHiddenLedger(b.id)} />
                  <p className="text-xs text-muted-foreground">Personal, kept in this browser. The open ledger always shows.</p>
                </>
              )}
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
              <button type="button" className={btnSm} onClick={() => { selectBook(b.id); window.location.hash = '#/'; }}>Open</button>
              <button type="button" className={btnSm} onClick={() => setEditing(b)}>Edit</button>
              <button type="button" className={btnSmDanger} onClick={() => setDeleting(b)}>Delete</button>
            </div>
            <StampFooter className="!mt-0" createdAt={b.createdAt} updatedAt={b.updatedAt} />
          </li>
        ))}
      </ul>

      {err && <p role="alert" className="rounded-lg bg-muted px-3 py-2 text-sm text-negative">{err}</p>}
      {editing && books.find(b => b.id === editing.id) && (
        <Modal title={`Edit ledger: ${books.find(b => b.id === editing.id).name}`} onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Details key={editing.id} book={books.find(b => b.id === editing.id)} reloadBooks={reloadBooks} />
            <Members bookId={editing.id} selfId={me?.id} />
          </div>
        </Modal>
      )}
      <p className="text-xs text-muted-foreground">Switching Active off hides a ledger from its members. Nothing is deleted, and switching it on brings it back. Delete removes the ledger for good, with all its entries, documents and settings.</p>
      {disabling && (
        <ConfirmDialog
          title="Disable ledger?"
          message={`${disabling.name} will disappear from the side panel and from its members. Nothing is deleted: you can enable it again here.`}
          confirmLabel="Disable"
          busy={busy}
          onConfirm={disable}
          onCancel={() => setDisabling(null)}
        />
      )}
      {reactivating && (
        <ConfirmDialog
          title="Enable ledger?"
          message={`${reactivating.name} will be visible again to its members.`}
          confirmLabel="Enable"
          confirmText={reactivating.name}
          busy={busy}
          onConfirm={reactivate}
          onCancel={() => setReactivating(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete ledger?"
          message={`${deleting.name} will be permanently deleted with all its entries, documents (and their files), projects, funds, people and settings. This cannot be undone. Take a backup first if you may need any of it. To hide it without deleting, switch Active off instead.`}
          confirmLabel="Delete"
          confirmText={deleting.name}
          tone="danger"
          busy={busy}
          onConfirm={removeLedger}
          onCancel={() => setDeleting(null)}
        />
      )}

      {creating && <NewLedgerModal onClose={() => setCreating(false)} />}
    </div>
  );
}
