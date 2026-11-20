import React from 'react';

export const ROLE_LABELS = { viewer: 'Viewer', editor: 'Editor', admin: 'Admin' };
export const canEdit = role => role === 'editor' || role === 'admin';
export const canAdmin = role => role === 'admin';

export function RoleBadge({ role }) {
  if (!role) return null;
  return <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{ROLE_LABELS[role] || role}</span>;
}

// Small summary tile inside a card: label above, value below.
export function Tile({ label, children }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold">{children}</dd>
    </div>
  );
}
