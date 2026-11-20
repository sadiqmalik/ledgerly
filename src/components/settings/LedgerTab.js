import { useState } from 'react';
import { api } from '../../services/dataAPI';
import { useAuth } from '../../auth/AuthContext';
import { useBooks } from '../../hooks/BooksContext';
import CurrencySelect from '../common/CurrencySelect';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { useResource, Field, inputCls, btnPrimary, btnDanger, btnSecondary } from './ui';
import CurrencyLabel from '../common/CurrencyLabel';

// Compact danger button for the small cards in the Members grid.
const btnSmDanger = 'rounded-md border border-negative px-2 py-1 text-xs font-medium text-negative hover:bg-muted disabled:opacity-50';

function Details({ book, reloadBooks }) {
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

function Members({ bookId, selfId }) {
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
      setErr(ex.response?.status === 404 ? 'No account with that email — ask a super admin to create it.' : errorMessage(ex));
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
                <div className="truncate text-sm font-semibold">{m.name || m.email}{m.disabled ? ' (disabled)' : ''}{m.isSuperAdmin ? ' (super admin)' : ''}</div>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate">{m.email}</dd>
                </dl>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <select aria-label={`Role of ${m.email}`} className="rounded-md border border-border bg-background px-1.5 py-1 text-xs" value={m.role} disabled={self}
                  title={self ? 'You cannot change your own role' : undefined} onChange={e => setRoleOf(m.accountId, e.target.value)}>
                  <option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option>
                </select>
                <button type="button" className={btnSmDanger} disabled={self} onClick={() => remove(m)}>Remove</button>
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1" style={{ minWidth: '12rem' }}>
          <Field label="Add member by email">
            <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} required placeholder="name@example.com" />
          </Field>
        </div>
        <select aria-label="Role" className="rounded-md border border-border bg-background px-2 py-2 text-sm" value={role} onChange={e => setRole(e.target.value)}>
          <option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option>
        </select>
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

// One box for both directions: deactivate an active ledger, reactivate an inactive one (only a super administrator
// still sees an inactive ledger, and only they may reactivate it).
function DeactivateLedger({ book, books, reloadBooks }) {
  const inactive = book.active === false;
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setErr(''); setBusy(true);
    try {
      await api.put(`/books/${book.id}/active`, { active: inactive });
      if (inactive) await reloadBooks(book.id);
      else {
        const next = books.find(b => b.id !== book.id && b.active !== false);
        await reloadBooks(next?.id);
      }
    } catch (ex) {
      setErr(errorMessage(ex, inactive ? 'Could not reactivate the ledger.' : 'Could not deactivate the ledger.'));
    } finally {
      setBusy(false); setConfirming(false);
    }
  };
  const verb = inactive ? 'Reactivate' : 'Deactivate';
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <h3 className={`font-medium ${inactive ? 'text-foreground' : 'text-negative'}`}>{inactive ? 'Ledger is inactive' : 'Deactivate ledger'}</h3>
      <p className="text-sm text-muted-foreground">
        {inactive
          ? 'This ledger is hidden from everyone except super administrators. Reactivate it to make it available to its members again.'
          : 'Deactivating hides this ledger from everyone. Nothing is deleted and no data is lost. Only a super administrator can reactivate it.'}
      </p>
      {err && <p role="alert" className="text-sm text-negative">{err}</p>}
      <button type="button" className={inactive ? btnPrimary : btnDanger} onClick={() => setConfirming(true)}>{verb} ledger</button>
      {confirming && (
        <ConfirmDialog
          title={`${verb} ledger?`}
          message={inactive
            ? `${book.name} will be available to its members again.`
            : `${book.name} will be hidden from everyone. No data is deleted; a super administrator can reactivate it.`}
          confirmLabel={`${verb} ledger`}
          confirmText={book.name}
          tone={inactive ? 'default' : 'danger'}
          busy={busy}
          onConfirm={toggle}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function ReadOnlyDetails({ book }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <h3 className="font-medium">Details</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Name</dt><dd>{book.name}</dd>
        <dt className="text-muted-foreground">Base currency</dt><dd><CurrencyLabel code={book.baseCurrency} /></dd>
      </dl>
    </div>
  );
}

export default function LedgerTab({ bookId, canEdit }) {
  const { account } = useAuth();
  const { books, reloadBooks } = useBooks();
  const book = books.find(b => b.id === bookId);
  if (!book) return null;
  if (!canEdit) return <div className="max-w-xl"><ReadOnlyDetails book={book} /></div>;
  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)_minmax(0,22rem)]">
      <Details key={`${book.id}:${book.name}:${book.baseCurrency}`} book={book} reloadBooks={reloadBooks} />
      <Members bookId={bookId} selfId={account?.id} />
      <DeactivateLedger key={book.id} book={book} books={books} reloadBooks={reloadBooks} />
    </div>
  );
}
