import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A button that opens a small popover on hover/focus (mouse), or on tap (touch). Click on a mouse/keyboard
// toggles via onActivate. The popover is portalled and fixed so table overflow never clips it.
export default function ChipShell({ label, title, active, style, className = '', onActivate, children, popover, onOpen, width = 280 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const card = useRef(null);
  const timer = useRef(null);
  const touch = useRef(false);
  const clearTouch = () => { touch.current = false; };

  const clear = () => { clearTimeout(timer.current); };
  const openNow = useCallback(() => { clear(); setOpen(true); if (onOpen) onOpen(); }, [onOpen]);
  const closeNow = useCallback(() => { clear(); setOpen(false); }, []);
  const later = (fn, ms) => { clear(); timer.current = setTimeout(fn, ms); };
  useEffect(() => clear, []);
  // A touch that turned into a scroll never produces a click; forget it so a later keyboard Enter acts normally.
  useEffect(() => {
    window.addEventListener('scroll', clearTouch, true);
    return () => window.removeEventListener('scroll', clearTouch, true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    const h = card.current ? card.current.offsetHeight : 200;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6 + h <= window.innerHeight || r.top - 6 - h < 0;
    setPos({ left, top: below ? r.bottom + 6 : r.top - 6 - h, width: w });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeNow(); if (btn.current) btn.current.focus(); } };
    const onDown = e => { if (!btn.current?.contains(e.target) && !card.current?.contains(e.target)) closeNow(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', closeNow, true);
    window.addEventListener('resize', closeNow);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', closeNow, true);
      window.removeEventListener('resize', closeNow);
    };
  }, [open, closeNow]);

  const stop = e => e.stopPropagation();
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-pressed={active}
        aria-label={label}
        aria-expanded={open}
        title={title}
        className={`inline-flex max-w-full items-center gap-1.5 align-middle border-0 bg-transparent p-0 text-sm leading-tight text-left hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? 'underline decoration-2 font-medium' : ''} ${className}`}
        style={{ ...style, cursor: 'pointer' }}
        onPointerDown={e => { touch.current = e.pointerType === 'touch' || e.pointerType === 'pen'; }}
        onPointerCancel={clearTouch}
        onPointerUp={() => { setTimeout(clearTouch, 400); }}
        onPointerEnter={e => { if (e.pointerType === 'mouse') later(openNow, 250); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') later(closeNow, 180); }}
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) openNow(); }}
        onClick={e => {
          e.stopPropagation();
          if (touch.current) { touch.current = false; if (open) closeNow(); else openNow(); return; }
          closeNow();
          onActivate();
        }}
        onKeyDown={e => { clearTouch(); if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
      >
        {children}
      </button>
      {open && createPortal(
        <div
          ref={card}
          role="group"
          aria-label={`${label} details`}
          className="fixed z-[70] rounded-lg border border-border bg-card p-3 text-sm text-card-foreground shadow-lg"
          style={{ left: pos ? pos.left : -9999, top: pos ? pos.top : 0, width: pos ? pos.width : width }}
          onPointerEnter={clear}
          onPointerLeave={e => { if (e.pointerType === 'mouse') later(closeNow, 180); }}
          onClick={stop}
          onKeyDown={stop}
        >
          {popover(closeNow)}
        </div>,
        document.body
      )}
    </>
  );
}

export const PopRow = ({ k, children }) => (
  <div className="flex justify-between gap-3 py-0.5 text-xs">
    <span className="text-muted-foreground">{k}</span>
    <span className="min-w-0 truncate text-right tabular-nums">{children}</span>
  </div>
);
export const PopAction = ({ onClick, children }) => (
  <button type="button" onClick={onClick}
    className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-border">
    {children}
  </button>
);
