import { useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useAuth } from '../../auth/AuthContext';
import { useBooks } from '../../hooks/BooksContext';
import CurrencySelect from '../common/CurrencySelect';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { useResource, Field, inputCls, btnPrimary, btnSecondary, Toggle } from './ui';
import { getDefaultLedger, setDefaultLedger } from '../../utils/defaultLedger';
import CurrencyLabel from '../common/CurrencyLabel';
import Select from '../common/Select';
import { hasResource } from '../../auth/resources.mjs';
import useLoanRegisters from '../loans/useLoanRegisters';

// Compact danger button for the small cards in the Members grid.
const btnSmDanger = 'rounded-md border border-negative px-2 py-1 text-xs font-medium text-negative hover:bg-muted disabled:opacity-50';

export function Details({ book, reloadBooks }) {
  const [name, setName] = useState(book.name);
  const [currency, setCurrency] = useState(book.baseCurrency);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const save = async e => {
    e.preventDefault();
    setMsg(''); setErr('');
    try {
      await api.put(`/books/${book.id}`, { name: name.trim(), baseCurrency: currency });
      await reloadBooks();
      setMsg('Saved.');
    } catch (ex) {
      setErr(ex.response?.status === 409
        ? `${errorMessage(ex)} (The base currency cannot change once the ledger has entries.)`
        : errorMessage(ex, 'Could not save.'));
    }
  };
  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-medium">Details</h3>
      <Field label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} required /></Field>
      <Field label="Base currency">
        <CurrencySelect className={inputCls} value={currency} onChange={setCurrency} />
      </Field>
      <p className="text-xs text-muted-foreground">
        The base currency (<CurrencyLabel code={book.baseCurrency} />) is used for totals, reports and projects. Funds in other currencies are wallets and are shown in their own currency.
        {' '}It cannot be changed once the ledger has entries.
      </p>
      {err && <p role="alert" className="text-sm text-negative">{err}</p>}
      {msg && <p role="status" className="text-sm text-positive">{msg}</p>}
      <button type="submit" className={btnPrimary} disabled={!name.trim() || currency.length !== 3}>Save</button>
    </form>
  );
}

