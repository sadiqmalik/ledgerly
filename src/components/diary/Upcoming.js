import React from 'react';
import { whenText } from './shared';
import DateTile, { tileGrid } from './DateTile';

// The important dates coming up soon, soonest first. Each is a small card with a countdown; today is highlighted.
export default function Upcoming({ items, onOpen, title = 'Upcoming', canEdit = false, onLock }) {
  if (!items?.length) return null;
  return (
    <div aria-label={title}>
      <h3 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h3>
      <div className={tileGrid}>
        {items.map(n => (
          <DateTile key={n.id} note={n} onOpen={onOpen || (() => {})} canEdit={canEdit} onLock={onLock} countdown={whenText(n.daysAway)} soon={n.daysAway <= 7}
            show={{ date: n.nextDate, endDate: n.nextEndDate }} />
        ))}
      </div>
    </div>
  );
}
