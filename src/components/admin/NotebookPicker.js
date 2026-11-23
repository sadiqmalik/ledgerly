import React, { useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';
import { Toggle } from '../settings/ui';

const chip = 'rounded-lg border border-border bg-muted/30 px-2.5 py-1.5';

// A ledger's notebooks as compact switches (on = allowed). Hidden while loading and when the ledger has none.
// Admin mode: excluded + onChange(newExcludedArray).
// Code mode (code): rule ({only?, exclude?}), ownerExcluded, onChange(newRuleOrNull).
export default function NotebookPicker({ bookId, code = false, excluded = [], rule, ownerExcluded = [], onChange, disabled }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let live = true;
    setList(null);
    api.get('/diary/ledger-notebooks', { params: { bookId } })
      .then(res => { if (live) setList(Array.isArray(res.data) ? res.data : (res.data?.notebooks || [])); })
      .catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [bookId]);
  if (!list || list.length === 0) return null;

  const ids = list.map(n => n.id);
  let off = excluded;
  let later = true;
  if (code) {
    later = !(rule && Array.isArray(rule.only));
    off = later ? (rule?.exclude || []) : ids.filter(id => !rule.only.includes(id));
  }
  const blocked = id => code && ownerExcluded.includes(id);
  const isOn = id => !blocked(id) && !off.includes(id);

  // Code mode: build the rule from the allowed ids and the "later" switch; null when nothing is narrowed.
  const emit = (nextOff, nextLater) => {
    const allowed = ids.filter(id => !blocked(id));
    const offU = nextOff.filter(id => allowed.includes(id));
    if (nextLater) return onChange(offU.length ? { exclude: offU } : null);
    return onChange({ only: allowed.filter(id => !offU.includes(id)) });
  };
  const flip = (id, on) => {
    const next = on ? off.filter(x => x !== id) : [...off, id];
    if (code) emit(next, later); else onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Notebooks</p>
      <div className="flex flex-wrap gap-2">
        {list.map(n => (
          <div key={n.id} className={chip}>
            <Toggle compact tone="neutral" label={n.name} checked={isOn(n.id)} disabled={disabled || blocked(n.id)} onChange={on => flip(n.id, on)} />
            {blocked(n.id) && <p className="text-xs text-muted-foreground">left out for this admin</p>}
          </div>
        ))}
      </div>
      {code && <Toggle compact label="Include notebooks created later" checked={later} disabled={disabled} onChange={v => emit(off, v)} />}
    </div>
  );
}
