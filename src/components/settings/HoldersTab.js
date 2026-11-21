import { useLedger } from '../../hooks/LedgerContext';
import CrudTab from './CrudTab';
import { Field, Check, inputCls } from './ui';
import { useResource } from './ui';
import Amount from '../common/Amount';
import CurrencySelect from '../common/CurrencySelect';
import CurrencyLabel from '../common/CurrencyLabel';
import Select from '../common/Select';

const KINDS = ['bank', 'cash', 'wallet'];

export default function HoldersTab({ bookId, canEdit }) {
  const { book } = useLedger();
  const funds = useResource(`/books/${bookId}/funds`, { all: true });
  // Sum of each account's funds, per currency (never mixed).
  const totals = id => {
    const by = {};
    funds.data.filter(f => f.holderId === id && !f.archived).forEach(f => { by[f.currency] = (by[f.currency] || 0) + f.balance; });
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b));
  };
  return (
    <CrudTab
      bookId={bookId}
      path="holders"
      label="Account"
      canEdit={canEdit}
      removal="archive"
      countKey="holders"
      countHref={h => {
        const ids = funds.data.filter(f => f.holderId === h.id).map(f => f.id);
        return ids.length ? `#/ledger?fund=${ids.join(',')}&year=all` : null;
      }}
      isArchived={h => !h.active}
      restoreBody={{ active: true }}
      columns={[
        { key: 'name', label: 'Name', primary: true, cell: h => h.name },
        { key: 'kind', label: 'Kind', cell: h => h.kind },
        { key: 'currency', label: 'Currency', cell: h => <CurrencyLabel code={h.currency} /> },
        {
          key: 'balance', label: 'Balance',
          cell: h => {
            const t = totals(h.id);
            return t.length ? t.map(([c, m]) => <div key={c} className="tabular-nums"><Amount minor={m} currency={c} /></div>) : '–';
          },
        },
        { key: 'status', label: 'Status', cell: h => (h.active ? 'Active' : 'Inactive') },
      ]}
      blankDraft={() => ({ name: '', kind: 'bank', currency: book.baseCurrency, active: true })}
      toDraft={h => ({ name: h.name, kind: h.kind, currency: h.currency, active: !!h.active })}
      toPayload={d => ({ name: d.name.trim(), kind: d.kind, currency: d.currency, active: d.active })}
      renderFields={(d, update) => {
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className={inputCls} value={d.name} onChange={e => update({ name: e.target.value })} />
            </Field>
            <Field label="Kind">
              <Select className={inputCls} value={d.kind} onChange={e => update({ kind: e.target.value })}>
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Field label="Currency">
              <CurrencySelect className={inputCls} value={d.currency} onChange={currency => update({ currency })} />
            </Field>
            <div className="self-end pb-2">
              <Check label="Active" checked={d.active} onChange={active => update({ active })} />
            </div>
          </div>
        );
      }}
    />
  );
}
