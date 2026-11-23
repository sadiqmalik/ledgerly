import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage } from '../common/format';
import Select from '../common/Select';
import { Field, inputCls, btnPrimary } from './ui';
import { allZones, browserZone, nowInZone, zoneLabel } from '../../utils/timeZones';

// Settings > Time zone: the ledger's application time zone. Entries without their own time zone use it. Not set means
// each person's browser time zone. Admins change it; everyone else sees it read-only.
export default function TimeZoneTab({ bookId, canEdit }) {
  const ledger = useLedger();
  const [zone, setZone] = useState(ledger?.timeZone || browserZone());
  const [saved, setSaved] = useState(ledger?.timeZone || browserZone());
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { setZone(ledger?.timeZone || browserZone()); setSaved(ledger?.timeZone || browserZone()); }, [ledger?.timeZone]);
  const zones = useMemo(() => { const list = allZones(); return list.includes(zone) ? list : [zone, ...list]; }, [zone]);
  const now = useMemo(() => nowInZone(zone).time, [zone, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.put(`/books/${bookId}/timezone`, { timeZone: zone });
      setSaved(zone);
      if (ledger?.refreshTimeZone) await ledger.refreshTimeZone();
      setMsg('Saved.');
    } catch (e) { setErr(errorMessage(e, 'Could not save.')); }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="max-w-md rounded-xl border border-border bg-card p-4 space-y-3">
        <Field label="Ledger time zone">
          <Select className={inputCls} value={zone} onChange={e => { setZone(e.target.value); setMsg(''); }} disabled={!canEdit || busy} aria-label="Ledger time zone">
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
        <p className="text-sm">Now: <span className="font-medium">{now}</span> <span className="text-muted-foreground">({zoneLabel(zone)})</span></p>
        <p className="text-xs text-muted-foreground">Entries without their own time zone use this one.{ledger?.timeZone ? '' : ' Until an administrator saves one, each person sees their own browser time zone.'}</p>
        {err && <p role="alert" className="text-sm text-negative">{err}</p>}
        {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
        {canEdit && <button type="button" className={btnPrimary} onClick={save} disabled={busy || (zone === saved && Boolean(ledger?.timeZone))}>{busy ? 'Saving...' : 'Save'}</button>}
      </div>
    </div>
  );
}
