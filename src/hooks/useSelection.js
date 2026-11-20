import { useCallback, useEffect, useMemo, useState } from 'react';

// Multi-select state for a list of rows. Only ids present in `rows` and passing `canSelect` can be selected;
// when `rows` changes, selected ids that are no longer selectable are dropped.
// Pass a stable `canSelect` (or leave it out) so the pruning effect does not run on every render.
export function useSelection(rows, canSelect = () => true) {
  const [selected, setSelected] = useState(() => new Set());

  // Keyed by the selectable ids themselves, so a list rebuilt on every render does not re-run the pruning effect.
  const idsNow = rows.filter(r => canSelect(r)).map(r => r.id);
  const idsKey = idsNow.join('\u0001');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selectableIds = useMemo(() => idsNow, [idsKey]);
  const selectableSet = useMemo(() => new Set(selectableIds), [selectableIds]);

  // Drop selections that are gone from the rows or no longer selectable. Returning `prev` keeps the state unchanged.
  useEffect(() => {
    setSelected(prev => {
      let changed = false;
      const next = new Set();
      prev.forEach(id => {
        if (selectableSet.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [selectableSet]);

  const isSelected = useCallback(id => selected.has(id), [selected]);

  const toggle = useCallback(id => {
    setSelected(prev => {
      if (!selectableSet.has(id)) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, [selectableSet]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectableCount = selectableIds.length;
  const count = selected.size;
  const allSelected = selectableCount > 0 && selectableIds.every(id => selected.has(id));
  const someSelected = count > 0 && !allSelected;

  // Select every selectable row, or clear the selection when all of them are already selected.
  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const every = selectableIds.length > 0 && selectableIds.every(id => prev.has(id));
      return every ? new Set() : new Set(selectableIds);
    });
  }, [selectableIds]);

  const ids = useMemo(() => Array.from(selected), [selected]);

  return { selected, isSelected, toggle, toggleAll, clear, count, ids, allSelected, someSelected, selectableCount };
}

export default useSelection;
