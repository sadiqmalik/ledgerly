import React, { useEffect, useState } from 'react';
import { useLedger } from '../../hooks/LedgerContext';
import Select from '../common/Select';
import { inputCls } from '../settings/ui';
import { allZones, browserZone, formatInZone, nowInZone, zoneLabel, zonedToInstant, offsetLabel, zoneGapText, cityName } from '../../utils/timeZones';

// ComboInput items from plain names.
export const asItems = list => list.map(name => ({ id: name.toLowerCase(), name }));
export const pill = 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground';

// Entry colours: a fixed list (the server accepts only these keys). Full class names so Tailwind keeps them.
export const COLOR_KEYS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'];
export const COLOR_BG = { red: 'bg-red-500', orange: 'bg-orange-500', amber: 'bg-amber-500', green: 'bg-green-500', teal: 'bg-teal-500', blue: 'bg-blue-500', purple: 'bg-purple-500', pink: 'bg-pink-500' };
export const COLOR_BORDER = { red: 'border-l-red-500', orange: 'border-l-orange-500', amber: 'border-l-amber-500', green: 'border-l-green-500', teal: 'border-l-teal-500', blue: 'border-l-blue-500', purple: 'border-l-purple-500', pink: 'border-l-pink-500' };
// A coloured left edge for a card ('' when the entry has no colour).
export const COLOR_TINT = { red: 'bg-red-500/15', orange: 'bg-orange-500/15', amber: 'bg-amber-500/15', green: 'bg-green-500/15', teal: 'bg-teal-500/15', blue: 'bg-blue-500/15', purple: 'bg-purple-500/15', pink: 'bg-pink-500/15' };
// A tinted background plus coloured left edge for a card; plain card background when there is no colour.
export const colorEdge = color => (COLOR_BORDER[color] ? `border-l-4 ${COLOR_BORDER[color]} ${COLOR_TINT[color]}` : 'bg-card');

// A row of round swatches plus "none"; the selected one has a ring.
export const ColorPicker = ({ value, onChange, disabled }) => (
  <div role="group" aria-label="Colour" className="flex flex-wrap items-center gap-2">
    <button type="button" aria-label="No colour" aria-pressed={!value} disabled={disabled} onClick={() => onChange('')}
      className={`h-6 w-6 rounded-full border border-dashed border-border bg-card text-xs leading-none text-muted-foreground ${!value ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''}`}>&times;</button>
    {COLOR_KEYS.map(k => (
      <button key={k} type="button" aria-label={k} aria-pressed={value === k} disabled={disabled} onClick={() => onChange(k)}
        className={`h-6 w-6 rounded-full ${COLOR_BG[k]} ${value === k ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''}`} />
    ))}
  </div>
);

export { stampText } from '../common/Stamp';

// "today", "tomorrow", "in 12 days".
export const whenText = days => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

