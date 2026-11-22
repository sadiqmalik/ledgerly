import React from 'react';
import { btnSecondary, btnDanger } from '../settings/ui';
import { RichText } from './RichText';
import { pill, CalendarIcon, stampText } from './shared';

// One entry as a boxed card (the same style as the loan and project cards). The card opens the editor.
export default function NoteCard({ note: n, canEdit, onEdit, onDuplicate, onToggleActive, onDelete, hideCategory = false, countdown = null, soon = false }) {
  const isDate = n.kind === 'date';
  return (
    <div role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : undefined}
      onClick={canEdit ? () => onEdit(n) : undefined}
      onKeyDown={canEdit ? e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onEdit(n); } } : undefined}
      className={`flex h-full flex-col rounded-xl border bg-card p-4 text-foreground ${canEdit ? 'cursor-pointer hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent' : ''} ${n.important ? 'border-accent' : 'border-border'} ${n.active ? '' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-lg font-semibold">{n.important && <span role="img" aria-label="Starred" title="Starred" className="mr-1 text-accent">&#9733;</span>}{n.title}</h2>
        {!n.active && <span className={`${pill} shrink-0`}>disabled</span>}
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {isDate && <CalendarIcon />}<span>{n.date}</span>
        {isDate && <span>{n.repeatYearly ? 'every year' : 'important date'}</span>}
        {countdown && <span className={`font-medium ${soon ? 'text-accent' : ''}`}>{countdown}</span>}
      </p>
      {(n.fromName || n.toName) && (
        <p className="mt-1 text-sm text-muted-foreground">
          {n.fromName && <>From <span className="font-medium text-foreground">{n.fromName}</span></>}
          {n.fromName && n.toName && ' · '}
          {n.toName && <>For <span className="font-medium text-foreground">{n.toName}</span></>}
        </p>
      )}
      {n.message && <RichText text={n.message} className="mt-2 text-sm" />}
      <p className="mt-auto pt-2 text-xs text-muted-foreground">{stampText(n.createdAt, n.updatedAt)}</p>
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {!hideCategory && n.categoryName && <a href={`#/diary/${n.notebookId}/${n.categoryId}`} onClick={e => e.stopPropagation()} className={`${pill} hover:underline`} title="Open the category">{n.categoryName}</a>}
        {n.projectName && <a href={`#/projects/${n.projectId}`} onClick={e => e.stopPropagation()} className={`${pill} hover:underline`} title="Open the project">{n.projectName}</a>}
        {canEdit && (
          <span className="ml-auto flex items-center gap-2" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
            <button type="button" className={`${btnSecondary} !px-2 !py-1 text-xs`} onClick={() => onDuplicate(n)}>Duplicate</button>
            <button type="button" className={`${btnSecondary} !px-2 !py-1 text-xs`} onClick={() => onToggleActive(n)}>{n.active ? 'Disable' : 'Enable'}</button>
            <button type="button" className={`${btnDanger} !px-2 !py-1 text-xs`} onClick={() => onDelete(n)}>Delete</button>
          </span>
        )}
      </div>
    </div>
  );
}
