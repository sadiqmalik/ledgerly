import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PALETTES, getEffectivePalette, getPersonalPalette, applyEffectivePalette, storePersonalPalette } from '../../theme';
import { getEffectiveListView, getPersonalListView, applyEffectiveListView, storePersonalListView } from '../../hooks/useListView';
import { useAuth } from '../../auth/AuthContext';

// Quick personal appearance control for the top bar, so people signed in with an access code (who may not be able
// to open Settings) can change their palette and list layout. Personal only: nothing is sent to the server.
// Saves exactly what AppearanceTab saves (store the personal choice, then re-apply the effective value).

const LAYOUTS = [
  { key: 'cards', label: 'Cards' },
  { key: 'table', label: 'Table' },
];

const PANEL_WIDTH = 288;
const GUTTER = 16;

function PaletteIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <circle cx="13.5" cy="6.5" r=".6" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".6" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".6" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".6" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.7-1.7h2c3 0 5.5-2.5 5.5-5.5C22 6 17.5 2 12 2z" />
    </svg>
  );
}

// A group of radio buttons with roving focus: Tab enters the group, arrow keys move and select.
function RadioRow({ label, options, value, onPick, className, buttonClass, renderOption }) {
  const refs = useRef([]);
  const onKeyDown = event => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const current = Math.max(options.findIndex(o => o.key === value), 0);
    const next = (current + step + options.length) % options.length;
    onPick(options[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={className}>
      {options.map((option, index) => {
        const on = option.key === value;
        return (
          <button
            key={option.key}
            ref={el => { refs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={option.label}
            onClick={() => onPick(option.key)}
            className={buttonClass(on)}
          >
            {renderOption(option, on)}
          </button>
        );
      })}
    </div>
  );
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export default function AppearanceMenu() {
  const { account } = useAuth();
  const accountId = account?.id;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [, bump] = useState(0);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();

  const refresh = () => bump(n => n + 1);

  // Opens below the button, right-aligned to it, and clamped so the panel stays inside the viewport.
  const place = useCallback(() => {
    const button = triggerRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - GUTTER * 2);
    const left = Math.min(Math.max(rect.right - width, GUTTER), window.innerWidth - GUTTER - width);
    setPos({ top: rect.bottom + 8, left, width });
  }, []);

  const openMenu = () => { place(); setOpen(true); };

  // While open: Escape closes and returns focus to the button, an outside press closes, resizing repositions.
  // Focus moves to the current palette so keyboard users land inside the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = event => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', place);
    panelRef.current?.querySelector('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const palette = getEffectivePalette(accountId);
  const layout = getEffectiveListView(accountId);
  const hasOverride = Boolean(getPersonalPalette(accountId) || getPersonalListView(accountId));
  const paletteLabel = PALETTES.find(p => p.key === palette)?.label || '';

  const pickPalette = key => {
    storePersonalPalette(accountId, key);
    applyEffectivePalette(accountId);
    refresh();
  };
  const pickLayout = key => {
    storePersonalListView(accountId, key);
    applyEffectiveListView(accountId);
    refresh();
  };
  const useLedgerDefaults = () => {
    storePersonalPalette(accountId, null);
    storePersonalListView(accountId, null);
    applyEffectivePalette(accountId);
    applyEffectiveListView(accountId);
    refresh();
    // The button is disabled now, so move focus to the palette group instead of losing it.
    panelRef.current?.querySelector('[aria-checked="true"]')?.focus();
  };

  const paletteButton = on => [
    'inline-flex size-9 items-center justify-center rounded-full transition-shadow motion-reduce:transition-none',
    focusRing,
    on ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : 'hover:ring-2 hover:ring-border',
  ].join(' ');

  const layoutButton = on => [
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none',
    focusRing,
    on ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  ].join(' ');

  const panel = open && pos ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="Appearance"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
      className="fixed z-50 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-lg"
    >
      <div>
        <h2 id={`${panelId}-palette`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Colour palette</h2>
        <RadioRow
          label="Colour palette"
          options={PALETTES}
          value={palette}
          onPick={pickPalette}
          className="mt-2 grid grid-cols-7 gap-1"
          buttonClass={paletteButton}
          renderOption={(p) => (
            <>
              <span className="size-7 rounded-full border border-border" style={{ background: p.swatch }} aria-hidden="true" />
              <span className="sr-only">{p.label}</span>
            </>
          )}
        />
        <p className="mt-2 text-sm text-foreground">{paletteLabel}</p>
      </div>

      <div>
        <h2 id={`${panelId}-layout`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">List layout</h2>
        <RadioRow
          label="List layout"
          options={LAYOUTS}
          value={layout}
          onPick={pickLayout}
          className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          buttonClass={layoutButton}
          renderOption={(option) => option.label}
        />
      </div>

      <button
        type="button"
        onClick={useLedgerDefaults}
        disabled={!hasOverride}
        className={`rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
      >
        Use ledger defaults
      </button>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Appearance"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Appearance"
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none ${focusRing}`}
      >
        <PaletteIcon />
      </button>
      {panel && createPortal(panel, document.body)}
    </>
  );
}
