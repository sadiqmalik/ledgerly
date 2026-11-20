import { useState } from 'react';
import { PALETTES, getDefaultPalette, getPersonalPalette, getEffectivePalette, applyEffectivePalette, storeDefaultPalette, storePersonalPalette } from '../../theme';
import { getDefaultListView, getPersonalListView, applyEffectiveListView, storeDefaultListView, storePersonalListView } from '../../hooks/useListView';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../services/dataAPI';

// Small token-coloured previews for the list layout choices.
function CardsPreview() {
  return (
    <svg viewBox="0 0 96 56" aria-hidden="true" className="h-14 w-full">
      {[[4, 4], [50, 4], [4, 30], [50, 30]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="42" height="22" rx="4" className="fill-card stroke-border" strokeWidth="1" />
          <circle cx={x + 8} cy={y + 8} r="3" className="fill-accent" />
          <rect x={x + 14} y={y + 6} width="20" height="3" rx="1.5" className="fill-foreground" />
          <rect x={x + 8} y={y + 15} width="28" height="2" rx="1" className="fill-muted-foreground" />
        </g>
      ))}
    </svg>
  );
}

function TablePreview() {
  return (
    <svg viewBox="0 0 96 56" aria-hidden="true" className="h-14 w-full">
      <rect x="4" y="4" width="88" height="48" rx="4" className="fill-card stroke-border" strokeWidth="1" />
      <rect x="4" y="4" width="88" height="9" rx="4" className="fill-muted" />
      <rect x="9" y="7.5" width="18" height="2" rx="1" className="fill-muted-foreground" />
      <rect x="40" y="7.5" width="12" height="2" rx="1" className="fill-muted-foreground" />
      <rect x="70" y="7.5" width="14" height="2" rx="1" className="fill-muted-foreground" />
      {[20, 31, 42].map(y => (
        <g key={y}>
          <line x1="4" x2="92" y1={y} y2={y} className="stroke-border" strokeWidth="1" />
          <rect x="9" y={y + 4} width="22" height="2.5" rx="1" className="fill-foreground" />
          <rect x="40" y={y + 4} width="14" height="2.5" rx="1" className="fill-muted-foreground" />
          <rect x="70" y={y + 4} width="14" height="2.5" rx="1" className="fill-foreground" />
        </g>
      ))}
    </svg>
  );
}

const LIST_LAYOUTS = [
  { key: 'cards', label: 'Cards', Preview: CardsPreview },
  { key: 'table', label: 'Table', Preview: TablePreview },
];

const optionCls = (on, enabled, layout = 'items-center gap-3') =>
  `flex ${layout} rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${on ? 'border-accent bg-accent/10' : 'border-border bg-background'} ${enabled ? (on ? '' : 'hover:bg-muted') : 'cursor-not-allowed opacity-70'}`;

const labelOf = (list, key) => list.find(o => o.key === key)?.label;

function PalettePicker({ label, value, enabled, onPick }) {
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={!enabled} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {PALETTES.map(p => {
        const on = value === p.key;
        return (
          <button key={p.key} type="button" role="radio" aria-checked={on} aria-disabled={!enabled}
            onClick={enabled ? () => onPick(p.key) : undefined}
            className={optionCls(on, enabled)}>
            <span className="size-8 shrink-0 rounded-full border border-border" style={{ background: p.swatch }} aria-hidden="true" />
            <span className="text-sm font-medium">{p.label}</span>
            {on && <span className="ml-auto text-xs font-normal text-accent">Selected</span>}
          </button>
        );
      })}
    </div>
  );
}

