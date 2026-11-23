// Time zone helpers built on Intl only (no libraries). Zones are IANA names such as 'Europe/Stockholm'.

export const browserZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export const isValidZone = zone => {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
};

// All zones the browser knows, with a short fallback list for old browsers.
export const allZones = () => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const list = Intl.supportedValuesOf('timeZone');
      return list.includes('UTC') ? list : ['UTC', ...list];
    }
  } catch { /* fall through */ }
  return ['UTC', 'Europe/London', 'Europe/Stockholm', 'Asia/Karachi', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Australia/Sydney'];
};

// The zone's offset from UTC, in milliseconds, at the given instant.
const offsetAt = (ms, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
  }).formatToParts(new Date(ms));
  const n = t => Number(parts.find(p => p.type === t).value);
  const asUTC = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  return asUTC - Math.floor(ms / 1000) * 1000;
};

// A wall-clock date ('YYYY-MM-DD') and time ('HH:MM', default 00:00) in a zone to the real moment (a Date).
// The Intl offset technique: guess the instant as if the wall clock were UTC, correct it by the zone's offset there,
// then once more with the offset at the corrected instant (this settles daylight saving changes). In the hour that
// does not exist (spring forward) the result is the instant just after the gap; in the repeated hour (fall back) the
// later one (standard time) is used.
export const zonedToInstant = (date, time, timeZone) => {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time || '00:00').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  if (!timeZone) return new Date(y, m - 1, d, hh || 0, mm || 0);
  const first = guess - offsetAt(guess, timeZone);
  const second = guess - offsetAt(first, timeZone);
  if (first === second) return new Date(first);
  // The offsets differ across a change: keep whichever candidate really shows this wall clock in the zone.
  const shows = ms => guess === ms + offsetAt(ms, timeZone);
  if (shows(second)) return new Date(shows(first) ? Math.max(first, second) : second);
  return new Date(Math.max(first, second));
};

// Format an instant in a zone. opts are Intl.DateTimeFormat options (default: date and 24-hour time).
export const formatInZone = (date, timeZone, opts) => new Intl.DateTimeFormat('en-GB', {
  ...(opts || { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  ...(timeZone ? { timeZone } : {})
}).format(date);

// Short zone abbreviation for now, for example 'CET' (or 'GMT+5' where the browser has no name).
export const zoneLabel = (timeZone, at = new Date()) => {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' }).formatToParts(at).find(p => p.type === 'timeZoneName');
    return part ? part.value : timeZone;
  } catch { return timeZone || ''; }
};

// The current wall clock in a zone: { date: 'YYYY-MM-DD', time: 'HH:MM' }.
export const nowInZone = (timeZone, at = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(at);
  const g = t => parts.find(p => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}` };
};

// The same entry moment shown in another zone: 'D Mon YYYY, HH:MM'.
export const convertWallClock = (date, time, fromZone, toZone) => formatInZone(zonedToInstant(date, time, fromZone), toZone);

// The zone's offset from UTC in minutes at an instant (whole minutes, so half hours work).
export const offsetMinutes = (timeZone, at = new Date()) => Math.round(offsetAt(at.getTime(), timeZone) / 60000);

// The offset as text, for example 'UTC+5', 'UTC+1', 'UTC+5:30', 'UTC-3:30', 'UTC'.
export const offsetLabel = (timeZone, at = new Date()) => {
  try {
    const m = offsetMinutes(timeZone, at);
    if (!m) return 'UTC';
    const a = Math.abs(m);
    return `UTC${m < 0 ? '-' : '+'}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''}`;
  } catch { return ''; }
};

// How far the second zone is from the first at an instant: 'same time', '4 h earlier' or '5:30 h later'.
export const zoneGapText = (fromZone, toZone, at = new Date()) => {
  const d = offsetMinutes(toZone, at) - offsetMinutes(fromZone, at);
  if (!d) return 'same time';
  const a = Math.abs(d);
  return `${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, '0')}` : ''} h ${d < 0 ? 'earlier' : 'later'}`;
};

// The city part of an IANA name: 'Asia/Karachi' -> 'Karachi', 'America/New_York' -> 'New York'.
export const cityName = zone => String(zone || '').split('/').pop().replace(/_/g, ' ');