export const CalendarIcon = ({ className = '' }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`inline-block shrink-0 ${className}`}>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" />
  </svg>
);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = d => { const [y, m, day] = d.split('-'); return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`; };
// "12 Jan 2026, 14:30", "12 Jan 2026, 14:30 - 16:00" (same day), "12 Jan 2026 - 14 Jan 2026, 09:00"; missing parts are left out.
// Pass the next occurrence as date/endDate to show a yearly entry's coming span.
// With appZone, a time whose entry has a different time zone gets its abbreviation ("14:30 CET"); same zone shows nothing extra.
export const spanText = ({ date, time, endDate, endTime, timeZone, resolvedTimeZone }, appZone) => {
  timeZone = resolvedTimeZone || timeZone;
  const z = timeZone && appZone && timeZone !== appZone ? zoneLabel(timeZone, zonedToInstant(date, time || '12:00', timeZone)) : '';
  const tag = z ? ` (${z})` : ''; // shown once, at the end
  const start = `${niceDate(date)}${time ? `, ${time}` : ''}`;
  if (!endDate && !endTime) return `${start}${time ? tag : ''}`;
  if (!endDate || endDate === date) return endTime ? `${start} \u2013 ${endTime}${tag}` : `${start}${time ? tag : ''}`;
  return `${start} \u2013 ${niceDate(endDate)}${endTime ? `, ${endTime}` : ''}${time || endTime ? tag : ''}`;
};

// The ledger's application time zone for diary screens (the browser's when the ledger has none).
export const useAppZone = () => { const l = useLedger(); return (l && l.timeZone) || browserZone(); };

// Sort direction of the notebook entries, shared by the notebook and category pages (remembered in this browser; newest first by default).
const NEWEST_KEY = 'diary.newestFirst';
export const useNewestFirst = () => {
  const [newest, setNewest] = useState(() => { try { return localStorage.getItem(NEWEST_KEY) !== '0'; } catch { return true; } });
  const change = on => {
    setNewest(on);
    try { localStorage.setItem(NEWEST_KEY, on ? '1' : '0'); } catch { /* storage unavailable: the choice lasts for this page only */ }
  };
  return [newest, change];
};

// The zone an entry reads in: its own, else its category's, else its notebook's (the server resolves it), else the application zone.
export const zoneOf = (n, appZone) => (n && (n.resolvedTimeZone || n.timeZone)) || appZone;
const FROM_LABEL = { entry: 'entry', category: 'category', notebook: 'notebook', application: 'ledger' };
// What a level takes its zone from: the first set zone of [zone, levelName] pairs, else the application (ledger) zone.
export const inheritedFrom = (levels, appZone) => {
  const hit = levels.find(([z]) => z);
  return hit ? { zone: hit[0], from: hit[1] } : { zone: appZone, from: 'application' };
};
const parentLabel = from => FROM_LABEL[from] || from;
export const fromText = from => (from && from !== 'entry' ? ` (same as ${parentLabel(from)})` : '');
const city = z => (z.split('/').pop() || z).replace(/_/g, ' ');

// A zone picker for an entry, category or notebook. value '' means "same as the parent": the closed picker then reads
// "<City> · same as <category|notebook|ledger>"; the first option is that same-as choice.
export function ZoneSelect({ value, onChange, inherited, label = 'Time zone', disabled }) {
  const zones = allZones();
  const list = value && !zones.includes(value) ? [value, ...zones] : zones;
  return (
    <Select className={inputCls} value={value || ''} onChange={e => onChange(e.target.value)} aria-label={label} disabled={disabled}>
      <option value="">{value ? `Same as ${parentLabel(inherited.from)}` : `${city(inherited.zone)} · same as ${parentLabel(inherited.from)}`}</option>
      {list.map(z => <option key={z} value={z}>{z}</option>)}
    </Select>
  );
}

// "Entry time: 14:30 Asia/Karachi (UTC+5) = Europe/Stockholm (UTC+1): 10:30 on 1 Dec 2026 \u00b7 4 h earlier" when the entry
// has its own zone that differs from the application zone and a start time; otherwise ''.
export const ledgerTimeLine = (n, appZone) => {
  const tz = n && (n.resolvedTimeZone || n.timeZone);
  if (!n || !n.time || !tz || tz === appZone || !n.date) return '';
  const start = zonedToInstant(n.date, n.time, tz);
  const hm = d => formatInZone(d, appZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const day = d => formatInZone(d, appZone, { day: 'numeric', month: 'short', year: 'numeric' });
  let end = '';
  if (n.endTime) { const e = zonedToInstant(n.endDate || n.date, n.endTime, tz); end = ` \u2013 ${hm(e)}`; }
  return `Entry time: ${n.time} ${tz} (${offsetLabel(tz, start)}) = ${appZone} (${offsetLabel(appZone, start)}): ${hm(start)}${end} on ${day(start)} \u00b7 ${zoneGapText(tz, appZone, start)}`;
};

// One compact line (long wording as a tooltip) for an entry whose zone differs from the application zone:
// '22:57 Karachi (UTC+5) \u2192 18:57 Stockholm (UTC+1) \u00b7 4 h earlier'. null when there is nothing to say.
export const zoneCompact = (n, appZone) => {
  const tz = n && (n.resolvedTimeZone || n.timeZone);
  if (!n || !n.time || !tz || tz === appZone || !n.date) return null;
  const start = zonedToInstant(n.date, n.time, tz);
  const hm = d => formatInZone(d, appZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayIn = (d, z) => formatInZone(d, z, { day: 'numeric', month: 'short' });
  const sameDay = dayIn(start, appZone) === dayIn(start, tz);
  const end = n.endTime ? ` \u2013 ${hm(zonedToInstant(n.endDate || n.date, n.endTime, tz))}` : '';
  return {
    text: `Set in ${cityName(tz)} time \u00b7 ${hm(start)}${end}${sameDay ? '' : ` on ${dayIn(start, appZone)}`} in ${cityName(appZone)} (${zoneGapText(tz, appZone, start)})`,
    title: ledgerTimeLine(n, appZone)
  };
};
// One small line with the converted time (the entry's own time and zone are already in the Start row). divider puts it
// under a thin line at the end of a dialog, as extra information.
export function ZoneLine({ note, appZone, divider = false }) {
  const z = zoneCompact(note, appZone);
  return z ? <p className={`text-xs text-muted-foreground ${divider ? 'border-t border-border pt-2' : ''}`} title={z.title}>{z.text}</p> : null;
}

// "Now: 14:32 Asia/Karachi (UTC+5)" in the entry's zone and, when the application zone differs, also the same moment there.
export function NowLine({ zone, compact = false }) {
  const [, setTick] = useState(0);
  const appZone = useAppZone();
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);
  const now = new Date();
  const label = z => `${nowInZone(z, now).time} ${z} (${offsetLabel(z, now)})`;
  if (compact) return <span className="text-[11px] text-muted-foreground" title={`Now: ${label(zone)}`}>Now {nowInZone(zone, now).time} in {cityName(zone)}</span>;
  return (
    <p className="text-xs text-muted-foreground">
      Now: {label(zone)}{appZone && appZone !== zone ? <> = {label(appZone)} &middot; {zoneGapText(zone, appZone, now)}</> : null}
    </p>
  );
}

// Compact date for tiles: "12 Jan" (year only when not this year), "12 Jan, 14:30 - 16:00", "12 Jan - 14 Jan".
export const shortSpan = ({ date, time, endDate, endTime }) => {
  const year = String(new Date().getFullYear());
  const d = s => { const [y, m, day] = s.split('-'); return `${Number(day)} ${MONTHS[Number(m) - 1]}${y === year ? '' : ` ${y}`}`; };
  const t = [time, endTime].filter(Boolean).join(' – ');
  if (!endDate || endDate === date) return `${d(date)}${t ? `, ${t}` : ''}`;
  return `${d(date)}${time ? `, ${time}` : ''} – ${d(endDate)}${endTime ? `, ${endTime}` : ''}`;
};

const LockGlyph = ({ locked }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block shrink-0">
    <rect x="5" y="11" width="14" height="10" rx="2" />{locked ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
  </svg>
);
// A small padlock: a toggle button for people who can edit (`onLock`), a plain icon for everyone else when the entry is locked.
export function LockControl({ note: n, canEdit, onLock, buttonOnly = false }) {
  // Locked by its category or notebook (not by itself): the unlock control is on that category or notebook.
  if (canEdit && onLock && !(n.effectiveLocked && !n.locked)) {
    return (
      <button type="button" aria-pressed={!!n.locked} title={n.locked ? 'Unlock' : 'Lock'} aria-label={n.locked ? 'Unlock' : 'Lock'}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onLock(n); }} onKeyDown={e => e.stopPropagation()}
        className={`inline-flex shrink-0 items-center rounded p-0.5 hover:bg-muted ${n.locked ? 'text-accent' : 'text-muted-foreground'}`}>
        <LockGlyph locked={!!n.locked} />
      </button>
    );
  }
  if (buttonOnly) return null;
  return n.locked ? <span role="img" aria-label="Locked" title="Locked" className="inline-flex shrink-0 text-muted-foreground"><LockGlyph locked /></span> : null;
}

// A passive padlock icon (no button) for a locked card or tile.
export const LockIcon = () => <span role="img" aria-label="Locked" title="Locked" className="inline-flex shrink-0 text-muted-foreground"><LockGlyph locked /></span>;

// A small "Locked" chip shown next to the name of a locked notebook or category (everyone sees it; editors also get the padlock button).
export const LockedChip = () => <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"><LockGlyph locked />Locked</span>;

// Header lock button, same height as the compact buttons (btnSm): padlock 16px, "Locked" word and accent when locked.
export function HeaderLock({ locked, onToggle }) {
  return (
    <button type="button" aria-pressed={!!locked} title={locked ? 'Unlock' : 'Lock'} aria-label={locked ? 'Unlock' : 'Lock'} onClick={onToggle}
      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted ${locked ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-card text-muted-foreground'}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill={locked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <rect x="5" y="11" width="14" height="10" rx="2" />{locked ? <path d="M8 11V7a4 4 0 0 1 8 0v4" /> : <path d="M8 11V7a4 4 0 0 1 7.5-2" />}
      </svg>
      {locked && 'Locked'}
    </button>
  );
}

// Small "repeats every year" mark for a title (next to the star), with a tooltip.
export const RepeatIcon = ({ size = 18 }) => (
  <span role="img" aria-label="Repeats every year" title="Repeats every year" className="inline-flex shrink-0 align-middle text-muted-foreground">
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  </span>
);

// A calendar with an exclamation mark: marks an "important date" (as opposed to a plain note), shown next to the title.
export const ImportantDateIcon = ({ size = 18 }) => (
  <span role="img" aria-label="Important date" title="Important date" className="inline-flex shrink-0 align-middle text-accent">
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
      <path d="M12 12.5v3" /><path d="M12 18.2h.01" strokeWidth="2.6" />
    </svg>
  </span>
);

// The little icons after an entry's title: important date (calendar with star), repeats every year. showKind adds the
// calendar icon (dialogs, note cards and date tiles).
export const EntryMarks = ({ note, showKind = false, size = 16 }) => (
  note && ((showKind && note.kind === 'date') || note.repeatYearly) ? (
    <span className="inline-flex shrink-0 items-center gap-1">
      {showKind && note.kind === 'date' && <ImportantDateIcon size={size} />}
      {note.repeatYearly && <RepeatIcon size={size} />}
    </span>
  ) : null
);
