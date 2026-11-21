import { useEffect, useState } from 'react';
import { api } from '../../services/dataAPI';
import { useLedger } from '../../hooks/LedgerContext';
import { errorMessage } from '../common/format';
import { inputCls, btnSecondary } from './ui';
import { quantityPriceFromEntry } from '../../utils/entryQuantityPrice.mjs';
import Select from '../common/Select';

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function buildXlsx(data) {
  const ExcelJS = (await import('exceljs')).default;
  const funds = data.funds || [];
  const fund = id => funds.find(f => f.id === id);
  const name = (list, id) => (list || []).find(x => x.id === id)?.name || '';
  const entries = (data.entries || []).filter(e => !e.deletedAt)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const wb = new ExcelJS.Workbook();
  const years = [...new Set(entries.map(e => String(e.date).slice(0, 4)))].sort();
  for (const y of years) {
    const ws = wb.addWorksheet(y, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'DATE', key: 'd', width: 12 }, { header: 'FOR', key: 'p', width: 22 },
      { header: 'COMMENT', key: 'c', width: 40 }, { header: 'CREDIT', key: 'cr', width: 14 },
      { header: 'DEBIT', key: 'dr', width: 14 }, { header: 'FUND', key: 'f', width: 16 },
      { header: 'CATEGORY', key: 'cat', width: 16 }, { header: 'PROJECT', key: 'pr', width: 20 }, { header: 'CURRENCY', key: 'cur', width: 10 },
      { header: 'QUANTITY', key: 'qty', width: 12 }, { header: 'UNIT PRICE', key: 'up', width: 14 }
    ];
    ws.getRow(1).font = { bold: true };
    const rows = entries.filter(e => String(e.date).startsWith(y));
    for (const e of rows) {
      const qp = quantityPriceFromEntry(e);
      ws.addRow({
        d: e.date, p: e.partyName || name(data.parties, e.partyId), c: e.comment || '',
        cr: e.direction === 'cr' ? e.amount / 100 : null, dr: e.direction === 'dr' ? e.amount / 100 : null,
        f: e.fundName || fund(e.fundId)?.name || '', cat: e.categoryName || name(data.categories, e.categoryId),
        pr: e.projectName || name(data.projects, e.projectId),
        cur: e.currency || fund(e.fundId)?.currency || '',
        qty: qp.quantity,
        up: qp.unitPrice == null ? null : qp.unitPrice / 100,
      });
    }
    const last = rows.length + 1;
    const currencies = [...new Set(rows.map(e => e.currency || fund(e.fundId)?.currency || ''))].sort();
    for (const cur of currencies) {
      const t = ws.addRow({ p: `TOTAL ${cur}`.trim(), cur });
      t.getCell(4).value = { formula: `SUMIFS(D2:D${last},I2:I${last},"${cur}")` };
      t.getCell(5).value = { formula: `SUMIFS(E2:E${last},I2:I${last},"${cur}")` };
      t.font = { bold: true };
    }
    ws.getColumn(4).numFmt = '#,##0.00';
    ws.getColumn(5).numFmt = '#,##0.00';
    ws.getColumn(10).numFmt = '#,##0.###';
    ws.getColumn(11).numFmt = '#,##0.00';
  }
  const fs = wb.addWorksheet('Funds', { views: [{ state: 'frozen', ySplit: 1 }] });
  fs.columns = [{ header: 'FUND', key: 'n', width: 22 }, { header: 'CURRENCY', key: 'c', width: 10 }, { header: 'BALANCE', key: 'b', width: 16 }];
  fs.getRow(1).font = { bold: true };
  for (const f of funds) {
    const bal = entries.filter(e => e.fundId === f.id && !e.exclude)
      .reduce((s, e) => s + (e.direction === 'cr' ? e.amount : -e.amount), 0);
    fs.addRow({ n: f.name, c: f.currency, b: bal / 100 });
  }
  fs.getColumn(3).numFmt = '#,##0.00';
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export default function DataTab() {
  const { book, role } = useLedger();
  const isAdmin = role === 'admin';
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Years that have entries (GET /years, newest first); falls back to the current year.
  const [years, setYears] = useState([new Date().getFullYear()]);
  useEffect(() => {
    let live = true;
    api.get(`/books/${book.id}/years`)
      .then(r => { if (live && r.data.length) setYears(r.data.map(y => y.year)); })
      .catch(() => {});
    return () => { live = false; };
  }, [book.id]);
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (book.name || 'ledger').replace(/[^\w-]+/g, '_');

  const run = (key, fn) => async () => {
    setError(''); setBusy(key);
    try { await fn(); } catch (e) { setError(errorMessage(e, 'Download failed.')); } finally { setBusy(''); }
  };
  const get = async params => (await api.get(`/books/${book.id}/export`, { params, responseType: 'blob' })).data;

  const csv = run('csv', async () => saveBlob(await get({ format: 'csv', ...(year ? { year } : {}) }), `${slug}-${year || 'all'}.csv`));
  const json = run('json', async () => saveBlob(await get({ format: 'json' }), `${slug}-backup-${stamp}.json`));
  const xlsx = run('xlsx', async () => {
    const { data } = await api.get(`/books/${book.id}/export`, { params: { format: 'json' } });
    saveBlob(await buildXlsx(data), `${slug}-${stamp}.xlsx`);
  });

  return (
    <div className="w-full space-y-4">
      {error && <p role="alert" className="text-sm text-negative">{error}</p>}
      <div className="grid items-start gap-4 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h3 className="font-medium text-foreground">Entries (CSV)</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Year" className={`${inputCls} !mt-0 !w-auto`} value={year} onChange={e => setYear(e.target.value)}>
            <option value="">All years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <button type="button" className={btnSecondary} disabled={Boolean(busy)} onClick={csv}>{busy === 'csv' ? 'Preparing...' : 'Download CSV'}</button>
        </div>
      </div>
      {isAdmin && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h3 className="font-medium text-foreground">Full book (admin)</h3>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={Boolean(busy)} onClick={xlsx}>{busy === 'xlsx' ? 'Building...' : 'Download Excel'}</button>
            <button type="button" className={btnSecondary} disabled={Boolean(busy)} onClick={json}>{busy === 'json' ? 'Preparing...' : 'Download backup (JSON)'}</button>
          </div>
          <p className="text-xs text-muted-foreground">Excel has one sheet per year plus a Funds summary, and includes quantity/unit price columns. The JSON backup holds everything except document files.</p>
        </div>
      )}
      </div>
      <p className="text-sm text-muted-foreground">Nightly backups are saved automatically.</p>
    </div>
  );
}
