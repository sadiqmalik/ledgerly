import React from 'react';
import ChipShell from './ChipShell';
import { profitCommentLabel } from '../../optionalModules';

// Long comments (like a profit calculation) are stored on several lines. A list row shows only a short title; hovering
// (or tapping) it opens the full comment, laid out like the profit preview. Single-line comments look as before.
export const isMultiline = text => typeof text === 'string' && text.includes('\n');
export const commentTitle = text => (text || '').split('\n')[0];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "MEZ Profit 6.79% (Oct)" for a bank profit entry (the label comes from optionalModules), else the first line of the comment.
export function shortTitle(entry) {
  const text = entry.comment || '';
  const month = entry.meta && entry.meta.profitMonth;
  if (month) {
    const rate = entry.meta.profitRate ?? (/ x (\d+(?:\.\d+)?)% x /.exec(text) || [])[1];
    const mon = MON[Number(String(month).slice(5, 7)) - 1];
    return `${profitCommentLabel}${rate != null ? ` ${rate}%` : ''}${mon ? ` (${mon})` : ''}`;
  }
  return commentTitle(text);
}

// The lines of a comment: first line as a heading, the rest small and muted.
export function CommentLines({ text }) {
  return (
    <div className="break-words leading-snug">
      {text.split('\n').filter(Boolean).map((l, i) => (
        <div key={i} className={i === 0 ? 'text-sm font-medium text-foreground' : 'text-xs text-muted-foreground'}>{l}</div>
      ))}
    </div>
  );
}

// The comment of a list row. onActivate runs when the title is clicked (the row's own action, e.g. open the editor).
export function EntryComment({ entry, onActivate, fallback = null }) {
  const text = entry.comment;
  if (!text) return fallback;
  if (!isMultiline(text)) return text;
  const title = shortTitle(entry);
  return (
    <ChipShell label={`Comment: ${title}`} width={400} className="max-w-full text-sm font-medium text-foreground no-underline hover:no-underline"
      onActivate={onActivate || (() => {})} popover={() => <CommentLines text={text} />}>
      <span className="truncate">{title}</span>
    </ChipShell>
  );
}
