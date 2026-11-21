import React, { useState } from 'react';
import FundDot from '../common/FundDot';
import Modal from '../common/Modal';
import CurrencySelect from '../common/CurrencySelect';
import { api } from '../../services/dataAPI';
import { errorMessage } from '../common/format';
import { currencyColor, currencyRowStyle } from '../../utils/currencyStyle';
import { useCurrencies } from '../../hooks/CurrencyContext';
import { useLedger } from '../../hooks/LedgerContext';
import Amount from '../common/Amount';
import { Card, Skeleton, Empty, Badge, pct, tint } from './ui';
import Chart from './Chart';
import Select from '../common/Select';

const bal = n => `tabular-nums font-medium ${n < 0 ? 'text-negative' : ''}`;

// Heading of one half of the Funds card: the name and its total.
const FundsHeading = ({ label, total, base }) => (
  <h3 className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    <span>{label}</span>
    {total != null && <span className="text-sm normal-case tabular-nums text-foreground"><Amount minor={total} currency={base} /></span>}
  </h3>
);

function UsableBody({ groups, holders, view }) {
  const { fundById } = useLedger();
  if (!groups) return <Skeleton lines={3} />;
  if (!groups.usable.length) return <Empty>No usable funds.</Empty>;
  const positive = groups.usable.filter(f => f.balance > 0);
  return (
    <>
      {view !== 'list' && positive.length > 0 && (
        <Chart view={view} currency={groups.base} centerLabel="Usable" size={150} ariaLabel={`Usable funds, ${groups.base}`}
          segments={positive.map((f, i) => ({ id: f.id, label: f.name, value: f.balance, color: tint('usable', i) }))} />
      )}
      <ul style={{ listStyle: 'none' }} className={`divide-y divide-border ${view !== 'list' && positive.length > 0 ? 'mt-3 border-t border-border' : ''}`}>
        {(view !== 'list' && positive.length > 0 ? groups.usable.filter(f => f.balance <= 0) : groups.usable).map(f => (
          <li key={f.id} className="flex items-center gap-2 py-2">
            <FundDot color={fundById(f.id)?.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{f.name}</span>
              {holders[f.holderId] && <span className="block truncate text-xs text-muted-foreground">{holders[f.holderId]}</span>}
            </span>
            <span className={bal(f.balance)}><Amount minor={f.balance} currency={f.currency} /></span>
          </li>
        ))}
      </ul>
    </>
  );
}

function ReservedBody({ groups, view }) {
  const { fundById } = useLedger();
  const [showEmpty, setShowEmpty] = useState(false);
  if (!groups) return <Skeleton lines={4} />;
  const sorted = [...groups.reserved].sort((a, b) => b.balance - a.balance);
  const empty = sorted.filter(f => f.balance === 0);
  const list = showEmpty ? sorted : sorted.filter(f => f.balance !== 0);
  if (!sorted.length) return <Empty>No reserved funds.</Empty>;
  if (view !== 'list' && sorted.some(f => f.balance > 0)) {
    return (
      <Chart view={view} currency={groups.base} centerLabel="Reserved" size={150} ariaLabel={`Reserved funds, ${groups.base}`}
        segments={sorted.filter(f => f.balance > 0).map((f, i) => ({ id: f.id, label: f.name, value: f.balance, color: tint('reserved', i) }))} />
    );
  }
  return (
    <>
      <ul style={{ listStyle: 'none' }} className="flex flex-col gap-3">
        {list.map(f => (
          <li key={f.id}>
            <div className="flex items-center gap-2">
              <FundDot color={fundById(f.id)?.color} />
              <span className="min-w-0 truncate text-sm font-medium">{f.name}</span>
              <Badge>Reserved</Badge>
              <span className={`ml-auto ${bal(f.balance)}`}><Amount minor={f.balance} currency={f.currency} /></span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted" role="img" aria-label={`${pct(f.balance, groups.reservedTotal)}% of reserved`}>
              <div className="h-full rounded" style={{ width: `${Math.min(100, pct(f.balance, groups.reservedTotal))}%`, background: tint('reserved', 0) }} />
            </div>
          </li>
        ))}
      </ul>
      {empty.length > 0 && (
        <button type="button" className="mt-3 text-sm underline text-muted-foreground" style={{ background: 'transparent', border: 0, padding: 0 }}
          aria-expanded={showEmpty} onClick={() => setShowEmpty(s => !s)}>
          {showEmpty ? 'hide empty' : `show empty (${empty.length})`}
        </button>
      )}
      {!list.length && <Empty>All reserved funds are empty.</Empty>}
    </>
  );
}

// Usable and Reserved funds in one card, side by side on a wide screen.
export function Funds({ groups, holders, view = 'list' }) {
  return (
    <Card title="Funds" id="d-funds" wide>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        <div className="min-w-0">
          <FundsHeading label="Usable" total={groups?.usableTotal} base={groups?.base} />
          <UsableBody groups={groups} holders={holders} view={view} />
        </div>
        <div className="min-w-0">
          <FundsHeading label="Reserved" total={groups?.reservedTotal} base={groups?.base} />
          <ReservedBody groups={groups} view={view} />
        </div>
      </div>
    </Card>
  );
}

function AddWalletModal({ base, holders, onClose, onDone }) {
  const { book } = useLedger();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [holderId, setHolderId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bad = currency.length !== 3 || currency === base;
  const submit = async e => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api.post(`/books/${book.id}/funds`, { name: name.trim(), kind: 'general', currency, holderId: holderId || null });
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Could not add the wallet.'));
      setBusy(false);
    }
  };
  return (
    <Modal title="Add wallet" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1 text-sm">Name
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus placeholder="e.g. USD savings" />
        </label>
        <label className="flex flex-col gap-1 text-sm">Currency
          <CurrencySelect value={currency} onChange={setCurrency} />
          <span className="text-xs text-muted-foreground">Must differ from the base currency ({base}).</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">Account (optional)
          <Select value={holderId} onChange={e => setHolderId(e.target.value)}>
            <option value="">None</option>
            {Object.entries(holders || {}).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </Select>
        </label>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || bad}>Add wallet</button>
        </div>
      </form>
    </Modal>
  );
}

