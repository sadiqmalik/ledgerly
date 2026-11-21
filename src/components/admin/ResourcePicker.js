import React from 'react';
import { RESOURCES, CODE_RESOURCES, RESOURCE_LABELS } from '../../auth/resources.mjs';
import { ToggleGrid } from '../settings/ui';

// Pages (resources) an account or access code may use, as switches. value is an array of keys.
// Switching all off is allowed: the account then sees a "no pages" screen.
export default function ResourcePicker({ value, onChange, disabled, legend = 'Pages', forCode = false, notebookLedgers = null }) {
  const keys = forCode ? CODE_RESOURCES : RESOURCES; // access codes are view-only: no Settings page
  return (
    <div className="space-y-1">
      <ToggleGrid legend={legend} options={keys.map(key => ({ value: key, label: RESOURCE_LABELS[key] }))}
        value={value} onChange={onChange} disabled={disabled} minWidth={11} />
      {notebookLedgers && value.includes('diary') && (
        <p className="text-xs text-muted-foreground">
          Notebook: this admin can open the notebooks linked to ledgers they have a role in. A Viewer reads, an Editor or Admin changes. A notebook that is not linked to a ledger stays private to its owner.
          {notebookLedgers.length === 0 && ' Give them a role in a ledger first.'}
        </p>
      )}
      {value.length === 0 && <p className="text-xs text-muted-foreground">No pages: signing in will show an empty screen.</p>}
    </div>
  );
}

export const pagesText = resources => (resources.length ? resources.map(k => RESOURCE_LABELS[k] || k).join(', ') : 'No pages');
