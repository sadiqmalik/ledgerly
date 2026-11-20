import { useLedger } from '../../hooks/LedgerContext';
import Amount from '../common/Amount';
import CurrencySelect from '../common/CurrencySelect';
import CurrencyLabel from '../common/CurrencyLabel';
import CrudTab from './CrudTab';
import { useResource, Field, inputCls } from './ui';

const KINDS = ['general', 'reserved', 'custodial', 'investment', 'memo'];
const DEFAULT_COLOR = '#2f5d50';

export default function FundsTab({ bookId, canEdit }) {
  const { book } = useLedger();
  // All holders, archived included, so every fund's account name can be shown.
  const holders = useResource(`/books/${bookId}/holders`, { all: true });
  const holderName = id => holders.data.find(h => h.id === id)?.name || '';

  return (
    <CrudTab
      bookId={bookId}
      path="funds"
      label="Fund"
      canEdit={canEdit}
      ctx={{ holders: holders.data }}
      removal="archive"
      countKey="funds"
      countHref={f => `#/ledger?fund=${f.id}&year=all`}
      isArchived={f => !!f.archived}
      restoreBody={{ archived: false }}
      columns={[
        {
          key: 'color', label: 'Colour',
          cell: f => (
            <span
              aria-label={f.color ? `Colour ${f.color}` : 'No colour'}
              className="inline-block size-3 rounded-full border border-border"
              style={{ background: f.color || 'transparent' }}
            />
          ),
        },
        { key: 'name', label: 'Name', primary: true, cell: f => f.name },
        { key: 'kind', label: 'Kind', cell: f => f.kind },
        { key: 'reserved', label: 'Reserved', cell: f => (f.isReserved ? 'Yes' : 'No') },
        { key: 'currency', label: 'Currency', cell: f => <CurrencyLabel code={f.currency} /> },
        { key: 'account', label: 'Account', cell: f => holderName(f.holderId) || '-' },
        {
          key: 'balance', label: 'Balance', right: true,
          cell: f => <Amount minor={f.balance} currency={f.currency} />,
        },
      ]}
      blankDraft={() => ({
        name: '', kind: 'general', isReserved: false, currency: book.baseCurrency, holderId: '', color: DEFAULT_COLOR,
      })}
      toDraft={f => ({
        name: f.name,
        kind: f.kind,
        isReserved: !!f.isReserved,
        currency: f.currency,
        holderId: f.holderId || '',
        color: f.color || DEFAULT_COLOR,
      })}
      toPayload={d => ({
        name: d.name.trim(),
        kind: d.kind,
        isReserved: d.isReserved,
        currency: d.currency,
        holderId: d.holderId || null,
        color: d.color,
      })}
      renderFields={(d, update, ctx) => {
        // Inactive holders are only offered when this fund is already linked to one.
        const holderOptions = ctx.holders.filter(h => h.active || h.id === d.holderId);
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input className={inputCls} value={d.name} onChange={e => update({ name: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select className={inputCls} value={d.kind} onChange={e => update({ kind: e.target.value })}>
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Currency">
              <CurrencySelect className={inputCls} value={d.currency} onChange={currency => update({ currency })} />
            </Field>
            <Field label="Account">
              <select className={inputCls} value={d.holderId} onChange={e => update({ holderId: e.target.value })}>
                <option value="">None</option>
                {holderOptions.map(h => (
                  <option key={h.id} value={h.id}>{h.name}{h.active ? '' : ' (inactive)'}</option>
                ))}
              </select>
            </Field>
            <Field label="Colour">
              <input
                type="color"
                className="mt-1 h-10 w-16 cursor-pointer rounded-md border border-border bg-background p-1"
                value={d.color}
                onChange={e => update({ color: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={d.isReserved}
                onChange={e => update({ isReserved: e.target.checked })}
              />
              <span>Reserved fund</span>
            </label>
          </div>
        );
      }}
    />
  );
}