// Foreign-currency funds, grouped by currency (subtotal when a currency has more than one wallet).
export function Wallets({ groups, holders }) {
  const { fundById, role, notifyChanged, can } = useLedger();
  const { name, label } = useCurrencies();
  const [adding, setAdding] = useState(false);
  const byCur = {};
  (groups ? groups.wallets : []).forEach(f => { (byCur[f.currency] = byCur[f.currency] || []).push(f); });
  const curs = Object.keys(byCur).sort();
  return (
    <Card title="Wallets" id="d-wallets"
      action={role === 'admin' && can('settings') && groups && <button type="button" className="btn px-2 py-1 text-sm" onClick={() => setAdding(true)}>Add wallet</button>}>
      {!groups ? <Skeleton lines={2} /> : !curs.length ? <Empty>No foreign-currency wallets.</Empty> : (
        <div className="flex flex-col gap-4">
          {curs.map(c => {
            const list = byCur[c];
            return (
              <div key={c}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide text-white dark:text-black" style={{ background: currencyColor(c) }}>{label(c)}</span>
                  <span className="text-xs text-muted-foreground">{name(c)}</span>
                  {list.length > 1 && (
                    <span className="ml-auto text-sm text-muted-foreground">Subtotal <span className={bal(list.reduce((s, f) => s + f.balance, 0))}><Amount minor={list.reduce((s, f) => s + f.balance, 0)} currency={c} /></span></span>
                  )}
                </div>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" style={{ listStyle: 'none' }}>
                  {list.map(f => (
                    <li key={f.id} className="rounded-md border border-border p-3" style={currencyRowStyle(f.currency, groups.base)}>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground"><FundDot color={fundById(f.id)?.color} /><span className="truncate">{f.name}</span></div>
                      <div className={`mt-1 text-lg font-semibold ${bal(f.balance)}`}><Amount minor={f.balance} currency={f.currency} /></div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {adding && <AddWalletModal base={groups.base} holders={holders} onClose={() => setAdding(false)} onDone={() => { setAdding(false); notifyChanged(); }} />}
    </Card>
  );
}

// Memo funds are tracked only. Negatives are shown plainly, not as alarms.
export function Memo({ groups }) {
  const [open, setOpen] = useState(false);
  const list = groups ? groups.memo : [];
  return (
    <Card title="Memo" id="d-memo" wide
      action={groups && list.length > 0 && (
        <button type="button" className="btn px-2 py-1 text-sm" aria-expanded={open} aria-controls="d-memo-body" onClick={() => setOpen(o => !o)}>
          {open ? 'Hide' : `Show (${list.length})`}
        </button>
      )}>
      <p className="text-xs text-muted-foreground">Tracked separately; not part of your money.</p>
      {!groups && <Skeleton lines={2} className="mt-2" />}
      {groups && open && (
        <table id="d-memo-body" className="mt-2 w-full text-sm">
          <thead><tr className="border-b border-border text-left text-muted-foreground"><th className="py-1 font-medium">Name</th><th className="text-right font-medium">Balance</th></tr></thead>
          <tbody>
            {list.map(f => (
              <tr key={f.id} className="border-b border-border">
                <td className="py-1.5">{f.name}</td>
                <td className="text-right tabular-nums"><Amount minor={f.balance} currency={f.currency} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
