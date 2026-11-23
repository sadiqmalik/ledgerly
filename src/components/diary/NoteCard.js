import { StampFooter } from '../common/Stamp';
import React from 'react';
import { btnSecondary, btnDanger } from '../settings/ui';
import { RichText } from './RichText';
import { pill, colorEdge, CalendarIcon, stampText, spanText, LockIcon, EntryMarks, useAppZone } from './shared';

// One entry as a boxed card (the same style as the loan and project cards). The card opens the editor.
export default function NoteCard({ note: n, canEdit, onEdit, onDuplicate, onToggleActive, onDelete, onLock, hideCategory = false, countdown = null, soon = false }) {
  const isDate = n.kind === 'date';
  const appZone = useAppZone();
  return (
    <div role="button" tabIndex={0}
      onClick={() => onEdit(n)}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onEdit(n); } }}
      className={`flex h-full flex-col rounded-xl border p-4 text-foreground cursor-pointer hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${colorEdge(n.color)} ${n.important ? 'border-accent' : 'border-border'} ${n.active ? '' : 'opacity-70'}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 text-lg font-semibold">{n.important && <span role="img" aria-label="Starred" title="Starred" className="mr-1 text-accent">&#9733;</span>}{n.title}{n.repeatYearly && <> <EntryMarks note={n} size={15} /></>}</h2>
        <span className="flex shrink-0 items-center gap-1">
          {!n.active && <span className={pill}>disabled</span>}
          {n.effectiveLocked && <LockIcon />}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {!hideCategory && n.categoryName && <a href={`#/diary/${n.notebookId}/${n.categoryId}`} onClick={e => e.stopPropagation()} className={`${pill} hover:underline`} title="Open the category">{n.categoryName}</a>}
        {n.projectName && <a href={`#/projects/${n.projectId}`} onClick={e => e.stopPropagation()} className={`${pill} hover:underline`} title="Open the project">{n.projectName}</a>}
        {isDate && <CalendarIcon />}<span>{spanText(n, appZone)}</span>
        {countdown && <span className={`font-medium ${soon ? 'text-accent' : ''}`}>{countdown}</span>}
        {n.fromName && <span>From <span className="font-medium text-foreground">{n.fromName}</span></span>}
        {n.toName && <span>For <span className="font-medium text-foreground">{n.toName}</span></span>}
      </div>
      {n.message && <RichText text={n.message} className="mt-2 text-sm" />}
      <StampFooter createdAt={n.createdAt} updatedAt={n.updatedAt} />
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {canEdit && !n.effectiveLocked && (
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
