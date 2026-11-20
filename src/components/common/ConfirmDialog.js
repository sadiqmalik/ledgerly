import React, { useState } from 'react';
import Modal from './Modal';

// In-app confirmation built on Modal. Cancel and Esc/backdrop call onCancel; Confirm calls onConfirm.
// While busy, both buttons are disabled and Esc/backdrop cannot dismiss the dialog.
// Footer: Cancel left, confirm right on desktop; stacked full-width with confirm on top on phones.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'default',
  busy = false,
  confirmText,
  confirmTextLabel,
  onConfirm,
  onCancel
}) {
  const cancel = () => { if (!busy && onCancel) onCancel(); };
  // Optional typed confirmation: the input starts empty each time the dialog opens (it mounts on open).
  const [typed, setTyped] = useState('');
  const needsText = typeof confirmText === 'string' && confirmText !== '';
  const matched = !needsText || typed.trim() === confirmText;
  const submit = () => { if (!busy && matched && onConfirm) onConfirm(); };

  return (
    <Modal title={title} onClose={cancel}>
      <div className="space-y-3">
        <div className="text-sm">{message}</div>
        {needsText && (
          <label className="block space-y-1 text-sm">
            <span>{confirmTextLabel || <>Type <strong>{confirmText}</strong> to confirm</>}</span>
            <input
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              value={typed}
              autoFocus
              autoComplete="off"
              disabled={busy}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
            />
          </label>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn w-full sm:w-auto" onClick={cancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`${tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'} w-full sm:w-auto`}
            onClick={submit}
            disabled={busy || !matched}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
