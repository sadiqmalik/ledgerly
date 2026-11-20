import React from 'react';
import { RESOURCES, RESOURCE_LABELS } from '../../auth/resources.mjs';

// Pages (resources) an account or access code may use, as checkboxes. value is an array of keys.
// Unchecking all is allowed: the account then sees a "no pages" screen.
export default function ResourcePicker({ value, onChange, disabled }) {
  const toggle = key => onChange(value.includes(key) ? value.filter(k => k !== key) : RESOURCES.filter(k => k === key || value.includes(k)));
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-sm font-medium text-foreground">Pages</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {RESOURCES.map(key => (
          <label key={key} className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={value.includes(key)} onChange={() => toggle(key)} />
            {RESOURCE_LABELS[key]}
          </label>
        ))}
      </div>
      {value.length === 0 && <p className="text-xs text-muted-foreground">No pages: signing in will show an empty screen.</p>}
    </fieldset>
  );
}

export const pagesText = resources => (resources.length ? resources.map(k => RESOURCE_LABELS[k] || k).join(', ') : 'No pages');