function LayoutPicker({ label, value, enabled, onPick }) {
  return (
    <div role="radiogroup" aria-label={label} aria-disabled={!enabled} className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
      {LIST_LAYOUTS.map(({ key, label: text, Preview }) => {
        const on = value === key;
        return (
          <button key={key} type="button" role="radio" aria-checked={on} aria-disabled={!enabled}
            onClick={enabled ? () => onPick(key) : undefined}
            className={optionCls(on, enabled, 'flex-col gap-2')}>
            <Preview />
            <span className="flex w-full items-center gap-2 text-sm font-medium">
              {text}
              {on && <span className="ml-auto text-xs font-normal text-accent">Selected</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// A picker plus its "Use ledger default" button and a note naming the current ledger default.
function PersonalBlock({ title, help, children, hasOverride, onReset, defaultLabel }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-medium">{title}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{help}</p>
        </div>
        <button type="button" onClick={onReset} disabled={!hasOverride}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Use ledger default
        </button>
      </div>
      {children}
      <p className="mt-3 text-xs text-muted-foreground">
        Ledger default: {defaultLabel}{hasOverride ? ' (you are using your own choice)' : ' (you are using it)'}
      </p>
    </div>
  );
}

// Appearance settings in two layers. "My appearance" is personal (saved per account in this browser) and wins over
// "Ledger default", which only an administrator can change; the default applies to everyone who has not chosen their own.
export default function AppearanceTab({ bookId, canEdit }) {
  const { account } = useAuth();
  const accountId = account?.id;
  const [, bump] = useState(0);
  const refresh = () => bump(n => n + 1);
  const [error, setError] = useState('');

  const defaultPalette = getDefaultPalette();
  const defaultView = getDefaultListView();
  const personalPalette = getPersonalPalette(accountId);
  const personalView = getPersonalListView(accountId);
  const effectivePalette = getEffectivePalette(accountId);
  const effectiveView = personalView || defaultView || 'cards';

  const reapply = () => { applyEffectivePalette(accountId); applyEffectiveListView(accountId); refresh(); };

  const pickMyPalette = key => { storePersonalPalette(accountId, key); reapply(); };
  const resetMyPalette = () => { storePersonalPalette(accountId, null); reapply(); };
  const pickMyView = key => { storePersonalListView(accountId, key); reapply(); };
  const resetMyView = () => { storePersonalListView(accountId, null); reapply(); };

  // Ledger default: optimistic, rolled back if saving fails. Only changes the look for users without a personal choice.
  const saveDefault = async (patch, store, previous, failure) => {
    setError('');
    store(Object.values(patch)[0]);
    reapply();
    try {
      await api.put(`/books/${bookId}/appearance`, patch);
    } catch {
      store(previous);
      reapply();
      setError(failure);
    }
  };
  const pickDefaultPalette = key => {
    if (!canEdit || key === (defaultPalette || 'forest')) return;
    saveDefault({ palette: key }, storeDefaultPalette, defaultPalette || 'forest', 'Could not save the ledger default palette. The previous default has been restored.');
  };
  const pickDefaultView = key => {
    if (!canEdit || key === (defaultView || 'cards')) return;
    saveDefault({ listView: key }, storeDefaultListView, defaultView || 'cards', 'Could not save the ledger default list layout. The previous default has been restored.');
  };

  return (
    <div className={`grid items-start gap-6 grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] ${canEdit ? '' : 'max-w-3xl'}`}>
      {error && <div className="alert alert-error col-span-full" role="alert">{error}</div>}

      <section className="space-y-3" aria-labelledby="my-appearance">
        <div>
          <h3 id="my-appearance" className="text-lg font-semibold">My appearance</h3>
          <p className="text-sm text-muted-foreground">Your own choices, saved for your account in this browser. They win over the ledger default. Light and dark mode is separate (sun/moon button in the top bar).</p>
        </div>
        <PersonalBlock title="Colour palette" help="The accent colour of the app."
          hasOverride={!!personalPalette} onReset={resetMyPalette}
          defaultLabel={labelOf(PALETTES, defaultPalette || 'forest')}>
          <PalettePicker label="My colour palette" value={effectivePalette} enabled onPick={pickMyPalette} />
        </PersonalBlock>
        <PersonalBlock title="List layout" help="How Funds, Accounts, Categories and People are listed."
          hasOverride={!!personalView} onReset={resetMyView}
          defaultLabel={labelOf(LIST_LAYOUTS, defaultView || 'cards')}>
          <LayoutPicker label="My list layout" value={effectiveView} enabled onPick={pickMyView} />
        </PersonalBlock>
      </section>

      {canEdit && (
        <section className="space-y-3" aria-labelledby="ledger-default">
          <div>
            <h3 id="ledger-default" className="text-lg font-semibold">Ledger default (administrators)</h3>
            <p className="text-sm text-muted-foreground">
              The default look for everyone on this ledger who has not chosen their own.
              {' Changing it does not affect people with a personal choice.'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="font-medium">Default colour palette</h4>
            <PalettePicker label="Ledger default colour palette" value={defaultPalette || 'forest'} enabled onPick={pickDefaultPalette} />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="font-medium">Default list layout</h4>
            <LayoutPicker label="Ledger default list layout" value={defaultView || 'cards'} enabled onPick={pickDefaultView} />
          </div>
        </section>
      )}
    </div>
  );
}
