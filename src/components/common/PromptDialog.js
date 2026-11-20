import React, { useState } from 'react';
import Modal from './Modal';
import { inputCls } from '../settings/ui';

// In-app text prompt built on Modal, the counterpart of ConfirmDialog. Enter submits; Cancel, Esc and backdrop call onCancel.
// validate(value) returns an error message, or '' when the value is acceptable. onSubmit(value) receives the raw value.
// While busy, the field and buttons are disabled and Esc/backdrop cannot dismiss the dialog.
// Footer: Cancel left, confirm right on desktop; stacked full-width with confirm on top on phones.
export default function PromptDialog({
  title,
  message,
  label,
  initialValue = '',
  placeholder,
  confirmLabel = 'OK',
  helpText,
  busy = false,
  validate,
  onSubmit,
  onCancel
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');

  const cancel = () => { if (!busy && onCancel) onCancel(); };
  const submit = e => {
    e.preventDefault();
    if (busy) return;
    const problem = validate ? validate(value) : '';
    if (problem) { setError(problem); return; }
    if (onSubmit) onSubmit(value);
  };

  return (
    <Modal title={title} onClose={cancel}>
      <form onSubmit={submit} className="space-y-3">
        {message && <div className="text-sm">{message}</div>}
        <label className="block text-sm font-medium text-foreground">
          {label}
          <input
            className={inputCls}
            value={value}
            onChange={e => { setValue(e.target.value); if (error) setError(''); }}
            placeholder={placeholder}
            disabled={busy}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'prompt-dialog-error' : undefined}
          />
          {helpText && <span className="block text-xs font-normal text-muted-foreground">{helpText}</span>}
        </label>
        {error && <p id="prompt-dialog-error" role="alert" className="text-sm text-negative">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn w-full sm:w-auto" onClick={cancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
