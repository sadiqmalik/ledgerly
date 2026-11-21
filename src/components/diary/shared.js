import React from 'react';

// ComboInput items from plain names.
export const asItems = list => list.map(name => ({ id: name.toLowerCase(), name }));
export const pill = 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground';

export { stampText } from '../common/Stamp';

// "today", "tomorrow", "in 12 days".
export const whenText = days => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

export const CalendarIcon = ({ className = '' }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`inline-block shrink-0 ${className}`}>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />
  </svg>
);
