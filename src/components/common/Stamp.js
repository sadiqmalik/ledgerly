import React from 'react';

const fmt = iso => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

// "Created 21 Nov 2026, 22:15" and, when it changed afterwards, "· updated ...". Empty when the time is unknown (rows
// from before timestamps were added). Design rule: every record shows when it was made (docs/TECH_SPECS.md).
export const stampText = (createdAt, updatedAt) => {
  const created = createdAt ? `Created ${fmt(createdAt)}` : '';
  const changed = updatedAt && (!createdAt || Math.abs(Date.parse(updatedAt) - Date.parse(createdAt)) > 60000);
  if (!created && !changed) return '';
  return `${created}${created && changed ? ' · ' : ''}${changed ? `${created ? 'updated' : 'Updated'} ${fmt(updatedAt)}` : ''}`;
};

export default function Stamp({ createdAt, updatedAt, className = 'mt-1 text-xs text-muted-foreground' }) {
  const text = stampText(createdAt, updatedAt);
  return text ? <p className={className}>{text}</p> : null;
}