export function Members({ bookId, selfId }) {
  const { data, error, loading, reload } = useResource(`/books/${bookId}/members`);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [err, setErr] = useState('');
  const [pendingRemove, setPendingRemove] = useState(null); // member awaiting confirmation
  const [removing, setRemoving] = useState(false);

  const run = async fn => {
    setErr('');
    try { await fn(); reload(); } catch (ex) { setErr(errorMessage(ex)); }
  };
  const setRoleOf = (id, r) => run(() => api.put(`/books/${bookId}/members/${id}`, { role: r }));
  const remove = m => setPendingRemove(m);
  const confirmRemove = async () => {
    const m = pendingRemove;
    setRemoving(true);
    await run(() => api.put(`/books/${bookId}/members/${m.accountId}`, { role: null }));
    setRemoving(false);
    setPendingRemove(null);
  };
  const add = async e => {
    e.preventDefault();
    setErr('');
    try {
      await api.post(`/books/${bookId}/members`, { email: email.trim(), role });
      setEmail(''); reload();
    } catch (ex) {
      setErr(ex.response?.status === 404 ? 'No account with that username or email: ask a super admin to create it.' : errorMessage(ex));
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-medium">Members</h3>
      {(error || err) && <p role="alert" className="text-sm text-negative">{error || err}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]" style={{ listStyle: 'none' }}>
        {data.map(m => {
          const self = m.accountId === selfId;
          return (
            <li key={m.accountId} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-background p-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{m.name || m.username}{m.disabled ? ' (disabled)' : ''}{m.isSuperAdmin ? ' (super admin)' : ''}</div>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                  <dt className="text-muted-foreground">User</dt>
                  <dd className="truncate">{m.username}{m.email ? ` · ${m.email}` : ''}</dd>
                </dl>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <Select aria-label={`Role of ${m.username}`} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs" value={m.role} disabled={self}
                  title={self ? 'You cannot change your own role' : undefined} onChange={e => setRoleOf(m.accountId, e.target.value)}>
                  <option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option>
                </Select>
                <button type="button" className={btnSmDanger} disabled={self} onClick={() => remove(m)}>Remove</button>
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1" style={{ minWidth: '12rem' }}>
          <Field label="Add member by username or email">
            <input className={inputCls} value={email} onChange={e => setEmail(e.target.value)} required placeholder="username or name@example.com" autoCapitalize="none" spellCheck={false} />
          </Field>
        </div>
        <Select aria-label="Role" className="rounded-md border border-border bg-background px-2 py-2 text-sm" value={role} onChange={e => setRole(e.target.value)}>
          <option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option>
        </Select>
        <button type="submit" className={btnSecondary} disabled={!email.trim()}>Add</button>
      </form>
      {pendingRemove && (
        <ConfirmDialog
          title="Remove member?"
          message={`Remove ${pendingRemove.name || pendingRemove.email} from this ledger?`}
          confirmLabel="Remove"
          tone="danger"
          busy={removing}
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}

// Personal choice: open this ledger first when I sign in (this browser).
export function DefaultLedger({ bookId, compact = false }) {
  const { account } = useAuth();
  const id = String(account?.id || '');
  const [isDefault, setIsDefault] = useState(() => getDefaultLedger(id) === bookId);
  // Only one ledger is the default: every switch re-reads when another one is turned on.
  useEffect(() => {
    const sync = () => setIsDefault(getDefaultLedger(id) === bookId);
    window.addEventListener('ledger:default-changed', sync);
    return () => window.removeEventListener('ledger:default-changed', sync);
  }, [id, bookId]);
  if (!id) return null;
  return <Toggle compact={compact} label="Open when I sign in" hint="Personal, kept in this browser. Turn it on in another ledger to change it." checked={isDefault} onChange={on => { setDefaultLedger(id, on ? bookId : null); setIsDefault(on); window.dispatchEvent(new Event('ledger:default-changed')); }} />;
}

const count = r => (Array.isArray(r.data) ? r.data.length : null);

// Settings > Details: a read-only summary of this ledger. Editing, Active, the sign-in default and the switcher list are
// on the Administration page (super administrators).
export function DetailsTab({ bookId }) {
  const { books } = useBooks();
  const { account } = useAuth();
  const { registers } = useLoanRegisters();
  const book = books.find(b => b.id === bookId);
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    let live = true;
    setCounts(null);
    const one = (key, can) => (can ? api.get(`/books/${bookId}/${key}`).then(count).catch(() => null) : Promise.resolve(null));
    Promise.all([
      one('projects', hasResource(account, 'projects')),
      one('documents', hasResource(account, 'documents')),
      one('items', hasResource(account, 'items')),
    ]).then(([projects, documents, items]) => { if (live) setCounts({ projects, documents, items }); });
    return () => { live = false; };
  }, [bookId, account]);
  if (!book) return null;
  const isDefault = getDefaultLedger(String(account?.id || '')) === book.id;
  const loans = hasResource(account, 'loans') && registers ? registers.filter(r => !r.bookId || r.bookId === book.id).length : null;
  const facts = [
    ['Name', book.name],
    ['Base currency', <CurrencyLabel key="c" code={book.baseCurrency} />],
    ['Status', book.active === false ? 'Inactive' : 'Active'],
    ['Opens at sign-in', isDefault ? 'Yes' : 'No'],
    ['Projects', counts?.projects], ['Loans', loans], ['Documents', counts?.documents], ['Items', counts?.items],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className="font-medium">Details</h3>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-background px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {account?.isSuperAdmin && <p className="text-xs text-muted-foreground">To rename this ledger, change its currency, switch it off, make it the sign-in default or hide it from the switcher, use Administration &gt; All ledgers.</p>}
    </div>
  );
}

// Settings > Members: who can use this ledger and with which role (ledger admins only).
export function MembersTab({ bookId }) {
  const { account } = useAuth();
  return <div className="w-full max-w-3xl"><Members bookId={bookId} selfId={account?.id} /></div>;
}

export default DetailsTab;
