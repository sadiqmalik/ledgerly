import React, { useMemo } from 'react';
import Amount from '../common/Amount';
import FundChip from '../common/FundChip';
import PartyChip from '../common/PartyChip';
import CategoryTag from '../common/CategoryTag';
import QuantityPriceText from '../common/QuantityPriceText';
import { useLedger } from '../../hooks/LedgerContext';
import { refundedIds } from '../common/refundPairs';
import { currencyRowStyle } from '../../utils/currencyStyle';
import { EntryComment } from '../common/CommentText';
import LockIcon from './LockIcon';
import DocCount from '../documents/DocCount';
import useProjectNames from '../../hooks/useProjectNames';

// Quiet project label (folder icon + name) that links to the project.
const ProjectTag = ({ projectId, names, link }) => {
  if (!projectId) return null;
  const name = names[projectId]?.name || 'Project';
  if (!link) return <span className="inline-flex max-w-full min-w-0 items-center text-xs text-muted-foreground" title={`Project: ${name}`}><span className="truncate">{name}</span></span>;
  return (
    <a href={`#/projects/${projectId}`} title={`Project: ${name}`} aria-label={`Project ${name}`}
      onClick={ev => ev.stopPropagation()} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation(); }}
      className="inline-flex max-w-full min-w-0 items-center gap-1 text-xs text-muted-foreground hover:underline underline-offset-2">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
      <span className="truncate">{name}</span>
    </a>
  );
};

const Tags = ({ e, closed, refunded }) => (
  <>
    {closed && <LockIcon year={e.date.slice(0, 4)} className="mr-1 align-[-1px]" />}
    {e.linkId && <span title="Linked transfer leg" aria-label="Linked transfer" className="mr-1">&#8596;</span>}
    {refunded && <span title="Balanced by a matching entry" className="mr-1 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">⚖ Balanced</span>}
    {e.exclude && <span className="ml-1 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">excluded</span>}
  </>
);

// Entries as a table on wide screens and as stacked cards on phones. onSelect makes rows clickable.
export default function EntryTable({ rows, openings = [], openingCaption = '', onSelect, selection }) {
  const { book, isClosedDate, can, canEdit } = useLedger();
  const projectNames = useProjectNames();
  const projectLinks = can('projects');
  const base = book.baseCurrency;
  const refunded = useMemo(() => refundedIds(rows), [rows]);
  const canOpen = e => canEdit && Boolean(onSelect) && !isClosedDate(e.date);
  const open = e => { if (canOpen(e)) onSelect(e); };
  const keyOpen = (ev, e) => { if (canOpen(e) && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); onSelect(e); } };
  const rowClass = e => `${e.exclude ? 'opacity-50' : ''} ${canOpen(e) ? 'cursor-pointer hover:bg-muted/40' : ''}`;

  if (!rows.length && !openings.length) return <p className="muted p-4 text-center">No entries.</p>;
  const openText = `Opening balance${openingCaption ? ` \u2014 ${openingCaption}` : ''}`;

  return (
    <>
    {!!openings.length && (
      <div className="mb-3">
        <div className="mb-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">{openText}</div>
        <div className="flex flex-wrap justify-center gap-2">
          {openings.map(o => (
            <div key={`open-${o.fundId}-${o.currency}`} className="flex min-w-[9rem] max-w-full flex-1 basis-40 flex-col items-center gap-1 text-center rounded-xl border border-accent/20 bg-gradient-to-br from-accent/10 via-muted/40 to-card px-3 py-2.5 shadow-sm">
              <FundChip fundId={o.fundId} name={o.fundName} size="sm" />
              <Amount minor={Math.abs(o.amount)} currency={o.currency} tone={o.amount >= 0 ? 'cr' : 'dr'} className="text-base font-semibold" />
            </div>
          ))}
        </div>
      </div>
    )}
    {!!rows.length && <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" style={{ listStyle: 'none' }}>
      {rows.map(e => (
        <li key={e.id} className={`flex min-w-0 items-center gap-3 px-3 py-1.5 text-sm sm:gap-3 ${rowClass(e)} ${selection?.isSelected(e.id) ? 'bg-accent/10' : ''}`} style={currencyRowStyle(e.currency, base)} onClick={() => open(e)}
          tabIndex={canOpen(e) ? 0 : undefined} onKeyDown={ev => keyOpen(ev, e)}>
          {canEdit && selection && (
            <input type="checkbox" aria-label="Select entry" checked={selection.isSelected(e.id)} onChange={() => selection.toggle(e.id)}
              disabled={Boolean(e.linkId) || isClosedDate(e.date)}
              title={e.linkId ? 'Linked transfer legs cannot be changed in bulk' : isClosedDate(e.date) ? 'This year is closed' : undefined}
              onClick={ev => ev.stopPropagation()} onKeyDown={ev => ev.stopPropagation()}
              className="size-4 shrink-0 accent-[var(--accent)]" />
          )}
          <div className="w-[4.75rem] shrink-0 whitespace-nowrap text-xs text-muted-foreground">{e.date}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground" title={e.comment && !e.comment.includes('\n') ? e.comment : undefined}>
              <Tags e={e} closed={isClosedDate(e.date)} refunded={refunded.has(e.id)} /><EntryComment entry={e} onActivate={() => open(e)} fallback={<span className="font-normal text-muted-foreground">(no comment)</span>} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 text-xs leading-tight text-muted-foreground">
              <FundChip fundId={e.fundId} name={e.fundName} size="sm" />
              <PartyChip partyId={e.partyId} name={e.partyName} />
              <CategoryTag categoryId={e.categoryId} name={e.categoryName} />
              <ProjectTag projectId={e.projectId} names={projectNames} link={projectLinks} />
              <DocCount count={e.docCount} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <Amount minor={e.amount} currency={e.currency || base} tone={e.direction} className="font-semibold" />
            <div className="text-xs text-muted-foreground"><QuantityPriceText entry={e} currency={e.currency || base} /></div>
          </div>
        </li>
      ))}
    </ul>}
    </>
  );
}
