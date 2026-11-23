import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

// Open modals, oldest first. Only the last one reacts to Escape.
const stack = [];

// Dialog: centred modal on desktop, full-width sheet on phones. `side` makes it a right-hand panel on desktop;
// `bare` leaves out the title bar and its close button: the content draws its own header (with a close button).
// `wide` gives a roomier dialog for long forms (admin users and access codes).
// Focus moves to the first field on open, is trapped inside, and returns to the opener on close.
// A backdrop click asks for confirmation when anything in the form was changed.
export default function Modal({ title, onClose, side = false, wide = false, bare = false, children }) {
  const dialog = useRef(null);
  const dirty = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const token = {};
    stack.push(token);
    const el = dialog.current;
    if (el) {
      const first = el.querySelector(FIELDS) || el.querySelector(FOCUSABLE);
      if (first && !el.contains(document.activeElement)) first.focus();
      else if (!first) { el.tabIndex = -1; el.focus(); }
    }
    const onKey = e => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        // A popover (select, menu) inside the dialog is the topmost layer: let it close first.
        if (el && el.querySelector('[aria-expanded="true"]')) return;
        closeRef.current();
      } else if (e.key === 'Tab' && el) {
        const nodes = Array.from(el.querySelectorAll(FOCUSABLE)).filter(n => n.offsetParent !== null || n === document.activeElement);
        if (!nodes.length) { e.preventDefault(); return; }
        const firstN = nodes[0]; const lastN = nodes[nodes.length - 1];
        if (!el.contains(document.activeElement)) { e.preventDefault(); firstN.focus(); }
        else if (e.shiftKey && document.activeElement === firstN) { e.preventDefault(); lastN.focus(); }
        else if (!e.shiftKey && document.activeElement === lastN) { e.preventDefault(); firstN.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(token);
      if (i >= 0) stack.splice(i, 1);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);

  const backdrop = e => {
    if (e.target !== e.currentTarget) return;
    if (dirty.current && !window.confirm('Discard your changes?')) return;
    onClose();
  };

  return (
    <div className={`fixed inset-0 z-50 flex bg-black/40 ${side ? 'items-end md:items-stretch md:justify-end' : 'items-end md:items-center md:justify-center'}`}
      onMouseDown={backdrop}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={title}
        onInput={() => { dirty.current = true; }}
        className={`bg-card text-card-foreground w-full max-h-[92vh] overflow-y-auto p-4 md:p-5 rounded-t-2xl ${side ? 'md:max-w-md md:max-h-none md:rounded-none md:border-l md:border-border' : `${wide ? 'md:max-w-2xl' : 'md:max-w-lg'} md:rounded-2xl`}`}>
        {!bare && (
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="btn px-2 py-1">&times;</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
