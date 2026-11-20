import { useState } from 'react';
import { api } from '../../services/dataAPI';
import Amount from '../common/Amount';
import ConfirmDialog from '../common/ConfirmDialog';
import { errorMessage } from '../common/format';
import { useLedger } from '../../hooks/LedgerContext';
import { useResource, btnSecondary, btnDanger } from './ui';

export default function YearsTab({ bookId, canEdit }) {
  const { refreshYears, notifyChanged, fundById } = useLedger();
  const { data, error, loading, reload } = useResource(`/books/${bookId}/years`);
  const [checks, setChecks] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  // { year, mode: 'close' | 'reopen' } while the confirmation dialog is open, otherwise null.
  const [confirmYear, setConfirmYear] = useState(null);

  const run = async (y, fn) => {
    setErr(''); setBusy(String(y));
    try { await fn(); } catch (ex) { setErr(`${y}: ${errorMessage(ex)}`); }
    setBusy('');
  };
  const check = y => run(y, async () => {
    const r = await api.get(`/books/${bookId}/years/${y}/check`);
    setChecks(c => ({ ...c, [y]: r.data }));
  });
  const close = y => setConfirmYear({ year: y, mode: 'close' });
  const reopen = y => setConfirmYear({ year: y, mode: 'reopen' });
  // Runs the close or reopen request; errors land in the err area. The dialog is dismissed either way.
  const confirmAction = async () => {
    if (!confirmYear) return;
    const { year, mode } = confirmYear;
    await run(year, async () => {
      await api.post(`/books/${bookId}/years/${year}/${mode}`, {});
      setChecks(c => ({ ...c, [year]: undefined })); reload(); refreshYears(); notifyChanged();
    });
    setConfirmYear(null);
  };
  const cancelConfirm = () => setConfirmYear(null);

  return (
    <div className="space-y-3">
      {(error || err) && <p role="alert" className="text-sm text-negative">{error || err}</p>}
      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && !data.length && <p className="text-sm text-muted-foreground">No years yet.</p>}
      <ul className="grid items-start gap-3 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]" style={{ listStyle: 'none' }}>
        {data.map(y => {
          const c = checks[y.year];
          return (
            <li key={y.year} className={`rounded-lg border border-border bg-card p-3`}>
              <div>
                <span className="font-medium">{y.year}</span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {y.closed ? `Closed${y.closedAt ? ` ${String(y.closedAt).slice(0, 10)}` : ''}` : 'Open'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} disabled={busy === String(y.year)} onClick={() => check(y.year)}>Check</button>
                {canEdit && !y.closed && <button type="button" className={btnSecondary} disabled={busy === String(y.year)} onClick={() => close(y.year)}>Close</button>}
                {canEdit && y.closed && <button type="button" className={btnDanger} disabled={busy === String(y.year)} onClick={() => reopen(y.year)}>Reopen</button>}
              </div>
              {c && (c.ok ? <p className="mt-2 text-sm text-positive">Matches the snapshot.</p> : (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
                  <p className="text-negative">Differs from the snapshot:</p>
                  {(c.diffs || []).map(d => (
                    <div key={d.fundId}>
                      <p className="font-medium">{d.name}</p>
                      <p className="flex flex-wrap items-baseline gap-x-1 text-xs text-muted-foreground tabular-nums">
                        <Amount minor={d.snapshot} currency={fundById(d.fundId)?.currency} /> <span aria-hidden="true">→</span> <span className="sr-only">now</span> <Amount minor={d.now} currency={fundById(d.fundId)?.currency} />
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {confirmYear && confirmYear.mode === 'close' && (
        <ConfirmDialog
          title={`Close ${confirmYear.year}?`}
          confirmLabel="Close year"
          tone="danger"
          busy={busy === String(confirmYear.year)}
          onConfirm={confirmAction}
          onCancel={cancelConfirm}
          message={(
            <ul className="list-disc space-y-1 pl-5">
              <li>Entries in {confirmYear.year} are locked (no edit, delete or add) until it is reopened.</li>
              <li>A snapshot of each fund&apos;s balance at 31 Dec {confirmYear.year} is saved.</li>
              <li>Nothing is created or moved for {confirmYear.year + 1}; balances carry forward automatically.</li>
            </ul>
          )}
        />
      )}
      {confirmYear && confirmYear.mode === 'reopen' && (
        <ConfirmDialog
          title={`Reopen ${confirmYear.year}?`}
          confirmLabel="Reopen year"
          busy={busy === String(confirmYear.year)}
          onConfirm={confirmAction}
          onCancel={cancelConfirm}
          message={`Entries become editable again. Check afterwards to compare with the snapshot.`}
        />
      )}
    </div>
  );
}
